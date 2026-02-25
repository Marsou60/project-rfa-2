"""
Service d'import Excel (et base commune pour Google Sheets).
"""
from typing import Dict, List, Tuple, Any
from app.core.normalize import normalize_header, sanitize_amount
from app.core.fields import get_field_mapping, FIELD_DEFINITIONS


def build_data_from_dataframe(df) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, str]]:
    """
    À partir d'un DataFrame (en-têtes = colonnes), produit les mêmes sorties que load_excel.
    Permet de réutiliser la logique pour Excel ou Google Sheets.
    - data: liste de dicts (une ligne = un dict avec clés internes)
    - raw_columns: liste des noms de colonnes bruts
    - column_mapping: clé interne -> nom colonne reconnue
    """
    raw_columns = list(df.columns)
    normalized_headers = {col: normalize_header(str(col)) for col in raw_columns}
    field_mapping = get_field_mapping()
    column_mapping: Dict[str, str] = {}
    for excel_col, normalized in normalized_headers.items():
        if normalized in field_mapping:
            internal_key, _ = field_mapping[normalized]
            column_mapping[internal_key] = excel_col

    data: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        row_dict: Dict[str, Any] = {}
        for key, _, _ in FIELD_DEFINITIONS:
            if key in column_mapping:
                excel_col = column_mapping[key]
                try:
                    value = row[excel_col]
                except (KeyError, IndexError):
                    value = None
                if key in ["code_union", "nom_client", "groupe_client"]:
                    import pandas as _pd
                    row_dict[key] = str(value).strip() if _pd.notna(value) else ""
                else:
                    row_dict[key] = sanitize_amount(value)
            else:
                if key in ["code_union", "nom_client", "groupe_client"]:
                    row_dict[key] = ""
                else:
                    row_dict[key] = 0.0
        if row_dict.get("code_union"):
            if not row_dict.get("groupe_client"):
                row_dict["groupe_client"] = "Sans groupe"
            data.append(row_dict)
    return data, raw_columns, column_mapping


def load_excel(file_path: str) -> Tuple[List[Dict], List[str], Dict[str, str]]:
    """
    Charge un fichier Excel et retourne :
    - data: liste de dicts (une ligne = un dict)
    - raw_columns: liste des noms de colonnes bruts
    - column_mapping: mapping clé interne -> nom colonne Excel reconnue
    """
    import pandas as pd
    df = pd.read_excel(file_path, engine="openpyxl")
    return build_data_from_dataframe(df)

