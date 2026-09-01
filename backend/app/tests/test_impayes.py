from app.services.impayes_service import (
    normalize_statut,
    parse_montant,
    normalize_code_union,
    partenaire_type_of,
    normalize_plateforme,
)


def test_normalize_statut_excel_labels():
    assert normalize_statut("🟡 IMPAYÉ EN COURS DE PAIEMENT") == "en_cours"
    assert normalize_statut("⚫ En contentieux") == "contentieux"
    assert normalize_statut("🟢 REGULARISE") == "regularise"
    assert normalize_statut("🟡 REGULARISE") == "regularise"
    assert normalize_statut("🟣 EN ATTENTE") == "en_attente"
    assert normalize_statut(None) == "en_attente"
    assert normalize_statut("Échéancier en place") == "echeancier"


def test_parse_montant_excel_formats():
    assert parse_montant(5697.51) == 5697.51
    assert parse_montant("5614.20") == 5614.20
    assert parse_montant("3 883,18") == 3883.18
    assert parse_montant("10 635, 94") == 10635.94
    assert parse_montant("13 000") == 13000.0
    assert parse_montant("-") == 0.0


def test_code_union_and_plateforme():
    assert normalize_code_union("m0160") == "M0160"
    assert normalize_code_union("?") is None
    assert normalize_plateforme("Alliance Automotive") == "ALLIANCE"
    assert partenaire_type_of("DCA") == "plateforme"
    assert partenaire_type_of("TOTAL") == "partenaire"
