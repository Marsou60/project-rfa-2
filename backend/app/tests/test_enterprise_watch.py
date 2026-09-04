from app.services.enterprise_watch import build_snapshot, normalize_directors, snapshot_changes


def test_normalize_directors_excludes_auditors_and_is_stable():
    rows = [
        {
            "type_dirigeant": "personne morale",
            "denomination": "GESTION AUTO",
            "siren": "123 456 789",
            "qualite": "Président",
        },
        {
            "type_dirigeant": "personne physique",
            "prenoms": "Marie",
            "nom": "Martin",
            "date_de_naissance": "1980-02",
            "qualite": "Gérant",
        },
        {
            "type_dirigeant": "personne morale",
            "denomination": "AUDIT SA",
            "qualite": "Commissaire aux comptes titulaire",
        },
    ]

    assert normalize_directors(rows) == [
        {"name": "GESTION AUTO", "role": "Président", "identifier": "123456789"},
        {"name": "MARIE MARTIN", "role": "Gérant", "identifier": "1980-02"},
    ]


def test_build_snapshot_tracks_requested_establishment():
    item = {
        "siren": "123456789",
        "nom_raison_sociale": "AUTO UNION",
        "etat_administratif": "A",
        "nature_juridique": "5710",
        "dirigeants": [],
        "siege": {
            "siret": "12345678900011",
            "adresse": "1 RUE DU SIEGE 75001 PARIS",
            "code_postal": "75001",
            "libelle_commune": "PARIS",
            "etat_administratif": "A",
        },
        "matching_etablissements": [{
            "siret": "12345678900029",
            "adresse": "8 RUE DU MAGASIN 69001 LYON",
            "code_postal": "69001",
            "libelle_commune": "LYON",
            "etat_administratif": "A",
        }],
    }

    snapshot = build_snapshot(item, "12345678900029")

    assert snapshot["address"] == "8 RUE DU MAGASIN 69001 LYON"
    assert snapshot["city"] == "Lyon"
    assert snapshot["siren"] == "123456789"
    assert len(snapshot["snapshot_hash"]) == 64


def test_snapshot_changes_detects_address_director_and_status():
    old = {
        "address": "1 RUE A",
        "postal_code": "75001",
        "city": "Paris",
        "directors": [{"name": "ALAIN DUPONT", "role": "Gérant", "identifier": "1970"}],
        "company_status": "A",
        "establishment_status": "A",
        "legal_name": "GARAGE A",
        "legal_form": "5499",
    }
    new = {
        **old,
        "address": "2 RUE B",
        "directors": [{"name": "MARIE MARTIN", "role": "Gérant", "identifier": "1980"}],
        "company_status": "C",
    }

    types = {change["alert_type"] for change in snapshot_changes(old, new)}

    assert types == {"ADDRESS_CHANGE", "DIRECTOR_CHANGE", "COMPANY_STATUS_CHANGE"}
