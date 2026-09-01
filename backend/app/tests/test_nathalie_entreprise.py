from app.services.nathalie_entreprise import (
    find_sirens,
    find_sirets,
    find_tva,
    luhn_ok,
    map_etablissement,
    tva_from_siren,
)


KBIS_TEXT = """
EXTRAIT Kbis
Greffe du Tribunal de Commerce
Dénomination : GARAGE DUPONT
SIRET : 443 061 841 00047
SIREN 443 061 841
N° TVA intracommunautaire : FR64 443061841
Adresse : 8 rue de Londres 75009 Paris
"""

KBIS_RCS_ONLY = """
EXTRAIT D'IMMATRICULATION PRINCIPALE
Dénomination : GARAGE DUPONT
Forme juridique : SARL
RCS Paris B 443 061 841
Numéro unique d'identification : 443 061 841
Adresse du siège : 12 rue de Metz 57000 Metz
"""

KBIS_RCS_NEWLINE = """
Identification de la personne morale
SIREN
443 061 841
Lieu d'immatriculation
RCS NANTERRE
"""


def test_luhn_and_tva():
    assert luhn_ok("44306184100047")
    assert not luhn_ok("44306184100048")
    assert tva_from_siren("443061841") == "FR64443061841"


def test_extract_siret_and_tva_from_kbis_text():
    assert find_sirets(KBIS_TEXT)[0] == "44306184100047"
    assert find_tva(KBIS_TEXT) == "FR64443061841"


def test_extract_siren_from_rcs():
    assert find_sirets(KBIS_RCS_ONLY) == []
    assert find_sirens(KBIS_RCS_ONLY)[0] == "443061841"
    assert find_sirens(KBIS_RCS_NEWLINE)[0] == "443061841"
    assert find_sirens("Immatriculée au RCS de Paris sous le numéro 443 061 841")[0] == "443061841"


def test_find_denomination_on_kbis():
    from app.services.nathalie_entreprise import find_denominations
    names = find_denominations(KBIS_RCS_ONLY)
    assert names[0] == "GARAGE DUPONT"


def test_pdf_text_extracts_siret():
    import fitz
    from app.services.nathalie_entreprise import extract_text_from_kbis, find_sirets

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "SIRET : 443 061 841 00047")
    data = doc.tobytes()
    doc.close()
    text, method = extract_text_from_kbis(data, "kbis.pdf")
    assert method == "pdf"
    assert find_sirets(text)[0] == "44306184100047"


def test_map_etablissement_prefers_enseigne_and_street():
    item = {
        "siren": "443061841",
        "nom_raison_sociale": "GOOGLE FRANCE",
        "nom_complet": "GOOGLE FRANCE",
        "tva": ["FR64443061841"],
        "dirigeants": [
            {"nom": "MANICLE", "prenoms": "PAUL", "type_dirigeant": "personne physique"},
        ],
        "siege": {
            "siret": "44306184100047",
            "numero_voie": "8",
            "type_voie": "RUE",
            "libelle_voie": "DE LONDRES",
            "code_postal": "75009",
            "libelle_commune": "PARIS",
            "est_siege": True,
            "etat_administratif": "A",
            "liste_enseignes": ["GOOGLE FRANCE"],
            "adresse": "8 RUE DE LONDRES 75009 PARIS",
        },
    }
    mapped = map_etablissement(item, item["siege"])
    assert mapped["siret"] == "44306184100047"
    assert mapped["tva"] == "FR64443061841"
    assert mapped["adresse"] == "8 RUE DE LONDRES"
    assert mapped["code_postal"] == "75009"
    assert mapped["ville"] == "Paris"
    assert mapped["contact_magasin"] == "PAUL MANICLE"
    assert mapped["nom_client"] == "GOOGLE FRANCE"
