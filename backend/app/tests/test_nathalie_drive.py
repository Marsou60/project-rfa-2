from app.services.nathalie_service import (
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
