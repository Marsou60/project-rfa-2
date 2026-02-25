"""
Tests pour le moteur de calcul de paliers.
"""
import pytest
from app.services.tier_engine import compute_tier


def test_compute_tier_below_minimum():
    """Test avec CA < seuil minimum -> rate=0, triggered=False"""
    tiers = [{"min": 20000, "rate": 0.01}]
    result = compute_tier(19999, tiers)
    
    assert result["ca"] == 19999
    assert result["selected_min"] is None
    assert result["rate"] == 0.0
    assert result["triggered"] is False
    assert result["value"] == 0.0


def test_compute_tier_at_minimum():
    """Test avec CA = seuil minimum -> déclenché"""
    tiers = [{"min": 20000, "rate": 0.01}]
    result = compute_tier(20000, tiers)
    
    assert result["ca"] == 20000
    assert result["selected_min"] == 20000
    assert result["rate"] == 0.01
    assert result["triggered"] is True
    assert result["value"] == 200.0


def test_compute_tier_multiple_tiers():
    """Test avec plusieurs paliers -> choisir le bon"""
    tiers = [
        {"min": 20000, "rate": 0.01},
        {"min": 50000, "rate": 0.015},
        {"min": 75000, "rate": 0.02}
    ]
    
    # CA entre 50k et 75k -> palier 50k
    result = compute_tier(60000, tiers)
    assert result["selected_min"] == 50000
    assert result["rate"] == 0.015
    assert result["value"] == 900.0
    
    # CA au-dessus du max -> palier max
    result = compute_tier(999999, tiers)
    assert result["selected_min"] == 75000
    assert result["rate"] == 0.02
    assert result["value"] == 19999.98


def test_compute_tier_empty_tiers():
    """Test avec liste vide -> rate=0"""
    result = compute_tier(100000, [])
    
    assert result["rate"] == 0.0
    assert result["triggered"] is False
    assert result["value"] == 0.0


def test_compute_tier_rounding():
    """Test arrondi à 2 décimales"""
    tiers = [{"min": 20000, "rate": 0.01}]
    result = compute_tier(33333.333, tiers)
    
    assert result["value"] == 333.33




