from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.nathalie_service import (
    COL,
    SHEET_WIDTH,
    _client_to_sheet_row,
    _normalize_group_key,
    _preserve_sheet_backup_columns,
    _sync_liste_client_2,
    classify_drive_filename,
    default_perimetre,
    dept_from_postal,
    extract_code_from_folder_name,
    score_drive_folder_name,
)


def test_classify_rib_kbis_id():
    assert classify_drive_filename("RIB Garage Dupont.pdf") == "rib"
    assert classify_drive_filename("releve d'identité bancaire.jpg") == "rib"
    assert classify_drive_filename("KBIS_INPI.pdf") == "kbis"
    assert classify_drive_filename("Extrait K-bis 2026.pdf") == "kbis"
    assert classify_drive_filename("CNI recto verso.pdf") == "piece_identite"
    assert classify_drive_filename("photo enseigne.jpg") is None
    assert classify_drive_filename("PHOTO 1 - Devanture.jpg") == "photo_devanture"
    assert classify_drive_filename("PHOTO 2 - Comptoir.png") == "photo_comptoir"
    assert classify_drive_filename("PHOTO 3 - Stock.jpeg") == "photo_stock"
    assert classify_drive_filename("PHOTO 4.jpg") == "photo_autre_1"
    assert classify_drive_filename("PHOTO 5.webp") == "photo_autre_2"


def test_score_existing_drive_folder():
    assert score_drive_folder_name("M0160 : GARAGE DUPONT", "M0160", "GARAGE DUPONT") == 100
    assert score_drive_folder_name("M0160 GARAGE", "M0160") == 80
    assert score_drive_folder_name("Dossier M0160 archives", "M0160") >= 50
    assert score_drive_folder_name("Autre magasin", "M0160") == 0
    assert score_drive_folder_name("M0338 : MS PIECE AUTO", "M0338", "GROUPEMENT UNION") < 80
    assert score_drive_folder_name("M0338 : MS PIECE AUTO", "M0338", "MS PIECE AUTO") == 100


def test_extract_code_from_folder_name():
    assert extract_code_from_folder_name("M0160 : GARAGE DUPONT") == "M0160"
    assert extract_code_from_folder_name("J0071 Jumbo Amiens") == "J0071"
    assert extract_code_from_folder_name("Archives 2024") is None


def test_normalize_group_key():
    assert _normalize_group_key("GROUPE JUMBO") == "JUMBO"
    assert _normalize_group_key("groupe center") == "CENTER"
    assert _normalize_group_key("CODIFA") == "CODIFA"
    assert _normalize_group_key("INDEPENDANT UNION") == "MAGASIN"


def test_client_to_sheet_row_mapping():
    row = _client_to_sheet_row({
        "code_union": "M0341",
        "perimetre": "Octobre - 2026",
        "nom_client": "GARAGE TEST",
        "groupe": "INDEPENDANT UNION",
        "region_commerciale": "Île-de-France",
        "contact_magasin": "Jean Dupont",
        "contact_responsable_pdv": "Marie",
        "telephone": "0102030405",
        "telephone_responsable": "0607080910",
        "mail": "a@b.fr",
        "siret": "12345678901234",
        "agent_union": "Vanessa",
        "rib_url": "https://drive/rib",
        "photo_devanture_url": "https://drive/photo",
        "adresse": "12 rue des Lilas",
        "ville": "Argenteuil",
        "code_postal": "95100",
        "notes": "ne pas copier",
    })
    assert len(row) == SHEET_WIDTH
    assert row[COL["id_client"]] == "M0341"
    assert row[COL["code_union"]] == "M0341"
    assert row[COL["perimetre"]] == "Octobre - 2026"
    assert row[COL["nom_client"]] == "GARAGE TEST"
    assert row[COL["groupe"]] == "INDEPENDANT UNION"
    assert row[5] == ""
    assert row[COL["region"]] == "Île-de-France"
    assert row[COL["contact_magasin"]] == "Jean Dupont"
    assert row[COL["adresse"]] == "12 rue des Lilas"
    assert row[COL["code_postal"]] == "95100"
    assert row[COL["departement"]] == "95"
    assert row[COL["ville"]] == "Argenteuil"
    assert row[COL["telephone"]] == "0102030405"
    assert row[COL["responsable_pdv"]] == "Marie"
    assert row[14] == ""
    assert row[COL["mail"]] == "a@b.fr"
    assert row[COL["siret"]] == "12345678901234"
    assert row[17:21] == ["", "", "", ""]
    assert row[COL["agent_union"]] == "Vanessa"
    assert row[22:] == [""] * 6
    joined = "".join(row)
    assert "0607080910" not in joined
    assert "https://drive" not in joined
    assert "ne pas copier" not in joined


def test_default_perimetre_and_dept():
    when = datetime(2026, 10, 5, tzinfo=ZoneInfo("Europe/Paris"))
    assert default_perimetre(when) == "Octobre - 2026"
    assert dept_from_postal("95100") == "95"
    assert dept_from_postal("75 011") == "75"
    assert dept_from_postal("") == ""


def test_preserve_sheet_backup_columns():
    new_row = _client_to_sheet_row({
        "code_union": "M0001",
        "groupe": "INDEPENDANT UNION",
        "agent_union": "PAUL",
    })
    existing = [""] * SHEET_WIDTH
    existing[4] = "Old agent"
    existing[5] = "12345"
    existing[6] = "OUI"
    merged = _preserve_sheet_backup_columns(new_row, existing)
    assert merged[COL["groupe"]] == "INDEPENDANT UNION"
    assert merged[5] == ""
    assert merged[6] == ""
    assert merged[COL["agent_union"]] == "PAUL"

    created = _preserve_sheet_backup_columns(
        _client_to_sheet_row({"code_union": "M0002", "agent_union": "PAUL"}),
        None,
    )
    assert created[4] == ""
    assert created[COL["agent_union"]] == "PAUL"


def test_sync_liste_client_2_swallows_errors(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("sheets down")

    monkeypatch.setattr("app.services.nathalie_service._upsert_liste_client_2_row", boom)
    assert "sheets down" in _sync_liste_client_2({"code_union": "M0001"})
    monkeypatch.setattr("app.services.nathalie_service._delete_liste_client_2_row", boom)
    assert "sheets down" in _sync_liste_client_2(delete_code="M0001")
    assert _sync_liste_client_2(None) is None
