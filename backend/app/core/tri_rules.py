"""
Règles RFA pour les tri-partites.
"""
from typing import List, Dict

# Règles par tri-partite : {clé_interne: [{"min": seuil, "rate": taux}]}
TRI_RULES: Dict[str, List[Dict[str, float]]] = {
    # DCA
    "TRI_DCA_SBS": [{"min": 25000, "rate": 0.03}],
    
    # ALLIANCE
    "TRI_SCHAEFFLER": [{"min": 20000, "rate": 0.05}],
    "TRI_ALLIANCE_DELPHI": [{"min": 20000, "rate": 0.08}],
    "TRI_ALLIANCE_BREMBO": [{"min": 20000, "rate": 0.08}],
    "TRI_ALLIANCE_SOGEFI": [{"min": 20000, "rate": 0.04}],
    
    # ACR
    "TRI_ACR_FREINAGE": [{"min": 50000, "rate": 0.04}],
    "TRI_ACR_EMBRAYAGE": [{"min": 50000, "rate": 0.04}],
    "TRI_ACR_FILTRE": [{"min": 25000, "rate": 0.015}],
    "TRI_ACR_DISTRIBUTION": [{"min": 25000, "rate": 0.03}],
    # ACR – 2 % inconditionnel (rémunération Groupement Union)
    "TRI_ACR_MACHINE_TOURNANTE": [{"min": 0, "rate": 0.02}],
    "TRI_ACR_LIAISON_AU_SOL": [{"min": 0, "rate": 0.02}],
    
    # EXADIS
    "TRI_EXADIS_EMBRAYAGE": [{"min": 50000, "rate": 0.04}],
    "TRI_EXADIS_FILTRATION": [{"min": 25000, "rate": 0.02}],
    "TRI_EXADIS_DISTRIBUTION": [{"min": 25000, "rate": 0.03}],
    "TRI_EXADIS_ETANCHEITE": [{"min": 5000, "rate": 0.02}],  # ELRING
    "TRI_EXADIS_THERMIQUE": [{"min": 5000, "rate": 0.015}],  # NRF
}




