"""
Tests parser Pure Data — tripartites marque × famille (Adhérents 2026).
"""
from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows


def test_alliance_delphi_freinage_vs_psd_split():
    rows = [
        {
            "fournisseur": "ALLIANCE",
            "marque": "DELPHI",
            "famille": "FREINAGE",
            "sous_famille": "PLAQUETTE DE FREIN",
            "ca": 20000,
        },
        {
            "fournisseur": "ALLIANCE",
            "marque": "DELPHI",
            "famille": "SUSPENSION ET DIRECTION",
            "sous_famille": "PIECE DE CHASSIS",
            "ca": 15000,
        },
        {
            "fournisseur": "ALLIANCE",
            "marque": "BREMBO",
            "famille": "FREINAGE",
            "sous_famille": "DISQUE DE FREIN",
            "ca": 10000,
        },
    ]
    recap = compute_recap_ca_from_rows(rows)

    assert recap["tri"]["TRI_ALLIANCE_DELPHI_FREINAGE"] == 20000.0
    assert recap["tri"]["TRI_ALLIANCE_DELPHI_PSD"] == 15000.0
    assert recap["tri"]["TRI_ALLIANCE_BREMBO_FREINAGE"] == 10000.0

    # Legacy marque-wide still aggregates (for old contracts)
    assert recap["tri"]["TRI_ALLIANCE_DELPHI"] == 35000.0
    assert recap["tri"]["TRI_ALLIANCE_BREMBO"] == 10000.0

    # No cross-contamination
    assert recap["tri"]["TRI_ALLIANCE_DELPHI_FREINAGE"] != recap["tri"]["TRI_ALLIANCE_DELPHI_PSD"]


def test_alliance_skf_distribution_vs_roulelements():
    rows = [
        {
            "fournisseur": "ALLIANCE",
            "marque": "SKF",
            "famille": "MOTEUR ET PERIPHERIQUE",
            "sous_famille": "KIT DISTRIBUTION + POMPE A EAU",
            "ca": 50000,
        },
        {
            "fournisseur": "ALLIANCE",
            "marque": "SKF",
            "famille": "SUSPENSION ET DIRECTION",
            "sous_famille": "KIT ROULEMENT DE ROUE",
            "ca": 8000,
        },
    ]
    recap = compute_recap_ca_from_rows(rows)
    assert recap["tri"]["TRI_ALLIANCE_SKF_DISTRIBUTION"] == 50000.0
    assert recap["tri"]["TRI_ALLIANCE_SKF_ROULEMENTS"] == 8000.0


def test_acr_brand_not_whole_family_for_2026_keys():
    rows = [
        {
            "fournisseur": "ACR",
            "marque": "BREMBO",
            "famille": "FREINAGE",
            "sous_famille": "PLAQUETTE DE FREIN",
            "ca": 12000,
        },
        {
            "fournisseur": "ACR",
            "marque": "TRW",
            "famille": "FREINAGE",
            "sous_famille": "DISQUE DE FREIN",
            "ca": 30000,
        },
    ]
    recap = compute_recap_ca_from_rows(rows)
    assert recap["tri"]["TRI_ACR_BREMBO_FREINAGE"] == 12000.0
    assert recap["tri"]["TRI_ACR_TRW_FREINAGE"] == 30000.0
    # Legacy famille entière
    assert recap["tri"]["TRI_ACR_FREINAGE"] == 42000.0
