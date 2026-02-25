"""
Résolution du contrat applicable pour une entité.
"""
from sqlmodel import Session, select
from typing import Optional, List
from app.database import engine
from app.models import Contract, ContractAssignment, TargetType, ContractScope


def normalize_value(value: str) -> str:
    """Normalise une valeur pour la comparaison (trim, uppercase)."""
    if not value:
        return ""
    return value.strip().upper()


def resolve_contract(
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None
) -> Contract:
    """
    Résout le contrat applicable selon la priorité :
    1) Assignment Code Union (priorité 100)
    2) Assignment Groupe Client (priorité 50)
    3) Contrat par défaut
    
    Args:
        code_union: Code Union du client (si mode=client)
        groupe_client: Groupe Client (si mode=group ou depuis client)
    
    Returns:
        Contract applicable
    """
    with Session(engine) as session:
        # Résolution uniquement parmi les contrats ADHERENT (pas les contrats Union/DAF)
        # 1) Chercher assignment Code Union (priorité la plus haute = 100)
        if code_union:
            code_union_norm = normalize_value(code_union)
            statement = select(ContractAssignment).where(
                ContractAssignment.target_type == TargetType.CODE_UNION
            )
            all_code_assignments = session.exec(statement).all()
            for assignment in all_code_assignments:
                assignment_value_norm = normalize_value(assignment.target_value)
                if assignment_value_norm == code_union_norm:
                    contract = session.get(Contract, assignment.contract_id)
                    if contract and contract.is_active and contract.scope == ContractScope.ADHERENT:
                        print(f"[RESOLVE] OK - Contrat trouve via Code Union '{code_union}' (normalise: '{code_union_norm}'): {contract.name}")
                        return contract
                    elif contract and contract.scope != ContractScope.ADHERENT:
                        print(f"[RESOLVE] IGNORE - Contrat affecte a '{code_union}' est scope UNION (DAF), on ne l'applique pas aux adhérents")
                    elif contract:
                        print(f"[RESOLVE] WARN - Contrat trouve via Code Union '{code_union}' mais INACTIF: {contract.name}")
        
        # 2) Chercher assignment Groupe Client (priorité moyenne = 50)
        if groupe_client:
            groupe_norm = normalize_value(groupe_client)
            statement = select(ContractAssignment).where(
                ContractAssignment.target_type == TargetType.GROUPE_CLIENT
            )
            all_groupe_assignments = session.exec(statement).all()
            for assignment in all_groupe_assignments:
                assignment_value_norm = normalize_value(assignment.target_value)
                if assignment_value_norm == groupe_norm:
                    contract = session.get(Contract, assignment.contract_id)
                    if contract and contract.is_active and contract.scope == ContractScope.ADHERENT:
                        print(f"[RESOLVE] OK - Contrat trouve via Groupe Client '{groupe_client}' (normalise: '{groupe_norm}'): {contract.name}")
                        return contract
                    elif contract and contract.scope != ContractScope.ADHERENT:
                        print(f"[RESOLVE] IGNORE - Contrat affecte a '{groupe_client}' est scope UNION (DAF), on ne l'applique pas aux adhérents")
                    elif contract:
                        print(f"[RESOLVE] WARN - Contrat trouve via Groupe Client '{groupe_client}' mais INACTIF: {contract.name}")
        
        # 3) Contrat par défaut (adhérent uniquement)
        statement = select(Contract).where(
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_default == True,
            Contract.is_active == True
        )
        default_contract = session.exec(statement).first()
        if default_contract:
            print(f"[RESOLVE] Utilisation du contrat par defaut (adherent): {default_contract.name}")
            return default_contract
        
        # Fallback : premier contrat actif adhérent (exclure les contrats dont le nom indique Union/DAF au cas où ils seraient mal tagués)
        statement = select(Contract).where(
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_active == True
        ).order_by(Contract.name)
        all_adherent = session.exec(statement).all()
        fallback = None
        for c in all_adherent:
            name_lower = (c.name or "").lower()
            if "union" in name_lower or "groupement" in name_lower:
                print(f"[RESOLVE] IGNORE fallback adherent: '{c.name}' (nom evoque Union/DAF)")
                continue
            fallback = c
            break
        if fallback:
            print(f"[RESOLVE] Fallback vers premier contrat actif (adherent): {fallback.name}")
            return fallback
        
        raise ValueError("Aucun contrat adhérent disponible")


def get_contract_by_id(contract_id: int) -> Optional[Contract]:
    """Récupère un contrat par son ID."""
    with Session(engine) as session:
        return session.get(Contract, contract_id)


def get_default_union_contract() -> Optional[Contract]:
    """
    Récupère le contrat Union par défaut (scope="union").
    Si aucun contrat par défaut, retourne le premier contrat Union actif.
    """
    from app.models import ContractScope
    with Session(engine) as session:
        # 1) Chercher le contrat par défaut
        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_default == True,
            Contract.is_active == True
        )
        default_contract = session.exec(statement).first()
        
        if default_contract:
            print(f"[RESOLVE UNION] Contrat par defaut trouve: {default_contract.name}")
            return default_contract
        
        # 2) Fallback : premier contrat Union actif
        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_active == True
        ).order_by(Contract.name)
        fallback = session.exec(statement).first()
        
        if fallback:
            print(f"[RESOLVE UNION] Fallback vers premier contrat Union actif: {fallback.name}")
            return fallback
        
        print("[RESOLVE UNION] AUCUN contrat Union trouve !")
        return None


def get_all_union_contracts() -> List[Contract]:
    """
    Récupère les contrats Union actifs (scope=UNION) dont le nom indique un usage DAF/Groupement.
    On ne garde que les contrats dont le nom contient "union" ou "groupement" (insensible à la casse),
    pour éviter d'utiliser par erreur un contrat adhérent (ex. "Alliance") mal tagué en scope UNION.
    """
    from app.models import ContractScope
    with Session(engine) as session:
        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_active == True
        ).order_by(Contract.name)
        all_union = session.exec(statement).all()
        name_lower = lambda n: (n or "").lower()
        contracts = [
            c for c in all_union
            if "union" in name_lower(c.name) 
            or "groupement" in name_lower(c.name)
            or "purflux" in name_lower(c.name)
        ]
        if len(contracts) < len(all_union):
            excluded = [c.name for c in all_union if c not in contracts]
            print(f"[RESOLVE UNION] Contrats scope=UNION exclus (nom sans 'Union'/'Groupement'): {excluded}")
        print(f"[RESOLVE UNION] {len(contracts)} contrat(s) Union actif(s) pour DAF")
        for contract in contracts:
            print(f"  - {contract.name} (ID: {contract.id})")
        return list(contracts)

