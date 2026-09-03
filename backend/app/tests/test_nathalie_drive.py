from app.services.nathalie_service import (
    COL,
    _client_to_sheet_row,
    _normalize_group_key,
    _preserve_sheet_backup_columns,
    _sync_liste_client_2,
    classify_drive_filename,
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
        "nom_client": "GARAGE TEST",
        "groupe": "INDEPENDANT UNION",
        "region_commerciale": "IDF",
        "contact_magasin": "Jean Dupont",
        "contact_responsable_pdv": "Marie",
        "telephone": "0102030405",
        "telephone_responsable": "0607080910",
        "mail": "a@b.fr",
        "siret": "12345678901234",
        "agent_union": "NATHALIE",
        "rib_url": "https://drive/rib",
        "photo_devanture_url": "https://drive/photo",
        "ville": "Paris",
        "code_postal": "75011",
    })
    assert len(row) == max(COL.values()) + 1
    assert row[COL["id_client"]] == "M0341"
    assert row[COL["code_union"]] == "M0341"
    assert row[COL["nom_client"]] == "GARAGE TEST"
    assert row[COL["region"]] == "IDF"
    assert row[COL["contact_magasin"]] == "Jean Dupont"
    assert row[COL["responsable_pdv"]] == "Marie"
    assert row[COL["agent_union"]] == "NATHALIE"
    assert row[COL["rib"]] == "https://drive/rib"
    assert row[COL["photo_enseigne"]] == "https://drive/photo"
    assert "0607080910" in row[COL["note_generale"]]


def test_preserve_sheet_backup_columns():
    new_row = _client_to_sheet_row({"code_union": "M0001", "agent_union": "PAUL"})
    existing = [""] * 26
    existing[COL["contact_agent"]] = "Old agent"
    existing[COL["total_2024"]] = "12345"
    existing[COL["adherent_alliance"]] = "OUI"
    merged = _preserve_sheet_backup_columns(new_row, existing)
    assert merged[COL["contact_agent"]] == "Old agent"
    assert merged[COL["total_2024"]] == "12345"
    assert merged[COL["adherent_alliance"]] == "OUI"
    assert merged[COL["agent_union"]] == "PAUL"

    created = _preserve_sheet_backup_columns(
        _client_to_sheet_row({"code_union": "M0002", "agent_union": "PAUL"}),
        None,
    )
    assert created[COL["contact_agent"]] == "PAUL"


def test_sync_liste_client_2_swallows_errors(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("sheets down")

    monkeypatch.setattr("app.services.nathalie_service._upsert_liste_client_2_row", boom)
    assert "sheets down" in _sync_liste_client_2({"code_union": "M0001"})
    monkeypatch.setattr("app.services.nathalie_service._delete_liste_client_2_row", boom)
    assert "sheets down" in _sync_liste_client_2(delete_code="M0001")
    assert _sync_liste_client_2(None) is None
