"""
Stockage Supabase dedie au Pure Data cumule (2025/2026+).
Separation stricte du pure_data historique et du pure_data_monthly.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from app.database import engine

PURE_DATA_CUMULATIVE_TABLE = "pure_data_cumulative"

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
            conn.execute(text(f'SELECT 1 FROM "{PURE_DATA_CUMULATIVE_TABLE}" LIMIT 1'))
        return True
    except Exception:
        return False


def _ensure_table() -> None:
    if _table_exists():
        return
    from sqlalchemy import text
    create_sql = text(
        f'''
        CREATE TABLE IF NOT EXISTS "{PURE_DATA_CUMULATIVE_TABLE}" (
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


def write_cumulative_rows(rows: List[Dict], reporting_month: int) -> int:
    """
    Remplace integralement la table cumulative.
    reporting_month est force sur toutes les lignes (fichier sans mois).
    """
    if not rows:
        return 0

    _ensure_table()
    forced_month = _norm_month(reporting_month)

    def _clean_tuple(row: Dict) -> tuple:
        vals = []
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
                val = forced_month
            else:
                val = str(val).strip() if val is not None else None
            vals.append(val)
        return tuple(vals)

    col_list = ", ".join(f'"{c}"' for c in COLUMNS)

    # PostgreSQL/Supabase : insertion multi-lignes ultra-rapide via execute_values
    # (psycopg2 executemany = ligne par ligne = trop lent → dépassement de délai).
    if engine.dialect.name == "postgresql":
        from psycopg2.extras import execute_values
        raw = engine.raw_connection()
        try:
            cur = raw.cursor()
            cur.execute(f'DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"')
            sql = f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES %s'
            BATCH = 1000
            total = 0
            batch = []
            for row in rows:
                batch.append(_clean_tuple(row))
                if len(batch) >= BATCH:
                    execute_values(cur, sql, batch, page_size=BATCH)
                    total += len(batch)
                    batch = []
            if batch:
                execute_values(cur, sql, batch, page_size=len(batch))
                total += len(batch)
            raw.commit()
            return total
        finally:
            raw.close()

    # SQLite (dev local) : streaming par lots
    from sqlalchemy import text
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    insert_sql = f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES ({placeholders})'
    with engine.begin() as conn:
        conn.execute(text(f'DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"'))
        BATCH = 500
        total = 0
        batch = []
        for row in rows:
            batch.append({c: v for c, v in zip(COLUMNS, _clean_tuple(row))})
            if len(batch) >= BATCH:
                conn.execute(text(insert_sql), batch)
                total += len(batch)
                batch = []
        if batch:
            conn.execute(text(insert_sql), batch)
            total += len(batch)
    return total


def read_cumulative_rows() -> Tuple[List[Dict], List[str], Dict[str, str]]:
    if not _table_exists():
        return [], list(COLUMNS), {col: col for col in COLUMNS}
    from sqlalchemy import text
    col_select = ", ".join(f'"{c}"' for c in COLUMNS)
    with engine.connect() as conn:
        result = conn.execute(text(f'SELECT {col_select} FROM "{PURE_DATA_CUMULATIVE_TABLE}"'))
        rows_raw = result.fetchall()
    rows = [dict(zip(COLUMNS, r)) for r in rows_raw]
    for r in rows:
        r["year"] = _norm_year(r.get("annee"))
        r["month"] = _norm_month(r.get("mois"))
    return rows, list(COLUMNS), {col: col for col in COLUMNS}


def count_cumulative_rows() -> int:
    if not _table_exists():
        return 0
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(f'SELECT COUNT(*) FROM "{PURE_DATA_CUMULATIVE_TABLE}"'))
        return result.scalar() or 0
