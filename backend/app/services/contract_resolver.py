"""
Résolution du contrat applicable pour une entité.

IMPORTANT — séparation des années :
- year < 2026 (ou None) : règles / contrats historiques (RFA 2025).
  Le contrat « Adhérents 2026 » et les contrats « … 2026 » only ne doivent JAMAIS s'appliquer.
- year >= 2026 : contrat Adhérents 2026 pour la base / Privilege ;
  les contrats spéciaux (Warning, APC, groupes…) restent ;
  APA / Discount basculent vers leur version 2026 (assignments restent sur le contrat 2025).
"""
from sqlmodel import Session, select
from typing import Optional, List
from app.database import engine
from app.models import Contract, ContractAssignment, TargetType, ContractScope


ADHERENT_2026_NAME = "Adhérents 2026"

# Contrats « de base » 2025 remplacés par Adhérents 2026 en 2026 uniquement
LEGACY_BASE_CONTRACT_NAMES = {
    "BASE_STANDARD",
    "Privilege 2",
    "Privilege",
    "PRIVILEGE 2",
    "PRIVILEGE",
    "Contrat Privilege 2",
    "Contrat Privilege",
}

# Contrats spéciaux dont le barème 2026 diffère du 2025.
# Les assignments restent pointés sur le contrat 2025 (espace RFA 2025 intact) ;
# en year>=2026 on bascule vers le contrat 2026 homonyme.
SPECIAL_CONTRACT_YEAR_UPGRADES = {
    "APA Marseille – Avenant Union Nord + Franchise": "APA Marseille 2026",
    "Groupe Discount": "Groupe Discount 2026",
}

# Contrats uniquement 2026 (pas d'équivalent 2025) — exclus de la vue RFA 2025
YEAR_2026_ONLY_CONTRACT_NAMES = {
    "APA Marseille 2026",
    "Groupe Discount 2026",
    "Otto'Parts / Codifa 2026",
}


def normalize_value(value: str) -> str:
    """Normalise une valeur pour la comparaison (trim, uppercase)."""
    if not value:
        return ""
    return value.strip().upper()


def _name_upper(contract: Optional[Contract]) -> str:
    return ((contract.name if contract else "") or "").strip().upper()


def is_adherent_2026_contract(contract: Optional[Contract]) -> bool:
    if not contract:
        return False
    if _name_upper(contract) == ADHERENT_2026_NAME.upper():
        return True
    # Filet de sécurité : tout contrat avec level_baremes est un contrat 2026
    raw = getattr(contract, "level_baremes", None)
    return bool(raw and str(raw).strip() not in ("", "null", "[]"))


def is_legacy_base_contract(contract: Optional[Contract]) -> bool:
    if not contract:
        return False
    return _name_upper(contract) in {n.upper() for n in LEGACY_BASE_CONTRACT_NAMES}


def is_year_2026_only_contract(contract: Optional[Contract]) -> bool:
    if not contract:
        return False
    return _name_upper(contract) in {n.upper() for n in YEAR_2026_ONLY_CONTRACT_NAMES}


def _upgrade_target_for_2026(contract: Optional[Contract]) -> Optional[str]:
    """Nom du contrat 2026 si un upgrade spécial est défini, sinon None."""
    if not contract:
        return None
    name = (contract.name or "").strip()
    if name in SPECIAL_CONTRACT_YEAR_UPGRADES:
        return SPECIAL_CONTRACT_YEAR_UPGRADES[name]
    # Comparaison case-insensitive
    upper = name.upper()
    for legacy, target in SPECIAL_CONTRACT_YEAR_UPGRADES.items():
        if legacy.upper() == upper:
            return target
    return None


def _find_by_name(session: Session, name: str) -> Optional[Contract]:
    return session.exec(
        select(Contract).where(
            Contract.name == name,
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_active == True,
        )
    ).first()


def _find_legacy_default(session: Session) -> Optional[Contract]:
    """Défaut 2025 : BASE_STANDARD, sinon is_default hors Adhérents 2026, sinon premier legacy."""
    base = _find_by_name(session, "BASE_STANDARD")
    if base:
        return base

    defaults = session.exec(
        select(Contract).where(
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_default == True,
            Contract.is_active == True,
        )
    ).all()
    for c in defaults:
        if not is_adherent_2026_contract(c):
            return c

    for name in ("Privilege 2", "Privilege"):
        c = _find_by_name(session, name)
        if c:
            return c

    all_adherent = session.exec(
        select(Contract).where(
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_active == True,
        ).order_by(Contract.name)
    ).all()
    for c in all_adherent:
        if is_adherent_2026_contract(c):
            continue
        name_lower = (c.name or "").lower()
        if "union" in name_lower or "groupement" in name_lower:
            continue
        return c
    return None


def _find_adherent_2026(session: Session) -> Optional[Contract]:
    c = _find_by_name(session, ADHERENT_2026_NAME)
    if c:
        return c
    # Fallback : premier contrat avec level_baremes
    all_adherent = session.exec(
        select(Contract).where(
            Contract.scope == ContractScope.ADHERENT,
            Contract.is_active == True,
        )
    ).all()
    for c in all_adherent:
        if is_adherent_2026_contract(c):
            return c
    return None


def apply_year_contract_policy(
    contract: Optional[Contract],
    year: Optional[int],
    session: Session,
) -> Optional[Contract]:
    """
    Applique la politique d'année sur un contrat déjà résolu (assignment ou défaut brut).
    """
    # ── RFA 2025 / historique ──
    if year is None or year < 2026:
        if is_adherent_2026_contract(contract) or is_year_2026_only_contract(contract):
            legacy = _find_legacy_default(session)
            print(
                f"[RESOLVE] year={year}: contrat 2026 '{getattr(contract, 'name', None)}' "
                f"remplacé par legacy '{getattr(legacy, 'name', None)}' (vue RFA 2025 protégée)"
            )
            return legacy
        return contract

    # ── RFA 2026+ ──
    adherent_2026 = _find_adherent_2026(session)
    if contract is None:
        print(f"[RESOLVE] year={year}: pas d'assignment -> {ADHERENT_2026_NAME}")
        return adherent_2026
    if is_adherent_2026_contract(contract):
        return contract
    if is_legacy_base_contract(contract):
        print(
            f"[RESOLVE] year={year}: base/privilege '{contract.name}' -> {ADHERENT_2026_NAME}"
        )
        return adherent_2026 or contract

    # Upgrade spécial 2025 → 2026 (APA, Discount…) sans toucher au contrat 2025 en base
    upgrade_name = _upgrade_target_for_2026(contract)
    if upgrade_name:
        upgraded = _find_by_name(session, upgrade_name)
        if upgraded:
            print(
                f"[RESOLVE] year={year}: upgrade '{contract.name}' -> '{upgraded.name}'"
            )
            return upgraded
        print(
            f"[RESOLVE] year={year}: upgrade '{contract.name}' prévu vers '{upgrade_name}' "
            f"mais contrat introuvable — conservation du 2025"
        )

    # Autres contrats spéciaux (Warning, APC, groupes…) inchangés
    print(f"[RESOLVE] year={year}: contrat spécial conservé '{contract.name}'")
    return contract


def _resolve_raw_assignment(
    session: Session,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
) -> Optional[Contract]:
    """Résolution assignment / défaut SANS politique d'année."""
    if code_union:
        code_union_norm = normalize_value(code_union)
        statement = select(ContractAssignment).where(
            ContractAssignment.target_type == TargetType.CODE_UNION
        )
        all_code_assignments = session.exec(statement).all()
        for assignment in all_code_assignments:
            if normalize_value(assignment.target_value) == code_union_norm:
                contract = session.get(Contract, assignment.contract_id)
                if contract and contract.is_active and contract.scope == ContractScope.ADHERENT:
                    print(
                        f"[RESOLVE] OK - Contrat trouve via Code Union '{code_union}' "
                        f"(normalise: '{code_union_norm}'): {contract.name}"
                    )
                    return contract
                elif contract and contract.scope != ContractScope.ADHERENT:
                    print(
                        f"[RESOLVE] IGNORE - Contrat affecte a '{code_union}' est scope UNION (DAF)"
                    )
                elif contract:
                    print(
                        f"[RESOLVE] WARN - Contrat trouve via Code Union '{code_union}' "
                        f"mais INACTIF: {contract.name}"
                    )

    if groupe_client:
        groupe_norm = normalize_value(groupe_client)
        statement = select(ContractAssignment).where(
            ContractAssignment.target_type == TargetType.GROUPE_CLIENT
        )
        all_groupe_assignments = session.exec(statement).all()
        for assignment in all_groupe_assignments:
            if normalize_value(assignment.target_value) == groupe_norm:
                contract = session.get(Contract, assignment.contract_id)
                if contract and contract.is_active and contract.scope == ContractScope.ADHERENT:
                    print(
                        f"[RESOLVE] OK - Contrat trouve via Groupe Client '{groupe_client}' "
                        f"(normalise: '{groupe_norm}'): {contract.name}"
                    )
                    return contract
                elif contract and contract.scope != ContractScope.ADHERENT:
                    print(
                        f"[RESOLVE] IGNORE - Contrat affecte a '{groupe_client}' est scope UNION (DAF)"
                    )
                elif contract:
                    print(
                        f"[RESOLVE] WARN - Contrat trouve via Groupe Client '{groupe_client}' "
                        f"mais INACTIF: {contract.name}"
                    )

    # Défaut adhérent : préférer un défaut NON-2026 pour ne pas polluer le fallback 2025
    statement = select(Contract).where(
        Contract.scope == ContractScope.ADHERENT,
        Contract.is_default == True,
        Contract.is_active == True,
    )
    defaults = session.exec(statement).all()
    for default_contract in defaults:
        if not is_adherent_2026_contract(default_contract):
            print(f"[RESOLVE] Utilisation du contrat par defaut (adherent): {default_contract.name}")
            return default_contract
    if defaults:
        # Uniquement Adhérents 2026 en défaut → basculer sur legacy pour le brut
        legacy = _find_legacy_default(session)
        if legacy:
            print(
                f"[RESOLVE] Defaut DB est 2026 — fallback legacy brut '{legacy.name}'"
            )
            return legacy
        print(f"[RESOLVE] Utilisation du contrat par defaut (adherent): {defaults[0].name}")
        return defaults[0]

    legacy = _find_legacy_default(session)
    if legacy:
        print(f"[RESOLVE] Fallback legacy: {legacy.name}")
        return legacy

    raise ValueError("Aucun contrat adhérent disponible")


def resolve_contract(
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    year: Optional[int] = None,
) -> Contract:
    """
    Résout le contrat applicable selon la priorité :
    1) Assignment Code Union
    2) Assignment Groupe Client
    3) Contrat par défaut
    puis applique la politique d'année (2025 vs 2026).

    Args:
        year: Année RFA. None ou < 2026 = vue historique 2025.
              >= 2026 = contrat Adhérents 2026 pour la base.
    """
    with Session(engine) as session:
        raw = _resolve_raw_assignment(session, code_union, groupe_client)
        resolved = apply_year_contract_policy(raw, year, session)
        if not resolved:
            raise ValueError("Aucun contrat adhérent disponible")
        print(
            f"[RESOLVE] FINAL year={year}: {resolved.name} "
            f"(brut={getattr(raw, 'name', None)})"
        )
        return resolved


class BatchContractResolver:
    """
    Résout les contrats pour de nombreuses entités en une seule série de requêtes.
    Respecte la même politique d'année que resolve_contract.
    """
    def __init__(self):
        with Session(engine) as session:
            all_assignments = session.exec(select(ContractAssignment)).all()
            all_contracts = session.exec(select(Contract).where(Contract.is_active == True)).all()
            self._by_code_union: dict = {}
            self._by_groupe: dict = {}
            self._default_legacy: Optional[Contract] = None
            self._adherent_2026: Optional[Contract] = None
            self._by_name: dict = {}
            contracts_map = {c.id: c for c in all_contracts}
            for c in all_contracts:
                if c.scope == ContractScope.ADHERENT and c.name:
                    self._by_name[(c.name or "").strip().upper()] = c
            for a in all_assignments:
                c = contracts_map.get(a.contract_id)
                if not c or not c.is_active or c.scope != ContractScope.ADHERENT:
                    continue
                val = normalize_value(a.target_value)
                if a.target_type == TargetType.CODE_UNION and val not in self._by_code_union:
                    self._by_code_union[val] = c
                elif a.target_type == TargetType.GROUPE_CLIENT and val not in self._by_groupe:
                    self._by_groupe[val] = c

            for c in all_contracts:
                if c.scope != ContractScope.ADHERENT:
                    continue
                if is_adherent_2026_contract(c) and not self._adherent_2026:
                    self._adherent_2026 = c
                if c.is_default and not is_adherent_2026_contract(c) and not self._default_legacy:
                    self._default_legacy = c
            if not self._default_legacy:
                for c in all_contracts:
                    if c.scope == ContractScope.ADHERENT and is_legacy_base_contract(c):
                        self._default_legacy = c
                        break
            if not self._default_legacy:
                for c in all_contracts:
                    if c.scope == ContractScope.ADHERENT and not is_adherent_2026_contract(c):
                        self._default_legacy = c
                        break

    def _apply_year(self, contract: Optional[Contract], year: Optional[int]) -> Optional[Contract]:
        if year is None or year < 2026:
            if is_adherent_2026_contract(contract) or is_year_2026_only_contract(contract):
                return self._default_legacy
            return contract or self._default_legacy
        # 2026+
        if contract is None or is_legacy_base_contract(contract):
            return self._adherent_2026 or contract or self._default_legacy
        if is_adherent_2026_contract(contract):
            return contract
        upgrade_name = _upgrade_target_for_2026(contract)
        if upgrade_name:
            upgraded = self._by_name.get(upgrade_name.strip().upper())
            if upgraded:
                return upgraded
        return contract

    def resolve(
        self,
        code_union: Optional[str] = None,
        groupe_client: Optional[str] = None,
        year: Optional[int] = None,
    ) -> Optional[Contract]:
        raw = None
        if code_union:
            raw = self._by_code_union.get(normalize_value(code_union))
        if raw is None and groupe_client:
            raw = self._by_groupe.get(normalize_value(groupe_client))
        if raw is None:
            raw = self._default_legacy
        return self._apply_year(raw, year)


def get_contract_by_id(contract_id: int) -> Optional[Contract]:
    """Récupère un contrat par ID."""
    with Session(engine) as session:
        return session.get(Contract, contract_id)


def get_default_union_contract() -> Optional[Contract]:
    """
    Récupère le contrat Union par défaut (scope="union").
    Si aucun contrat par défaut, retourne le premier contrat Union actif.
    """
    with Session(engine) as session:
        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_default == True,
            Contract.is_active == True,
        )
        default_contract = session.exec(statement).first()

        if default_contract:
            print(f"[RESOLVE UNION] Contrat par defaut trouve: {default_contract.name}")
            return default_contract

        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_active == True,
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
    """
    with Session(engine) as session:
        statement = select(Contract).where(
            Contract.scope == ContractScope.UNION,
            Contract.is_active == True,
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
