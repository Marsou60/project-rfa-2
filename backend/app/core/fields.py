"""
Catalogue des champs à mapper depuis Excel.
"""
from typing import Dict, List, Tuple

# Import circulaire évité : normalize_header sera utilisé dans get_field_mapping
def _normalize_for_mapping(s: str) -> str:
    """Même logique que normalize_header (minuscules, pas d'accents, non-alphanum -> espace)."""
    if not s:
        return ""
    import re
    import unicodedata
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# Mapping : (clé interne, label affiché, aliases Excel normalisés)
FIELD_DEFINITIONS: List[Tuple[str, str, List[str]]] = [
    # Identifiants
    ("code_union", "Code Union", ["code union"]),
    ("nom_client", "Nom Client", ["nom client"]),
    ("groupe_client", "Groupe Client", ["groupe client", "groupe", "groupe_client"]),
    
    # Global plateformes
    ("GLOBAL_ACR", "ACR (global)", ["ca rfa globale acr (€)", "ca rfa globale acr"]),
    ("GLOBAL_ALLIANCE", "ALLIANCE (global)", ["ca rfa globale alliance (€)", "ca rfa globale alliance"]),
    ("GLOBAL_DCA", "DCA (global)", [
        "ca rfa globale dca (€)", "ca rfa globale dca",
        "dca global", "global dca", "ca global dca", "ca dca global",
        "rfa dca", "ca dca", "dca (global)",
    ]),
    ("GLOBAL_EXADIS", "EXADIS (global)", [
        "ca rfa globale exadis (€)", "ca rfa globale exadis",
        "exadis global", "global exadis", "ca global exadis", "ca exadis global",
        "rfa exadis", "ca exadis", "exadis (global)",
    ]),
    
    # Tri-partites
    ("TRI_DCA_SBS", "DCA – SBS (NK)", ["ca rfa nk (€)", "ca rfa nk", "ca rfa sbs (€)", "ca rfa sbs", "dca sbs", "sbs nk", "nk"]),
    ("TRI_DCA_DAYCO", "DCA – Dayco", ["ca dca dayco (€)", "ca dca dayco", "dca dayco", "dayco"]),
    ("TRI_ACR_FREINAGE", "ACR – Freinage", ["ca acr freinage (€)", "ca acr freinage"]),
    ("TRI_ACR_EMBRAYAGE", "ACR – Embrayage", ["ca acr embrayage (€)", "ca acr embrayage"]),
    ("TRI_ACR_FILTRE", "ACR – Filtre", ["ca acr filtre (€)", "ca acr filtre"]),
    ("TRI_ACR_DISTRIBUTION", "ACR – Distribution", ["ca acr distribution (€)", "ca acr distribution"]),
    ("TRI_ACR_MACHINE_TOURNANTE", "ACR – Machine tournante", [
        "ca acr machine tournante (€)", "ca acr machine tournante",
        "ca acr machine tournante (euro)", "ca acr machine tournante €",
    ]),
    ("TRI_ACR_LIAISON_AU_SOL", "ACR – Liaison au sol", [
        "ca acr liaison au sol (€)", "ca acr liaison au sol",
        "ca acr liaison au sol (euro)", "ca acr liaison au sol €",
    ]),
    ("TRI_EXADIS_FREINAGE", "EXADIS – Freinage", ["ca exadis freinage (€)", "ca exadis freinage", "exadis freinage"]),
    ("TRI_EXADIS_EMBRAYAGE", "EXADIS – Embrayage (LUK/SACHS)", ["ca exadis embrayage (luk/sachs) (€)", "ca exadis embrayage (luk/sachs)", "ca exadis embrayage luk sachs", "ca exadis embrayage (€)", "ca exadis embrayage", "exadis embrayage"]),
    ("TRI_EXADIS_FILTRATION", "EXADIS – Filtration", ["ca exadis filtration (€)", "ca exadis filtration", "exadis filtration"]),
    ("TRI_EXADIS_DISTRIBUTION", "EXADIS – Distribution", ["ca exadis distribution (€)", "ca exadis distribution", "exadis distribution"]),
    ("TRI_EXADIS_ETANCHEITE", "EXADIS – Etanchéité (ELRING)", ["ca exadis etancheite (elring) (€)", "ca exadis etancheite (elring)", "ca exadis etancheite elring", "ca exadis etancheite (€)", "ca exadis etancheite", "exadis etancheite"]),
    ("TRI_EXADIS_THERMIQUE", "EXADIS – Thermique (NRF)", ["ca exadis thermique (nrf) (€)", "ca exadis thermique (nrf)", "ca exadis thermique nrf", "ca exadis thermique (€)", "ca exadis thermique", "exadis thermique"]),
    ("TRI_SCHAEFFLER", "Schaeffler", ["ca rfa schaeffler (€)", "ca rfa schaeffler"]),
    ("TRI_ALLIANCE_DELPHI", "ALLIANCE – Delphi", ["ca alliance delphi freinage (€)", "ca alliance delphi freinage", "ca alliance delphi (€)", "ca alliance delphi"]),
    ("TRI_ALLIANCE_BREMBO", "ALLIANCE – Brembo ADD", ["ca alliance brembo add (€)", "ca alliance brembo add"]),
    ("TRI_ALLIANCE_SOGEFI", "ALLIANCE – Sogefi", ["ca alliance sogefi (€)", "ca alliance sogefi"]),
    ("TRI_ALLIANCE_SKF", "ALLIANCE – SKF", ["ca alliance skf (€)", "ca alliance skf"]),
    ("TRI_ALLIANCE_NAPA", "ALLIANCE – NAPA", ["ca alliance napa (€)", "ca alliance napa"]),
    ("TRI_ALLIANCE_MECAFILTER", "ALLIANCE – Mecafilter", ["ca alliance mecafilter (€)", "ca alliance mecafilter", "alliance mecafilter", "mecafilter"]),
    ("TRI_ALLIANCE_MANN", "ALLIANCE – Mann Filter", ["ca alliance mann (€)", "ca alliance mann", "ca alliance mann filter (€)", "ca alliance mann filter", "alliance mann", "mann filter"]),
    ("TRI_PURFLUX_COOPERS", "Purflux / Coopers (Alliance+ACR)", ["ca purflux coopers (alliance acr) (€)", "ca purflux coopers (alliance acr)", "ca purflux coopers alliance acr", "ca purflux coopers"]),

    # Adhérents 2026 — Alliance marque × famille
    ("TRI_ALLIANCE_DELPHI_FREINAGE", "ALLIANCE – Delphi Freinage", []),
    ("TRI_ALLIANCE_DELPHI_PSD", "ALLIANCE – Delphi PSD", []),
    ("TRI_ALLIANCE_BREMBO_FREINAGE", "ALLIANCE – Brembo Freinage", []),
    ("TRI_ALLIANCE_SKF_DISTRIBUTION", "ALLIANCE – SKF Distribution", []),
    ("TRI_ALLIANCE_PURFLUX_FILTRATION", "ALLIANCE – Purflux Filtration", []),
    ("TRI_ALLIANCE_COOPERS_FILTRATION", "ALLIANCE – Coopers Filtration", []),
    ("TRI_ALLIANCE_GATES_DISTRIBUTION", "ALLIANCE – Gates Distribution", []),
    ("TRI_ALLIANCE_FEBI_PSD", "ALLIANCE – Febi PSD", []),
    ("TRI_ALLIANCE_KYB_AMORTISSEURS", "ALLIANCE – KYB Amortisseurs", []),
    ("TRI_ALLIANCE_LUK_EMBRAYAGE", "ALLIANCE – LUK Embrayage", []),
    ("TRI_ALLIANCE_CEVAM_MT", "ALLIANCE – CEVAM MT", []),
    ("TRI_ALLIANCE_INA_DISTRIBUTION", "ALLIANCE – INA Distribution", []),
    ("TRI_ALLIANCE_MANN_FILTRATION", "ALLIANCE – Mann Filtration", []),
    ("TRI_ALLIANCE_SNR_ROULEMENTS", "ALLIANCE – SNR Roulements", []),
    ("TRI_ALLIANCE_VALEO_EMBRAYAGE", "ALLIANCE – Valeo Embrayage", []),
    ("TRI_ALLIANCE_LTM_AMORTISSEURS", "ALLIANCE – LTM Amortisseurs", []),
    ("TRI_ALLIANCE_SASIC_PSD", "ALLIANCE – Sasic PSD", []),
    ("TRI_ALLIANCE_BOSCH_MT", "ALLIANCE – Bosch MT", []),
    ("TRI_ALLIANCE_SKF_ROULEMENTS", "ALLIANCE – SKF Roulements", []),
    ("TRI_ALLIANCE_VALEO_MT", "ALLIANCE – Valeo MT", []),
    ("TRI_ALLIANCE_MECAFILTER_FILTRATION", "ALLIANCE – Mecafilter Filtration", []),

    # Adhérents 2026 — ACR marque × famille
    ("TRI_ACR_BREMBO_FREINAGE", "ACR – Brembo Freinage", []),
    ("TRI_ACR_LUK_EMBRAYAGE", "ACR – LUK Embrayage", []),
    ("TRI_ACR_VALEO_EMBRAYAGE", "ACR – Valeo Embrayage", []),
    ("TRI_ACR_BOSCH_FREINAGE", "ACR – Bosch Freinage", []),
    ("TRI_ACR_ABS_FREINAGE", "ACR – ABS Freinage", []),
    ("TRI_ACR_CHAMPION_FREINAGE", "ACR – Champion Freinage", []),
    ("TRI_ACR_FERODO_FREINAGE", "ACR – Ferodo Freinage", []),
    ("TRI_ACR_TRW_FREINAGE", "ACR – TRW Freinage", []),
    ("TRI_ACR_BLUEPRINT_EMBRAYAGE", "ACR – Blue Print Embrayage", []),
    ("TRI_ACR_SACHS_EMBRAYAGE", "ACR – Sachs Embrayage", []),

    # Adhérents 2026 — DCA / EXADIS marque × famille
    ("TRI_DCA_SASIC_PSD", "DCA – Sasic PSD", []),
    ("TRI_EXADIS_BREMBO_FREINAGE", "EXADIS – Brembo Freinage", []),
    ("TRI_EXADIS_FERODO_FREINAGE", "EXADIS – Ferodo Freinage", []),
    ("TRI_EXADIS_TRW_FREINAGE", "EXADIS – TRW Freinage", []),
    ("TRI_EXADIS_BLUEPRINT_FREINAGE", "EXADIS – Blue Print Freinage", []),
    ("TRI_EXADIS_LPR_FREINAGE", "EXADIS – LPR Freinage", []),
    ("TRI_EXADIS_PURFLUX_FILTRATION", "EXADIS – Purflux Filtration", []),
    ("TRI_EXADIS_WIX_FILTRATION", "EXADIS – WIX Filtration", []),
    ("TRI_EXADIS_MANN_FILTRATION", "EXADIS – Mann Filtration", []),
    ("TRI_EXADIS_GATES_DISTRIBUTION", "EXADIS – Gates Distribution", []),
    ("TRI_EXADIS_HEPU_DISTRIBUTION", "EXADIS – Hepu Distribution", []),
    ("TRI_EXADIS_IPD_DISTRIBUTION", "EXADIS – IPD Distribution", []),
    ("TRI_EXADIS_SNR_DISTRIBUTION", "EXADIS – SNR Distribution", []),
    ("TRI_EXADIS_LUK_EMBRAYAGE", "EXADIS – LUK Embrayage", []),
    ("TRI_EXADIS_SACHS_EMBRAYAGE", "EXADIS – Sachs Embrayage", []),
]


def get_field_mapping() -> Dict[str, Tuple[str, str]]:
    """
    Retourne un mapping : alias normalisé -> (clé interne, label).
    Chaque alias et sa forme normalisée (sans accents, sans (€) etc.) sont ajoutés
    pour matcher exactement les en-têtes Excel (ex: "CA ACR MACHINE TOURNANTE (€)").
    """
    mapping = {}
    for key, label, aliases in FIELD_DEFINITIONS:
        for alias in aliases:
            mapping[alias] = (key, label)
            norm = _normalize_for_mapping(alias)
            if norm and norm not in mapping:
                mapping[norm] = (key, label)
    return mapping


def get_field_by_key(key: str) -> Tuple[str, str]:
    """
    Retourne (key, label) pour une clé interne donnée.
    """
    for k, label, _ in FIELD_DEFINITIONS:
        if k == key:
            return (k, label)
    return (key, key)


# Mapping : tri-partite → globale parente (même fournisseur)
TRI_TO_GLOBAL: Dict[str, str] = {
    "TRI_ACR_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_EMBRAYAGE": "GLOBAL_ACR",
    "TRI_ACR_FILTRE": "GLOBAL_ACR",
    "TRI_ACR_DISTRIBUTION": "GLOBAL_ACR",
    "TRI_ACR_MACHINE_TOURNANTE": "GLOBAL_ACR",
    "TRI_ACR_LIAISON_AU_SOL": "GLOBAL_ACR",
    "TRI_DCA_SBS": "GLOBAL_DCA",
    "TRI_DCA_DAYCO": "GLOBAL_DCA",
    "TRI_EXADIS_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_EMBRAYAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_FILTRATION": "GLOBAL_EXADIS",
    "TRI_EXADIS_DISTRIBUTION": "GLOBAL_EXADIS",
    "TRI_EXADIS_ETANCHEITE": "GLOBAL_EXADIS",
    "TRI_EXADIS_THERMIQUE": "GLOBAL_EXADIS",
    "TRI_SCHAEFFLER": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_DELPHI": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_BREMBO": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SOGEFI": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SKF": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_NAPA": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_MECAFILTER": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_MANN": "GLOBAL_ALLIANCE",
    "TRI_PURFLUX_COOPERS": "GLOBAL_ALLIANCE",
    # Adhérents 2026
    "TRI_ALLIANCE_DELPHI_FREINAGE": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_DELPHI_PSD": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_BREMBO_FREINAGE": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SKF_DISTRIBUTION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_PURFLUX_FILTRATION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_COOPERS_FILTRATION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_GATES_DISTRIBUTION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_FEBI_PSD": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_KYB_AMORTISSEURS": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_LUK_EMBRAYAGE": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_CEVAM_MT": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_INA_DISTRIBUTION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_MANN_FILTRATION": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SNR_ROULEMENTS": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_VALEO_EMBRAYAGE": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_LTM_AMORTISSEURS": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SASIC_PSD": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_BOSCH_MT": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_SKF_ROULEMENTS": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_VALEO_MT": "GLOBAL_ALLIANCE",
    "TRI_ALLIANCE_MECAFILTER_FILTRATION": "GLOBAL_ALLIANCE",
    "TRI_ACR_BREMBO_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_LUK_EMBRAYAGE": "GLOBAL_ACR",
    "TRI_ACR_VALEO_EMBRAYAGE": "GLOBAL_ACR",
    "TRI_ACR_BOSCH_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_ABS_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_CHAMPION_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_FERODO_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_TRW_FREINAGE": "GLOBAL_ACR",
    "TRI_ACR_BLUEPRINT_EMBRAYAGE": "GLOBAL_ACR",
    "TRI_ACR_SACHS_EMBRAYAGE": "GLOBAL_ACR",
    "TRI_DCA_SASIC_PSD": "GLOBAL_DCA",
    "TRI_EXADIS_BREMBO_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_FERODO_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_TRW_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_BLUEPRINT_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_LPR_FREINAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_PURFLUX_FILTRATION": "GLOBAL_EXADIS",
    "TRI_EXADIS_WIX_FILTRATION": "GLOBAL_EXADIS",
    "TRI_EXADIS_MANN_FILTRATION": "GLOBAL_EXADIS",
    "TRI_EXADIS_GATES_DISTRIBUTION": "GLOBAL_EXADIS",
    "TRI_EXADIS_HEPU_DISTRIBUTION": "GLOBAL_EXADIS",
    "TRI_EXADIS_IPD_DISTRIBUTION": "GLOBAL_EXADIS",
    "TRI_EXADIS_SNR_DISTRIBUTION": "GLOBAL_EXADIS",
    "TRI_EXADIS_LUK_EMBRAYAGE": "GLOBAL_EXADIS",
    "TRI_EXADIS_SACHS_EMBRAYAGE": "GLOBAL_EXADIS",
}

# Mapping inverse : globale → liste de ses tri-partites
GLOBAL_TO_TRIS: Dict[str, List[str]] = {}
for _tri, _glob in TRI_TO_GLOBAL.items():
    GLOBAL_TO_TRIS.setdefault(_glob, []).append(_tri)


# Groupes "fictifs" : ne pas consolider, traiter chaque client individuellement
EXCLUDED_GROUPS: set = {
    "GROUPE LES LYONNAIS",
    "INDEPENDANT UNION",
}


def get_global_fields() -> List[str]:
    """Retourne les clés des champs global."""
    return ["GLOBAL_ACR", "GLOBAL_ALLIANCE", "GLOBAL_DCA", "GLOBAL_EXADIS"]


def get_tri_fields() -> List[str]:
    """Retourne les clés des champs tri-partite (legacy + Adhérents 2026)."""
    return [
        "TRI_DCA_SBS",
        "TRI_DCA_DAYCO",
        "TRI_ACR_FREINAGE",
        "TRI_ACR_EMBRAYAGE",
        "TRI_ACR_FILTRE",
        "TRI_ACR_DISTRIBUTION",
        "TRI_ACR_MACHINE_TOURNANTE",
        "TRI_ACR_LIAISON_AU_SOL",
        "TRI_EXADIS_FREINAGE",
        "TRI_EXADIS_EMBRAYAGE",
        "TRI_EXADIS_FILTRATION",
        "TRI_EXADIS_DISTRIBUTION",
        "TRI_EXADIS_ETANCHEITE",
        "TRI_EXADIS_THERMIQUE",
        "TRI_SCHAEFFLER",
        "TRI_ALLIANCE_DELPHI",
        "TRI_ALLIANCE_BREMBO",
        "TRI_ALLIANCE_SOGEFI",
        "TRI_ALLIANCE_SKF",
        "TRI_ALLIANCE_NAPA",
        "TRI_ALLIANCE_MECAFILTER",
        "TRI_ALLIANCE_MANN",
        "TRI_PURFLUX_COOPERS",
        # Adhérents 2026 — Alliance
        "TRI_ALLIANCE_DELPHI_FREINAGE",
        "TRI_ALLIANCE_DELPHI_PSD",
        "TRI_ALLIANCE_BREMBO_FREINAGE",
        "TRI_ALLIANCE_SKF_DISTRIBUTION",
        "TRI_ALLIANCE_PURFLUX_FILTRATION",
        "TRI_ALLIANCE_COOPERS_FILTRATION",
        "TRI_ALLIANCE_GATES_DISTRIBUTION",
        "TRI_ALLIANCE_FEBI_PSD",
        "TRI_ALLIANCE_KYB_AMORTISSEURS",
        "TRI_ALLIANCE_LUK_EMBRAYAGE",
        "TRI_ALLIANCE_CEVAM_MT",
        "TRI_ALLIANCE_INA_DISTRIBUTION",
        "TRI_ALLIANCE_MANN_FILTRATION",
        "TRI_ALLIANCE_SNR_ROULEMENTS",
        "TRI_ALLIANCE_VALEO_EMBRAYAGE",
        "TRI_ALLIANCE_LTM_AMORTISSEURS",
        "TRI_ALLIANCE_SASIC_PSD",
        "TRI_ALLIANCE_BOSCH_MT",
        "TRI_ALLIANCE_SKF_ROULEMENTS",
        "TRI_ALLIANCE_VALEO_MT",
        "TRI_ALLIANCE_MECAFILTER_FILTRATION",
        # Adhérents 2026 — ACR
        "TRI_ACR_BREMBO_FREINAGE",
        "TRI_ACR_LUK_EMBRAYAGE",
        "TRI_ACR_VALEO_EMBRAYAGE",
        "TRI_ACR_BOSCH_FREINAGE",
        "TRI_ACR_ABS_FREINAGE",
        "TRI_ACR_CHAMPION_FREINAGE",
        "TRI_ACR_FERODO_FREINAGE",
        "TRI_ACR_TRW_FREINAGE",
        "TRI_ACR_BLUEPRINT_EMBRAYAGE",
        "TRI_ACR_SACHS_EMBRAYAGE",
        # Adhérents 2026 — DCA / EXADIS
        "TRI_DCA_SASIC_PSD",
        "TRI_EXADIS_BREMBO_FREINAGE",
        "TRI_EXADIS_FERODO_FREINAGE",
        "TRI_EXADIS_TRW_FREINAGE",
        "TRI_EXADIS_BLUEPRINT_FREINAGE",
        "TRI_EXADIS_LPR_FREINAGE",
        "TRI_EXADIS_PURFLUX_FILTRATION",
        "TRI_EXADIS_WIX_FILTRATION",
        "TRI_EXADIS_MANN_FILTRATION",
        "TRI_EXADIS_GATES_DISTRIBUTION",
        "TRI_EXADIS_HEPU_DISTRIBUTION",
        "TRI_EXADIS_IPD_DISTRIBUTION",
        "TRI_EXADIS_SNR_DISTRIBUTION",
        "TRI_EXADIS_LUK_EMBRAYAGE",
        "TRI_EXADIS_SACHS_EMBRAYAGE",
    ]

