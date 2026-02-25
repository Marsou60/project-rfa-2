"""
Barèmes RFA et Bonus pour les plateformes globales.
"""
from typing import List, Dict

# Barème RFA pour les plateformes globales
GLOBAL_TIERS_RFA: List[Dict[str, float]] = [
    {"min": 20000, "rate": 0.01},
    {"min": 50000, "rate": 0.015},
    {"min": 75000, "rate": 0.02},
    {"min": 100000, "rate": 0.025},
    {"min": 150000, "rate": 0.03},
    {"min": 200000, "rate": 0.035}
]

# Barème Bonus pour les plateformes globales
GLOBAL_TIERS_BONUS: List[Dict[str, float]] = [
    {"min": 20000, "rate": 0.005},
    {"min": 50000, "rate": 0.01},
    {"min": 75000, "rate": 0.015},
    {"min": 100000, "rate": 0.02},
    {"min": 150000, "rate": 0.025},
    {"min": 200000, "rate": 0.03}
]

# Plateformes concernées par ce barème
GLOBAL_PLATFORMS = [
    "GLOBAL_ACR",
    "GLOBAL_ALLIANCE",
    "GLOBAL_DCA",
    "GLOBAL_EXADIS"
]




