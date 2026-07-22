"""
Seed initial de la base de données avec le contrat BASE_STANDARD.
"""
import json
import os
from sqlmodel import Session, select
from app.database import engine
from app.models import Contract, ContractRule, ContractAssignment, RuleScope, ContractScope
from app.core.global_tiers import GLOBAL_TIERS_RFA, GLOBAL_TIERS_BONUS, GLOBAL_PLATFORMS
from app.core.tri_rules import TRI_RULES
from app.core.fields import FIELD_DEFINITIONS, get_tri_fields
from app.services.contract_json_importer import import_contracts_from_file
from app.services.contract_resolver import ADHERENT_2026_NAME, is_adherent_2026_contract


def seed_base_standard():
    """Crée le contrat BASE_STANDARD si aucun contrat n'existe."""
    with Session(engine) as session:
        statement = select(Contract)
        existing = session.exec(statement).first()

        if existing:
            print("Base de données déjà initialisée, skip seed")
            return

        contracts_json_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "contracts", "contracts.json"
        )
        if os.path.exists(contracts_json_path):
            print(f"Importation des contrats depuis {contracts_json_path}...")
            try:
                result = import_contracts_from_file(contracts_json_path, mode="merge")
                print(f"Import JSON: {result['imported']} importés, {result['updated']} mis à jour")
                if result["errors"]:
                    print(f"Erreurs: {result['errors']}")
                existing = session.exec(statement).first()
                if existing:
                    print("Contrats importés depuis JSON, skip création BASE_STANDARD")
                    return
            except Exception as e:
                print(f"Erreur lors de l'import JSON: {e}")
                print("Création du contrat BASE_STANDARD par défaut...")

        print("Création du contrat BASE_STANDARD...")

        contract = Contract(
            name="BASE_STANDARD",
            description="Contrat standard avec barèmes par défaut (équivalent V1) — RFA 2025",
            is_default=True,
            is_active=True,
        )
        session.add(contract)
        session.commit()
        session.refresh(contract)

        for key in GLOBAL_PLATFORMS:
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
                tiers_bonus=json.dumps(GLOBAL_TIERS_BONUS),
            )
            session.add(rule)

        for key in get_tri_fields():
            label = key
            for k, l, _ in FIELD_DEFINITIONS:
                if k == key:
                    label = l
                    break

            tiers = TRI_RULES.get(key, [])

            rule = ContractRule(
                contract_id=contract.id,
                key=key,
                scope=RuleScope.TRI,
                label=label,
                tiers=json.dumps(tiers) if tiers else None,
            )
            session.add(rule)

        session.commit()
        print(
            f"Contrat BASE_STANDARD créé avec {len(GLOBAL_PLATFORMS)} règles globales "
            f"et {len(get_tri_fields())} règles tri-partites"
        )


def ensure_adherent_2026_contract():
    """
    Importe / met à jour le contrat Adhérents 2026 pour la RFA 2026 UNIQUEMENT.

    Ne le pose PAS en is_default global (sinon la vue RFA 2025 est contaminée).
    Ne migre PAS les assignations BASE/Privilege en base : la bascule 2026
    se fait dans resolve_contract(year=2026).
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
            select(Contract).where(Contract.name == ADHERENT_2026_NAME)
        ).first()
        if not new_contract:
            print("[SEED] Contrat 'Adhérents 2026' absent après import")
            return

        # Jamais défaut global — réserve à resolve_contract(year>=2026)
        if new_contract.is_default:
            new_contract.is_default = False
            session.add(new_contract)
            print("[SEED] Adhérents 2026 retiré du is_default global (protection RFA 2025)")

        # S'assurer qu'un défaut 2025 existe (BASE_STANDARD de préférence)
        legacy_default = session.exec(
            select(Contract).where(
                Contract.scope == ContractScope.ADHERENT,
                Contract.is_default == True,
                Contract.is_active == True,
            )
        ).first()
        if not legacy_default or is_adherent_2026_contract(legacy_default):
            base = session.exec(
                select(Contract).where(
                    Contract.name == "BASE_STANDARD",
                    Contract.scope == ContractScope.ADHERENT,
                )
            ).first()
            if base:
                # Retirer tout autre défaut adhérent
                others = session.exec(
                    select(Contract).where(
                        Contract.is_default == True,
                        Contract.scope == ContractScope.ADHERENT,
                    )
                ).all()
                for c in others:
                    c.is_default = False
                    session.add(c)
                base.is_default = True
                base.is_active = True
                session.add(base)
                print("[SEED] BASE_STANDARD rétabli comme contrat par défaut (RFA 2025)")
            else:
                print("[SEED] WARN: aucun BASE_STANDARD pour servir de défaut 2025")

        # Si des assignations pointent encore vers Adhérents 2026 (migration précédente),
        # les ramener vers BASE_STANDARD pour que la vue 2025 lise le bon contrat en DB.
        # La bascule 2026 reste gérée par resolve_contract(year=2026).
        base = session.exec(
            select(Contract).where(Contract.name == "BASE_STANDARD")
        ).first()
        reverted = 0
        if base and new_contract.id != base.id:
            assignments = session.exec(
                select(ContractAssignment).where(
                    ContractAssignment.contract_id == new_contract.id
                )
            ).all()
            for a in assignments:
                a.contract_id = base.id
                session.add(a)
                reverted += 1

        session.commit()
        print(
            f"[SEED] Adhérents 2026 prêt pour year>=2026 "
            f"({reverted} assignation(s) 2026→BASE_STANDARD pour protéger la vue 2025)"
        )
