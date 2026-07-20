"""
Parser Pure Data -> recap_ca (global + tri-partite) pour le calcul RFA 2026.

ADDITIF : ne modifie rien au flux RFA 2025. Produit la même structure `recap_ca`
que celle attendue par app.services.rfa_calculator.calculate_rfa :
    { "global": {GLOBAL_*: ca}, "tri": {TRI_*: ca} }

Règles validées avec la direction (ancien contrat) — voir mapping ci-dessous.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from app.core.fields import get_global_fields, get_tri_fields


def _u(v: Optional[str]) -> str:
    return (v or "").strip().upper()


# ── GLOBAL : fournisseur Pure Data -> clé GLOBAL_* ──
GLOBAL_BY_FOURNISSEUR: Dict[str, str] = {
    "ACR": "GLOBAL_ACR",
    "ALLIANCE": "GLOBAL_ALLIANCE",
    "DCA_GLOBAL": "GLOBAL_DCA",
    "DCA": "GLOBAL_DCA",
    "EXADIS": "GLOBAL_EXADIS",
}

# ── Sous-familles servant aux tri-partites ACR/EXADIS ──
_DISTRIB_SF = {
    "KIT DISTRIBUTION",
    "COURROIE DE DISTRIBUTION",
    "GALET / TENDEUR",
    "KIT COURROIE ACCESSOIRE",
}


def _is_embrayage(sf: str) -> bool:
    return "EMBRAYAGE" in sf or sf == "VOLANT BIMASSE"


def _is_distribution(sf: str) -> bool:
    return sf in _DISTRIB_SF


def _is_machine_tournante(sf: str) -> bool:
    return ("ALTERNATEUR" in sf) or ("DEMARREUR" in sf) or ("MACHINE TOURNANTE" in sf)


# ── Règles tri-partites : (clé, prédicat(fournisseur, marque, famille, sous_famille)) ──
# Chaque prédicat reçoit des valeurs déjà en MAJUSCULES.
TRI_RULES = [
    # ACR — par famille
    ("TRI_ACR_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and fa == "FREINAGE"),
    ("TRI_ACR_FILTRE", lambda frs, m, fa, sf: frs == "ACR" and fa == "FILTRATION"),
    ("TRI_ACR_LIAISON_AU_SOL", lambda frs, m, fa, sf: frs == "ACR" and fa == "SUSPENSION ET DIRECTION"),
    # ACR — par sous-famille
    ("TRI_ACR_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and _is_embrayage(sf)),
    ("TRI_ACR_DISTRIBUTION", lambda frs, m, fa, sf: frs == "ACR" and _is_distribution(sf)),
    ("TRI_ACR_MACHINE_TOURNANTE", lambda frs, m, fa, sf: frs == "ACR" and _is_machine_tournante(sf)),

    # DCA — par marque (exacte)
    ("TRI_DCA_DAYCO", lambda frs, m, fa, sf: frs in ("DCA_GLOBAL", "DCA") and m == "DAYCO"),
    ("TRI_DCA_SBS", lambda frs, m, fa, sf: frs in ("DCA_GLOBAL", "DCA") and m == "NK"),

    # EXADIS — familles + marques
    ("TRI_EXADIS_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and fa == "FREINAGE"),
    ("TRI_EXADIS_FILTRATION", lambda frs, m, fa, sf: frs == "EXADIS" and fa == "FILTRATION"),
    ("TRI_EXADIS_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and _is_distribution(sf)),
    ("TRI_EXADIS_EMBRAYAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m in ("LUK", "SACHS")),
    ("TRI_EXADIS_ETANCHEITE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "ELRING"),
    ("TRI_EXADIS_THERMIQUE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "NRF"),

    # ALLIANCE — par marque
    ("TRI_ALLIANCE_DELPHI", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "DELPHI"),
    ("TRI_ALLIANCE_BREMBO", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "BREMBO"),
    ("TRI_ALLIANCE_SKF", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SKF"),
    ("TRI_ALLIANCE_NAPA", lambda frs, m, fa, sf: frs == "ALLIANCE" and m.startswith("NAPA")),
    ("TRI_ALLIANCE_SOGEFI", lambda frs, m, fa, sf: frs == "ALLIANCE" and m in ("PURFLUX", "COOPERSFIAAM")),
    ("TRI_SCHAEFFLER", lambda frs, m, fa, sf: frs == "ALLIANCE" and m in ("LUK", "INA", "FAG")),
    # TRI_PURFLUX_COOPERS : fusionné dans TRI_ALLIANCE_SOGEFI (pas de ligne séparée)
]


def compute_recap_ca_from_rows(rows: List[Dict]) -> Dict[str, Dict[str, float]]:
    """
    Agrège les lignes Pure Data (déjà filtrées sur l'entité + l'année) en recap_ca.
    Chaque ligne : dict avec fournisseur, marque, famille, sous_famille, ca.
    """
    recap = {
        "global": {k: 0.0 for k in get_global_fields()},
        "tri": {k: 0.0 for k in get_tri_fields()},
    }

    for r in rows:
        try:
            ca = float(r.get("ca") or 0.0)
        except (ValueError, TypeError):
            ca = 0.0
        if ca == 0.0:
            continue

        frs = _u(r.get("fournisseur"))
        marque = _u(r.get("marque"))
        famille = _u(r.get("famille"))
        sous_famille = _u(r.get("sous_famille"))

        # Global : tout le CA du fournisseur
        gkey = GLOBAL_BY_FOURNISSEUR.get(frs)
        if gkey and gkey in recap["global"]:
            recap["global"][gkey] += ca

        # Tri-partites : une ligne peut alimenter une tri-partite (règles disjointes)
        for tri_key, predicate in TRI_RULES:
            if predicate(frs, marque, famille, sous_famille):
                recap["tri"][tri_key] += ca

    # Arrondi propre
    recap["global"] = {k: round(v, 2) for k, v in recap["global"].items()}
    recap["tri"] = {k: round(v, 2) for k, v in recap["tri"].items()}
    return recap
