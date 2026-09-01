"""
Suivi des impayés adhérents (plateformes + partenaires).

Tables Supabase `impayes` + `impayes_events` : source de vérité pour l'app
et pour un futur agent IA (statuts normalisés, journal d'événements).
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text

from app.database import engine

IMPAYES_TABLE = "impayes"
EVENTS_TABLE = "impayes_events"

STATUTS = (
    "en_attente",
    "en_cours",
    "echeancier",
    "contentieux",
    "regularise",
    "abandonne",
)
STATUTS_ACTIFS = ("en_attente", "en_cours", "echeancier", "contentieux")

STATUT_LABELS = {
    "en_attente": "En attente",
    "en_cours": "En cours de paiement",
    "echeancier": "Échéancier",
    "contentieux": "Contentieux",
    "regularise": "Régularisé",
    "abandonne": "Abandonné",
}

PLATEFORMES_CONNUES = {
    "ACR",
    "DCA",
    "EXADIS",
    "ALLIANCE",
    "ALLIANCE AUTOMOTIVE",
    "OTTO'GO",
    "OTTOGO",
    "DASIR",
}

COLUMNS = [
    "id",
    "code_union",
    "nom_magasin",
    "commercial",
    "plateforme",
    "partenaire_type",
    "motif",
    "date_facture",
    "date_facture_label",
    "montant",
    "date_notif_dette",
    "statut",
    "statut_brut",
    "commentaires",
    "suivi",
    "source",
    "source_ref",
    "import_batch_id",
    "is_active",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "statut_changed_at",
]


def _is_pg() -> bool:
    return engine.dialect.name == "postgresql"


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _uuid() -> str:
    return str(uuid.uuid4())


def parse_montant(value: Any) -> float:
    if value is None or value == "" or value == "-":
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        return round(float(value), 2)
    s = str(value).strip()
    s = s.replace("€", "").replace("\xa0", "").replace("\u202f", "")
    s = re.sub(r"\s+", "", s)
    s = s.replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    if s in ("", "-", ".", "-."):
        return 0.0
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def normalize_statut(raw: Any) -> str:
    if raw is None or str(raw).strip() == "":
        return "en_attente"
    s = str(raw).upper()
    s = re.sub(r"[^\w\sÀ-ÿ']", " ", s)
    if "REGULAR" in s or "RÉGULAR" in s or "REGUL" in s:
        return "regularise"
    if "CONTENTIEUX" in s:
        return "contentieux"
    if "ECHEANC" in s or "ÉCHÉANC" in s or "ECHÉANC" in s:
        return "echeancier"
    if "ABANDON" in s or "PERTE" in s or "DOUTEUX" in s:
        return "abandonne"
    if "COURS" in s:
        return "en_cours"
    if "ATTENTE" in s:
        return "en_attente"
    return "en_attente"


def normalize_plateforme(raw: Any) -> str:
    if raw is None:
        return ""
    s = str(raw).strip().upper()
    s = re.sub(r"\s+", " ", s)
    if s in ("ALLIANCE AUTOMOTIVE", "ALLIANCE AUTO"):
        return "ALLIANCE"
    if s in ("OTTOGO", "OTTO GO"):
        return "OTTO'GO"
    return s


def partenaire_type_of(plateforme: str) -> str:
    key = (plateforme or "").upper().replace(" ", "")
    if key in {"ACR", "DCA", "EXADIS", "ALLIANCE", "OTTO'GO", "OTTOGO", "DASIR"}:
        return "plateforme"
    return "partenaire"


def normalize_code_union(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if s in ("", "?", "-", "N/A", "NA", "NONE"):
        return None
    return s


def _parse_date(value: Any) -> Tuple[Optional[str], Optional[str]]:
    """Retourne (date ISO YYYY-MM-DD | None, label texte | None)."""
    if value is None or value == "":
        return None, None
    if isinstance(value, datetime):
        return value.date().isoformat(), value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.isoformat(), value.strftime("%d/%m/%Y")
    s = str(value).strip()
    if not s or s == "-":
        return None, None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            d = datetime.strptime(s[:10], fmt).date()
            return d.isoformat(), s
        except ValueError:
            continue
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m:
        return m.group(1), s
    return None, s


def _row_to_dict(row) -> Dict[str, Any]:
    data = dict(row)
    montant = data.get("montant")
    if montant is not None:
        data["montant"] = float(montant)
    for key in (
        "date_facture",
        "date_notif_dette",
        "created_at",
        "updated_at",
        "statut_changed_at",
    ):
        val = data.get(key)
        if hasattr(val, "isoformat"):
            data[key] = val.isoformat()
    data["statut_label"] = STATUT_LABELS.get(data.get("statut") or "", data.get("statut"))
    data["actif"] = (data.get("statut") in STATUTS_ACTIFS) and bool(data.get("is_active", True))
    return data


def ensure_tables() -> None:
    """Crée les tables si absentes (Postgres/Supabase ou SQLite local)."""
    if _is_pg():
        ddl_impayes = f'''
        CREATE TABLE IF NOT EXISTS {IMPAYES_TABLE} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          code_union text,
          nom_magasin text NOT NULL DEFAULT '',
          commercial text,
          plateforme text NOT NULL DEFAULT '',
          partenaire_type text NOT NULL DEFAULT 'plateforme',
          motif text,
          date_facture date,
          date_facture_label text,
          montant numeric(14,2) NOT NULL DEFAULT 0,
          date_notif_dette date,
          statut text NOT NULL DEFAULT 'en_attente',
          statut_brut text,
          commentaires text,
          suivi text,
          source text NOT NULL DEFAULT 'manuel',
          source_ref text,
          import_batch_id uuid,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          created_by text,
          updated_by text,
          statut_changed_at timestamptz DEFAULT now()
        )
        '''
        ddl_events = f'''
        CREATE TABLE IF NOT EXISTS {EVENTS_TABLE} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          impaye_id uuid NOT NULL REFERENCES {IMPAYES_TABLE}(id) ON DELETE CASCADE,
          event_type text NOT NULL,
          old_statut text,
          new_statut text,
          commentaire text,
          actor text,
          actor_type text NOT NULL DEFAULT 'humain',
          payload jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
        '''
        comments = [
            f"COMMENT ON TABLE {IMPAYES_TABLE} IS "
            "'Suivi impayés adhérents Union. Source de vérité app + agent IA.'",
            f"COMMENT ON COLUMN {IMPAYES_TABLE}.statut IS "
            "'en_attente | en_cours | echeancier | contentieux | regularise | abandonne'",
            f"COMMENT ON COLUMN {IMPAYES_TABLE}.source IS "
            "'manuel | excel | partenaire | agent_ia'",
            f"COMMENT ON TABLE {EVENTS_TABLE} IS "
            "'Journal (statuts, notes, imports) destiné à l''agent IA.'",
        ]
    else:
        ddl_impayes = f'''
        CREATE TABLE IF NOT EXISTS {IMPAYES_TABLE} (
          id TEXT PRIMARY KEY,
          code_union TEXT,
          nom_magasin TEXT NOT NULL DEFAULT '',
          commercial TEXT,
          plateforme TEXT NOT NULL DEFAULT '',
          partenaire_type TEXT NOT NULL DEFAULT 'plateforme',
          motif TEXT,
          date_facture TEXT,
          date_facture_label TEXT,
          montant REAL NOT NULL DEFAULT 0,
          date_notif_dette TEXT,
          statut TEXT NOT NULL DEFAULT 'en_attente',
          statut_brut TEXT,
          commentaires TEXT,
          suivi TEXT,
          source TEXT NOT NULL DEFAULT 'manuel',
          source_ref TEXT,
          import_batch_id TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          created_by TEXT,
          updated_by TEXT,
          statut_changed_at TEXT
        )
        '''
        ddl_events = f'''
        CREATE TABLE IF NOT EXISTS {EVENTS_TABLE} (
          id TEXT PRIMARY KEY,
          impaye_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          old_statut TEXT,
          new_statut TEXT,
          commentaire TEXT,
          actor TEXT,
          actor_type TEXT NOT NULL DEFAULT 'humain',
          payload TEXT,
          created_at TEXT NOT NULL
        )
        '''
        comments = []

    indexes = [
        f"CREATE INDEX IF NOT EXISTS idx_impayes_code_union ON {IMPAYES_TABLE}(code_union)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_statut ON {IMPAYES_TABLE}(statut)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_plateforme ON {IMPAYES_TABLE}(plateforme)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_commercial ON {IMPAYES_TABLE}(commercial)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_active ON {IMPAYES_TABLE}(is_active)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_events_impaye ON {EVENTS_TABLE}(impaye_id)",
        f"CREATE INDEX IF NOT EXISTS idx_impayes_events_created ON {EVENTS_TABLE}(created_at)",
    ]

    with engine.begin() as conn:
        conn.execute(text(ddl_impayes))
        conn.execute(text(ddl_events))
        for stmt in comments:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        for stmt in indexes:
            conn.execute(text(stmt))
        if _is_pg():
            conn.execute(text(f"ALTER TABLE {IMPAYES_TABLE} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"ALTER TABLE {EVENTS_TABLE} ENABLE ROW LEVEL SECURITY"))
            # Accès API = rôle postgres (bypass RLS). Anon key bloquée. Agent IA : service_role.


def _add_event(
    conn,
    impaye_id: str,
    event_type: str,
    *,
    old_statut: Optional[str] = None,
    new_statut: Optional[str] = None,
    commentaire: Optional[str] = None,
    actor: Optional[str] = None,
    actor_type: str = "humain",
    payload: Optional[Dict] = None,
) -> None:
    payload_val = json.dumps(payload, ensure_ascii=False) if payload else None
    payload_expr = "CAST(:payload AS jsonb)" if _is_pg() else ":payload"
    conn.execute(
        text(
            f"""
            INSERT INTO {EVENTS_TABLE}
              (id, impaye_id, event_type, old_statut, new_statut, commentaire, actor, actor_type, payload, created_at)
            VALUES
              (:id, :impaye_id, :event_type, :old_statut, :new_statut, :commentaire, :actor, :actor_type, {payload_expr}, :created_at)
            """
        ),
        {
            "id": _uuid(),
            "impaye_id": impaye_id,
            "event_type": event_type,
            "old_statut": old_statut,
            "new_statut": new_statut,
            "commentaire": commentaire,
            "actor": actor,
            "actor_type": actor_type,
            "payload": payload_val,
            "created_at": _now_iso() if not _is_pg() else datetime.utcnow(),
        },
    )


def list_impayes(
    *,
    code_union: Optional[str] = None,
    statut: Optional[str] = None,
    plateforme: Optional[str] = None,
    commercial: Optional[str] = None,
    q: Optional[str] = None,
    actifs_only: bool = False,
    include_inactive: bool = False,
) -> List[Dict[str, Any]]:
    ensure_tables()
    clauses = []
    params: Dict[str, Any] = {}
    if not include_inactive:
        clauses.append("is_active = TRUE" if _is_pg() else "is_active = 1")
    if code_union:
        clauses.append("UPPER(code_union) = :code_union")
        params["code_union"] = code_union.strip().upper()
    if statut:
        clauses.append("statut = :statut")
        params["statut"] = statut
    if plateforme:
        clauses.append("UPPER(plateforme) = :plateforme")
        params["plateforme"] = plateforme.strip().upper()
    if commercial:
        clauses.append("UPPER(TRIM(commercial)) = :commercial")
        params["commercial"] = commercial.strip().upper()
    if actifs_only:
        placeholders = ", ".join(f":st_{i}" for i, _ in enumerate(STATUTS_ACTIFS))
        clauses.append(f"statut IN ({placeholders})")
        for i, st in enumerate(STATUTS_ACTIFS):
            params[f"st_{i}"] = st
    if q:
        clauses.append(
            "(UPPER(COALESCE(code_union,'')) LIKE :q OR UPPER(COALESCE(nom_magasin,'')) LIKE :q "
            "OR UPPER(COALESCE(plateforme,'')) LIKE :q OR UPPER(COALESCE(commentaires,'')) LIKE :q "
            "OR UPPER(COALESCE(suivi,'')) LIKE :q)"
        )
        params["q"] = f"%{q.strip().upper()}%"
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM {IMPAYES_TABLE}{where} ORDER BY updated_at DESC"
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [_row_to_dict(r) for r in rows]


def get_impaye(impaye_id: str) -> Optional[Dict[str, Any]]:
    ensure_tables()
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT * FROM {IMPAYES_TABLE} WHERE id = :id"),
            {"id": impaye_id},
        ).mappings().first()
    return _row_to_dict(row) if row else None


def list_events(impaye_id: str) -> List[Dict[str, Any]]:
    ensure_tables()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"SELECT * FROM {EVENTS_TABLE} WHERE impaye_id = :id ORDER BY created_at DESC"
            ),
            {"id": impaye_id},
        ).mappings().all()
    out = []
    for row in rows:
        data = dict(row)
        payload = data.get("payload")
        if isinstance(payload, str):
            try:
                data["payload"] = json.loads(payload)
            except Exception:
                pass
        if hasattr(data.get("created_at"), "isoformat"):
            data["created_at"] = data["created_at"].isoformat()
        out.append(data)
    return out


def summary(code_union: Optional[str] = None) -> Dict[str, Any]:
    ensure_tables()
    clauses = ["is_active = TRUE"] if _is_pg() else ["is_active = 1"]
    params: Dict[str, Any] = {}
    if code_union:
        clauses.append("UPPER(code_union) = :code_union")
        params["code_union"] = code_union.strip().upper()
    where = " WHERE " + " AND ".join(clauses)
    sql = f"""
        SELECT
          statut,
          plateforme,
          partenaire_type,
          COUNT(*) AS nb,
          COALESCE(SUM(montant), 0) AS montant
        FROM {IMPAYES_TABLE}
        {where}
        GROUP BY statut, plateforme, partenaire_type
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()

    by_statut: Dict[str, Dict[str, Any]] = {
        st: {"statut": st, "label": STATUT_LABELS[st], "nb": 0, "montant": 0.0}
        for st in STATUTS
    }
    by_plateforme: Dict[str, Dict[str, Any]] = {}
    total_nb = 0
    total_montant = 0.0
    actifs_nb = 0
    actifs_montant = 0.0

    for row in rows:
        st = row["statut"] or "en_attente"
        plat = row["plateforme"] or "AUTRE"
        nb = int(row["nb"] or 0)
        montant = float(row["montant"] or 0)
        if st not in by_statut:
            by_statut[st] = {"statut": st, "label": st, "nb": 0, "montant": 0.0}
        by_statut[st]["nb"] += nb
        by_statut[st]["montant"] += montant
        if plat not in by_plateforme:
            by_plateforme[plat] = {
                "plateforme": plat,
                "partenaire_type": row["partenaire_type"] or "partenaire",
                "nb": 0,
                "montant": 0.0,
                "actifs_nb": 0,
                "actifs_montant": 0.0,
            }
        by_plateforme[plat]["nb"] += nb
        by_plateforme[plat]["montant"] = round(by_plateforme[plat]["montant"] + montant, 2)
        total_nb += nb
        total_montant += montant
        if st in STATUTS_ACTIFS:
            actifs_nb += nb
            actifs_montant += montant
            by_plateforme[plat]["actifs_nb"] += nb
            by_plateforme[plat]["actifs_montant"] = round(by_plateforme[plat]["actifs_montant"] + montant, 2)

    return {
        "total_nb": total_nb,
        "total_montant": round(total_montant, 2),
        "actifs_nb": actifs_nb,
        "actifs_montant": round(actifs_montant, 2),
        "by_statut": list(by_statut.values()),
        "by_plateforme": sorted(
            by_plateforme.values(), key=lambda x: x["actifs_montant"], reverse=True
        ),
        "statuts": [{"value": k, "label": v} for k, v in STATUT_LABELS.items()],
    }


def flags_by_codes(codes: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
    """Indicateurs par code_union (fiche adhérent / liste)."""
    ensure_tables()
    clauses = ["is_active = TRUE"] if _is_pg() else ["is_active = 1"]
    params: Dict[str, Any] = {}
    if codes:
        placeholders = []
        for i, code in enumerate(codes):
            key = f"c_{i}"
            placeholders.append(f":{key}")
            params[key] = code.strip().upper()
        clauses.append(f"UPPER(code_union) IN ({', '.join(placeholders)})")
    where = " WHERE " + " AND ".join(clauses)
    sql = f"""
        SELECT code_union, statut, COUNT(*) AS nb, COALESCE(SUM(montant), 0) AS montant
        FROM {IMPAYES_TABLE}
        {where}
          AND code_union IS NOT NULL AND code_union <> ''
        GROUP BY code_union, statut
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()

    severity = {st: i for i, st in enumerate(
        ("abandonne", "regularise", "en_attente", "en_cours", "echeancier", "contentieux")
    )}
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        code = (row["code_union"] or "").upper()
        if not code:
            continue
        bucket = out.setdefault(
            code,
            {
                "code_union": code,
                "nb": 0,
                "montant": 0.0,
                "actifs_nb": 0,
                "actifs_montant": 0.0,
                "worst_statut": "regularise",
                "has_impaye": False,
            },
        )
        st = row["statut"] or "en_attente"
        nb = int(row["nb"] or 0)
        montant = float(row["montant"] or 0)
        bucket["nb"] += nb
        bucket["montant"] = round(bucket["montant"] + montant, 2)
        if st in STATUTS_ACTIFS:
            bucket["actifs_nb"] += nb
            bucket["actifs_montant"] = round(bucket["actifs_montant"] + montant, 2)
            bucket["has_impaye"] = True
            if severity.get(st, 0) >= severity.get(bucket["worst_statut"], 0):
                bucket["worst_statut"] = st
    return out


def create_impaye(payload: Dict[str, Any], actor: Optional[str] = None) -> Dict[str, Any]:
    ensure_tables()
    statut_brut = payload.get("statut_brut") or payload.get("statut")
    statut = payload.get("statut") or normalize_statut(statut_brut)
    if statut not in STATUTS:
        statut = "en_attente"
    plateforme = normalize_plateforme(payload.get("plateforme"))
    date_facture, date_label = _parse_date(payload.get("date_facture"))
    if payload.get("date_facture_label"):
        date_label = str(payload["date_facture_label"]).strip()
    notif, _ = _parse_date(payload.get("date_notif_dette"))
    now = datetime.utcnow()
    record = {
        "id": payload.get("id") or _uuid(),
        "code_union": normalize_code_union(payload.get("code_union")),
        "nom_magasin": (payload.get("nom_magasin") or "").strip(),
        "commercial": (payload.get("commercial") or None),
        "plateforme": plateforme,
        "partenaire_type": payload.get("partenaire_type") or partenaire_type_of(plateforme),
        "motif": payload.get("motif") or None,
        "date_facture": date_facture,
        "date_facture_label": date_label,
        "montant": parse_montant(payload.get("montant")),
        "date_notif_dette": notif,
        "statut": statut,
        "statut_brut": str(statut_brut).strip() if statut_brut else None,
        "commentaires": payload.get("commentaires") or None,
        "suivi": payload.get("suivi") or None,
        "source": payload.get("source") or "manuel",
        "source_ref": payload.get("source_ref") or None,
        "import_batch_id": payload.get("import_batch_id"),
        "is_active": True if _is_pg() else 1,
        "created_at": now if _is_pg() else _now_iso(),
        "updated_at": now if _is_pg() else _now_iso(),
        "created_by": actor,
        "updated_by": actor,
        "statut_changed_at": now if _is_pg() else _now_iso(),
    }
    if record["source"] not in ("manuel", "excel", "partenaire", "agent_ia"):
        record["source"] = "manuel"
    cols = ", ".join(COLUMNS)
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    with engine.begin() as conn:
        conn.execute(text(f"INSERT INTO {IMPAYES_TABLE} ({cols}) VALUES ({placeholders})"), record)
        _add_event(
            conn,
            record["id"],
            "created",
            new_statut=statut,
            actor=actor,
            actor_type="import" if record["source"] in ("excel", "import") else (
                "agent_ia" if record["source"] == "agent_ia" else "humain"
            ),
            payload={"source": record["source"]},
        )
    created = get_impaye(record["id"])
    if not created:
        raise RuntimeError("Impayé créé mais introuvable")
    return created


def update_impaye(
    impaye_id: str,
    payload: Dict[str, Any],
    actor: Optional[str] = None,
) -> Dict[str, Any]:
    ensure_tables()
    current = get_impaye(impaye_id)
    if not current:
        raise KeyError(impaye_id)

    allowed = {
        "code_union",
        "nom_magasin",
        "commercial",
        "plateforme",
        "partenaire_type",
        "motif",
        "date_facture",
        "date_facture_label",
        "montant",
        "date_notif_dette",
        "commentaires",
        "suivi",
        "is_active",
    }
    sets = []
    params: Dict[str, Any] = {"id": impaye_id, "updated_by": actor}
    for key in allowed:
        if key not in payload:
            continue
        val = payload[key]
        if key == "code_union":
            val = normalize_code_union(val)
        elif key == "plateforme":
            val = normalize_plateforme(val)
            if "partenaire_type" not in payload:
                sets.append("partenaire_type = :partenaire_type")
                params["partenaire_type"] = partenaire_type_of(val)
        elif key == "montant":
            val = parse_montant(val)
        elif key in ("date_facture", "date_notif_dette"):
            parsed, label = _parse_date(val)
            val = parsed
            if key == "date_facture" and "date_facture_label" not in payload and label:
                sets.append("date_facture_label = :date_facture_label")
                params["date_facture_label"] = label
        elif key == "is_active":
            val = bool(val) if _is_pg() else (1 if val else 0)
        sets.append(f"{key} = :{key}")
        params[key] = val

    if not sets:
        return current

    now = datetime.utcnow() if _is_pg() else _now_iso()
    sets.append("updated_at = :updated_at")
    sets.append("updated_by = :updated_by")
    params["updated_at"] = now
    sql = f"UPDATE {IMPAYES_TABLE} SET {', '.join(sets)} WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)
        _add_event(
            conn,
            impaye_id,
            "updated",
            actor=actor,
            payload={k: payload[k] for k in payload if k in allowed},
        )
    updated = get_impaye(impaye_id)
    if not updated:
        raise KeyError(impaye_id)
    return updated


def change_statut(
    impaye_id: str,
    new_statut: str,
    *,
    commentaire: Optional[str] = None,
    actor: Optional[str] = None,
    actor_type: str = "humain",
) -> Dict[str, Any]:
    ensure_tables()
    if new_statut not in STATUTS:
        raise ValueError(f"Statut inconnu: {new_statut}")
    current = get_impaye(impaye_id)
    if not current:
        raise KeyError(impaye_id)
    old = current["statut"]
    if old == new_statut and not commentaire:
        return current
    now = datetime.utcnow() if _is_pg() else _now_iso()
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                UPDATE {IMPAYES_TABLE}
                SET statut = :statut,
                    updated_at = :updated_at,
                    updated_by = :updated_by,
                    statut_changed_at = :statut_changed_at
                WHERE id = :id
                """
            ),
            {
                "id": impaye_id,
                "statut": new_statut,
                "updated_at": now,
                "updated_by": actor,
                "statut_changed_at": now,
            },
        )
        if commentaire:
            # Append to suivi rather than overwrite
            existing = current.get("suivi") or ""
            stamp = datetime.utcnow().strftime("%d/%m/%Y")
            line = f"{stamp} : {commentaire}".strip()
            suivi = (existing + "\n" + line).strip() if existing else line
            conn.execute(
                text(f"UPDATE {IMPAYES_TABLE} SET suivi = :suivi WHERE id = :id"),
                {"id": impaye_id, "suivi": suivi},
            )
        _add_event(
            conn,
            impaye_id,
            "statut_changed" if old != new_statut else "note",
            old_statut=old,
            new_statut=new_statut,
            commentaire=commentaire,
            actor=actor,
            actor_type=actor_type,
        )
    updated = get_impaye(impaye_id)
    if not updated:
        raise KeyError(impaye_id)
    return updated


def add_note(impaye_id: str, commentaire: str, actor: Optional[str] = None) -> Dict[str, Any]:
    current = get_impaye(impaye_id)
    if not current:
        raise KeyError(impaye_id)
    stamp = datetime.utcnow().strftime("%d/%m/%Y")
    line = f"{stamp} : {commentaire}".strip()
    existing = current.get("suivi") or ""
    suivi = (existing + "\n" + line).strip() if existing else line
    now = datetime.utcnow() if _is_pg() else _now_iso()
    with engine.begin() as conn:
        conn.execute(
            text(
                f"UPDATE {IMPAYES_TABLE} SET suivi = :suivi, updated_at = :updated_at, updated_by = :updated_by WHERE id = :id"
            ),
            {"id": impaye_id, "suivi": suivi, "updated_at": now, "updated_by": actor},
        )
        _add_event(conn, impaye_id, "note", commentaire=commentaire, actor=actor)
    updated = get_impaye(impaye_id)
    if not updated:
        raise KeyError(impaye_id)
    return updated
