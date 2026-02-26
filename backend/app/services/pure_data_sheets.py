"""
Chargement des données Pure Data depuis Google Sheets.
Utilise le même compte de service que le reste de l'application.
Feuille : "global New" dans le spreadsheet RFA principal.
"""
import os
from typing import List, Dict, Tuple

# Même spreadsheet que RFA
SPREADSHEET_ID = os.environ.get(
    "RFA_SHEETS_SPREADSHEET_ID",
    "16Hog9Dc43vwj_JmjRBLlIPaYoHoxLKVB7eSrBVXOLM0"
)
PURE_DATA_SHEET_NAME = os.environ.get("PURE_DATA_SHEET_NAME", "global New")


def _get_sheets_creds():
    from google.oauth2 import service_account
    info = None
    json_env = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if json_env:
        import json
        info = json.loads(json_env)
    else:
        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        if creds_path and os.path.exists(creds_path):
            import json
            with open(creds_path) as f:
                info = json.load(f)
    if not info:
        raise ValueError("GOOGLE_CREDENTIALS_JSON ou GOOGLE_APPLICATION_CREDENTIALS manquant")
    return service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )


def load_pure_data_from_sheets() -> Tuple[List[Dict], List[str], Dict[str, str]]:
    """
    Lit la feuille 'global New' et retourne (rows, columns, column_mapping)
    au même format que pure_data_import.load_pure_data().
    """
    from googleapiclient.discovery import build
    from app.services.pure_data_import import PURE_FIELD_DEFINITIONS
    from app.core.normalize import normalize_header

    client = build("sheets", "v4", credentials=_get_sheets_creds())
    result = (
        client.spreadsheets()
        .values()
        .get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{PURE_DATA_SHEET_NAME}!A1:Z500000",
        )
        .execute()
    )
    all_values = result.get("values", [])
    if not all_values:
        return [], [], {}

    headers_raw = all_values[0]
    data_rows   = all_values[1:]

    # Mapping en-têtes → clés canoniques (même logique que load_pure_data)
    raw_field_mapping: Dict[str, str] = {}
    for key, aliases in PURE_FIELD_DEFINITIONS:
        for alias in aliases:
            raw_field_mapping[alias] = key

    column_mapping: Dict[str, str] = {}   # clé canonique → nom colonne sheet
    col_index: Dict[int, str] = {}        # index colonne → clé canonique

    for i, col in enumerate(headers_raw):
        normalized = normalize_header(col)
        if normalized in raw_field_mapping:
            canonical = raw_field_mapping[normalized]
            if canonical not in column_mapping:
                column_mapping[canonical] = col
                col_index[i] = canonical
        else:
            for alias, canonical in raw_field_mapping.items():
                if alias in normalized or normalized in alias:
                    if canonical not in column_mapping:
                        column_mapping[canonical] = col
                        col_index[i] = canonical
                    break

    # Construire les lignes
    rows: List[Dict] = []
    for raw_row in data_rows:
        if not any(c.strip() for c in raw_row if c):
            continue
        row_dict: Dict = {}
        for key, _ in PURE_FIELD_DEFINITIONS:
            row_dict[key] = None

        for i, val in enumerate(raw_row):
            if i in col_index:
                key = col_index[i]
                text = str(val).strip() if val else None

                if key == "ca":
                    try:
                        text = text.replace(" ", "").replace(",", ".").replace("€", "") if text else "0"
                        row_dict[key] = float(text) if text else 0.0
                    except (ValueError, AttributeError):
                        row_dict[key] = 0.0
                elif key == "annee":
                    import re
                    m = re.search(r"(20\d{2})", text or "")
                    row_dict[key] = int(m.group(1)) if m else None
                    # Stocker aussi l'année comme entier dans "year"
                elif key == "mois":
                    try:
                        v = int(text) if text else None
                        row_dict[key] = v if v and 1 <= v <= 12 else None
                    except (ValueError, TypeError):
                        row_dict[key] = _parse_month_name(text)
                else:
                    row_dict[key] = text

        # Calculer year/month depuis annee/mois si présents
        rows.append(row_dict)

    columns = list(headers_raw)
    return rows, columns, {v: k for k, v in column_mapping.items()}


def _parse_month_name(text: str) -> int | None:
    if not text:
        return None
    t = text.lower().strip()
    months = {
        "janvier": 1, "fevrier": 2, "février": 2, "mars": 3,
        "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
        "aout": 8, "août": 8, "septembre": 9, "octobre": 10,
        "novembre": 11, "decembre": 12, "décembre": 12,
    }
    for k, v in months.items():
        if k in t:
            return v
    import re
    m = re.search(r"(\d{1,2})", t)
    if m:
        v = int(m.group(1))
        return v if 1 <= v <= 12 else None
    return None
