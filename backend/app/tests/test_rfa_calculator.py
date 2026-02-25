"""
Tests pour le calculateur RFA.
"""
import pytest
from app.services.rfa_calculator import calculate_rfa


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




