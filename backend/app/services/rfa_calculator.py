"""
Calculateur RFA (RFA + Bonus) pour clients et groupes.
"""
import json
from typing import Dict, List, Optional, Any
from app.core.fields import get_field_by_key, get_global_fields, get_tri_fields
from app.core.global_tiers import GLOBAL_PLATFORMS
from app.services.tier_engine import compute_tier
from app.models import Contract, ContractRule, ContractOverride, RuleScope, TargetType

# Prime fixe Contrat Warning (TTC) — les 3 seuils TRI doivent être atteints ensemble.
# Montant HT = TTC / 1.20 pour rester cohérent avec la facturation TVA de l'Espace Client / PDF.
WARNING_PRIME_TTC = 3000.0
WARNING_PRIME_HT = round(WARNING_PRIME_TTC / 1.20, 2)  # 2500.00
WARNING_PRIME_REQUIRES = (
    ("TRI_SCHAEFFLER", "Schaeffler", 70000.0),
    ("TRI_ALLIANCE_DELPHI", "Delphi", 150000.0),
    ("TRI_ALLIANCE_SOGEFI", "Sogefi / Coopers", 20000.0),
)

# EXADIS : le CA Prodex compte pour le palier, pas pour le montant versé.
EXADIS_EXCLUDED_BRAND = "PRODEX"

# M0291 : challenge ACR. Au-delà de 65 000 €, le taux ACR (RFA + bonus du palier)
# est remplacé par un taux fixe : palier actuel + 2,5 points.
# Ex. 2,5 % + 2 % = 4,5 % → 7 % fixe. Le bonus du barème n'est pas ajouté en plus.
M0291_CODE = "M0291"
M0291_ACR_CHALLENGE_MIN = 65000.0
M0291_ACR_CHALLENGE_RATE = 0.025


def exadis_remuneration_base(recap_ca: Dict, ca: float, key: str = "GLOBAL_EXADIS") -> tuple:
    """(ca_exclu Prodex, assiette rémunérée). Le palier reste sur `ca` complet."""
    raw = 0.0
    try:
        raw = float(((recap_ca or {}).get("excluded_ca") or {}).get(key) or 0)
    except (TypeError, ValueError):
        raw = 0.0
    full = float(ca or 0)
    excluded = round(max(0.0, min(raw, full)), 2)
    return excluded, round(full - excluded, 2)


def _pay_on_assiette(tier_result: Dict, assiette: float) -> Dict:
    out = dict(tier_result)
    rate = float(out.get("rate") or 0)
    out["value"] = round(assiette * rate, 2)
    out["assiette"] = assiette
    return out


def is_warning_contract(contract: Optional[Contract]) -> bool:
    if not contract:
        return False
    return "WARNING" in ((contract.name or "").strip().upper())


def is_adherents_2026_contract(contract: Optional[Contract]) -> bool:
    """Contrat standard unique 2026 (Classique / Silver / Gold) — hors contrats spéciaux."""
    if not contract:
        return False
    name = (getattr(contract, "name", None) or "").strip().upper()
    # Normalise accents courants (ADHÉRENTS / ADHERENTS)
    name = name.replace("É", "E").replace("È", "E").replace("Ê", "E")
    return name == "ADHERENTS 2026"


def should_apply_entity_overrides(
    contract: Optional[Contract],
    year: Optional[int] = None,
) -> bool:
    """
    En 2026, Adhérents 2026 remplace les barèmes 2025 pour tous les clients
    sans contrat particulier. Les overrides client/groupe 2025 ne doivent
    pas personnaliser ce contrat standard.
    """
    if year is not None and int(year) >= 2026 and is_adherents_2026_contract(contract):
        return False
    return True


def is_apa_2026_contract(contract: Optional[Contract]) -> bool:
    if not contract:
        return False
    name = (contract.name or "").strip().upper()
    return name == "APA MARSEILLE 2026" or (
        "APA MARSEILLE" in name and "2026" in name
    )


APA_NORD_FRANCHISE_ALLIANCE_MIN = 450000.0
APA_NORD_FRANCHISE_ACR_MIN = 450000.0
APA_NORD_FRANCHISE_TOTAL_MIN = 2000000.0
APA_NORD_FRANCHISE_RATE = 0.12


def evaluate_apa_nord_franchise(
    recap_ca: Dict[str, Dict[str, float]],
    contract: Optional[Contract],
    year: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Bonus Nord+Franchise APA 2026 : Alliance + ACR passent à 12 % si
    Alliance ≥ 450k, ACR ≥ 450k et CA total toutes plateformes ≥ 2 M€.
    """
    if year is None or int(year) < 2026:
        return None
    if not is_apa_2026_contract(contract):
        return None

    global_ca = (recap_ca or {}).get("global") or {}
    alliance_ca = float(global_ca.get("GLOBAL_ALLIANCE") or 0.0)
    acr_ca = float(global_ca.get("GLOBAL_ACR") or 0.0)
    total_ca = compute_total_global_ca(recap_ca or {})

    conditions = [
        {
            "key": "GLOBAL_ALLIANCE",
            "label": "Alliance ≥ 450 000 €",
            "required": APA_NORD_FRANCHISE_ALLIANCE_MIN,
            "ca": round(alliance_ca, 2),
            "met": alliance_ca >= APA_NORD_FRANCHISE_ALLIANCE_MIN,
        },
        {
            "key": "GLOBAL_ACR",
            "label": "ACR ≥ 450 000 €",
            "required": APA_NORD_FRANCHISE_ACR_MIN,
            "ca": round(acr_ca, 2),
            "met": acr_ca >= APA_NORD_FRANCHISE_ACR_MIN,
        },
        {
            "key": "TOTAL_GLOBAL",
            "label": "CA total ≥ 2 000 000 €",
            "required": APA_NORD_FRANCHISE_TOTAL_MIN,
            "ca": round(total_ca, 2),
            "met": total_ca >= APA_NORD_FRANCHISE_TOTAL_MIN,
        },
    ]
    triggered = all(c["met"] for c in conditions)
    return {
        "key": "APA_NORD_FRANCHISE",
        "label": "Bonus Nord+Franchise 12 % (Alliance + ACR)",
        "rate": APA_NORD_FRANCHISE_RATE,
        "triggered": triggered,
        "conditions": conditions,
        "platforms": ["GLOBAL_ALLIANCE", "GLOBAL_ACR"],
    }


def evaluate_m0291_acr_challenge(
    recap_ca: Dict[str, Dict[str, float]],
    code_union: Optional[str],
    year: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Challenge réservé au code Union M0291 (RFA 2026+).
    Si le CA ACR dépasse 65 000 €, le taux du palier (RFA + bonus) est remplacé
    par un taux fixe égal à ce palier + 2,5 points (4,5 % deviennent 7 %).
    La cotisation est offerte. Retourne None pour tout autre client.
    """
    if year is not None and int(year) < 2026:
        return None
    if (code_union or "").strip().upper() != M0291_CODE:
        return None

    acr_ca = float(((recap_ca or {}).get("global") or {}).get("GLOBAL_ACR") or 0.0)
    triggered = acr_ca > M0291_ACR_CHALLENGE_MIN
    if triggered:
        missing = 0.0
    else:
        missing = round(max(M0291_ACR_CHALLENGE_MIN - acr_ca, 0.0), 2)
    return {
        "key": "M0291_ACR_CHALLENGE",
        "code_union": M0291_CODE,
        "label": "Challenge ACR",
        "threshold": M0291_ACR_CHALLENGE_MIN,
        "bonus_rate": M0291_ACR_CHALLENGE_RATE,
        "ca": round(acr_ca, 2),
        "triggered": triggered,
        "missing": missing,
        "cotisation_offerte": triggered,
    }


def evaluate_warning_prime(
    recap_ca: Dict[str, Dict[str, float]],
    contract: Optional[Contract],
    year: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Évalue la prime Warning (3000 € TTC) si les 3 CA tri-partites sont atteints.
    Applicable uniquement en RFA 2026+ (jamais en vue RFA 2025).
    Retourne None si le contrat n'est pas Warning ou si l'année < 2026.
    """
    if year is None or int(year) < 2026:
        return None
    if not is_warning_contract(contract):
        return None

    tri_ca = (recap_ca or {}).get("tri") or {}
    conditions = []
    all_met = True
    for key, label, required in WARNING_PRIME_REQUIRES:
        ca = float(tri_ca.get(key) or 0.0)
        met = ca >= required
        if not met:
            all_met = False
        conditions.append({
            "key": key,
            "label": label,
            "required": required,
            "ca": round(ca, 2),
            "met": met,
            "missing": round(max(required - ca, 0.0), 2),
        })

    return {
        "key": "WARNING_TRI_PRIME",
        "label": "Prime Warning tripartites Alliance",
        "amount_ttc": WARNING_PRIME_TTC,
        "amount_ht": WARNING_PRIME_HT,
        "triggered": all_met,
        "conditions": conditions,
    }


def parse_level_baremes(contract: Optional[Contract]) -> List[Dict[str, Any]]:
    """Parse le JSON level_baremes d'un contrat (liste vide si absent / invalide)."""
    if not contract:
        return []
    raw = getattr(contract, "level_baremes", None)
    if not raw:
        return []
    try:
        levels = json.loads(raw) if isinstance(raw, str) else raw
        return levels if isinstance(levels, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def select_contract_level(total_ca: float, levels: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Choisit le niveau de contrat selon le CA global cumulé.
    maxGlobal=None signifie pas de plafond (ex: Gold au-delà de 700k).
    """
    if not levels or total_ca is None:
        return None
    sorted_levels = sorted(levels, key=lambda lvl: float(lvl.get("minGlobal") or 0))
    for level in sorted_levels:
        min_g = float(level.get("minGlobal") or 0)
        max_g = level.get("maxGlobal")
        if total_ca < min_g:
            continue
        if max_g is not None and total_ca > float(max_g):
            continue
        return level
    return None


def compute_total_global_ca(recap_ca: Dict[str, Dict[str, float]]) -> float:
    """Somme des CA des plateformes globales présentes dans le récap."""
    total = 0.0
    for key in GLOBAL_PLATFORMS:
        if key in recap_ca.get("global", {}):
            total += float(recap_ca["global"][key] or 0)
    return total


def load_contract_rules(contract: Contract) -> Dict[str, ContractRule]:
    """
    Charge toutes les règles d'un contrat indexées par key.
    """
    from sqlmodel import Session, select
    from app.database import engine
    
    with Session(engine) as session:
        statement = select(ContractRule).where(
            ContractRule.contract_id == contract.id
        )
        rules = session.exec(statement).all()
        return {rule.key: rule for rule in rules}


def load_entity_overrides(target_type: str, target_value: str) -> Dict[str, Dict[str, List]]:
    """
    Charge les overrides d'une entite (client ou groupe) indexes par (field_key, tier_type).
    
    Args:
        target_type: "CODE_UNION" ou "GROUPE_CLIENT"
        target_value: code_union ou groupe_client
    
    Returns:
        {
            "GLOBAL_ACR": {"rfa": [...], "bonus": [...]},
            "TRI_DCA_SBS": {"tri": [...]},
            ...
        }
    """
    from sqlmodel import Session, select
    from app.database import engine
    
    result = {}
    normalized = target_value.strip().upper() if target_value else ""
    
    # Convertir target_type en Enum si c'est une chaine
    if isinstance(target_type, str):
        target_type_enum = TargetType(target_type)
    else:
        target_type_enum = target_type
    
    with Session(engine) as session:
        statement = select(ContractOverride).where(
            ContractOverride.target_type == target_type_enum,
            ContractOverride.target_value == normalized,
            ContractOverride.is_active == True
        )
        overrides = session.exec(statement).all()
        
        for override in overrides:
            if override.field_key not in result:
                result[override.field_key] = {}
            
            try:
                tiers = json.loads(override.custom_tiers)
                result[override.field_key][override.tier_type.value] = tiers
            except:
                pass
    
    return result


def load_client_overrides(code_union: str) -> Dict[str, Dict[str, List]]:
    """
    Charge les overrides d'un client (wrapper pour compatibilite).
    """
    return load_entity_overrides("CODE_UNION", code_union)


def _tri_rule_has_tiers(rule: Optional[ContractRule]) -> bool:
    """True si la règle TRI a au moins un palier non vide."""
    if not rule:
        return False
    raw = getattr(rule, "tiers", None)
    if not raw or raw in ("[]", "null"):
        return False
    try:
        tiers = json.loads(raw) if isinstance(raw, str) else raw
        return bool(tiers)
    except Exception:
        return False


def superseded_legacy_tri_keys(contract_rules: Optional[Dict[str, ContractRule]]) -> set:
    """
    Clés TRI « marque entière » à ignorer quand le contrat définit déjà des
    clés marque × famille (ex. TRI_ALLIANCE_DELPHI vs *_FREINAGE / *_PSD).

    Évite qu'un override 2025 sur Delphi agrégé réapparaisse en 2026 à côté
    de Delphi Freinage / Delphi PSD (Adhérents 2026).
    """
    rules = contract_rules or {}
    keys_with_tiers = {k for k, r in rules.items() if _tri_rule_has_tiers(r)}
    if not keys_with_tiers:
        return set()

    candidates = set(get_tri_fields()) | set(rules.keys())
    superseded = set()
    for legacy in candidates:
        prefix = f"{legacy}_"
        if any(k.startswith(prefix) for k in keys_with_tiers):
            superseded.add(legacy)
    return superseded


def calculate_rfa(
    recap_ca: Dict[str, Dict[str, float]],
    contract: Optional[Contract] = None,
    contract_rules: Optional[Dict[str, ContractRule]] = None,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    entity_overrides: Optional[Dict[str, Dict[str, List]]] = None,
    year: Optional[int] = None,
) -> Dict:
    """
    Calcule les RFA a partir d'un recapitulatif de CA et d'un contrat.
    
    Args:
        recap_ca: {
            "global": {key: amount},
            "tri": {key: amount}
        }
        contract: Contrat a utiliser (optionnel, pour compatibilite V1)
        contract_rules: Dict des regles du contrat indexees par key (optionnel)
        code_union: Code Union du client pour charger ses overrides (optionnel)
        groupe_client: Groupe client pour charger ses overrides (optionnel)
        entity_overrides: Dict des overrides deja charges (optionnel, evite un rechargement)
        year: Année RFA. La prime Warning ne s'applique qu'à partir de 2026.
    
    Returns:
        {
            "global": {
                "GLOBAL_ACR": {
                    "label": "...",
                    "ca": ...,
                    "rfa": {"selected_min":..., "rate":..., "value":..., "triggered":..., "has_override":...},
                    "bonus": {"selected_min":..., "rate":..., "value":..., "triggered":..., "has_override":...},
                    "total": {"rate":..., "value":...},
                    "triggered": bool
                },
                ...
            },
            "tri": {
                "TRI_DCA_SBS": {
                    "label": "...",
                    "ca": ...,
                    "selected_min":...,
                    "rate":...,
                    "value":...,
                    "triggered":...,
                    "has_override":...
                },
                ...
            },
            "totals": {
                "global_rfa": ...,
                "global_bonus": ...,
                "global_total": ...,
                "tri_total": ...,
                "grand_total": ...
            }
        }
    """
    result = {
        "global": {},
        "tri": {},
        "totals": {}
    }
    
    # Charger les regles du contrat si fourni
    if contract_rules is None:
        if contract:
            contract_rules = load_contract_rules(contract)
        else:
            contract_rules = {}
    
    # Overrides client/groupe : ignorés sur Adhérents 2026 (barème unique 2026)
    if not should_apply_entity_overrides(contract, year):
        client_overrides: Dict[str, Dict[str, List]] = {}
    elif entity_overrides is not None:
        client_overrides = entity_overrides
    elif code_union:
        client_overrides = load_entity_overrides("CODE_UNION", code_union)
    elif groupe_client:
        client_overrides = load_entity_overrides("GROUPE_CLIENT", groupe_client)
    else:
        client_overrides = {}
    
    # Calculer RFA pour les plateformes globales
    global_rfa_sum = 0.0
    global_bonus_sum = 0.0

    # MODE NIVEAUX (Classique / Silver / Gold) : CA global → niveau → paliers plateforme
    level_baremes = parse_level_baremes(contract)
    use_level_based = bool(level_baremes)
    selected_level = None
    total_global_ca = 0.0
    tripartites_enabled = True

    if use_level_based:
        total_global_ca = compute_total_global_ca(recap_ca)
        selected_level = select_contract_level(total_global_ca, level_baremes)
        tripartites_enabled = bool(selected_level and selected_level.get("tripartitesEnabled", False))
        level_name = selected_level.get("id") if selected_level else None
        print(
            f"[LEVEL MODE] CA Total: {total_global_ca:.2f}, "
            f"Niveau: {level_name or 'AUCUN'}, Tripartites: {tripartites_enabled}"
        )
        result["contract_level"] = {
            "id": level_name,
            "total_ca": total_global_ca,
            "tripartites_enabled": tripartites_enabled,
            "min_global": selected_level.get("minGlobal") if selected_level else None,
            "max_global": selected_level.get("maxGlobal") if selected_level else None,
        }
    
    # MODE COMBINE: Si le contrat utilise le taux global combine (ignoré si level-based)
    use_combined_rate = (
        (not use_level_based)
        and getattr(contract, 'use_combined_global_rate', False)
    ) if contract else False
    combined_rate_rfa = None
    combined_rate_bonus = None
    combined_min_reached_rfa = None
    combined_min_reached_bonus = None
    
    if use_combined_rate:
        # Plateformes participantes = celles qui ont un barème RFA non vide.
        # Permet Codifa (Alliance+ACR only) sans appliquer le taux à DCA/EXADIS.
        combined_keys: List[str] = []
        for key in GLOBAL_PLATFORMS:
            rule = contract_rules.get(key)
            if not rule or rule.scope != RuleScope.GLOBAL:
                continue
            try:
                tiers_check = json.loads(rule.tiers_rfa or "[]") if rule.tiers_rfa else []
            except (json.JSONDecodeError, TypeError):
                tiers_check = []
            if tiers_check:
                combined_keys.append(key)
        if not combined_keys:
            combined_keys = list(GLOBAL_PLATFORMS)

        total_combined_ca = 0.0
        for key in combined_keys:
            if key in recap_ca.get("global", {}):
                total_combined_ca += float(recap_ca["global"][key] or 0)

        first_rule = None
        for key in combined_keys:
            if key in contract_rules:
                first_rule = contract_rules[key]
                break

        if first_rule and first_rule.scope == RuleScope.GLOBAL:
            tiers_rfa_json = first_rule.tiers_rfa or "[]"
            tiers_bonus_json = first_rule.tiers_bonus or "[]"
            combined_tiers_rfa = json.loads(tiers_rfa_json) if tiers_rfa_json else []
            combined_tiers_bonus = json.loads(tiers_bonus_json) if tiers_bonus_json else []

            combined_result_rfa = compute_tier(total_combined_ca, combined_tiers_rfa)
            combined_result_bonus = compute_tier(total_combined_ca, combined_tiers_bonus)

            combined_rate_rfa = combined_result_rfa["rate"]
            combined_rate_bonus = combined_result_bonus["rate"]
            combined_min_reached_rfa = combined_result_rfa["selected_min"]
            combined_min_reached_bonus = combined_result_bonus["selected_min"]

            print(
                f"[COMBINED MODE] keys={combined_keys} CA Total: {total_combined_ca:.2f}, "
                f"Taux RFA: {combined_rate_rfa*100:.2f}%, Taux Bonus: {combined_rate_bonus*100:.2f}%"
            )
    else:
        combined_keys = list(GLOBAL_PLATFORMS)

    # Bonus APA Nord+Franchise (12 % Alliance+ACR sous conditions)
    apa_boost = evaluate_apa_nord_franchise(recap_ca, contract, year=year)
    apa_boost_keys = set()
    if apa_boost and apa_boost.get("triggered"):
        apa_boost_keys = set(apa_boost.get("platforms") or [])
        print(f"[APA NORD+FRANCHISE] déclenché → {apa_boost.get('rate')*100:.0f}% sur {apa_boost_keys}")
    elif apa_boost:
        print("[APA NORD+FRANCHISE] conditions non remplies")

    m0291_challenge = evaluate_m0291_acr_challenge(recap_ca, code_union, year=year)

    for key in GLOBAL_PLATFORMS:
        if key not in recap_ca.get("global", {}):
            continue
        
        ca = recap_ca["global"][key]
        _, label = get_field_by_key(key)
        
        # Recuperer la regle du contrat
        rule = contract_rules.get(key)
        
        # Charger les paliers depuis la regle
        if rule and rule.scope == RuleScope.GLOBAL:
            tiers_rfa_json = rule.tiers_rfa or "[]"
            tiers_bonus_json = rule.tiers_bonus or "[]"
            tiers_rfa = json.loads(tiers_rfa_json) if tiers_rfa_json else []
            tiers_bonus = json.loads(tiers_bonus_json) if tiers_bonus_json else []
            label = rule.label
        else:
            # Pas de regle -> RFA = 0
            tiers_rfa = []
            tiers_bonus = []

        # MODE NIVEAUX: paliers issus du niveau sélectionné (identiques pour toutes plateformes)
        if use_level_based:
            if selected_level:
                tiers_rfa = list(selected_level.get("tiersRfa") or [])
                tiers_bonus = list(selected_level.get("tiersBonus") or [])
            else:
                tiers_rfa = []
                tiers_bonus = []
        
        # Verifier si des overrides existent pour ce client
        has_rfa_override = False
        has_bonus_override = False
        key_overrides = client_overrides.get(key, {})
        
        if "rfa" in key_overrides and key_overrides["rfa"]:
            tiers_rfa = key_overrides["rfa"]
            has_rfa_override = True
        
        if "bonus" in key_overrides and key_overrides["bonus"]:
            tiers_bonus = key_overrides["bonus"]
            has_bonus_override = True
        
        # MODE COMBINE: utiliser le taux global au lieu du taux par fournisseur
        # (uniquement sur les plateformes participantes du barème combiné)
        if use_combined_rate and combined_rate_rfa is not None and key in combined_keys:
            # Appliquer le taux combine a ce fournisseur
            rfa_value = ca * combined_rate_rfa
            rfa_result = {
                "ca": ca,
                "selected_min": combined_min_reached_rfa,
                "min_threshold": tiers_rfa[0]["min"] if tiers_rfa else None,
                "rate": combined_rate_rfa,
                "triggered": combined_rate_rfa > 0,
                "value": rfa_value
            }
            rfa_result["has_override"] = has_rfa_override
            
            bonus_value = ca * combined_rate_bonus if combined_rate_bonus else 0
            bonus_result = {
                "ca": ca,
                "selected_min": combined_min_reached_bonus,
                "min_threshold": tiers_bonus[0]["min"] if tiers_bonus else None,
                "rate": combined_rate_bonus or 0,
                "triggered": (combined_rate_bonus or 0) > 0,
                "value": bonus_value
            }
            bonus_result["has_override"] = has_bonus_override
        else:
            # MODE NORMAL ou NIVEAUX: calculer RFA par fournisseur individuellement
            # (ou plateforme hors périmètre combiné → barème propre, souvent vide)
            rfa_result = compute_tier(ca, tiers_rfa)
            # Ajouter le seuil minimal (premier palier)
            rfa_min_threshold = tiers_rfa[0]["min"] if tiers_rfa and len(tiers_rfa) > 0 else None
            rfa_result["min_threshold"] = rfa_min_threshold
            rfa_result["has_override"] = has_rfa_override
            
            # Calculer Bonus
            bonus_result = compute_tier(ca, tiers_bonus)
            # Ajouter le seuil minimal (premier palier)
            bonus_min_threshold = tiers_bonus[0]["min"] if tiers_bonus and len(tiers_bonus) > 0 else None
            bonus_result["min_threshold"] = bonus_min_threshold
            bonus_result["has_override"] = has_bonus_override

        ca_exclu = 0.0
        ca_remunere = ca
        if key == "GLOBAL_EXADIS":
            ca_exclu, ca_remunere = exadis_remuneration_base(recap_ca, ca)
            if ca_exclu > 0:
                rfa_result = _pay_on_assiette(rfa_result, ca_remunere)
                bonus_result = _pay_on_assiette(bonus_result, ca_remunere)

        # APA Nord+Franchise : forcer 12 % RFA sur Alliance + ACR (sans bonus)
        if key in apa_boost_keys:
            boost_rate = float(apa_boost.get("rate") or APA_NORD_FRANCHISE_RATE)
            rfa_result = {
                "ca": ca,
                "selected_min": APA_NORD_FRANCHISE_ALLIANCE_MIN,
                "min_threshold": APA_NORD_FRANCHISE_ALLIANCE_MIN,
                "rate": boost_rate,
                "triggered": True,
                "value": ca * boost_rate,
                "has_override": has_rfa_override,
                "apa_nord_franchise": True,
            }
            bonus_result = {
                "ca": ca,
                "selected_min": None,
                "min_threshold": None,
                "rate": 0.0,
                "triggered": False,
                "value": 0.0,
                "has_override": has_bonus_override,
            }

        # M0291 : taux fixe = palier (RFA + bonus) + 2,5 points. Le bonus n'est pas repris en plus.
        if m0291_challenge and key == "GLOBAL_ACR":
            base_rfa = float(rfa_result.get("rate") or 0.0)
            base_bonus = float(bonus_result.get("rate") or 0.0)
            base_rate = round(base_rfa + base_bonus, 6)
            m0291_challenge["base_rfa_rate"] = base_rfa
            m0291_challenge["base_bonus_rate"] = base_bonus
            m0291_challenge["base_rate"] = base_rate
            if m0291_challenge.get("triggered"):
                fixed_rate = round(base_rate + M0291_ACR_CHALLENGE_RATE, 6)
                rfa_result["rate"] = fixed_rate
                rfa_result["value"] = round(ca_remunere * fixed_rate, 2)
                rfa_result["triggered"] = fixed_rate > 0
                rfa_result["acr_challenge"] = True
                bonus_result["rate"] = 0.0
                bonus_result["value"] = 0.0
                bonus_result["triggered"] = False
                m0291_challenge["boosted_rfa_rate"] = fixed_rate
                m0291_challenge["boosted_rate"] = fixed_rate
                m0291_challenge["fixed_rate"] = True
                print(
                    f"[M0291 ACR] CA {ca_remunere:.2f} > {M0291_ACR_CHALLENGE_MIN:.0f} "
                    f"→ {base_rfa*100:.2f}% + {base_bonus*100:.2f}% = {base_rate*100:.2f}% "
                    f"remplacé par {fixed_rate*100:.2f}% fixe"
                )
            else:
                m0291_challenge["boosted_rfa_rate"] = base_rfa
                m0291_challenge["boosted_rate"] = base_rate
                m0291_challenge["fixed_rate"] = False

        # Total
        total_rate = rfa_result["rate"] + bonus_result["rate"]
        total_value = rfa_result["value"] + bonus_result["value"]
        triggered = rfa_result["triggered"] or bonus_result["triggered"]
        
        platform_row = {
            "label": label,
            "ca": ca,
            "rfa": rfa_result,
            "bonus": bonus_result,
            "total": {
                "rate": total_rate,
                "value": total_value
            },
            "triggered": triggered,
            "has_override": has_rfa_override or has_bonus_override
        }
        if key == "GLOBAL_EXADIS" and ca_exclu > 0:
            platform_row["ca_exclu"] = ca_exclu
            platform_row["ca_remunere"] = ca_remunere
            platform_row["exclusion_marque"] = EXADIS_EXCLUDED_BRAND
        if m0291_challenge and key == "GLOBAL_ACR":
            platform_row["acr_challenge"] = m0291_challenge
        result["global"][key] = platform_row
        
        global_rfa_sum += rfa_result["value"]
        global_bonus_sum += bonus_result["value"]
    
    # Calculer RFA pour les tri-partites
    tri_total = 0.0
    legacy_tri_superseded = superseded_legacy_tri_keys(contract_rules)
    
    for key in get_tri_fields():
        if key not in recap_ca.get("tri", {}):
            continue
        # Contrats 2026 marque×famille : ne pas appliquer / exposer l'agrégat legacy
        # (y compris via override client 2025).
        if key in legacy_tri_superseded:
            continue
        
        ca = recap_ca["tri"][key]
        _, default_label = get_field_by_key(key)
        
        # Recuperer la regle du contrat
        rule = contract_rules.get(key)
        
        if rule and rule.scope == RuleScope.TRI:
            tiers_json = rule.tiers or "[]"
            tiers = json.loads(tiers_json) if tiers_json else []
            label = rule.label
        else:
            # Pas de regle definie -> RFA = 0
            tiers = []
            label = default_label

        # MODE NIVEAUX: tripartites réservées Silver / Gold
        if use_level_based and not tripartites_enabled:
            tiers = []
        
        # Verifier si des overrides existent pour ce client (tri-partite)
        has_tri_override = False
        key_overrides = client_overrides.get(key, {})
        
        if "tri" in key_overrides and key_overrides["tri"]:
            tiers = key_overrides["tri"]
            has_tri_override = True
        
        tier_result = compute_tier(ca, tiers)
        # Ajouter le seuil minimal (premier palier)
        tri_min_threshold = tiers[0]["min"] if tiers and len(tiers) > 0 else None
        tier_result["min_threshold"] = tri_min_threshold
        ca_exclu, ca_remunere = exadis_remuneration_base(recap_ca, ca, key)
        if ca_exclu > 0:
            tier_result = _pay_on_assiette(tier_result, ca_remunere)

        tri_row = {
            "label": label,
            "ca": ca,
            "selected_min": tier_result["selected_min"],
            "min_threshold": tri_min_threshold,
            "rate": tier_result["rate"],
            "value": tier_result["value"],
            "triggered": tier_result["triggered"],
            "has_override": has_tri_override
        }
        if ca_exclu > 0:
            tri_row["ca_exclu"] = ca_exclu
            tri_row["ca_remunere"] = ca_remunere
            tri_row["exclusion_marque"] = EXADIS_EXCLUDED_BRAND
        result["tri"][key] = tri_row
        
        tri_total += tier_result["value"]
    
    # Calculer les totaux
    global_total = global_rfa_sum + global_bonus_sum
    grand_total = global_total + tri_total

    # Prime fixe Warning 2026+ (si applicable) — s'ajoute au grand total HT
    fixed_bonuses: List[Dict[str, Any]] = []
    fixed_bonus_ht = 0.0
    warning_prime = evaluate_warning_prime(recap_ca, contract, year=year)
    if warning_prime is not None:
        fixed_bonuses.append(warning_prime)
        if warning_prime.get("triggered"):
            fixed_bonus_ht = float(warning_prime.get("amount_ht") or 0.0)
            grand_total += fixed_bonus_ht

    if apa_boost is not None:
        result["apa_nord_franchise"] = apa_boost

    if m0291_challenge is not None:
        result["acr_challenge"] = m0291_challenge

    result["fixed_bonuses"] = fixed_bonuses
    result["totals"] = {
        "global_rfa": round(global_rfa_sum, 2),
        "global_bonus": round(global_bonus_sum, 2),
        "global_total": round(global_total, 2),
        "tri_total": round(tri_total, 2),
        "fixed_bonus_total": round(fixed_bonus_ht, 2),
        "grand_total": round(grand_total, 2),
    }

    return result


def calculate_rfa_multi_contracts(
    recap_ca: Dict[str, Dict[str, float]],
    contracts: List[Contract],
    ca_by_groupe: Dict = None
) -> Dict:
    """
    Calcule les RFA avec plusieurs contrats Union (un par fournisseur).
    
    Pour chaque regle (GLOBAL_ACR, TRI_DCA_SBS, etc.), trouve le bon contrat
    et applique ses paliers.
    Gere aussi les bonus groupes (ex: Soutien APA +3%).
    
    Args:
        recap_ca: {
            "global": {key: amount},
            "tri": {key: amount}
        }
        contracts: Liste de tous les contrats Union actifs
    
    Returns:
        Dict avec structure identique à calculate_rfa
    """
    # Indexer les contrats par regle qu'ils contiennent
    # Ne garder QUE les regles qui ont de vrais paliers (pas les regles vides)
    rules_by_key = {}
    
    for contract in contracts:
        contract_rules_dict = load_contract_rules(contract)
        for key, rule in contract_rules_dict.items():
            has_tiers_rfa = rule.tiers_rfa and rule.tiers_rfa != "[]" and rule.tiers_rfa != "null"
            has_tiers_bonus = rule.tiers_bonus and rule.tiers_bonus != "[]" and rule.tiers_bonus != "null"
            has_tiers = rule.tiers and rule.tiers != "[]" and rule.tiers != "null"
            
            if has_tiers_rfa or has_tiers_bonus or has_tiers:
                rules_by_key[key] = rule
                print(f"[MULTI-CONTRACT] Regle {key} -> Contrat {contract.name}")
            # Sinon on ignore la regle vide pour ne pas ecraser une regle valide
    
    # Calculer RFA pour chaque règle globale
    result = {
        "global": {},
        "tri": {}
    }
    
    global_rfa_sum = 0.0
    global_bonus_sum = 0.0
    
    for key in get_global_fields():
        ca = recap_ca.get("global", {}).get(key, 0.0)
        _, default_label = get_field_by_key(key)
        
        rule = rules_by_key.get(key)
        
        if rule and rule.scope == RuleScope.GLOBAL:
            # Charger les paliers
            tiers_rfa_json = rule.tiers_rfa or "[]"
            tiers_bonus_json = rule.tiers_bonus or "[]"
            tiers_rfa = json.loads(tiers_rfa_json) if tiers_rfa_json else []
            tiers_bonus = json.loads(tiers_bonus_json) if tiers_bonus_json else []
            label = rule.label
        else:
            tiers_rfa = []
            tiers_bonus = []
            label = default_label
        
        # Calculer RFA et Bonus
        tier_rfa = compute_tier(ca, tiers_rfa)
        tier_bonus = compute_tier(ca, tiers_bonus)
        ca_exclu = 0.0
        ca_remunere = ca
        if key == "GLOBAL_EXADIS":
            ca_exclu, ca_remunere = exadis_remuneration_base(recap_ca, ca)
            if ca_exclu > 0:
                tier_rfa = _pay_on_assiette(tier_rfa, ca_remunere)
                tier_bonus = _pay_on_assiette(tier_bonus, ca_remunere)

        total_value = tier_rfa["value"] + tier_bonus["value"]
        triggered = tier_rfa["triggered"] or tier_bonus["triggered"]
        
        row = {
            "label": label,
            "ca": ca,
            "rfa": tier_rfa,
            "bonus": tier_bonus,
            "total": {
                "value": round(total_value, 2),
                "triggered": triggered
            },
            "triggered": triggered,
            "has_override": False
        }
        if key == "GLOBAL_EXADIS" and ca_exclu > 0:
            row["ca_exclu"] = ca_exclu
            row["ca_remunere"] = ca_remunere
            row["exclusion_marque"] = EXADIS_EXCLUDED_BRAND
        result["global"][key] = row
        
        global_rfa_sum += tier_rfa["value"]
        global_bonus_sum += tier_bonus["value"]
    
    # Calculer RFA pour chaque règle tri-partite
    tri_total = 0.0
    
    for key in get_tri_fields():
        ca = recap_ca.get("tri", {}).get(key, 0.0)
        _, default_label = get_field_by_key(key)
        
        rule = rules_by_key.get(key)
        
        if rule and rule.scope == RuleScope.TRI:
            tiers_json = rule.tiers or "[]"
            tiers = json.loads(tiers_json) if tiers_json else []
            label = rule.label
        else:
            tiers = []
            label = default_label
        
        tier_result = compute_tier(ca, tiers)
        tri_min_threshold = tiers[0]["min"] if tiers and len(tiers) > 0 else None
        tier_result["min_threshold"] = tri_min_threshold
        ca_exclu, ca_remunere = exadis_remuneration_base(recap_ca, ca, key)
        if ca_exclu > 0:
            tier_result = _pay_on_assiette(tier_result, ca_remunere)

        tri_row = {
            "label": label,
            "ca": ca,
            "selected_min": tier_result["selected_min"],
            "min_threshold": tri_min_threshold,
            "rate": tier_result["rate"],
            "value": tier_result["value"],
            "triggered": tier_result["triggered"],
            "has_override": False
        }
        if ca_exclu > 0:
            tri_row["ca_exclu"] = ca_exclu
            tri_row["ca_remunere"] = ca_remunere
            tri_row["exclusion_marque"] = EXADIS_EXCLUDED_BRAND
        result["tri"][key] = tri_row
        
        tri_total += tier_result["value"]
    
    # Calculer les bonus groupes (ex: Soutien APA Groupe +3%)
    bonus_groups_total = 0.0
    result["bonus_groups"] = []
    
    if ca_by_groupe:
        for key, rule in rules_by_key.items():
            if not rule or rule.scope != RuleScope.GLOBAL:
                continue
            bg_json = getattr(rule, 'bonus_groups', None)
            if not bg_json or bg_json == "null" or bg_json == "[]":
                continue
            try:
                bg_list = json.loads(bg_json)
            except Exception:
                continue
            
            for bg in bg_list:
                groupe_client = bg.get("groupeClient", bg.get("groupe_client", ""))
                bonus_rate = float(bg.get("bonusRate", bg.get("bonus_rate", 0)))
                bg_label = bg.get("label", f"Bonus {groupe_client}")
                
                if not groupe_client or bonus_rate <= 0:
                    continue
                
                groupe_upper = groupe_client.upper().strip()
                groupe_ca = 0.0
                for g_name, g_data in ca_by_groupe.items():
                    if g_name.upper().strip() == groupe_upper:
                        groupe_ca = g_data.get("global", {}).get(key, 0.0)
                        break
                
                if groupe_ca > 0:
                    bonus_value = round(groupe_ca * bonus_rate, 2)
                    bonus_groups_total += bonus_value
                    supplier_name = key.replace("GLOBAL_", "")
                    result["bonus_groups"].append({
                        "field_key": key,
                        "supplier": supplier_name,
                        "groupe_client": groupe_client,
                        "label": bg_label,
                        "ca": groupe_ca,
                        "bonus_rate": bonus_rate,
                        "value": bonus_value
                    })
                    print(f"[BONUS GROUPE] {bg_label} ({groupe_client}) -> {bonus_rate*100}% x {groupe_ca:.0f} = {bonus_value:.2f}")
    
    # Calculer les rémunérations Marketing & Événement
    marketing_total = 0.0
    result["marketing"] = {}
    
    for contract in contracts:
        if not contract.marketing_rules:
            continue
        try:
            m_rules = json.loads(contract.marketing_rules)
            for key, m_rule in m_rules.items():
                # On associe la règle marketing à une clé fournisseur (ex: GLOBAL_ALLIANCE)
                # Mais si la clé n'est pas dans le CA global, on prend 0 comme base (sauf si fixe)
                ca_base = recap_ca.get("global", {}).get(key, 0.0)
                
                m_type = m_rule.get("type", "fixed")
                amount = 0.0
                rate = None
                
                if m_type == "fixed":
                    amount = float(m_rule.get("amount", 0.0))
                elif m_type == "rate":
                    rate = float(m_rule.get("rate", 0.0))
                    amount = ca_base * rate
                
                if amount > 0:
                    _, label = get_field_by_key(key)
                    if key not in result["marketing"]:
                        result["marketing"][key] = {
                            "label": label,
                            "amount": 0.0,
                            "calculation_type": m_type,
                            "rate": rate,
                            "base_amount": ca_base
                        }
                    
                    # On additionne si plusieurs contrats ont des règles pour le même fournisseur (rare mais possible)
                    result["marketing"][key]["amount"] += amount
                    marketing_total += amount
                    print(f"[MARKETING] {label} -> {m_type} {amount:.2f}")
        except Exception as e:
            print(f"[MARKETING] Erreur calcul marketing pour contrat {contract.id}: {str(e)}")

    # Calculer les totaux
    global_total = global_rfa_sum + global_bonus_sum
    grand_total = global_total + tri_total + bonus_groups_total + marketing_total
    
    result["totals"] = {
        "global_rfa": round(global_rfa_sum, 2),
        "global_bonus": round(global_bonus_sum, 2),
        "global_total": round(global_total, 2),
        "tri_total": round(tri_total, 2),
        "bonus_groups_total": round(bonus_groups_total, 2),
        "marketing_total": round(marketing_total, 2),
        "grand_total": round(grand_total, 2)
    }
    
    return result

