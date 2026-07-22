"""
Seed initial de la base de données avec le contrat BASE_STANDARD.
"""
import json
import os
from sqlmodel import Session, select
from app.database import engine
from app.models import Contract, ContractRule, ContractAssignment, RuleScope
from app.core.global_tiers import GLOBAL_TIERS_RFA, GLOBAL_TIERS_BONUS, GLOBAL_PLATFORMS
from app.core.tri_rules import TRI_RULES
from app.core.fields import FIELD_DEFINITIONS, get_global_fields, get_tri_fields
from app.services.contract_json_importer import import_contracts_from_file


# Contrats remplacés par Adhérents 2026 (assignations migrées au démarrage)
LEGACY_BASE_CONTRACT_NAMES = {
    "BASE_STANDARD",
    "Privilege 2",
    "Privilege",
    "PRIVILEGE 2",
    "PRIVILEGE",
    "Contrat Privilege 2",
    "Contrat Privilege",
}


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


def ensure_adherent_2026_contract():
    """
    Importe / met à jour le contrat Adhérents 2026, le pose en défaut,
    et bascule les assignations des anciens contrats de base / Privilege.
    Les contrats spéciaux (Warning, APC, groupes, etc.) ne sont pas touchés.
    """
    contracts_dir = os.path.join(os.path.dirname(__file__), "..", "..", "contracts")
    adherent_path = os.path.join(contracts_dir, "contrat_adherent_2026.json")
    if not os.path.exists(adherent_path):
        print(f"[SEED] Contrat Adhérents 2026 introuvable: {adherent_path}")
        return

    try:
        result = import_contracts_from_file(adherent_path, mode="merge")
        print(
            f"[SEED] Adhérents 2026: {result['imported']} importé(s), "
            f"{result['updated']} mis à jour"
        )
        if result.get("errors"):
            print(f"[SEED] Erreurs Adhérents 2026: {result['errors']}")
    except Exception as e:
        print(f"[SEED] Erreur import Adhérents 2026: {e}")
        return

    with Session(engine) as session:
        new_contract = session.exec(
            select(Contract).where(Contract.name == "Adhérents 2026")
        ).first()
        if not new_contract:
            print("[SEED] Contrat 'Adhérents 2026' absent après import")
            return

        # Défaut unique adhérent
        from app.models import ContractScope
        others = session.exec(
            select(Contract).where(
                Contract.is_default == True,
                Contract.scope == ContractScope.ADHERENT,
                Contract.id != new_contract.id,
            )
        ).all()
        for c in others:
            c.is_default = False
            session.add(c)
        new_contract.is_default = True
        new_contract.is_active = True
        session.add(new_contract)

        # Migrer assignations BASE_STANDARD / Privilege → Adhérents 2026
        legacy = session.exec(select(Contract)).all()
        legacy_name_set = {n.upper() for n in LEGACY_BASE_CONTRACT_NAMES}
        legacy_ids = {
            c.id
            for c in legacy
            if (c.name or "").strip().upper() in legacy_name_set
        }
        legacy_ids.discard(new_contract.id)

        migrated = 0
        if legacy_ids:
            assignments = session.exec(select(ContractAssignment)).all()
            for a in assignments:
                if a.contract_id in legacy_ids:
                    a.contract_id = new_contract.id
                    session.add(a)
                    migrated += 1

            for c in legacy:
                if c.id in legacy_ids:
                    c.is_default = False
                    session.add(c)

        session.commit()
        print(
            f"[SEED] Adhérents 2026 est le contrat par défaut "
            f"({migrated} assignation(s) migrée(s) depuis base/privilege)"
        )
