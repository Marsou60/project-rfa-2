"""
Parser Pure Data -> recap_ca (global + tri-partite) pour le calcul RFA 2026.

ADDITIF : ne modifie rien au flux RFA 2025. Produit la même structure `recap_ca`
que celle attendue par app.services.rfa_calculator.calculate_rfa :
    { "global": {GLOBAL_*: ca}, "tri": {TRI_*: ca} }

Règles legacy (ancien contrat) : familles / marques agrégées.
Règles Adhérents 2026 : marque × famille (disjointes des clés legacy).
"""
from __future__ import annotations

from typing import Dict, List, Optional, Callable, Tuple

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

# ── Familles Pure Data (labels commerciaux du livret → catalogue) ──
# Freinage VL → FREINAGE
# PSD → SUSPENSION ET DIRECTION
# Filtration VL → FILTRATION
# Embrayage → TRANSMISSION ET EMBRAYAGE
# Distribution VL (Alliance) → MOTEUR ET PERIPHERIQUE
# MT / Machine tournante → DEMARRAGE ET CHARGE
# Thermique → THERMIE ET CLIMATISATION
FA_FREINAGE = "FREINAGE"
FA_PSD = "SUSPENSION ET DIRECTION"
FA_FILTRATION = "FILTRATION"
FA_EMBRAYAGE = "TRANSMISSION ET EMBRAYAGE"
FA_DISTRIB_ALLIANCE = "MOTEUR ET PERIPHERIQUE"
FA_MT = "DEMARRAGE ET CHARGE"
FA_THERMIQUE = "THERMIE ET CLIMATISATION"

# ── Sous-familles servant aux tri-partites ACR/EXADIS ──
_DISTRIB_SF = {
    "KIT DISTRIBUTION",
    "COURROIE DE DISTRIBUTION",
    "GALET / TENDEUR",
    "KIT COURROIE ACCESSOIRE",
    "KIT DISTRIBUTION + POMPE A EAU",
    "KIT DISTRIBUTION COURROIE",
    "KIT DISTRIBUTION CHAINE",
    "COURROIE ACCESSOIRE",
    "GALET / TENDEUR CHAINE",
}


def _is_embrayage(sf: str) -> bool:
    return "EMBRAYAGE" in sf or sf == "VOLANT BIMASSE"


def _is_distribution(sf: str) -> bool:
    if sf in _DISTRIB_SF:
        return True
    return "DISTRIBUTION" in sf or "COURROIE" in sf or "GALET" in sf


def _is_machine_tournante(sf: str) -> bool:
    return ("ALTERNATEUR" in sf) or ("DEMARREUR" in sf) or ("MACHINE TOURNANTE" in sf)


def _is_roulelement(sf: str) -> bool:
    return "ROULEMENT" in sf


def _is_amortisseur(sf: str) -> bool:
    return "AMORTISSEUR" in sf


def _is_dca(frs: str) -> bool:
    return frs in ("DCA_GLOBAL", "DCA")


def _is_valeo(m: str) -> bool:
    return m == "VALEO" or m.startswith("VALEO")


def _is_coopers(m: str) -> bool:
    return "COOPERS" in m


def _is_ltm(m: str) -> bool:
    return m in ("LTM", "LA TUNISIE MECANIQUE") or "TUNISIE MECANIQUE" in m


def _is_mecafilter(m: str) -> bool:
    return m.replace(" ", "") in ("MECAFILTER",) or "MECA FILTER" in m


def _is_blueprint(m: str) -> bool:
    compact = m.replace(" ", "")
    return compact in ("BLUEPRINT", "BLUPRINT") or m == "BLUE PRINT"


def _is_mann(m: str) -> bool:
    return m in ("MANN FILTER", "MANN") or m.startswith("MANN")


TriPredicate = Callable[[str, str, str, str], bool]
TriRule = Tuple[str, TriPredicate]


# ── Règles tri-partites LEGACY (anciens contrats) ──
# Ne pas modifier le sens de ces clés.
TRI_RULES_LEGACY: List[TriRule] = [
    # ACR — par famille
    ("TRI_ACR_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and fa == FA_FREINAGE),
    ("TRI_ACR_FILTRE", lambda frs, m, fa, sf: frs == "ACR" and fa == FA_FILTRATION),
    ("TRI_ACR_LIAISON_AU_SOL", lambda frs, m, fa, sf: frs == "ACR" and fa == FA_PSD),
    # ACR — par sous-famille
    ("TRI_ACR_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and _is_embrayage(sf)),
    ("TRI_ACR_DISTRIBUTION", lambda frs, m, fa, sf: frs == "ACR" and _is_distribution(sf)),
    ("TRI_ACR_MACHINE_TOURNANTE", lambda frs, m, fa, sf: frs == "ACR" and _is_machine_tournante(sf)),

    # DCA — par marque (exacte)
    ("TRI_DCA_DAYCO", lambda frs, m, fa, sf: _is_dca(frs) and m == "DAYCO"),
    ("TRI_DCA_SBS", lambda frs, m, fa, sf: _is_dca(frs) and m == "NK"),

    # EXADIS — familles + marques
    ("TRI_EXADIS_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and fa == FA_FREINAGE),
    ("TRI_EXADIS_FILTRATION", lambda frs, m, fa, sf: frs == "EXADIS" and fa == FA_FILTRATION),
    ("TRI_EXADIS_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and _is_distribution(sf)),
    ("TRI_EXADIS_EMBRAYAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m in ("LUK", "SACHS")),
    ("TRI_EXADIS_ETANCHEITE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "ELRING"),
    ("TRI_EXADIS_THERMIQUE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "NRF"),

    # ALLIANCE — par marque (toutes familles)
    ("TRI_ALLIANCE_DELPHI", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "DELPHI"),
    ("TRI_ALLIANCE_BREMBO", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "BREMBO"),
    ("TRI_ALLIANCE_SKF", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SKF"),
    ("TRI_ALLIANCE_NAPA", lambda frs, m, fa, sf: frs == "ALLIANCE" and m.startswith("NAPA")),
    ("TRI_ALLIANCE_SOGEFI", lambda frs, m, fa, sf: frs == "ALLIANCE" and m in ("PURFLUX", "COOPERSFIAAM")),
    ("TRI_SCHAEFFLER", lambda frs, m, fa, sf: frs == "ALLIANCE" and m in ("LUK", "INA", "FAG")),
]


# ── Règles Adhérents 2026 : marque × famille ──
# Mapping livret → Pure Data validé sur PUREDATA20262027.xlsx
TRI_RULES_ADHERENT_2026: List[TriRule] = [
    # Alliance — Premium
    ("TRI_ALLIANCE_DELPHI_FREINAGE", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "DELPHI" and fa == FA_FREINAGE),
    ("TRI_ALLIANCE_DELPHI_PSD", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "DELPHI" and fa == FA_PSD),
    ("TRI_ALLIANCE_BREMBO_FREINAGE", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "BREMBO" and fa == FA_FREINAGE),
    ("TRI_ALLIANCE_SKF_DISTRIBUTION", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SKF" and fa == FA_DISTRIB_ALLIANCE),
    ("TRI_ALLIANCE_PURFLUX_FILTRATION", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "PURFLUX" and fa == FA_FILTRATION),
    ("TRI_ALLIANCE_COOPERS_FILTRATION", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_coopers(m) and fa == FA_FILTRATION),
    ("TRI_ALLIANCE_GATES_DISTRIBUTION", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "GATES" and fa == FA_DISTRIB_ALLIANCE),

    # Alliance — Standard
    ("TRI_ALLIANCE_FEBI_PSD", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "FEBI" and fa == FA_PSD),
    ("TRI_ALLIANCE_KYB_AMORTISSEURS", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "KYB" and fa == FA_PSD),
    ("TRI_ALLIANCE_LUK_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "LUK" and fa == FA_EMBRAYAGE),
    ("TRI_ALLIANCE_CEVAM_MT", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "CEVAM" and fa == FA_MT),
    ("TRI_ALLIANCE_INA_DISTRIBUTION", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "INA" and fa == FA_DISTRIB_ALLIANCE),
    ("TRI_ALLIANCE_MANN_FILTRATION", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_mann(m) and fa == FA_FILTRATION),
    ("TRI_ALLIANCE_SNR_ROULEMENTS", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SNR" and _is_roulelement(sf)),
    ("TRI_ALLIANCE_VALEO_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_valeo(m) and fa == FA_EMBRAYAGE),
    ("TRI_ALLIANCE_LTM_AMORTISSEURS", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_ltm(m) and fa == FA_PSD),
    ("TRI_ALLIANCE_SASIC_PSD", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SASIC" and fa == FA_PSD),
    ("TRI_ALLIANCE_BOSCH_MT", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "BOSCH" and fa == FA_MT),

    # Alliance — Basique
    ("TRI_ALLIANCE_SKF_ROULEMENTS", lambda frs, m, fa, sf: frs == "ALLIANCE" and m == "SKF" and _is_roulelement(sf)),
    ("TRI_ALLIANCE_VALEO_MT", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_valeo(m) and fa == FA_MT),
    ("TRI_ALLIANCE_MECAFILTER_FILTRATION", lambda frs, m, fa, sf: frs == "ALLIANCE" and _is_mecafilter(m) and fa == FA_FILTRATION),

    # ACR — Basique (marques solo ; catalogue exclu)
    ("TRI_ACR_BREMBO_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "BREMBO" and fa == FA_FREINAGE),
    ("TRI_ACR_LUK_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "LUK" and fa == FA_EMBRAYAGE),
    ("TRI_ACR_VALEO_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and _is_valeo(m) and fa == FA_EMBRAYAGE),
    ("TRI_ACR_BOSCH_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "BOSCH" and fa == FA_FREINAGE),
    ("TRI_ACR_ABS_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "ABS" and fa == FA_FREINAGE),
    ("TRI_ACR_CHAMPION_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "CHAMPION" and fa == FA_FREINAGE),
    ("TRI_ACR_FERODO_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "FERODO" and fa == FA_FREINAGE),
    ("TRI_ACR_TRW_FREINAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "TRW" and fa == FA_FREINAGE),
    ("TRI_ACR_BLUEPRINT_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and _is_blueprint(m) and fa == FA_EMBRAYAGE),
    ("TRI_ACR_SACHS_EMBRAYAGE", lambda frs, m, fa, sf: frs == "ACR" and m == "SACHS" and fa == FA_EMBRAYAGE),

    # DCA — Adhérents 2026
    ("TRI_DCA_SASIC_PSD", lambda frs, m, fa, sf: _is_dca(frs) and m == "SASIC" and fa == FA_PSD),
    # NK toutes familles + DAYCO distribution : clés legacy TRI_DCA_SBS / TRI_DCA_DAYCO réutilisées

    # EXADIS — Basique marque × famille
    ("TRI_EXADIS_BREMBO_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "BREMBO" and fa == FA_FREINAGE),
    ("TRI_EXADIS_FERODO_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "FERODO" and fa == FA_FREINAGE),
    ("TRI_EXADIS_TRW_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "TRW" and fa == FA_FREINAGE),
    ("TRI_EXADIS_BLUEPRINT_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and _is_blueprint(m) and fa == FA_FREINAGE),
    ("TRI_EXADIS_LPR_FREINAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "LPR" and fa == FA_FREINAGE),
    ("TRI_EXADIS_PURFLUX_FILTRATION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "PURFLUX" and fa == FA_FILTRATION),
    ("TRI_EXADIS_WIX_FILTRATION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "WIX" and fa == FA_FILTRATION),
    ("TRI_EXADIS_MANN_FILTRATION", lambda frs, m, fa, sf: frs == "EXADIS" and _is_mann(m) and fa == FA_FILTRATION),
    ("TRI_EXADIS_GATES_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "GATES" and _is_distribution(sf)),
    ("TRI_EXADIS_HEPU_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "HEPU" and _is_distribution(sf)),
    ("TRI_EXADIS_IPD_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "IPD" and _is_distribution(sf)),
    ("TRI_EXADIS_SNR_DISTRIBUTION", lambda frs, m, fa, sf: frs == "EXADIS" and m == "SNR" and _is_distribution(sf)),
    ("TRI_EXADIS_LUK_EMBRAYAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "LUK" and fa == FA_EMBRAYAGE),
    ("TRI_EXADIS_SACHS_EMBRAYAGE", lambda frs, m, fa, sf: frs == "EXADIS" and m == "SACHS" and fa == FA_EMBRAYAGE),
    # NRF / ELRING : clés legacy TRI_EXADIS_THERMIQUE / TRI_EXADIS_ETANCHEITE réutilisées
]


# Union : legacy d'abord, puis Adhérents 2026 (une ligne peut alimenter plusieurs clés ;
# chaque contrat ne référence que ses propres clés → pas de double rémunération).
TRI_RULES: List[TriRule] = TRI_RULES_LEGACY + TRI_RULES_ADHERENT_2026


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

        # Tri-partites : une ligne peut alimenter plusieurs clés (legacy + 2026)
        for tri_key, predicate in TRI_RULES:
            if tri_key not in recap["tri"]:
                continue
            if predicate(frs, marque, famille, sous_famille):
                recap["tri"][tri_key] += ca

    # Arrondi propre
    recap["global"] = {k: round(v, 2) for k, v in recap["global"].items()}
    recap["tri"] = {k: round(v, 2) for k, v in recap["tri"].items()}
    return recap
