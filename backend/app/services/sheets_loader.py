"""
Charge les données RFA depuis un Google Sheet (même structure que l'Excel).
Utilise la même logique de mapping que excel_import via build_data_from_dataframe.

Prérequis :
  - pip install google-api-python-client google-auth
  - Compte de service Google Cloud avec accès à l'API Sheets
  - Fichier JSON de clé du compte de service
  - Partager le Google Sheet avec l'email du compte de service (ex: xxx@xxx.iam.gserviceaccount.com)
  - Variable d'environnement GOOGLE_APPLICATION_CREDENTIALS = chemin vers le fichier JSON
     ou passer credentials_path à load_from_sheets.
"""
from __future__ import annotations

import os
from typing import Dict, List, Tuple, Any, Optional

import pandas as pd

from app.services.excel_import import build_data_from_dataframe


def _get_sheets_client(credentials_path: Optional[str] = None):
    """Retourne le client Google Sheets (lazy import pour dépendance optionnelle)."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as e:
        raise ImportError(
            "Pour utiliser Google Sheets, installez : pip install google-api-python-client google-auth"
        ) from e
    path = credentials_path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not path or not os.path.isfile(path):
        raise ValueError(
            "Indiquez GOOGLE_APPLICATION_CREDENTIALS ou credentials_path vers le JSON du compte de service"
        )
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = service_account.Credentials.from_service_account_file(path, scopes=scopes)
    return build("sheets", "v4", credentials=creds)


def _values_to_dataframe(values: List[List[Any]]) -> pd.DataFrame:
    """Première ligne = en-têtes, lignes suivantes = données."""
    if not values or len(values) < 2:
        return pd.DataFrame()
    headers = [str(h) for h in values[0]]
    rows = values[1:]
    # Aligner le nombre de colonnes
    ncols = len(headers)
    normalized_rows = []
    for row in rows:
        r = list(row) if isinstance(row, (list, tuple)) else [row]
        r = r + [""] * (ncols - len(r))
        normalized_rows.append(r[:ncols])
    return pd.DataFrame(normalized_rows, columns=headers)


def load_from_sheets(
    spreadsheet_id: str,
    sheet_name_or_range: Optional[str] = None,
    credentials_path: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, str]]:
    """
    Charge les données depuis un Google Sheet.

    - spreadsheet_id : l'ID du tableur (dans l'URL : .../d/SPREADSHEET_ID/edit)
    - sheet_name_or_range : nom de la feuille (ex. "Feuille1") ou plage "Feuille1!A:Z". None = première feuille.
    - credentials_path : chemin vers le JSON du compte de service (sinon GOOGLE_APPLICATION_CREDENTIALS).

    Retourne (data, raw_columns, column_mapping) comme load_excel, pour alimenter create_import + compute_aggregations.
    """
    client = _get_sheets_client(credentials_path)
    range_str = sheet_name_or_range if sheet_name_or_range else None
    if not range_str:
        # Récupérer le nom de la première feuille
        meta = client.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = meta.get("sheets", [])
        if not sheets:
            raise ValueError("Aucune feuille dans le tableur")
        range_str = sheets[0]["properties"]["title"]
    result = (
        client.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=range_str)
        .execute()
    )
    values = result.get("values", [])
    df = _values_to_dataframe(values)
    if df.empty:
        return [], [], {}
    return build_data_from_dataframe(df)
