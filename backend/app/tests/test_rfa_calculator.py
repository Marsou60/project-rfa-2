"""
Tests pour le calculateur RFA.
"""
from types import SimpleNamespace

import pytest
from app.services.rfa_calculator import (
    WARNING_PRIME_HT,
    WARNING_PRIME_TTC,
    calculate_rfa,
    evaluate_warning_prime,
)


def _warning_contract():
    return SimpleNamespace(id=21, name="Contrat Warning", use_combined_global_rate=False, level_baremes=None)


def test_warning_prime_triggered_adds_ht_to_grand_total():
    recap_ca = {
        "global": {"GLOBAL_ACR": 0.0, "GLOBAL_ALLIANCE": 0.0, "GLOBAL_DCA": 0.0, "GLOBAL_EXADIS": 0.0},
        "tri": {
            "TRI_SCHAEFFLER": 70000.0,
            "TRI_ALLIANCE_DELPHI": 150000.0,
            "TRI_ALLIANCE_SOGEFI": 20000.0,
        },
    }
    contract = _warning_contract()
    # Sans règles chargées (pas de session DB), seuls les totaux + prime importent ici
    result = calculate_rfa(recap_ca, contract=contract)
    assert result["totals"]["fixed_bonus_total"] == WARNING_PRIME_HT
    assert abs(result["totals"]["grand_total"] - WARNING_PRIME_HT) < 0.01
    prime = result["fixed_bonuses"][0]
    assert prime["triggered"] is True
    assert prime["amount_ttc"] == WARNING_PRIME_TTC


def test_warning_prime_missing_one_threshold():
    recap_ca = {
        "global": {},
        "tri": {
            "TRI_SCHAEFFLER": 70000.0,
            "TRI_ALLIANCE_DELPHI": 149999.0,
            "TRI_ALLIANCE_SOGEFI": 20000.0,
        },
    }
    prime = evaluate_warning_prime(recap_ca, _warning_contract())
    assert prime is not None
    assert prime["triggered"] is False
    assert prime["conditions"][1]["met"] is False


def test_warning_prime_not_for_other_contract():
    recap_ca = {
        "global": {},
        "tri": {
            "TRI_SCHAEFFLER": 100000.0,
            "TRI_ALLIANCE_DELPHI": 200000.0,
            "TRI_ALLIANCE_SOGEFI": 50000.0,
        },
    }
    other = SimpleNamespace(id=1, name="Contrat APC", use_combined_global_rate=False, level_baremes=None)
    assert evaluate_warning_prime(recap_ca, other) is None
    result = calculate_rfa(recap_ca, contract=other)
    assert result.get("fixed_bonuses") == []
    assert result["totals"].get("fixed_bonus_total", 0) == 0


def test_rfa_calculator_global_totals():
    """Test cohérence des totaux globaux"""
    recap_ca = {
        "global": {
            "GLOBAL_ACR": 100000.0,
            "GLOBAL_ALLIANCE": 50000.0,
            "GLOBAL_DCA": 0.0,
            "GLOBAL_EXADIS": 0.0
        },
        "tri": {}
    }
    
    result = calculate_rfa(recap_ca)
    
    # Vérifier que global_total = global_rfa + global_bonus
    totals = result["totals"]
    calculated_total = totals["global_rfa"] + totals["global_bonus"]
    
    assert abs(totals["global_total"] - calculated_total) < 0.01, \
        f"global_total ({totals['global_total']}) doit être égal à global_rfa + global_bonus ({calculated_total})"


def test_rfa_calculator_grand_total():
    """Test cohérence du grand total"""
    recap_ca = {
        "global": {
            "GLOBAL_ACR": 100000.0
        },
        "tri": {
            "TRI_DCA_SBS": 30000.0
        }
    }
    
    result = calculate_rfa(recap_ca)
    
    totals = result["totals"]
    calculated_grand = totals["global_total"] + totals["tri_total"]
    
    assert abs(totals["grand_total"] - calculated_grand) < 0.01, \
        f"grand_total ({totals['grand_total']}) doit être égal à global_total + tri_total ({calculated_grand})"


def test_rfa_calculator_below_threshold():
    """Test avec CA < seuil minimum -> RFA = 0"""
    recap_ca = {
        "global": {
            "GLOBAL_ACR": 15000.0  # < 20k
        },
        "tri": {}
    }
    
    result = calculate_rfa(recap_ca)
    
    acr_rfa = result["global"]["GLOBAL_ACR"]
    assert acr_rfa["rfa"]["triggered"] is False
    assert acr_rfa["rfa"]["value"] == 0.0
    assert acr_rfa["bonus"]["triggered"] is False
    assert acr_rfa["bonus"]["value"] == 0.0




