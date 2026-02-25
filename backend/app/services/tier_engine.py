"""
Moteur de calcul de paliers (tiers).
"""
from typing import List, Dict, Optional


def compute_tier(ca: float, tiers: List[Dict[str, float]]) -> Dict:
    """
    Calcule le palier applicable pour un CA donné.
    
    Args:
        ca: Chiffre d'affaires
        tiers: Liste de paliers [{"min": seuil, "rate": taux}]
    
    Returns:
        {
            "ca": ca,
            "selected_min": float|None,  # Seuil retenu
            "rate": float,                # Taux applicable (0.025)
            "triggered": bool,            # Si déclenché (CA >= seuil min)
            "value": float                # Montant RFA (arrondi à 2 décimales)
        }
    """
    if not tiers or len(tiers) == 0:
        return {
            "ca": ca,
            "selected_min": None,
            "min_threshold": None,
            "rate": 0.0,
            "triggered": False,
            "value": 0.0
        }
    
    # Trier les paliers par seuil croissant
    sorted_tiers = sorted(tiers, key=lambda x: x["min"])
    
    # Seuil minimal = premier palier
    first_threshold = sorted_tiers[0]["min"] if sorted_tiers else None
    
    # Trouver le plus grand palier dont min <= ca
    selected_tier = None
    for tier in sorted_tiers:
        if tier["min"] <= ca:
            selected_tier = tier
        else:
            break
    
    if selected_tier is None:
        # Aucun palier atteint
        return {
            "ca": ca,
            "selected_min": None,
            "min_threshold": first_threshold,
            "rate": 0.0,
            "triggered": False,
            "value": 0.0
        }
    
    # Calculer la valeur
    value = round(ca * selected_tier["rate"], 2)
    
    return {
        "ca": ca,
        "selected_min": selected_tier["min"],
        "min_threshold": first_threshold,
        "rate": selected_tier["rate"],
        "triggered": True,
        "value": value
    }




