"""
Annuaire adhérents Union pour Nathalie (création / consultation).

Table Supabase `nathalie_adherents` : source de vérité à la place de LISTE CLIENT 2 (Sheets).
Drive (pièces) et Gmail (ouvertures fournisseurs) restent gérés dans nathalie_service.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.database import engine

TABLE = "nathalie_adherents"

COLUMNS = [
    "id",
    "code_union",
    "nom_client",
    "groupe",
    "contact_magasin",
    "telephone",
    "mail",
    "adresse",
    "code_postal",
    "ville",
    "siret",
    "tva",
    "notes",
    "is_closed",
    "agent_union",
    "contrat_union",
    "ouverture_chez",
    "rib_url",
    "kbis_url",
    "piece_identite_url",
    "drive_folder_id",
    "drive_link",
    "drive_checked_at",
    "source",
    "created_at",
    "updated_at",
]


def _is_pg() -> bool:
    return engine.dialect.name == "postgresql"


def _now():
    return datetime.utcnow() if _is_pg() else datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _uuid() -> str:
    return str(uuid.uuid4())


def _bool(val) -> Any:
    if _is_pg():
        return bool(val)
    return 1 if val else 0


def ensure_tables() -> None:
    if _is_pg():
        ddl = f'''
        CREATE TABLE IF NOT EXISTS {TABLE} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          code_union text NOT NULL UNIQUE,
          nom_client text NOT NULL DEFAULT '',
          groupe text,
          contact_magasin text,
          telephone text,
          mail text,
          adresse text,
          code_postal text,
          ville text,
          siret text,
          tva text,
          notes text,
          is_closed boolean NOT NULL DEFAULT false,
          agent_union text,
          contrat_union text,
          ouverture_chez text,
          rib_url text,
          kbis_url text,
          piece_identite_url text,
          drive_folder_id text,
          drive_link text,
          drive_checked_at timestamptz,
          source text NOT NULL DEFAULT 'manuel',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        '''
        comments = [
            f"COMMENT ON TABLE {TABLE} IS "
            "'Annuaire adhérents Union pour Nathalie (création de comptes). Remplace LISTE CLIENT 2 Sheets.'",
        ]
    else:
        ddl = f'''
        CREATE TABLE IF NOT EXISTS {TABLE} (
          id TEXT PRIMARY KEY,
          code_union TEXT NOT NULL UNIQUE,
          nom_client TEXT NOT NULL DEFAULT '',
          groupe TEXT,
          contact_magasin TEXT,
          telephone TEXT,
          mail TEXT,
          adresse TEXT,
          code_postal TEXT,
          ville TEXT,
          siret TEXT,
          tva TEXT,
          notes TEXT,
          is_closed INTEGER NOT NULL DEFAULT 0,
          agent_union TEXT,
          contrat_union TEXT,
          ouverture_chez TEXT,
          rib_url TEXT,
          kbis_url TEXT,
          piece_identite_url TEXT,
          drive_folder_id TEXT,
          drive_link TEXT,
          drive_checked_at TEXT,
          source TEXT NOT NULL DEFAULT 'manuel',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        '''
        comments = []
    indexes = [
        f"CREATE INDEX IF NOT EXISTS idx_nathalie_adherents_groupe ON {TABLE}(groupe)",
        f"CREATE INDEX IF NOT EXISTS idx_nathalie_adherents_ville ON {TABLE}(ville)",
        f"CREATE INDEX IF NOT EXISTS idx_nathalie_adherents_closed ON {TABLE}(is_closed)",
    ]
    with engine.begin() as conn:
        conn.execute(text(ddl))
        for stmt in comments:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        for stmt in indexes:
            conn.execute(text(stmt))
        try:
            if _is_pg():
                conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS drive_checked_at timestamptz"))
            else:
                cols = conn.execute(text(f"PRAGMA table_info({TABLE})")).fetchall()
                names = {c[1] for c in cols}
                if "drive_checked_at" not in names:
                    conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN drive_checked_at TEXT"))
        except Exception:
            pass
        if _is_pg():
            try:
                conn.execute(text(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY"))
            except Exception:
                pass


def clean_code_union(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip().upper()
    if s in ("", "?", "-", "N/A", "NA"):
        return None
    return s


def clean_postal(value: Any) -> Optional[str]:
    if value is None or str(value).strip() in ("", "-", "?"):
        return None
    if isinstance(value, float):
        return f"{int(value):05d}"
    s = str(value).strip().replace(" ", "")
    try:
        return f"{int(float(s)):05d}"
    except (ValueError, OverflowError):
        return str(value).strip()


def clean_siret(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float):
        return str(int(value))
    s = str(value).strip().replace(" ", "")
    if s in ("", "?", "-", "N/A"):
        return None
    if re.match(r"^\d+\.0$", s):
        s = s[:-2]
    return s


def clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def is_closed_from(nom: str, notes: Optional[str]) -> bool:
    blob = f"{nom or ''} {notes or ''}".upper()
    return any(k in blob for k in ("FERME", "FERMÉ", "LIQUIDATION", "RADIE"))


def _row_to_client(row) -> Dict[str, Any]:
    data = dict(row)
    for key in ("created_at", "updated_at", "drive_checked_at"):
        val = data.get(key)
        if hasattr(val, "isoformat"):
            data[key] = val.isoformat()
    closed = data.get("is_closed")
    data["is_closed"] = bool(closed)
    rib = data.get("rib_url") or ""
    kbis = data.get("kbis_url") or ""
    piece = data.get("piece_identite_url") or ""
    data["rib"] = rib
    data["kbis"] = kbis
    data["piece_identite"] = piece
    data["note_generale"] = data.get("notes") or ""
    data["docs_complets"] = bool(rib and kbis and piece)
    data["has_rib"] = bool(rib)
    data["has_kbis"] = bool(kbis)
    data["drive_checked"] = bool(data.get("drive_checked_at") or data.get("drive_folder_id"))
    missing = []
    if not rib:
        missing.append("RIB")
    if not kbis:
        missing.append("Kbis")
    data["missing_docs"] = missing
    data["dossier_complet"] = not missing
    data["dossier_en_cours"] = bool(data["drive_checked"] and missing)
    return data


def list_clients(with_ouverture_only: bool = False) -> List[Dict[str, Any]]:
    ensure_tables()
    clauses = []
    if with_ouverture_only:
        clauses.append("ouverture_chez IS NOT NULL AND TRIM(ouverture_chez) <> ''")
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM {TABLE}{where} ORDER BY nom_client ASC"
    with engine.connect() as conn:
        rows = conn.execute(text(sql)).mappings().all()
    return [_row_to_client(r) for r in rows]


def get_by_code(code_union: str) -> Optional[Dict[str, Any]]:
    ensure_tables()
    code = clean_code_union(code_union)
    if not code:
        return None
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT * FROM {TABLE} WHERE UPPER(code_union) = :code"),
            {"code": code},
        ).mappings().first()
    return _row_to_client(row) if row else None


def next_code_union(prefix: str = "M") -> str:
    """Prochain code Mxxxx (indépendants). Les codes J restent gérés pour Jumbo existants."""
    ensure_tables()
    prefix = (prefix or "M").upper()
    with engine.connect() as conn:
        rows = conn.execute(
            text(f"SELECT code_union FROM {TABLE} WHERE UPPER(code_union) LIKE :p"),
            {"p": f"{prefix}%"},
        ).fetchall()
    max_n = 0
    for (code,) in rows:
        s = str(code or "").strip().upper()
        if s.startswith(prefix) and s[len(prefix):].isdigit():
            max_n = max(max_n, int(s[len(prefix):]))
    return f"{prefix}{max_n + 1:04d}"


def normalize_groupe_label(groupe: Optional[str]) -> Optional[str]:
    s = (groupe or "").strip()
    if not s:
        return None
    u = s.upper()
    if u in ("INDEPENDANT", "INDÉPENDANT", "INDEPENDANT UNION"):
        return "INDEPENDANT UNION"
    return s


def upsert_client(payload: Dict[str, Any], *, keep_docs: bool = True) -> Dict[str, Any]:
    ensure_tables()
    code = clean_code_union(payload.get("code_union"))
    if not code:
        raise ValueError("code_union requis")
    existing = get_by_code(code)
    nom = (payload.get("nom_client") or "").strip()
    notes = clean_text(payload.get("notes") if payload.get("notes") is not None else payload.get("note_generale"))
    record = {
        "code_union": code,
        "nom_client": nom,
        "groupe": normalize_groupe_label(payload.get("groupe")),
        "contact_magasin": clean_text(payload.get("contact_magasin") or payload.get("contact")),
        "telephone": clean_text(payload.get("telephone")),
        "mail": clean_text(payload.get("mail")),
        "adresse": clean_text(payload.get("adresse")),
        "code_postal": clean_postal(payload.get("code_postal")),
        "ville": clean_text(payload.get("ville")),
        "siret": clean_siret(payload.get("siret")),
        "tva": clean_text(payload.get("tva")),
        "notes": notes,
        "is_closed": _bool(payload.get("is_closed") if payload.get("is_closed") is not None else is_closed_from(nom, notes)),
        "agent_union": clean_text(payload.get("agent_union")),
        "contrat_union": clean_text(payload.get("contrat_union") or payload.get("contrat_type")),
        "ouverture_chez": clean_text(payload.get("ouverture_chez")),
        "rib_url": clean_text(payload.get("rib_url") or payload.get("rib")),
        "kbis_url": clean_text(payload.get("kbis_url") or payload.get("kbis")),
        "piece_identite_url": clean_text(payload.get("piece_identite_url") or payload.get("piece_identite")),
        "drive_folder_id": clean_text(payload.get("drive_folder_id")),
        "drive_link": clean_text(payload.get("drive_link")),
        "drive_checked_at": payload.get("drive_checked_at"),
        "source": payload.get("source") or "manuel",
        "updated_at": _now(),
    }
    if existing and keep_docs:
        aliases = {
            "rib_url": existing.get("rib_url") or existing.get("rib"),
            "kbis_url": existing.get("kbis_url") or existing.get("kbis"),
            "piece_identite_url": existing.get("piece_identite_url") or existing.get("piece_identite"),
            "drive_folder_id": existing.get("drive_folder_id"),
            "drive_link": existing.get("drive_link"),
            "drive_checked_at": existing.get("drive_checked_at"),
            "ouverture_chez": existing.get("ouverture_chez"),
            "agent_union": existing.get("agent_union"),
            "contrat_union": existing.get("contrat_union"),
        }
        for key, previous in aliases.items():
            if not record.get(key) and previous:
                record[key] = previous

    now = _now()
    if existing:
        sets = ", ".join(f"{c} = :{c}" for c in COLUMNS if c not in ("id", "code_union", "created_at"))
        params = {k: record[k] for k in COLUMNS if k not in ("id", "code_union", "created_at")}
        params["code"] = code
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE {TABLE} SET {sets} WHERE UPPER(code_union) = :code"),
                params,
            )
        updated = get_by_code(code)
        if not updated:
            raise RuntimeError("Mise à jour adhérent introuvable")
        return updated

    record["id"] = payload.get("id") or _uuid()
    record["created_at"] = now
    cols = ", ".join(COLUMNS)
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    with engine.begin() as conn:
        conn.execute(text(f"INSERT INTO {TABLE} ({cols}) VALUES ({placeholders})"), record)
    created = get_by_code(code)
    if not created:
        raise RuntimeError("Adhérent créé mais introuvable")
    return created


def parse_excel_rows(path: str) -> List[Dict[str, Any]]:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    sheet = None
    for name in wb.sheetnames:
        if "juillet" in name.lower():
            sheet = wb[name]
            break
    if sheet is None:
        sheet = wb[wb.sheetnames[-1]]

    rows: List[Dict[str, Any]] = []
    for raw in sheet.iter_rows(min_row=2, max_col=12, values_only=True):
        vals = list(raw) + [None] * 12
        code, mag, groupe, contact, tel, mail, adr, cp, ville, siret, tva, notes = vals[:12]
        if not mag and not code:
            continue
        nom = str(mag).strip() if mag else ""
        notes_s = clean_text(notes)
        rows.append({
            "code_union": code,
            "nom_client": nom,
            "groupe": groupe,
            "contact_magasin": contact,
            "telephone": tel,
            "mail": mail,
            "adresse": adr,
            "code_postal": cp,
            "ville": ville,
            "siret": siret,
            "tva": tva,
            "notes": notes_s,
            "is_closed": is_closed_from(nom, notes_s),
            "source": "excel",
        })
    return rows


def import_excel_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    created = 0
    updated = 0
    errors: List[str] = []
    for i, raw in enumerate(rows, start=1):
        try:
            code = clean_code_union(raw.get("code_union"))
            if not code:
                continue
            existed = get_by_code(code) is not None
            upsert_client(raw, keep_docs=True)
            if existed:
                updated += 1
            else:
                created += 1
        except Exception as exc:
            errors.append(f"Ligne {i}: {exc}")
    return {"created": created, "updated": updated, "errors": errors[:30], "total": created + updated}


def patch_drive_docs(code_union: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Met à jour uniquement les liens Drive / pièces, sans toucher au reste de la fiche."""
    ensure_tables()
    existing = get_by_code(code_union)
    if not existing:
        return None
    allowed = {
        "rib_url",
        "kbis_url",
        "piece_identite_url",
        "drive_folder_id",
        "drive_link",
        "drive_checked_at",
    }
    updates = {k: v for k, v in fields.items() if k in allowed and v not in (None, "")}
    if not updates:
        return existing
    updates["updated_at"] = _now()
    sets = ", ".join(f"{k} = :{k}" for k in updates)
    updates["code"] = clean_code_union(code_union)
    with engine.begin() as conn:
        conn.execute(
            text(f"UPDATE {TABLE} SET {sets} WHERE UPPER(code_union) = :code"),
            updates,
        )
    return get_by_code(code_union)
