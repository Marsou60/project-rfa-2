"""
Stockage Supabase dédié au mode Pure Data mensuel (isolé de l'existant).
"""
import re
from typing import List, Dict, Tuple, Optional
from app.database import engine

PURE_DATA_MONTHLY_TABLE = "pure_data_monthly"

COLUMNS = [
    "mois", "annee", "code_union", "raison_sociale", "groupe_client",
    "region_commerciale", "fournisseur", "marque", "groupe_frs",
    "famille", "sous_famille", "ca", "commercial",
]


def _norm_year(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        pass
    s = str(value)
    m = re.search(r"(20\d{2})", s)
    return int(m.group(1)) if m else None


def _norm_month(value) -> Optional[int]:
    if value is None:
        return None
    try:
        x = int(value)
        return x if 1 <= x <= 12 else None
    except (ValueError, TypeError):
        pass
    s = str(value).strip().lower()
    months = {
        "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
        "juillet": 7, "aout": 8, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
        "decembre": 12, "décembre": 12,
    }
    for key, val in months.items():
        if key in s:
            return val
    m = re.search(r"(\d{1,2})", s)
    if m:
        x = int(m.group(1))
        return x if 1 <= x <= 12 else None
    return None


def _table_exists() -> bool:
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text(f'SELECT 1 FROM "{PURE_DATA_MONTHLY_TABLE}" LIMIT 1'))
        return True
    except Exception:
        return False


def _ensure_table() -> None:
    """Crée la table mensuelle si absente (isolation complète de l'historique)."""
    if _table_exists():
        return
    from sqlalchemy import text
    create_sql = text(
        f'''
        CREATE TABLE IF NOT EXISTS "{PURE_DATA_MONTHLY_TABLE}" (
          "mois" INTEGER NULL,
          "annee" INTEGER NULL,
          "code_union" TEXT NULL,
          "raison_sociale" TEXT NULL,
          "groupe_client" TEXT NULL,
          "region_commerciale" TEXT NULL,
          "fournisseur" TEXT NULL,
          "marque" TEXT NULL,
          "groupe_frs" TEXT NULL,
          "famille" TEXT NULL,
          "sous_famille" TEXT NULL,
          "ca" DOUBLE PRECISION NULL,
          "commercial" TEXT NULL
        )
        '''
    )
    with engine.begin() as conn:
        conn.execute(create_sql)


def _build_in_clause(values: List, prefix: str) -> Tuple[str, Dict]:
    params: Dict = {}
    placeholders = []
    for idx, value in enumerate(values):
        key = f"{prefix}_{idx}"
        placeholders.append(f":{key}")
        params[key] = value
    return ", ".join(placeholders), params


def append_monthly_rows(rows: List[Dict]) -> int:
    if not rows:
        return 0
    _ensure_table()

    col_list = ", ".join(f'"{c}"' for c in COLUMNS)
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    insert_sql = f'INSERT INTO "{PURE_DATA_MONTHLY_TABLE}" ({col_list}) VALUES ({placeholders})'

    clean_rows = []
    for row in rows:
        clean = {}
        for col in COLUMNS:
            val = row.get(col)
            if col == "ca":
                try:
                    val = float(val) if val is not None else 0.0
                except (ValueError, TypeError):
                    val = 0.0
            elif col == "annee":
                val = _norm_year(val if val is not None else row.get("year"))
            elif col == "mois":
                val = _norm_month(val if val is not None else row.get("month"))
            else:
                val = str(val).strip() if val is not None else None
            clean[col] = val
        clean_rows.append(clean)

    from sqlalchemy import text
    BATCH = 500
    with engine.begin() as conn:
        for i in range(0, len(clean_rows), BATCH):
            conn.execute(text(insert_sql), clean_rows[i:i + BATCH])
    return len(clean_rows)


def delete_monthly_rows(
    years: Optional[List[int]] = None,
    months: Optional[List[int]] = None,
    fournisseurs: Optional[List[str]] = None,
) -> int:
    _ensure_table()
    from sqlalchemy import text
    where_parts: List[str] = []
    params: Dict = {}

    if years:
        clean_years = sorted({int(y) for y in years if y is not None})
        if clean_years:
            placeholders, p = _build_in_clause(clean_years, "year")
            where_parts.append(f'"annee" IN ({placeholders})')
            params.update(p)

    if months:
        clean_months = sorted({int(m) for m in months if m is not None and 1 <= int(m) <= 12})
        if clean_months:
            placeholders, p = _build_in_clause(clean_months, "month")
            where_parts.append(f'"mois" IN ({placeholders})')
            params.update(p)

    if fournisseurs:
        clean_fournisseurs = sorted({str(f).strip() for f in fournisseurs if str(f).strip()})
        if clean_fournisseurs:
            placeholders, p = _build_in_clause(clean_fournisseurs, "frs")
            where_parts.append(f'UPPER(TRIM("fournisseur")) IN ({placeholders})')
            params.update({k: str(v).upper() for k, v in p.items()})

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    with engine.begin() as conn:
        res = conn.execute(text(f'DELETE FROM "{PURE_DATA_MONTHLY_TABLE}" {where_clause}'), params)
        return int(res.rowcount or 0)


def get_monthly_scope(rows: List[Dict]) -> Dict[str, List]:
    years = set()
    months = set()
    fournisseurs = set()
    for row in rows:
        y = _norm_year(row.get("annee") if row.get("annee") is not None else row.get("year"))
        m = _norm_month(row.get("mois") if row.get("mois") is not None else row.get("month"))
        f = str(row.get("fournisseur") or "").strip()
        if y is not None:
            years.add(int(y))
        if m is not None:
            months.add(int(m))
        if f:
            fournisseurs.add(f.upper())
    return {"years": sorted(years), "months": sorted(months), "fournisseurs": sorted(fournisseurs)}


def list_monthly_periods() -> List[Dict]:
    if not _table_exists():
        return []
    from sqlalchemy import text
    sql = text(
        f'''
        SELECT
          "annee" AS annee,
          "mois" AS mois,
          UPPER(TRIM("fournisseur")) AS fournisseur,
          COUNT(*) AS row_count,
          COALESCE(SUM("ca"), 0) AS total_ca
        FROM "{PURE_DATA_MONTHLY_TABLE}"
        GROUP BY "annee", "mois", UPPER(TRIM("fournisseur"))
        ORDER BY "annee" DESC, "mois" DESC, UPPER(TRIM("fournisseur")) ASC
        '''
    )
    with engine.connect() as conn:
        rows = conn.execute(sql).fetchall()
    out = []
    for r in rows:
        out.append({
            "annee": int(r.annee) if r.annee is not None else None,
            "mois": int(r.mois) if r.mois is not None else None,
            "fournisseur": str(r.fournisseur or "").strip() or None,
            "row_count": int(r.row_count or 0),
            "total_ca": float(r.total_ca or 0.0),
        })
    return out


def read_monthly_rows(
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> Tuple[List[Dict], List[str], Dict[str, str]]:
    if not _table_exists():
        return [], list(COLUMNS), {col: col for col in COLUMNS}

    from sqlalchemy import text
    col_select = ", ".join(f'"{c}"' for c in COLUMNS)
    where_parts = []
    params: Dict = {}
    if year is not None:
        where_parts.append('"annee" = :year')
        params["year"] = year
    if month is not None:
        where_parts.append('"mois" = :month')
        params["month"] = month
    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    with engine.connect() as conn:
        result = conn.execute(
            text(f'SELECT {col_select} FROM "{PURE_DATA_MONTHLY_TABLE}" {where_clause}'),
            params,
        )
        rows_raw = result.fetchall()

    rows = [dict(zip(COLUMNS, r)) for r in rows_raw]
    for r in rows:
        r["year"] = _norm_year(r.get("annee"))
        r["month"] = _norm_month(r.get("mois"))
    return rows, list(COLUMNS), {col: col for col in COLUMNS}


def count_monthly_rows() -> int:
    if not _table_exists():
        return 0
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(f'SELECT COUNT(*) FROM "{PURE_DATA_MONTHLY_TABLE}"'))
        return result.scalar() or 0
