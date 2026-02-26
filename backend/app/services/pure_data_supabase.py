"""
Lecture / écriture des données Pure Data dans Supabase.
Structure identique à celle produite par pure_data_import.load_pure_data().
"""
from typing import List, Dict, Tuple, Optional
from sqlmodel import Session, text
from app.database import engine


PURE_DATA_TABLE = "pure_data"

# Colonnes de la table (ordre stable pour INSERT)
COLUMNS = [
    "mois", "annee", "code_union", "raison_sociale", "groupe_client",
    "region_commerciale", "fournisseur", "marque", "groupe_frs",
    "famille", "sous_famille", "ca", "commercial",
]


def write_pure_data_to_supabase(rows: List[Dict]) -> int:
    """
    Remplace tout le contenu de pure_data par les nouvelles lignes.
    Retourne le nombre de lignes insérées.
    """
    if not rows:
        return 0

    with Session(engine) as session:
        # Vider la table
        session.exec(text(f'DELETE FROM "{PURE_DATA_TABLE}"'))

        # Préparer le batch INSERT
        col_list = ", ".join(f'"{c}"' for c in COLUMNS)
        placeholders = ", ".join(f":{c}" for c in COLUMNS)
        sql = text(
            f'INSERT INTO "{PURE_DATA_TABLE}" ({col_list}) VALUES ({placeholders})'
        )

        # Nettoyer les lignes
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

        session.exec(sql, clean_rows)  # type: ignore[call-overload]
        session.commit()
        return len(clean_rows)


def read_pure_data_from_supabase() -> Tuple[List[Dict], List[str], Dict[str, str]]:
    """
    Lit toutes les lignes depuis Supabase.
    Retourne (rows, columns, column_mapping) — même format que load_pure_data().
    """
    with Session(engine) as session:
        result = session.exec(
            text(f'SELECT {", ".join(f"{chr(34)}{c}{chr(34)}" for c in COLUMNS)} FROM "{PURE_DATA_TABLE}"')
        )
        rows_raw = result.fetchall()

    rows = [dict(zip(COLUMNS, r)) for r in rows_raw]
    columns = list(COLUMNS)
    column_mapping = {col: col for col in COLUMNS}
    return rows, columns, column_mapping


def count_pure_data_rows() -> int:
    """Retourne le nombre de lignes en base."""
    with Session(engine) as session:
        result = session.exec(text(f'SELECT COUNT(*) FROM "{PURE_DATA_TABLE}"'))
        return result.scalar() or 0
