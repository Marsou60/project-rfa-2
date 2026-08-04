"""
Cotisations Union RFA 2026.

Règles :
- Adhérents 2026 (niveaux) : Classique 500 € · Silver 1 000 € · Gold 1 800 €
- Contrats spécifiques (numérotation revue direction / annexes) :
  - 1800 € : fiches 1,2,3,4,6,7,9,10,11,12,13,15,16,17,20,21
  - 1000 € : fiche 5
  - 500 €  : fiches 8,14,18,19

Les montants sont des barèmes par défaut. Le statut Facturer / Offrir
est stocké dans CotisationSetting (year=2026).
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

# Montants par niveau Adhérents 2026
LEVEL_COTISATION_2026: Dict[str, float] = {
    "CLASSIQUE": 500.0,
    "SILVER": 1000.0,
    "GOLD": 1800.0,
}

# Mapping fiche revue direction → (entity_key, amount)
# Numérotation alignée sur _generate_annexes / revue direction
# (hors Adhérents 2026 / Privilege / Basique).
SPECIAL_COTISATION_2026: Dict[str, float] = {
    # 1 — APA Marseille
    "GROUPE APA MARSEILLE": 1800.0,
    # 2 — APC Auto Pièces
    "M0005": 1800.0,
    # 3 — Sky Parts (APC)
    "M0061": 1800.0,
    # 4 — Warning
    "M0110": 1800.0,
    # 5 — DPA Montreuil / Distribution
    "M0027": 1000.0,
    # 6 — DPA Sevran
    "M0028": 1800.0,
    # 7 — Expert Pièce Auto
    "M0032": 1800.0,
    # 8 — GDRP
    "M0163": 500.0,
    # 9 — Groupe Auto Mourad
    "GROUPE AUTO MOURAD": 1800.0,
    # 10 — Groupe Center
    "GROUPE CENTER": 1800.0,
    # 11 — Groupe Discount
    "GROUPE DISCOUNT": 1800.0,
    # 12 — Groupe Jumbo
    "GROUPE JUMBO": 1800.0,
    # 13 — Groupe SMP
    "GROUPE SMP": 1800.0,
    # 14 — Kit Auto 92
    "M0248": 500.0,
    # 15 — Lifting Pièces Auto
    "M0216": 1800.0,
    # 16 — MMPA Créteil
    "M0164": 1800.0,
    # 17 — Pièces Méca Vitry
    "M0173": 1800.0,
    # 18 — PPA Plaisir
    "M0258": 500.0,
    # 19 — Repar'auto Service
    "M0166": 500.0,
    # 20 — Techno Franconville
    "M0022": 1800.0,
    # 21 — Codifa / Otto'Parts (ajout 2026)
    "CODIFA": 1800.0,
}

SPECIAL_FICHE_NUMBERS: Dict[str, int] = {
    "GROUPE APA MARSEILLE": 1,
    "M0005": 2,
    "M0061": 3,
    "M0110": 4,
    "M0027": 5,
    "M0028": 6,
    "M0032": 7,
    "M0163": 8,
    "GROUPE AUTO MOURAD": 9,
    "GROUPE CENTER": 10,
    "GROUPE DISCOUNT": 11,
    "GROUPE JUMBO": 12,
    "GROUPE SMP": 13,
    "M0248": 14,
    "M0216": 15,
    "M0164": 16,
    "M0173": 17,
    "M0258": 18,
    "M0166": 19,
    "M0022": 20,
    "CODIFA": 21,
}


def _norm_key(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def is_real_group_for_cotisation(groupe_client: Optional[str]) -> bool:
    """
    True si le client appartient à un vrai groupe consolidé
    (cotisation facturée au groupe, pas au magasin).
    Les groupes fictifs EXCLUDED_GROUPS (ex. INDEPENDANT UNION) restent individuels.
    """
    from app.core.fields import EXCLUDED_GROUPS

    g = _norm_key(groupe_client)
    if not g or g in ("SANS GROUPE", "SANSGROUPE", "-"):
        return False
    if g in EXCLUDED_GROUPS:
        return False
    if "INDEPENDANT" in g:
        return False
    return True


def special_cotisation_amount(entity_key: Optional[str]) -> Optional[float]:
    key = _norm_key(entity_key)
    if not key:
        return None
    if key in SPECIAL_COTISATION_2026:
        return float(SPECIAL_COTISATION_2026[key])
    # Alias groupes avec underscore
    alt = key.replace("_", " ")
    if alt in SPECIAL_COTISATION_2026:
        return float(SPECIAL_COTISATION_2026[alt])
    return None


def level_cotisation_amount(level_id: Optional[str]) -> Optional[float]:
    if not level_id:
        return None
    key = str(level_id).strip().upper()
    if key in LEVEL_COTISATION_2026:
        return float(LEVEL_COTISATION_2026[key])
    # Labels FR
    labels = {
        "CLASSIQUE": "CLASSIQUE",
        "CLASSIC": "CLASSIQUE",
        "SILVER": "SILVER",
        "GOLD": "GOLD",
    }
    mapped = labels.get(key)
    if mapped:
        return float(LEVEL_COTISATION_2026[mapped])
    return None


def default_cotisation_2026(
    *,
    entity_key: Optional[str],
    level_based: bool,
    level_id: Optional[str],
    contract_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Barème théorique 2026 pour une entité.
    Priorité : contrat spécifique (fiche) > niveau Adhérents 2026.
    """
    special_amt = special_cotisation_amount(entity_key)
    if special_amt is not None:
        fiche = SPECIAL_FICHE_NUMBERS.get(_norm_key(entity_key)) or SPECIAL_FICHE_NUMBERS.get(
            _norm_key(entity_key).replace("_", " ")
        )
        return {
            "amount": special_amt,
            "source": "special",
            "label": f"Contrat spécial{f' · fiche {fiche}' if fiche else ''}",
            "fiche": fiche,
            "level_id": None,
        }

    if level_based:
        # level_id may be CLASSIQUE or label Classique
        raw = (level_id or "").strip().upper()
        for cand in (raw, raw.replace("É", "E")):
            amt = level_cotisation_amount(cand)
            if amt is not None:
                return {
                    "amount": amt,
                    "source": "level",
                    "label": f"Adhérents 2026 · {cand.title()}",
                    "fiche": None,
                    "level_id": cand,
                }
        # Sous seuil : pas de cotisation
        return {
            "amount": 0.0,
            "source": "level_none",
            "label": "Adhérents 2026 · sous seuil (pas de cotisation)",
            "fiche": None,
            "level_id": None,
        }

    return {
        "amount": 0.0,
        "source": "none",
        "label": contract_name or "Aucun barème cotisation 2026",
        "fiche": None,
        "level_id": None,
    }


def merge_cotisation_status(
    default: Dict[str, Any],
    setting: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Fusionne le barème théorique avec le réglage DB (Facturer / Offrir).
    Si un montant a été forcé en DB (>0), on le conserve ; sinon barème théorique.
    """
    amount = float(default.get("amount") or 0)
    facturee = True
    deduite = True
    overridden = False

    if setting is not None:
        overridden = True
        db_amount = float(getattr(setting, "amount", 0) or 0)
        if db_amount > 0:
            amount = db_amount
        facturee = bool(getattr(setting, "facturee", True))
        deduite = bool(getattr(setting, "deduite", True))

    is_offerte = amount > 0 and (not facturee) and (not deduite)
    is_facture = amount > 0 and facturee and deduite
    deducted = amount if is_facture else 0.0

    return {
        "amount": round(amount, 2),
        "facturee": facturee,
        "deduite": deduite,
        "is_offerte": is_offerte,
        "is_facture": is_facture,
        "deducted": round(deducted, 2),
        "source": default.get("source"),
        "label": default.get("label"),
        "fiche": default.get("fiche"),
        "level_id": default.get("level_id"),
        "overridden": overridden,
    }


def resolve_cotisation_2026_for_entity(
    *,
    entity_key: str,
    level_based: bool,
    level_id: Optional[str],
    contract_name: Optional[str] = None,
    setting: Optional[Any] = None,
    entity_type: Optional[str] = None,
    groupe_client: Optional[str] = None,
) -> Dict[str, Any]:
    """
    entity_type: 'independent' | 'group' | 'client'
    Pour un magasin membre d'un vrai groupe : montant 0 (cotisation au groupe).
    """
    # Client rattaché à un groupe consolidé → pas de cotisation individuelle
    if (entity_type or "").lower() in ("independent", "client", ""):
        # Si on connaît le groupe du magasin et que c'est un vrai groupe
        if is_real_group_for_cotisation(groupe_client):
            return {
                "amount": 0.0,
                "facturee": False,
                "deduite": False,
                "is_offerte": False,
                "is_facture": False,
                "deducted": 0.0,
                "source": "group_member",
                "label": f"Cotisation au niveau groupe ({_norm_key(groupe_client)})",
                "fiche": None,
                "level_id": None,
                "overridden": False,
                "billed_at_group": _norm_key(groupe_client),
            }

    default = default_cotisation_2026(
        entity_key=entity_key,
        level_based=level_based,
        level_id=level_id,
        contract_name=contract_name,
    )
    return merge_cotisation_status(default, setting)
