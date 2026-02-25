"""
Seed initial de la base de données avec le contrat BASE_STANDARD.
"""
import json
import os
from sqlmodel import Session, select
from app.database import engine
from app.models import Contract, ContractRule, RuleScope
from app.core.global_tiers import GLOBAL_TIERS_RFA, GLOBAL_TIERS_BONUS, GLOBAL_PLATFORMS
from app.core.tri_rules import TRI_RULES
from app.core.fields import FIELD_DEFINITIONS, get_global_fields, get_tri_fields
from app.services.contract_json_importer import import_contracts_from_file


def seed_base_standard():
    """Crée le contrat BASE_STANDARD si aucun contrat n'existe."""
    with Session(engine) as session:
        # Vérifier si des contrats existent
        statement = select(Contract)
        existing = session.exec(statement).first()
        
        if existing:
            print("Base de données déjà initialisée, skip seed")
            return
        
        # Essayer d'importer depuis contracts.json si disponible
        contracts_json_path = os.path.join(os.path.dirname(__file__), "..", "..", "contracts", "contracts.json")
        if os.path.exists(contracts_json_path):
            print(f"Importation des contrats depuis {contracts_json_path}...")
            try:
                result = import_contracts_from_file(contracts_json_path, mode="merge")
                print(f"Import JSON: {result['imported']} importés, {result['updated']} mis à jour")
                if result['errors']:
                    print(f"Erreurs: {result['errors']}")
                # Vérifier si on a maintenant des contrats
                existing = session.exec(statement).first()
                if existing:
                    print("Contrats importés depuis JSON, skip création BASE_STANDARD")
                    return
            except Exception as e:
                print(f"Erreur lors de l'import JSON: {e}")
                print("Création du contrat BASE_STANDARD par défaut...")
        
        print("Création du contrat BASE_STANDARD...")
        
        # Créer le contrat
        contract = Contract(
            name="BASE_STANDARD",
            description="Contrat standard avec barèmes par défaut (équivalent V1)",
            is_default=True,
            is_active=True
        )
        session.add(contract)
        session.commit()
        session.refresh(contract)
        
        # Créer les règles pour les plateformes globales
        for key in GLOBAL_PLATFORMS:
            # Trouver le label dans FIELD_DEFINITIONS
            label = key
            for k, l, _ in FIELD_DEFINITIONS:
                if k == key:
                    label = l
                    break
            
            rule = ContractRule(
                contract_id=contract.id,
                key=key,
                scope=RuleScope.GLOBAL,
                label=label,
                tiers_rfa=json.dumps(GLOBAL_TIERS_RFA),
                tiers_bonus=json.dumps(GLOBAL_TIERS_BONUS)
            )
            session.add(rule)
        
        # Créer les règles pour les tri-partites
        for key in get_tri_fields():
            # Trouver le label
            label = key
            for k, l, _ in FIELD_DEFINITIONS:
                if k == key:
                    label = l
                    break
            
            # Récupérer les tiers depuis TRI_RULES
            tiers = TRI_RULES.get(key, [])
            
            rule = ContractRule(
                contract_id=contract.id,
                key=key,
                scope=RuleScope.TRI,
                label=label,
                tiers=json.dumps(tiers) if tiers else None
            )
            session.add(rule)
        
        session.commit()
        print(f"Contrat BASE_STANDARD créé avec {len(GLOBAL_PLATFORMS)} règles globales et {len(get_tri_fields())} règles tri-partites")

