"""
Stockage Supabase dedie au Pure Data cumule (2025/2026+).

Import cible : 1 fichier detaille par plateforme (ACR / DCA / EXADIS / ALLIANCE),
replace uniquement de cette plateforme, mois reels conserves dans les lignes.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from app.database import engine

PURE_DATA_CUMULATIVE_TABLE = "pure_data_cumulative"

CANONICAL_PLATFORMS = ("ACR", "DCA", "EXADIS", "ALLIANCE")

# Libelles historiques / variantes a effacer lors d'un replace plateforme
PLATFORM_ALIASES: Dict[str, Tuple[str, ...]] = {
    "ACR": ("ACR",),
    "DCA": ("DCA", "DCA_GLOBAL", "DCA GLOBAL"),
    "EXADIS": ("EXADIS",),
    "ALLIANCE": (
        "ALLIANCE",
        "AAG",
        "ALLIANCE AUTOMOTIVE",
        "ALLIANCE AUTOMOTIVE GROUP",
    ),
}


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


def normalize_platform(value: Optional[str]) -> Optional[str]:
    """Normalise un libelle fournisseur vers ACR|DCA|EXADIS|ALLIANCE."""
    if value is None:
        return None
    raw = str(value).strip().upper()
    if not raw:
        return None
    # Alias exacts d'abord
    for platform, aliases in PLATFORM_ALIASES.items():
        if raw in aliases or raw == platform:
            return platform
    for p in CANONICAL_PLATFORMS:
        if raw == p or raw.startswith(p + " ") or raw.startswith(p + "_") or raw.startswith(p + "-"):
            return p
    return None


def platform_delete_labels(platform: str) -> List[str]:
    """Tous les libelles fournisseur a supprimer pour une plateforme."""
    p = normalize_platform(platform) or str(platform).strip().upper()
    labels = {p}
    for alias in PLATFORM_ALIASES.get(p, ()):
        labels.add(alias)
    return sorted(labels)


COLUMNS = [
    "mois", "annee", "code_union", "raison_sociale", "groupe_client",
    "region_commerciale", "fournisseur", "marque", "groupe_frs",
    "famille", "sous_famille", "ca", "commercial",
]


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


def _clean_tuple(row: Dict, *, fallback_month: Optional[int], force_fournisseur: Optional[str] = None) -> tuple:
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
            # Preferer le mois reel du fichier ; fallback = mois de reference declare
            file_month = _norm_month(val if val is not None else row.get("month"))
            val = file_month if file_month is not None else _norm_month(fallback_month)
        elif col == "fournisseur":
            if force_fournisseur:
                val = force_fournisseur
            else:
                val = str(val).strip() if val is not None else None
        else:
            val = str(val).strip() if val is not None else None
        vals.append(val)
    return tuple(vals)


def _delete_sql_and_params(platform: str, years: List[int]):
    """
    DELETE scope plateforme × annees.
    Match tous les alias (DCA_GLOBAL, ALLIANCE AUTOMOTIVE, …)
    + prefixe 'PLATFORM %' + annee NULL (anciens imports).
    """
    from sqlalchemy import text

    labels = platform_delete_labels(platform)
    params: Dict = {"frs_prefix": f"{platform} %"}
    label_placeholders = []
    for idx, label in enumerate(labels):
        key = f"lbl{idx}"
        label_placeholders.append(f":{key}")
        params[key] = label

    frs_clause = (
        f'(UPPER(TRIM("fournisseur")) IN ({", ".join(label_placeholders)})'
        f' OR UPPER(TRIM("fournisseur")) LIKE :frs_prefix)'
    )

    clean_years = sorted({int(y) for y in years if y is not None})
    if not clean_years:
        return (
            text(
                f'''
                DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"
                WHERE {frs_clause}
                '''
            ),
            params,
        )

    year_placeholders = []
    for idx, y in enumerate(clean_years):
        key = f"y{idx}"
        year_placeholders.append(f":{key}")
        params[key] = y
        params[f"ys{idx}"] = str(y)

    # Inclure annee NULL : anciens imports mal types / incomplets
    year_clause = (
        f'("annee" IN ({", ".join(year_placeholders)})'
        f' OR CAST("annee" AS TEXT) IN ({", ".join(f":ys{i}" for i in range(len(clean_years)))})'
        f' OR "annee" IS NULL)'
    )
    sql = text(
        f'''
        DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"
        WHERE {frs_clause}
          AND {year_clause}
        '''
    )
    return sql, params


def _replace_platform_rows_atomic(
    platform: str,
    years: List[int],
    clean_tuples: List[tuple],
) -> Tuple[int, int]:
    """
    DELETE + INSERT dans UNE seule transaction.
    Si l'insert echoue → rollback → anciennes lignes conservees.
    Retourne (deleted, inserted).
    """
    _ensure_table()
    delete_sql, delete_params = _delete_sql_and_params(platform, years)
    col_list = ", ".join(f'"{c}"' for c in COLUMNS)
    labels = platform_delete_labels(platform)

    if engine.dialect.name == "postgresql":
        from psycopg2.extras import execute_values
        raw = engine.raw_connection()
        try:
            cur = raw.cursor()
            year_list = sorted({int(y) for y in years if y is not None})
            if year_list:
                cur.execute(
                    f'''
                    DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"
                    WHERE (
                        UPPER(TRIM("fournisseur")) = ANY(%s)
                        OR UPPER(TRIM("fournisseur")) LIKE %s
                    )
                      AND (
                        "annee" = ANY(%s)
                        OR CAST("annee" AS TEXT) = ANY(%s)
                        OR "annee" IS NULL
                      )
                    ''',
                    (labels, f"{platform} %", year_list, [str(y) for y in year_list]),
                )
            else:
                cur.execute(
                    f'''
                    DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"
                    WHERE UPPER(TRIM("fournisseur")) = ANY(%s)
                       OR UPPER(TRIM("fournisseur")) LIKE %s
                    ''',
                    (labels, f"{platform} %"),
                )
            deleted = int(cur.rowcount or 0)

            sql = f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES %s'
            BATCH = 1000
            inserted = 0
            for i in range(0, len(clean_tuples), BATCH):
                batch = clean_tuples[i:i + BATCH]
                execute_values(cur, sql, batch, page_size=len(batch))
                inserted += len(batch)
            raw.commit()
            return deleted, inserted
        except Exception:
            raw.rollback()
            raise
        finally:
            raw.close()

    from sqlalchemy import text
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    insert_sql = text(
        f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES ({placeholders})'
    )
    with engine.begin() as conn:
        res = conn.execute(delete_sql, delete_params)
        deleted = int(res.rowcount or 0)
        inserted = 0
        BATCH = 500
        for i in range(0, len(clean_tuples), BATCH):
            batch = [
                {c: v for c, v in zip(COLUMNS, t)}
                for t in clean_tuples[i:i + BATCH]
            ]
            conn.execute(insert_sql, batch)
            inserted += len(batch)
        return deleted, inserted


def filter_rows_for_platform(rows: List[Dict], fournisseur: str) -> Tuple[List[Dict], int]:
    """
    Garde les lignes de la plateforme selectionnee.
    Lignes sans fournisseur → assignees a la plateforme choisie (fichier mono-plateforme).
    Retourne (rows_kept, skipped_other_platforms).
    """
    platform = normalize_platform(fournisseur)
    if not platform:
        raise ValueError(f"Plateforme invalide: {fournisseur}")

    kept: List[Dict] = []
    skipped = 0
    for row in rows:
        frs = normalize_platform(row.get("fournisseur"))
        if frs is None:
            new_row = dict(row)
            new_row["fournisseur"] = platform
            kept.append(new_row)
        elif frs == platform:
            new_row = dict(row)
            new_row["fournisseur"] = platform
            kept.append(new_row)
        else:
            skipped += 1
    return kept, skipped


def write_cumulative_platform_rows(
    rows: List[Dict],
    *,
    fournisseur: str,
    reporting_month: int,
    reporting_year: Optional[int] = None,
) -> Dict:
    """
    Remplace les donnees d'UNE plateforme (annees presentes dans le fichier).
    Conserve le mois de chaque ligne ; si absent → reporting_month.

    Atomique : prepare d'abord, puis DELETE+INSERT en une transaction.
    Echec → rollback, anciennes donnees conservees.
    """
    platform = normalize_platform(fournisseur)
    if not platform:
        raise ValueError(f"Plateforme invalide: {fournisseur}")
    if not rows:
        return {
            "rows_inserted": 0,
            "rows_deleted": 0,
            "rows_skipped": 0,
            "fournisseur": platform,
            "years": [],
            "months_in_file": [],
        }

    kept, skipped = filter_rows_for_platform(rows, platform)
    if not kept:
        raise ValueError(
            f"Aucune ligne pour la plateforme {platform} "
            f"({skipped} ligne(s) d'autres plateformes ignorees)."
        )

    years = set()
    months = set()
    for row in kept:
        y = _norm_year(row.get("annee") if row.get("annee") is not None else row.get("year"))
        m = _norm_month(row.get("mois") if row.get("mois") is not None else row.get("month"))
        if y is not None:
            years.add(y)
        if m is not None:
            months.add(m)
    if not years and reporting_year:
        years.add(int(reporting_year))

    # Preparer TOUT avant d'ecrire en base
    clean = [
        _clean_tuple(row, fallback_month=reporting_month, force_fournisseur=platform)
        for row in kept
    ]
    if not clean:
        raise ValueError(f"Aucune ligne exploitable pour {platform} apres nettoyage.")

    deleted, inserted = _replace_platform_rows_atomic(platform, sorted(years), clean)

    return {
        "rows_inserted": inserted,
        "rows_deleted": deleted,
        "rows_skipped": skipped,
        "fournisseur": platform,
        "years": sorted(years),
        "months_in_file": sorted(months),
    }


def write_cumulative_rows(rows: List[Dict], reporting_month: int) -> int:
    """
    Legacy : remplace integralement la table.
    Si les lignes ont un mois, il est conserve ; sinon reporting_month.
    """
    if not rows:
        return 0

    _ensure_table()
    clean = [_clean_tuple(row, fallback_month=reporting_month) for row in rows]
    col_list = ", ".join(f'"{c}"' for c in COLUMNS)

    if engine.dialect.name == "postgresql":
        from psycopg2.extras import execute_values
        raw = engine.raw_connection()
        try:
            cur = raw.cursor()
            cur.execute(f'DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"')
            sql = f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES %s'
            BATCH = 1000
            total = 0
            for i in range(0, len(clean), BATCH):
                batch = clean[i:i + BATCH]
                execute_values(cur, sql, batch, page_size=len(batch))
                total += len(batch)
            raw.commit()
            return total
        except Exception:
            raw.rollback()
            raise
        finally:
            raw.close()

    from sqlalchemy import text
    placeholders = ", ".join(f":{c}" for c in COLUMNS)
    insert_sql = f'INSERT INTO "{PURE_DATA_CUMULATIVE_TABLE}" ({col_list}) VALUES ({placeholders})'
    with engine.begin() as conn:
        conn.execute(text(f'DELETE FROM "{PURE_DATA_CUMULATIVE_TABLE}"'))
        BATCH = 500
        total = 0
        for i in range(0, len(clean), BATCH):
            batch = [{c: v for c, v in zip(COLUMNS, t)} for t in clean[i:i + BATCH]]
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


def count_cumulative_rows_by_platform() -> Dict[str, int]:
    """Compte les lignes par plateforme canonique."""
    out = {p: 0 for p in CANONICAL_PLATFORMS}
    if not _table_exists():
        return out
    from sqlalchemy import text
    sql = text(
        f'''
        SELECT UPPER(TRIM("fournisseur")) AS frs, COUNT(*) AS n
        FROM "{PURE_DATA_CUMULATIVE_TABLE}"
        GROUP BY UPPER(TRIM("fournisseur"))
        '''
    )
    with engine.connect() as conn:
        for frs, n in conn.execute(sql).fetchall():
            platform = normalize_platform(frs)
            if platform:
                out[platform] = int(n or 0)
    return out


def months_in_data_by_platform(year: Optional[int] = None) -> Dict[str, List[int]]:
    """Mois presents en base, par plateforme (optionnellement filtres sur une annee)."""
    out = {p: [] for p in CANONICAL_PLATFORMS}
    if not _table_exists():
        return out
    from sqlalchemy import text
    if year:
        sql = text(
            f'''
            SELECT UPPER(TRIM("fournisseur")) AS frs, "mois" AS mois
            FROM "{PURE_DATA_CUMULATIVE_TABLE}"
            WHERE "annee" = :year AND "mois" IS NOT NULL
            GROUP BY UPPER(TRIM("fournisseur")), "mois"
            '''
        )
        params = {"year": int(year)}
    else:
        sql = text(
            f'''
            SELECT UPPER(TRIM("fournisseur")) AS frs, "mois" AS mois
            FROM "{PURE_DATA_CUMULATIVE_TABLE}"
            WHERE "mois" IS NOT NULL
            GROUP BY UPPER(TRIM("fournisseur")), "mois"
            '''
        )
        params = {}
    buckets: Dict[str, set] = {p: set() for p in CANONICAL_PLATFORMS}
    with engine.connect() as conn:
        for frs, mois in conn.execute(sql, params).fetchall():
            platform = normalize_platform(frs)
            m = _norm_month(mois)
            if platform and m:
                buckets[platform].add(m)
    return {p: sorted(buckets[p]) for p in CANONICAL_PLATFORMS}
