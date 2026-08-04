"""
Importe les contrats 2026 Codifa / Discount / APA + assignment CODIFA.

IMPORTANT : ne touche PAS aux contrats 2025 existants
(« APA Marseille – Avenant… », « Groupe Discount »).
Les assignments APA/Discount restent sur les contrats 2025 ;
le résolveur bascule vers les versions 2026 uniquement si year >= 2026.
"""
from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, select

load_dotenv(Path(__file__).resolve().parent / ".env")

from app.database import engine, init_db
from app.models import Contract, ContractAssignment, TargetType
from app.services.contract_json_importer import import_contracts_from_json

ROOT = Path(__file__).resolve().parent
CONTRACT_FILES = [
    ROOT / "contracts" / "contrat_codifa_2026.json",
    ROOT / "contracts" / "contrat_groupe_discount_2026.json",
    ROOT / "contracts" / "contrat_apa_marseille_2026.json",
]

PROTECTED_2025_NAMES = {
    "APA Marseille – Avenant Union Nord + Franchise",
    "Groupe Discount",
}


def _snapshot_protected(session: Session) -> dict:
    out = {}
    for name in PROTECTED_2025_NAMES:
        c = session.exec(select(Contract).where(Contract.name == name)).first()
        if not c:
            out[name] = None
            continue
        from app.models import ContractRule

        rules = session.exec(
            select(ContractRule).where(ContractRule.contract_id == c.id)
        ).all()
        out[name] = {
            "id": c.id,
            "use_combined_global_rate": c.use_combined_global_rate,
            "rules": {
                r.key: {
                    "tiers_rfa": r.tiers_rfa,
                    "tiers_bonus": r.tiers_bonus,
                    "tiers": r.tiers,
                }
                for r in rules
            },
        }
    return out


def _ensure_codifa_assignment(session: Session) -> None:
    contract = session.exec(
        select(Contract).where(Contract.name == "Otto'Parts / Codifa 2026")
    ).first()
    if not contract:
        print("[WARN] Contrat Otto'Parts / Codifa 2026 introuvable — pas d'assignment")
        return

    existing = session.exec(
        select(ContractAssignment).where(
            ContractAssignment.target_type == TargetType.GROUPE_CLIENT,
            ContractAssignment.target_value == "CODIFA",
        )
    ).first()
    # Case-insensitive scan
    if not existing:
        all_g = session.exec(
            select(ContractAssignment).where(
                ContractAssignment.target_type == TargetType.GROUPE_CLIENT
            )
        ).all()
        for a in all_g:
            if (a.target_value or "").strip().upper() == "CODIFA":
                existing = a
                break

    if existing:
        if existing.contract_id != contract.id:
            print(
                f"[ASSIGN] CODIFA: {existing.contract_id} -> {contract.id} "
                f"({contract.name})"
            )
            existing.contract_id = contract.id
            existing.priority = 50
            session.add(existing)
        else:
            print("[ASSIGN] CODIFA déjà sur Otto'Parts / Codifa 2026")
    else:
        session.add(
            ContractAssignment(
                contract_id=contract.id,
                target_type=TargetType.GROUPE_CLIENT,
                target_value="CODIFA",
                priority=50,
            )
        )
        print("[ASSIGN] CODIFA créé -> Otto'Parts / Codifa 2026")
    session.commit()


def main() -> None:
    init_db()
    with Session(engine) as session:
        before = _snapshot_protected(session)

    for path in CONTRACT_FILES:
        data = json.loads(path.read_text(encoding="utf-8"))
        # Guard: never import under protected 2025 names
        for c in data.get("contracts", []):
            if c.get("name") in PROTECTED_2025_NAMES:
                raise SystemExit(f"REFUS: tentative d'écraser le contrat 2025 '{c.get('name')}'")
        result = import_contracts_from_json(data, mode="merge")
        print(f"[IMPORT] {path.name}: {result}")

    with Session(engine) as session:
        after = _snapshot_protected(session)
        for name in PROTECTED_2025_NAMES:
            if before.get(name) != after.get(name):
                raise SystemExit(
                    f"ERREUR: le contrat 2025 '{name}' a été modifié — rollback manuel requis"
                )
            print(f"[OK] Contrat 2025 intact: {name} (id={after[name]['id'] if after[name] else None})")

        # Vérifie que les 3 contrats 2026 existent
        for name in (
            "Otto'Parts / Codifa 2026",
            "Groupe Discount 2026",
            "APA Marseille 2026",
        ):
            c = session.exec(select(Contract).where(Contract.name == name)).first()
            print(f"[OK] Contrat 2026 présent: {name} (id={c.id if c else None})")

        _ensure_codifa_assignment(session)

        # Assignments APA / Discount doivent toujours pointer vers 2025
        for target, expected_name in (
            ("GROUPE APA MARSEILLE", "APA Marseille – Avenant Union Nord + Franchise"),
            ("GROUPE DISCOUNT", "Groupe Discount"),
        ):
            a = None
            for row in session.exec(
                select(ContractAssignment).where(
                    ContractAssignment.target_type == TargetType.GROUPE_CLIENT
                )
            ).all():
                if (row.target_value or "").strip().upper() == target:
                    a = row
                    break
            if not a:
                print(f"[WARN] Assignment manquant: {target}")
                continue
            c = session.get(Contract, a.contract_id)
            ok = c and c.name == expected_name
            print(
                f"[{'OK' if ok else 'WARN'}] Assignment {target} -> "
                f"{getattr(c, 'name', None)} (attendu: {expected_name})"
            )


if __name__ == "__main__":
    main()
