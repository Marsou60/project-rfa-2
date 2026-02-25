"""
Service d'import de contrats depuis un fichier JSON.
"""
import json
from typing import Dict, List, Optional
from sqlmodel import Session, select
from app.database import engine
from app.models import Contract, ContractRule, RuleScope
from app.core.fields import get_global_fields, get_tri_fields
from app.core.global_tiers import GLOBAL_PLATFORMS


def import_contracts_from_json(
    json_data: Dict,
    mode: str = "merge",
    session: Optional[Session] = None
) -> Dict[str, int]:
    """
    Importe des contrats depuis un dictionnaire JSON.
    
    Args:
        json_data: Dictionnaire JSON avec structure attendue
        mode: "merge" (met à jour) ou "replace" (remplace)
        session: Session DB optionnelle (créée si None)
    
    Returns:
        {"imported": count, "updated": count, "errors": [...]}
    """
    result = {"imported": 0, "updated": 0, "errors": []}
    
    # Valider la structure
    if "contracts" not in json_data:
        result["errors"].append("Champ 'contracts' manquant dans le JSON")
        return result
    
    # Récupérer le barème de base global (optionnel)
    global_bareme_base = json_data.get("globalBaremeBase", {})
    base_rfa = global_bareme_base.get("rfa", [])
    base_bonus = global_bareme_base.get("bonus", [])
    
    use_session = session is not None
    if not use_session:
        session = Session(engine)
    
    try:
        contracts_data = json_data["contracts"]
        
        for contract_data in contracts_data:
            try:
                contract_id_str = contract_data.get("id")
                if not contract_id_str:
                    result["errors"].append("Contrat sans 'id' ignoré")
                    continue
                
                # Chercher le contrat existant par name (on utilise name comme identifiant unique)
                # ou créer un nouveau
                contract_name = contract_data.get("name", contract_id_str)
                
                statement = select(Contract).where(Contract.name == contract_name)
                existing_contract = session.exec(statement).first()
                
                if existing_contract and mode == "replace":
                    # Supprimer les anciennes règles
                    statement_rules = select(ContractRule).where(
                        ContractRule.contract_id == existing_contract.id
                    )
                    old_rules = session.exec(statement_rules).all()
                    for rule in old_rules:
                        session.delete(rule)
                    session.commit()
                
                # Récupérer le flag pour le mode taux combiné
                use_combined_global_rate = contract_data.get("useCombinedGlobalRate", False)
                
                # Récupérer le scope (ADHERENT ou UNION)
                from app.models import ContractScope
                scope_str = contract_data.get("scope", "ADHERENT")
                try:
                    scope = ContractScope[scope_str]
                except KeyError:
                    scope = ContractScope.ADHERENT
                
                # Créer ou mettre à jour le contrat
                if existing_contract:
                    contract = existing_contract
                    contract.description = contract_data.get("notes", contract.description)
                    contract.is_default = contract_data.get("isDefault", False)
                    contract.is_active = True
                    contract.use_combined_global_rate = use_combined_global_rate
                    contract.scope = scope
                    result["updated"] += 1
                else:
                    contract = Contract(
                        name=contract_name,
                        description=contract_data.get("notes"),
                        is_default=contract_data.get("isDefault", False),
                        is_active=True,
                        use_combined_global_rate=use_combined_global_rate,
                        scope=scope
                    )
                    session.add(contract)
                    session.commit()
                    session.refresh(contract)
                    result["imported"] += 1
                
                # Gérer le contrat par défaut unique (par scope)
                if contract.is_default:
                    statement_default = select(Contract).where(
                        Contract.is_default == True,
                        Contract.scope == contract.scope,
                        Contract.id != contract.id
                    )
                    other_defaults = session.exec(statement_default).all()
                    for c in other_defaults:
                        c.is_default = False
                        session.add(c)
                
                # Importer les règles globales
                global_rules = contract_data.get("globalRules", {})
                for key in GLOBAL_PLATFORMS:
                    rule_data = global_rules.get(key, {})
                    
                    # Vérifier si on utilise le barème de base
                    if rule_data.get("useBaseBareme", False):
                        tiers_rfa = base_rfa
                        tiers_bonus = base_bonus
                    else:
                        tiers_rfa = rule_data.get("tiersRfa", [])
                        tiers_bonus = rule_data.get("tiersBonus", [])
                    
                    # Chercher la règle existante
                    statement_rule = select(ContractRule).where(
                        ContractRule.contract_id == contract.id,
                        ContractRule.key == key
                    )
                    existing_rule = session.exec(statement_rule).first()
                    
                    # Trouver le label depuis field_catalog
                    from app.core.fields import get_field_by_key
                    _, label = get_field_by_key(key)
                    
                    # Bonus groupes (ex: Soutien APA +3%)
                    bonus_groups = rule_data.get("bonusGroups", [])
                    
                    if existing_rule:
                        existing_rule.tiers_rfa = json.dumps(tiers_rfa) if tiers_rfa else None
                        existing_rule.tiers_bonus = json.dumps(tiers_bonus) if tiers_bonus else None
                        existing_rule.bonus_groups = json.dumps(bonus_groups) if bonus_groups else None
                        session.add(existing_rule)
                    else:
                        new_rule = ContractRule(
                            contract_id=contract.id,
                            key=key,
                            scope=RuleScope.GLOBAL,
                            label=label,
                            tiers_rfa=json.dumps(tiers_rfa) if tiers_rfa else None,
                            tiers_bonus=json.dumps(tiers_bonus) if tiers_bonus else None,
                            bonus_groups=json.dumps(bonus_groups) if bonus_groups else None
                        )
                        session.add(new_rule)
                
                # Importer les règles tri-partites
                tri_rules = contract_data.get("triRules", {})
                for key in get_tri_fields():
                    rule_data = tri_rules.get(key, {})
                    tiers = rule_data.get("tiers", [])
                    
                    # Chercher la règle existante
                    statement_rule = select(ContractRule).where(
                        ContractRule.contract_id == contract.id,
                        ContractRule.key == key
                    )
                    existing_rule = session.exec(statement_rule).first()
                    
                    # Trouver le label
                    from app.core.fields import get_field_by_key
                    _, label = get_field_by_key(key)
                    
                    if existing_rule:
                        existing_rule.tiers = json.dumps(tiers) if tiers else None
                        session.add(existing_rule)
                    else:
                        new_rule = ContractRule(
                            contract_id=contract.id,
                            key=key,
                            scope=RuleScope.TRI,
                            label=label,
                            tiers=json.dumps(tiers) if tiers else None
                        )
                        session.add(new_rule)
                
                # Importer les règles marketing (stockées sur le contrat)
                marketing_rules = contract_data.get("marketingRules", {})
                if marketing_rules:
                    contract.marketing_rules = json.dumps(marketing_rules)
                    session.add(contract)
                
                session.commit()
                
            except Exception as e:
                result["errors"].append(f"Erreur import contrat {contract_data.get('id', '?')}: {str(e)}")
                session.rollback()
                continue
        
    finally:
        if not use_session:
            session.close()
    
    return result


def import_contracts_from_file(file_path: str, mode: str = "merge") -> Dict[str, int]:
    """
    Importe des contrats depuis un fichier JSON.
    
    Args:
        file_path: Chemin vers le fichier JSON
        mode: "merge" ou "replace"
    
    Returns:
        Résultat de l'import
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    
    return import_contracts_from_json(json_data, mode=mode)

