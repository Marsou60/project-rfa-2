"""
Export massif des rapports PDF (clients + groupes) vers Google Drive
et génération d'une feuille Google Sheets de pilotage.
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Dict, Any, List

from app.services.compute import compute_aggregations, get_entity_detail_with_rfa
from app.services.pdf_export import generate_pdf_report
from app.services.nathalie_service import DRIVE_ROOT_ID, _get_drive_client, _get_sheets_client
from app.storage import ImportData


def _safe_name(value: str) -> str:
    s = (value or "").strip()
    s = re.sub(r"[\\/:*?\"<>|]+", "-", s)
    return re.sub(r"\s+", " ", s).strip() or "Sans nom"


def _find_or_create_folder(drive, name: str, parent_id: str) -> str:
    escaped_name = name.replace("'", "\\'")
    q = (
        "mimeType='application/vnd.google-apps.folder' and trashed=false "
        f"and name='{escaped_name}' and '{parent_id}' in parents"
    )
    existing = drive.files().list(q=q, fields="files(id,name)", pageSize=1).execute().get("files", [])
    if existing:
        return existing[0]["id"]

    created = drive.files().create(
        body={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
        fields="id",
    ).execute()
    return created["id"]


def _upload_pdf_bytes(drive, parent_id: str, filename: str, content: bytes) -> Dict[str, str]:
    from googleapiclient.http import MediaIoBaseUpload

    media = MediaIoBaseUpload(io.BytesIO(content), mimetype="application/pdf", resumable=False)
    uploaded = drive.files().create(
        body={"name": filename, "parents": [parent_id]},
        media_body=media,
        fields="id,webViewLink",
    ).execute()
    return {
        "id": uploaded.get("id", ""),
        "url": uploaded.get("webViewLink", ""),
    }


def _create_pilotage_sheet(sheets, drive, year_folder_id: str, year: int) -> Dict[str, str]:
    created = drive.files().create(
        body={
            "name": f"Pilotage RFA {year} - {datetime.now().strftime('%Y-%m-%d %H-%M')}",
            "mimeType": "application/vnd.google-apps.spreadsheet",
            "parents": [year_folder_id],
        },
        fields="id,webViewLink",
    ).execute()
    spreadsheet_id = created["id"]
    spreadsheet_url = created.get("webViewLink", "")

    meta = sheets.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    first_sheet_id = meta["sheets"][0]["properties"]["sheetId"]
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {
                    "updateSheetProperties": {
                        "properties": {"sheetId": first_sheet_id, "title": "Pilotage"},
                        "fields": "title",
                    }
                }
            ]
        },
    ).execute()

    return {
        "spreadsheet_id": spreadsheet_id,
        "spreadsheet_url": spreadsheet_url,
        "sheet_id": first_sheet_id,
    }


def _write_pilotage_rows(
    sheets,
    spreadsheet_id: str,
    sheet_id: int,
    rows: List[List[Any]],
) -> None:
    headers = [
        "Code Union",
        "Nom client",
        "Groupe",
        "Type entite",
        "Type contrat",
        "Lien PDF",
        "Montant HT",
        "Montant TTC",
        "Envoyer",
        "Payer",
    ]
    values = [headers] + rows

    sheets.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Pilotage!A1",
        valueInputOption="USER_ENTERED",
        body={"values": values},
    ).execute()

    row_count = len(values)
    if row_count <= 1:
        return

    # Colonnes I/J = cases à cocher Envoyer/Payer
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": 1,
                            "endRowIndex": row_count,
                            "startColumnIndex": 8,
                            "endColumnIndex": 10,
                        },
                        "rule": {
                            "condition": {"type": "BOOLEAN"},
                            "showCustomUi": True,
                            "strict": True,
                        },
                    }
                }
            ]
        },
    ).execute()


def export_all_entity_pdfs_to_drive(
    import_id: str,
    import_data: ImportData,
    export_year: int = 2025,
    tva_rate: float = 0.20,
    include_clients: bool = True,
    include_groups: bool = True,
) -> Dict[str, Any]:
    """
    Génère tous les PDF clients/groupes, les pousse dans Drive,
    et crée une feuille de pilotage avec liens + montants + cases Envoyer/Payer.
    """
    if len(import_data.by_client) == 0 or len(import_data.by_group) == 0:
        compute_aggregations(import_data)

    drive = _get_drive_client()
    sheets = _get_sheets_client()

    year_folder_name = f"rfa {export_year}"
    year_folder_id = _find_or_create_folder(drive, year_folder_name, DRIVE_ROOT_ID)

    sheet_info = _create_pilotage_sheet(sheets, drive, year_folder_id, export_year)
    pilotage_rows: List[List[Any]] = []

    generated: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []

    def _process_entity(mode: str, entity_id: str, code_union: str, nom_client: str, groupe: str = ""):
        try:
            entity_detail = get_entity_detail_with_rfa(import_data, mode, entity_id)
            contract_applied = getattr(entity_detail, "contract_applied", None)
            contract_name = getattr(contract_applied, "name", None) or "Aucun contrat"
            totals = getattr(getattr(entity_detail, "rfa", None), "totals", None)
            if hasattr(totals, "get"):
                montant_ht = float(totals.get("grand_total", 0.0) or 0.0)
            else:
                montant_ht = float(getattr(totals, "grand_total", 0.0) or 0.0)
            montant_ttc = round(montant_ht * (1.0 + float(tva_rate or 0.0)), 2)

            folder_label = _safe_name(f"{code_union} - {nom_client}" if code_union else nom_client)
            entity_folder_id = _find_or_create_folder(drive, folder_label, year_folder_id)

            pdf_name = _safe_name(f"RFA_{code_union or entity_id}_{mode}_{export_year}.pdf")
            pdf_buffer = generate_pdf_report(import_id, mode, entity_id, import_data=import_data)
            uploaded = _upload_pdf_bytes(drive, entity_folder_id, pdf_name, pdf_buffer.getvalue())
            pdf_url = uploaded.get("url", "")

            pilotage_rows.append([
                code_union,
                nom_client,
                groupe,
                "CLIENT" if mode == "client" else "GROUPE",
                contract_name,
                f'=HYPERLINK("{pdf_url}","Voir PDF")' if pdf_url else "",
                round(montant_ht, 2),
                montant_ttc,
                False,
                False,
            ])

            generated.append({
                "mode": mode,
                "entity_id": entity_id,
                "code_union": code_union,
                "nom_client": nom_client,
                "folder_id": entity_folder_id,
                "pdf_id": uploaded.get("id"),
                "pdf_url": pdf_url,
                "montant_ht": round(montant_ht, 2),
                "montant_ttc": montant_ttc,
                "type_contrat": contract_name,
            })
        except Exception as e:
            errors.append({
                "mode": mode,
                "entity_id": entity_id,
                "error": str(e),
            })

    if include_clients:
        for code_union, data in sorted(import_data.by_client.items(), key=lambda x: x[0]):
            _process_entity(
                mode="client",
                entity_id=code_union,
                code_union=code_union,
                nom_client=(data.get("nom_client") or code_union),
                groupe=(data.get("groupe_client") or ""),
            )

    if include_groups:
        for groupe_name, data in sorted(import_data.by_group.items(), key=lambda x: x[0]):
            _process_entity(
                mode="group",
                entity_id=groupe_name,
                code_union="GROUPE",
                nom_client=groupe_name,
                groupe=groupe_name,
            )

    _write_pilotage_rows(
        sheets=sheets,
        spreadsheet_id=sheet_info["spreadsheet_id"],
        sheet_id=sheet_info["sheet_id"],
        rows=pilotage_rows,
    )

    return {
        "success": True,
        "export_year": export_year,
        "tva_rate": tva_rate,
        "folder_id": year_folder_id,
        "folder_url": f"https://drive.google.com/drive/folders/{year_folder_id}",
        "sheet_id": sheet_info["spreadsheet_id"],
        "sheet_url": sheet_info["spreadsheet_url"],
        "generated_count": len(generated),
        "error_count": len(errors),
        "generated": generated,
        "errors": errors,
    }

