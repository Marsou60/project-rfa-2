"""
Lecture / écriture des données Pure Data dans Supabase.
"""
from typing import List, Dict, Tuple
from app.database import engine

PURE_DATA_TABLE = "pure_data"

COLUMNS = [
    "mois", "annee", "code_union", "raison_sociale", "groupe_client",
    "region_commerciale", "fournisseur", "marque", "groupe_frs",
    "famille", "sous_famille", "ca", "commercial",
]


def _table_exists() -> bool:
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text(f'SELECT 1 FROM "{PURE_DATA_TABLE}" LIMIT 1'))
        return True
    except Exception:
        return False


def write_pure_data_to_supabase(rows: List[Dict]) -> int:
    if not rows:
        return 0

    col_list    = ", ".join(f'"{c}"' for c in COLUMNS)
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    insert_sql  = f'INSERT INTO "{PURE_DATA_TABLE}" ({col_list}) VALUES ({placeholders})'

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
            elif col in ("mois", "annee"):
                try:
                    val = int(val) if val is not None else None
                except (ValueError, TypeError):
                    val = None
            else:
                val = str(val).strip() if val is not None else None
            clean[col] = val
        clean_rows.append(clean)

    from sqlalchemy import text
    # Découper en lots de 500 pour éviter les limites PostgreSQL
    BATCH = 500
    with engine.begin() as conn:
        conn.execute(text(f'DELETE FROM "{PURE_DATA_TABLE}"'))
        for i in range(0, len(clean_rows), BATCH):
            batch = clean_rows[i:i + BATCH]
            conn.execute(text(insert_sql), batch)

    return len(clean_rows)


def read_pure_data_from_supabase(
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> Tuple[List[Dict], List[str], Dict[str, str]]:
    """Lit les données depuis Supabase avec filtres optionnels pour réduire le volume."""
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
            text(f'SELECT {col_select} FROM "{PURE_DATA_TABLE}" {where_clause}'),
            params,
        )
        rows_raw = result.fetchall()

    rows = [dict(zip(COLUMNS, r)) for r in rows_raw]
    return rows, list(COLUMNS), {col: col for col in COLUMNS}


def count_pure_data_rows() -> int:
    if not _table_exists():
        return 0
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(f'SELECT COUNT(*) FROM "{PURE_DATA_TABLE}"'))
        return result.scalar() or 0
