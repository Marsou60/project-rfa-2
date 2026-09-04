"""Veille légale des adhérents via Annuaire des Entreprises et BODACC."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text

from app.database import engine
from app.services import nathalie_adherents

ANNUAIRE_URL = "https://recherche-entreprises.api.gouv.fr/search"
BODACC_URL = (
    "https://www.bodacc.fr/api/explore/v2.1/catalog/datasets/"
    "annonces-commerciales/records"
)
USER_AGENT = "GroupementUnion-VeilleLegale/1.0 (+https://groupementunion.pro)"
SNAPSHOT_TABLE = "enterprise_watch_snapshots"
ALERT_TABLE = "enterprise_watch_alerts"


def _is_pg() -> bool:
    return engine.dialect.name == "postgresql"


def _now() -> Any:
    current = datetime.now(timezone.utc)
    return current if _is_pg() else current.isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _loads(value: Any, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _fetch_json(url: str, params: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ensure_tables() -> None:
    id_type = "uuid" if _is_pg() else "TEXT"
    ts_type = "timestamptz" if _is_pg() else "TEXT"
    json_type = "jsonb" if _is_pg() else "TEXT"
    bool_type = "boolean" if _is_pg() else "INTEGER"
    uuid_default = " DEFAULT gen_random_uuid()" if _is_pg() else ""
    false_default = "false" if _is_pg() else "0"
    with engine.begin() as conn:
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {SNAPSHOT_TABLE} (
              id {id_type} PRIMARY KEY{uuid_default},
              code_union text NOT NULL UNIQUE,
              siret text NOT NULL,
              siren text NOT NULL,
              legal_name text,
              address text,
              postal_code text,
              city text,
              company_status text,
              establishment_status text,
              legal_form text,
              directors {json_type} NOT NULL,
              bodacc_event_ids {json_type} NOT NULL,
              snapshot_hash text NOT NULL,
              fetched_at {ts_type} NOT NULL
            )
        """))
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {ALERT_TABLE} (
              id {id_type} PRIMARY KEY{uuid_default},
              fingerprint text NOT NULL UNIQUE,
              code_union text NOT NULL,
              siret text NOT NULL,
              alert_type text NOT NULL,
              severity text NOT NULL,
              title text NOT NULL,
              old_value {json_type},
              new_value {json_type},
              source text NOT NULL,
              source_url text,
              detected_at {ts_type} NOT NULL,
              acknowledged {bool_type} NOT NULL DEFAULT {false_default},
              acknowledged_at {ts_type},
              acknowledged_by text
            )
        """))
        for statement in (
            f"CREATE INDEX IF NOT EXISTS idx_watch_alerts_code ON {ALERT_TABLE}(code_union)",
            f"CREATE INDEX IF NOT EXISTS idx_watch_alerts_open ON {ALERT_TABLE}(acknowledged, detected_at)",
            f"CREATE INDEX IF NOT EXISTS idx_watch_snapshots_siren ON {SNAPSHOT_TABLE}(siren)",
        ):
            conn.execute(text(statement))


def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _address(establishment: Dict[str, Any]) -> str:
    return _clean_text(establishment.get("adresse"))


def normalize_directors(rows: Any) -> List[Dict[str, str]]:
    """Normalise les mandataires légaux et exclut les commissaires aux comptes."""
    directors: List[Dict[str, str]] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        role = _clean_text(row.get("qualite"))
        if "commissaire aux comptes" in role.casefold():
            continue
        if row.get("type_dirigeant") == "personne morale":
            name = _clean_text(row.get("denomination"))
            identifier = _digits(row.get("siren"))
        else:
            name = _clean_text(f"{row.get('prenoms') or ''} {row.get('nom') or ''}").upper()
            identifier = _clean_text(row.get("date_de_naissance") or row.get("annee_de_naissance"))
        if name:
            directors.append({"name": name, "role": role, "identifier": identifier})
    return sorted(directors, key=lambda item: (item["name"], item["role"], item["identifier"]))


def build_snapshot(item: Dict[str, Any], siret: str) -> Dict[str, Any]:
    wanted = _digits(siret)
    establishments = [item.get("siege") or {}, *(item.get("matching_etablissements") or [])]
    establishment = next(
        (row for row in establishments if _digits(row.get("siret")) == wanted),
        item.get("siege") or {},
    )
    snapshot = {
        "siret": wanted,
        "siren": _digits(item.get("siren"))[:9],
        "legal_name": _clean_text(item.get("nom_raison_sociale") or item.get("nom_complet")),
        "address": _address(establishment),
        "postal_code": _clean_text(establishment.get("code_postal")),
        "city": _clean_text(establishment.get("libelle_commune")).title(),
        "company_status": _clean_text(item.get("etat_administratif") or "A"),
        "establishment_status": _clean_text(establishment.get("etat_administratif") or "A"),
        "legal_form": _clean_text(item.get("nature_juridique")),
        "directors": normalize_directors(item.get("dirigeants")),
    }
    snapshot["snapshot_hash"] = hashlib.sha256(_json(snapshot).encode("utf-8")).hexdigest()
    return snapshot


def fetch_company_snapshot(siret: str) -> Dict[str, Any]:
    payload = _fetch_json(
        ANNUAIRE_URL,
        {"q": _digits(siret), "per_page": 1, "page": 1},
    )
    results = payload.get("results") or []
    if not results:
        raise ValueError("SIRET introuvable dans l’Annuaire des Entreprises")
    return build_snapshot(results[0], siret)


def fetch_bodacc_events(siren: str, limit: int = 30) -> List[Dict[str, Any]]:
    compact = _digits(siren)[:9]
    payload = _fetch_json(
        BODACC_URL,
        {
            "limit": limit,
            "order_by": "dateparution desc",
            "where": f'registre="{compact}" AND familleavis="collective"',
        },
    )
    events: List[Dict[str, Any]] = []
    for row in payload.get("results") or []:
        judgment = _loads(row.get("jugement"), {})
        events.append({
            "id": _clean_text(row.get("id")),
            "publication_date": _clean_text(row.get("dateparution")),
            "judgment_date": _clean_text(judgment.get("date")),
            "family": _clean_text(judgment.get("famille")),
            "nature": _clean_text(judgment.get("nature")),
            "detail": _clean_text(judgment.get("complementJugement")),
            "court": _clean_text(row.get("tribunal")),
            "url": _clean_text(row.get("url_complete")),
        })
    return [event for event in events if event["id"]]


def snapshot_changes(old: Dict[str, Any], new: Dict[str, Any]) -> List[Dict[str, Any]]:
    changes: List[Dict[str, Any]] = []
    fields = (
        ("address", "ADDRESS_CHANGE", "Adresse de l’établissement modifiée", "high"),
        ("directors", "DIRECTOR_CHANGE", "Dirigeant légal modifié", "high"),
        ("company_status", "COMPANY_STATUS_CHANGE", "Statut de l’entreprise modifié", "critical"),
        ("establishment_status", "ESTABLISHMENT_STATUS_CHANGE", "Statut de l’établissement modifié", "critical"),
        ("legal_name", "LEGAL_NAME_CHANGE", "Raison sociale modifiée", "medium"),
        ("legal_form", "LEGAL_FORM_CHANGE", "Forme juridique modifiée", "medium"),
    )
    for field, alert_type, title, severity in fields:
        previous = old.get(field)
        current = new.get(field)
        if previous != current:
            changes.append({
                "field": field,
                "alert_type": alert_type,
                "title": title,
                "severity": severity,
                "old_value": previous,
                "new_value": current,
            })
    if (
        old.get("postal_code") != new.get("postal_code")
        or old.get("city") != new.get("city")
    ) and not any(change["alert_type"] == "ADDRESS_CHANGE" for change in changes):
        changes.append({
            "field": "address",
            "alert_type": "ADDRESS_CHANGE",
            "title": "Adresse de l’établissement modifiée",
            "severity": "high",
            "old_value": {
                "address": old.get("address"), "postal_code": old.get("postal_code"), "city": old.get("city"),
            },
            "new_value": {
                "address": new.get("address"), "postal_code": new.get("postal_code"), "city": new.get("city"),
            },
        })
    return changes


def _fingerprint(code_union: str, alert_type: str, source_key: str) -> str:
    raw = f"{code_union}|{alert_type}|{source_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _insert_alert(
    conn,
    *,
    code_union: str,
    siret: str,
    alert_type: str,
    severity: str,
    title: str,
    old_value: Any,
    new_value: Any,
    source: str,
    source_key: str,
    source_url: Optional[str] = None,
) -> bool:
    fingerprint = _fingerprint(code_union, alert_type, source_key)
    alert_id = str(uuid.uuid4())
    params = {
        "id": alert_id,
        "fingerprint": fingerprint,
        "code_union": code_union,
        "siret": siret,
        "alert_type": alert_type,
        "severity": severity,
        "title": title,
        "old_value": _json(old_value) if old_value is not None else None,
        "new_value": _json(new_value) if new_value is not None else None,
        "source": source,
        "source_url": source_url,
        "detected_at": _now(),
    }
    if _is_pg():
        sql = f"""
            INSERT INTO {ALERT_TABLE}
              (id, fingerprint, code_union, siret, alert_type, severity, title,
               old_value, new_value, source, source_url, detected_at)
            VALUES
              (:id, :fingerprint, :code_union, :siret, :alert_type, :severity, :title,
               CAST(:old_value AS jsonb), CAST(:new_value AS jsonb), :source, :source_url, :detected_at)
            ON CONFLICT (fingerprint) DO NOTHING
        """
    else:
        sql = f"""
            INSERT OR IGNORE INTO {ALERT_TABLE}
              (id, fingerprint, code_union, siret, alert_type, severity, title,
               old_value, new_value, source, source_url, detected_at)
            VALUES
              (:id, :fingerprint, :code_union, :siret, :alert_type, :severity, :title,
               :old_value, :new_value, :source, :source_url, :detected_at)
        """
    result = conn.execute(text(sql), params)
    return bool(result.rowcount)


def _save_snapshot(
    conn,
    code_union: str,
    snapshot: Dict[str, Any],
    event_ids: Iterable[str],
) -> None:
    params = {
        "id": str(uuid.uuid4()),
        "code_union": code_union,
        **{key: snapshot.get(key) for key in (
            "siret", "siren", "legal_name", "address", "postal_code", "city",
            "company_status", "establishment_status", "legal_form", "snapshot_hash",
        )},
        "directors": _json(snapshot.get("directors") or []),
        "bodacc_event_ids": _json(sorted(set(event_ids))),
        "fetched_at": _now(),
    }
    if _is_pg():
        sql = f"""
            INSERT INTO {SNAPSHOT_TABLE}
              (id, code_union, siret, siren, legal_name, address, postal_code, city,
               company_status, establishment_status, legal_form, directors,
               bodacc_event_ids, snapshot_hash, fetched_at)
            VALUES
              (:id, :code_union, :siret, :siren, :legal_name, :address, :postal_code, :city,
               :company_status, :establishment_status, :legal_form, CAST(:directors AS jsonb),
               CAST(:bodacc_event_ids AS jsonb), :snapshot_hash, :fetched_at)
            ON CONFLICT (code_union) DO UPDATE SET
              siret=EXCLUDED.siret, siren=EXCLUDED.siren, legal_name=EXCLUDED.legal_name,
              address=EXCLUDED.address, postal_code=EXCLUDED.postal_code, city=EXCLUDED.city,
              company_status=EXCLUDED.company_status,
              establishment_status=EXCLUDED.establishment_status,
              legal_form=EXCLUDED.legal_form, directors=EXCLUDED.directors,
              bodacc_event_ids=EXCLUDED.bodacc_event_ids,
              snapshot_hash=EXCLUDED.snapshot_hash, fetched_at=EXCLUDED.fetched_at
        """
    else:
        sql = f"""
            INSERT INTO {SNAPSHOT_TABLE}
              (id, code_union, siret, siren, legal_name, address, postal_code, city,
               company_status, establishment_status, legal_form, directors,
               bodacc_event_ids, snapshot_hash, fetched_at)
            VALUES
              (:id, :code_union, :siret, :siren, :legal_name, :address, :postal_code, :city,
               :company_status, :establishment_status, :legal_form, :directors,
               :bodacc_event_ids, :snapshot_hash, :fetched_at)
            ON CONFLICT(code_union) DO UPDATE SET
              siret=excluded.siret, siren=excluded.siren, legal_name=excluded.legal_name,
              address=excluded.address, postal_code=excluded.postal_code, city=excluded.city,
              company_status=excluded.company_status,
              establishment_status=excluded.establishment_status,
              legal_form=excluded.legal_form, directors=excluded.directors,
              bodacc_event_ids=excluded.bodacc_event_ids,
              snapshot_hash=excluded.snapshot_hash, fetched_at=excluded.fetched_at
        """
    conn.execute(text(sql), params)


def _row(row: Any) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    data = dict(row)
    data["directors"] = _loads(data.get("directors"), [])
    data["bodacc_event_ids"] = _loads(data.get("bodacc_event_ids"), [])
    return data


def sync_client(code_union: str, *, baseline_days: int = 365) -> Dict[str, Any]:
    ensure_tables()
    client = nathalie_adherents.get_by_code(code_union)
    if not client:
        raise ValueError(f"Adhérent {code_union} introuvable")
    siret = _digits(client.get("siret"))
    if len(siret) != 14:
        raise ValueError("SIRET absent ou invalide")
    snapshot = fetch_company_snapshot(siret)
    events = fetch_bodacc_events(snapshot["siren"])
    created = 0
    with engine.begin() as conn:
        old = _row(conn.execute(
            text(f"SELECT * FROM {SNAPSHOT_TABLE} WHERE code_union=:code"),
            {"code": code_union},
        ).mappings().first())
        if old:
            for change in snapshot_changes(old, snapshot):
                if _insert_alert(
                    conn,
                    code_union=code_union,
                    siret=siret,
                    alert_type=change["alert_type"],
                    severity=change["severity"],
                    title=change["title"],
                    old_value=change["old_value"],
                    new_value=change["new_value"],
                    source="Annuaire des Entreprises",
                    source_key=f"{snapshot['snapshot_hash']}:{change['field']}",
                    source_url=f"https://annuaire-entreprises.data.gouv.fr/entreprise/{snapshot['siren']}",
                ):
                    created += 1
        known_event_ids = set((old or {}).get("bodacc_event_ids") or [])
        cutoff = date.today() - timedelta(days=baseline_days)
        for event in events:
            try:
                publication_date = date.fromisoformat(event["publication_date"])
            except (TypeError, ValueError):
                publication_date = date.min
            if event["id"] in known_event_ids or (not old and publication_date < cutoff):
                continue
            nature = event.get("nature") or "Nouvelle procédure collective"
            severity = "critical" if any(
                word in nature.casefold() for word in ("redressement", "liquidation", "sauvegarde")
            ) else "high"
            if _insert_alert(
                conn,
                code_union=code_union,
                siret=siret,
                alert_type="COLLECTIVE_PROCEEDING",
                severity=severity,
                title=nature,
                old_value=None,
                new_value=event,
                source="BODACC",
                source_key=event["id"],
                source_url=event.get("url"),
            ):
                created += 1
        _save_snapshot(conn, code_union, snapshot, [event["id"] for event in events])
    return {"code_union": code_union, "alerts_created": created, "siren": snapshot["siren"]}


def sync_all(*, force: bool = False, min_age_hours: int = 20) -> Dict[str, Any]:
    ensure_tables()
    clients = nathalie_adherents.list_clients()
    if not force:
        with engine.connect() as conn:
            latest = conn.execute(text(f"SELECT MAX(fetched_at) FROM {SNAPSHOT_TABLE}")).scalar()
        if latest:
            parsed = latest if isinstance(latest, datetime) else datetime.fromisoformat(str(latest).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - parsed < timedelta(hours=min_age_hours):
                return {"skipped": True, "reason": "veille déjà exécutée récemment", "total": 0}
    results, errors = [], []
    for client in clients:
        code_union = _clean_text(client.get("code_union"))
        if len(_digits(client.get("siret"))) != 14:
            continue
        try:
            results.append(sync_client(code_union))
        except Exception as exc:
            errors.append({"code_union": code_union, "error": str(exc)})
    return {
        "skipped": False,
        "total": len(results),
        "alerts_created": sum(row["alerts_created"] for row in results),
        "errors": errors,
    }


def list_alerts(
    *,
    acknowledged: Optional[bool] = None,
    code_union: Optional[str] = None,
    limit: int = 200,
) -> Dict[str, Any]:
    ensure_tables()
    clauses, params = [], {"limit": max(1, min(limit, 500))}
    if acknowledged is not None:
        clauses.append("acknowledged=:acknowledged")
        params["acknowledged"] = acknowledged if _is_pg() else int(acknowledged)
    if code_union:
        clauses.append("code_union=:code_union")
        params["code_union"] = code_union.strip().upper()
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = conn.execute(
            text(f"SELECT * FROM {ALERT_TABLE}{where} ORDER BY detected_at DESC LIMIT :limit"),
            params,
        ).mappings().all()
        open_count = conn.execute(
            text(f"SELECT COUNT(*) FROM {ALERT_TABLE} WHERE acknowledged=:ack"),
            {"ack": False if _is_pg() else 0},
        ).scalar() or 0
    alerts = []
    for raw in rows:
        item = dict(raw)
        item["old_value"] = _loads(item.get("old_value"), None)
        item["new_value"] = _loads(item.get("new_value"), None)
        item["acknowledged"] = bool(item.get("acknowledged"))
        for key in ("detected_at", "acknowledged_at"):
            if hasattr(item.get(key), "isoformat"):
                item[key] = item[key].isoformat()
        alerts.append(item)
    return {"alerts": alerts, "total": len(alerts), "unacknowledged": int(open_count)}


def acknowledge(alert_id: str, actor: str) -> Dict[str, Any]:
    ensure_tables()
    ack_value = True if _is_pg() else 1
    with engine.begin() as conn:
        result = conn.execute(
            text(f"""
                UPDATE {ALERT_TABLE}
                SET acknowledged=:ack, acknowledged_at=:now, acknowledged_by=:actor
                WHERE id=:id
            """),
            {"ack": ack_value, "now": _now(), "actor": actor, "id": alert_id},
        )
    if not result.rowcount:
        raise ValueError("Alerte introuvable")
    return {"id": alert_id, "acknowledged": True}
