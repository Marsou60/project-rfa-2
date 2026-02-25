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
    ("groupe_client", "Groupe Client", ["groupe client"]),
    
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
    ("TRI_PURFLUX_COOPERS", "Purflux / Coopers (Alliance+ACR)", ["ca purflux coopers (alliance acr) (€)", "ca purflux coopers (alliance acr)", "ca purflux coopers alliance acr", "ca purflux coopers"]),
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
    "TRI_PURFLUX_COOPERS": "GLOBAL_ALLIANCE",
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
    """Retourne les clés des champs tri-partite."""
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
        "TRI_PURFLUX_COOPERS",
    ]

