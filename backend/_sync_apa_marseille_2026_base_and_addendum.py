"""
Met à jour UNIQUEMENT les barèmes globaux du contrat « APA Marseille 2026 ».

Le calcul RFA lit la table contractrule. Le fichier
contracts/contrat_apa_marseille_2026.json n'est pas relu à chaque requête.
Le contrat a été chargé une fois par _import_codifa_discount_apa_2026.py
(fusion par nom). Au démarrage, l'API ne resynchronise que « Adhérents 2026 ».

Ce script n'est pas exécuté par l'API. Sans --apply, il n'écrit rien.

Il ne modifie pas :
- « APA Marseille – Avenant Union Nord + Franchise » (contrat 2025, id 7 en production)
- les règles tripartites
- les autres contrats (Groupe Discount, Codifa, Adhérents, …)
- les affectations

Ne pas relancer _import_codifa_discount_apa_2026.py pour ce correctif :
cet import réécrit aussi Codifa, Groupe Discount 2026 et chaque clé
tripartite du catalogue.

Usage, depuis backend/ :

  python _sync_apa_marseille_2026_base_and_addendum.py
      dry-run. Affiche la cible et les écarts. Aucune écriture.

  python _sync_apa_marseille_2026_base_and_addendum.py --apply
      écrit dans la base désignée par DATABASE_URL
      (ou dans le SQLite local si la variable est absente).

  python _sync_apa_marseille_2026_base_and_addendum.py --emit-sql
      affiche le SQL équivalent, sans ouvrir la base.
      Le fichier proposé est migrations/proposed/20261126_apa_marseille_2026_base_and_addendum.sql.

En production, le contrat « APA Marseille 2026 » est l'id 37 (relevé du
26 novembre 2026). La sélection se fait par le nom, pas par l'id.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
JSON_PATH = ROOT / "contracts" / "contrat_apa_marseille_2026.json"
SQL_PATH = (
    ROOT
    / "migrations"
    / "proposed"
    / "20261126_apa_marseille_2026_base_and_addendum.sql"
)

TARGET_NAME = "APA Marseille 2026"
PROTECTED_2025_NAME = "APA Marseille – Avenant Union Nord + Franchise"
GLOBAL_KEYS: Tuple[str, ...] = (
    "GLOBAL_ACR",
    "GLOBAL_ALLIANCE",
    "GLOBAL_DCA",
    "GLOBAL_EXADIS",
)

# Même tableau de base que Groupe Discount 2026, avant le taux négocié.
BASE_RFA: List[dict] = [
    {"min": 20000, "rate": 0.01},
    {"min": 50000, "rate": 0.015},
    {"min": 75000, "rate": 0.02},
    {"min": 100000, "rate": 0.025},
    {"min": 150000, "rate": 0.03},
    {"min": 200000, "rate": 0.035},
]
BASE_BONUS: List[dict] = [
    {"min": 20000, "rate": 0.005},
    {"min": 50000, "rate": 0.01},
    {"min": 75000, "rate": 0.015},
    {"min": 100000, "rate": 0.02},
    {"min": 150000, "rate": 0.025},
    {"min": 200000, "rate": 0.03},
]

ADDENDUM = {
    "GLOBAL_ALLIANCE": (450000, 0.11),
    "GLOBAL_ACR": (450000, 0.11),
    "GLOBAL_EXADIS": (450000, 0.11),
    "GLOBAL_DCA": (150000, 0.105),
}


class SyncRefused(RuntimeError):
    """Refus avant toute écriture, ou annulation si un effet de bord est détecté."""


def load_contract_payload(path: Path = JSON_PATH) -> dict:
    """Charge et contrôle le JSON. Lève SyncRefused si le barème n'est pas celui attendu."""
    data = json.loads(path.read_text(encoding="utf-8"))
    contracts = data.get("contracts") or []
    if len(contracts) != 1:
        raise SyncRefused(
            f"{path.name} doit contenir exactement un contrat, pas {len(contracts)}"
        )
    contract = contracts[0]
    if contract.get("name") != TARGET_NAME:
        raise SyncRefused(f"Nom JSON inattendu : {contract.get('name')!r}")
    if contract.get("name") == PROTECTED_2025_NAME:
        raise SyncRefused("Le JSON vise le contrat 2025")
    if contract.get("useCombinedGlobalRate"):
        raise SyncRefused("APA Marseille 2026 ne doit pas utiliser le taux combiné")
    if not contract.get("triRules"):
        raise SyncRefused("Les règles tripartites ont disparu du JSON")
    notes = contract.get("notes") or ""
    if "$apa$" in notes or "$name$" in notes:
        raise SyncRefused("Les notes contiennent un délimiteur SQL réservé")

    rules = contract.get("globalRules") or {}
    missing = [key for key in GLOBAL_KEYS if key not in rules]
    if missing:
        raise SyncRefused(f"Règles globales manquantes : {', '.join(missing)}")

    for key, (threshold, rate) in ADDENDUM.items():
        _assert_addendum_shape(key, rules[key], threshold, rate)
    return contract


def _assert_addendum_shape(key: str, rule: dict, threshold: int, rate: float) -> None:
    rfa = rule.get("tiersRfa") or []
    bonus = rule.get("tiersBonus") or []
    base_rfa = [tier for tier in BASE_RFA if tier["min"] < threshold]
    base_bonus = [tier for tier in BASE_BONUS if tier["min"] < threshold]
    if rfa != base_rfa + [{"min": threshold, "rate": rate}]:
        raise SyncRefused(f"{key} : le barème RFA n'est pas base + avenant")
    if bonus != base_bonus + [{"min": threshold, "rate": 0.0}]:
        raise SyncRefused(f"{key} : le bonus ne revient pas à 0 au seuil de l'avenant")
    if any(tier["min"] >= threshold and tier["rate"] != 0.0 for tier in bonus):
        raise SyncRefused(f"{key} : un bonus se cumule avec l'avenant")
    if any(tier["min"] >= threshold and tier["rate"] != rate for tier in rfa):
        raise SyncRefused(f"{key} : un palier de base survit au-dessus de l'avenant")


def dumps_tiers(tiers: Sequence[dict]) -> str:
    return json.dumps(list(tiers), ensure_ascii=False)


def render_sql(contract: Optional[dict] = None) -> str:
    """SQL à coller dans l'éditeur Supabase. Aucune connexion."""
    contract = contract or load_contract_payload()
    notes = contract["notes"]
    updates = []
    checks = []
    for key in GLOBAL_KEYS:
        rule = contract["globalRules"][key]
        rfa = dumps_tiers(rule["tiersRfa"])
        bonus = dumps_tiers(rule["tiersBonus"])
        updates.append(
            f"""UPDATE contractrule AS r
SET tiers_rfa = $apa${rfa}$apa$,
    tiers_bonus = $apa${bonus}$apa$,
    updated_at = now()
FROM contract AS c
WHERE r.contract_id = c.id
  AND c.name = '{TARGET_NAME}'
  AND r.key = '{key}'
  AND r.scope = 'GLOBAL';"""
        )
        checks.append(
            f"""    SELECT count(*) INTO n
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = '{TARGET_NAME}'
      AND r.key = '{key}'
      AND r.scope = 'GLOBAL'
      AND r.tiers_rfa = $apa${rfa}$apa$
      AND r.tiers_bonus = $apa${bonus}$apa$;
    IF n <> 1 THEN
        RAISE EXCEPTION '{key} non mis à jour (lignes=%s)', n;
    END IF;"""
        )

    keys_sql = ", ".join(f"'{key}'" for key in GLOBAL_KEYS)
    check_sql = "\n".join(checks)
    update_sql = "\n\n".join(updates)
    return f"""-- APA Marseille 2026 : tableau de base sous le seuil, avenant au-dessus, sans cumul.
--
-- PAS ENCORE APPLIQUÉ. Ne pas lancer ce script tant qu'il n'a pas été relu.
-- Il ne met à jour que les 4 règles GLOBAL du contrat nommé
-- « {TARGET_NAME} » (id 37 en production au 26 novembre 2026).
-- La sélection se fait par le nom, pas par l'id.
--
-- Ne modifie pas :
--   « {PROTECTED_2025_NAME} » (contrat 2025, id 7)
--   les règles tripartites
--   les autres contrats et les affectations
--
-- Le moteur RFA lit contractrule. Déployer le code ne suffit pas :
-- sans cette mise à jour, la projection 2026 reste à 0 % sous le seuil.
--
-- À lancer UNE FOIS, à la main, sur le projet Supabase groupement-union-rfa :
--   Tableau de bord → SQL Editor → coller ce fichier → Run.
-- Le script Python équivalent, qui lit le JSON et refuse les effets de bord,
-- est backend/_sync_apa_marseille_2026_base_and_addendum.py (--apply).
--
-- En cas d'échec, la transaction est annulée.

BEGIN;

DO $$
DECLARE
    apa_count integer;
    legacy_count integer;
    global_count integer;
BEGIN
    SELECT count(*) INTO apa_count
    FROM contract
    WHERE name = '{TARGET_NAME}';
    IF apa_count <> 1 THEN
        RAISE EXCEPTION 'Contrat {TARGET_NAME} introuvable ou dupliqué (%s)', apa_count;
    END IF;

    SELECT count(*) INTO legacy_count
    FROM contract
    WHERE name = $name${PROTECTED_2025_NAME}$name$;
    IF legacy_count <> 1 THEN
        RAISE EXCEPTION 'Contrat APA 2025 inattendu (%s). Aucune écriture.', legacy_count;
    END IF;

    SELECT count(*) INTO global_count
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = '{TARGET_NAME}'
      AND r.scope = 'GLOBAL'
      AND r.key IN ({keys_sql});
    IF global_count <> 4 THEN
        RAISE EXCEPTION 'Règles globales APA 2026 inattendues (%s). Aucune écriture.', global_count;
    END IF;
END $$;

CREATE TEMP TABLE _apa_other_rules AS
SELECT r.id, r.tiers_rfa, r.tiers_bonus, r.tiers, r.bonus_groups
FROM contractrule AS r
JOIN contract AS c ON c.id = r.contract_id
WHERE NOT (
    c.name = '{TARGET_NAME}'
    AND r.scope = 'GLOBAL'
    AND r.key IN ({keys_sql})
);

CREATE TEMP TABLE _apa_other_contracts AS
SELECT id, name, description, use_combined_global_rate, is_active, scope
FROM contract
WHERE name <> '{TARGET_NAME}';

CREATE TEMP TABLE _apa_assignments AS
SELECT id, contract_id, target_type, target_value, priority
FROM contractassignment;

UPDATE contract
SET description = $apa${notes}$apa$,
    updated_at = now()
WHERE name = '{TARGET_NAME}';

{update_sql}

DO $$
DECLARE
    n integer;
    drifted integer;
BEGIN
{check_sql}

    SELECT count(*) INTO drifted
    FROM _apa_other_rules AS g
    JOIN contractrule AS r ON r.id = g.id
    WHERE r.tiers_rfa IS DISTINCT FROM g.tiers_rfa
       OR r.tiers_bonus IS DISTINCT FROM g.tiers_bonus
       OR r.tiers IS DISTINCT FROM g.tiers
       OR r.bonus_groups IS DISTINCT FROM g.bonus_groups;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Une règle hors barème global APA 2026 a changé (%s). Annulation.', drifted;
    END IF;

    SELECT count(*) INTO drifted
    FROM _apa_other_contracts AS g
    JOIN contract AS c ON c.id = g.id
    WHERE c.name IS DISTINCT FROM g.name
       OR c.description IS DISTINCT FROM g.description
       OR c.use_combined_global_rate IS DISTINCT FROM g.use_combined_global_rate
       OR c.is_active IS DISTINCT FROM g.is_active
       OR c.scope IS DISTINCT FROM g.scope;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Un autre contrat a changé (%s). Annulation.', drifted;
    END IF;

    SELECT count(*) INTO drifted
    FROM _apa_assignments AS g
    JOIN contractassignment AS a ON a.id = g.id
    WHERE a.contract_id IS DISTINCT FROM g.contract_id
       OR a.target_type IS DISTINCT FROM g.target_type
       OR a.target_value IS DISTINCT FROM g.target_value
       OR a.priority IS DISTINCT FROM g.priority;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Une affectation a changé (%s). Annulation.', drifted;
    END IF;
END $$;

COMMIT;
"""


def database_target_label() -> str:
    """Hôte de la base, sans identifiant ni mot de passe."""
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        return "sqlite locale (DATABASE_URL absent)"
    parsed = urlparse(raw)
    host = parsed.hostname or "?"
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{host}{port}{parsed.path or ''}"


def _scope_value(scope) -> str:
    return getattr(scope, "value", scope)


def _rules_fingerprint(session, exclude_ids: Iterable[int]) -> Tuple:
    from sqlmodel import select
    from app.models import ContractRule

    excluded = set(exclude_ids)
    rows = []
    for rule in session.exec(select(ContractRule)).all():
        if rule.id in excluded:
            continue
        rows.append(
            (
                rule.id,
                rule.contract_id,
                rule.key,
                _scope_value(rule.scope),
                rule.tiers_rfa,
                rule.tiers_bonus,
                rule.tiers,
                rule.bonus_groups,
            )
        )
    return tuple(sorted(rows, key=lambda row: row[0] or 0))


def _contracts_fingerprint(session, exclude_ids: Iterable[int]) -> Tuple:
    from sqlmodel import select
    from app.models import Contract

    excluded = set(exclude_ids)
    rows = []
    for contract in session.exec(select(Contract)).all():
        if contract.id in excluded:
            continue
        rows.append(
            (
                contract.id,
                contract.name,
                contract.description,
                bool(contract.use_combined_global_rate),
                bool(contract.is_active),
                _scope_value(contract.scope),
                contract.level_baremes,
            )
        )
    return tuple(sorted(rows, key=lambda row: row[0] or 0))


def _assignments_fingerprint(session) -> Tuple:
    from sqlmodel import select
    from app.models import ContractAssignment

    rows = []
    for assignment in session.exec(select(ContractAssignment)).all():
        rows.append(
            (
                assignment.id,
                assignment.contract_id,
                _scope_value(assignment.target_type),
                assignment.target_value,
                assignment.priority,
            )
        )
    return tuple(sorted(rows, key=lambda row: row[0] or 0))


def sync_apa_global_rules(session, *, apply: bool) -> Dict:
    """
    Aligne les 4 barèmes globaux sur le JSON.

    `apply=False` annule la transaction après avoir vérifié qu'elle est possible.
    """
    from datetime import datetime, timezone

    from sqlmodel import select

    from app.models import Contract, ContractRule, RuleScope

    payload = load_contract_payload()
    matches = session.exec(select(Contract).where(Contract.name == TARGET_NAME)).all()
    if len(matches) != 1:
        raise SyncRefused(
            f"Contrat {TARGET_NAME!r} introuvable ou dupliqué ({len(matches)}). "
            "Aucune écriture. Ne pas créer le contrat avec ce script."
        )
    contract = matches[0]
    if contract.name != TARGET_NAME or contract.name == PROTECTED_2025_NAME:
        raise SyncRefused("Cible refusée")

    legacy = session.exec(
        select(Contract).where(Contract.name == PROTECTED_2025_NAME)
    ).all()
    if any(row.id == contract.id for row in legacy):
        raise SyncRefused("La cible est le contrat APA 2025. Aucune écriture.")

    if contract.use_combined_global_rate:
        raise SyncRefused(
            "APA Marseille 2026 est en taux combiné en base. "
            "Le barème corrigé est par plateforme. Aucune écriture."
        )
    raw_levels = getattr(contract, "level_baremes", None)
    if raw_levels and str(raw_levels).strip() not in ("", "null", "[]"):
        raise SyncRefused(
            "level_baremes est renseigné : le barème global ne s'appliquerait pas. "
            "Aucune écriture."
        )

    rules = session.exec(
        select(ContractRule).where(ContractRule.contract_id == contract.id)
    ).all()
    by_key: Dict[str, List] = {key: [] for key in GLOBAL_KEYS}
    for rule in rules:
        if _scope_value(rule.scope) == RuleScope.GLOBAL.value and rule.key in by_key:
            by_key[rule.key].append(rule)
    for key in GLOBAL_KEYS:
        count = len(by_key[key])
        if count != 1:
            raise SyncRefused(
                f"{key} : {count} règle(s) globale(s), 1 attendue. Aucune écriture."
            )

    target_ids = [by_key[key][0].id for key in GLOBAL_KEYS]
    before_rules = _rules_fingerprint(session, target_ids)
    before_contracts = _contracts_fingerprint(session, [contract.id])
    before_assignments = _assignments_fingerprint(session)

    changes = []
    for key in GLOBAL_KEYS:
        rule = by_key[key][0]
        rfa = dumps_tiers(payload["globalRules"][key]["tiersRfa"])
        bonus = dumps_tiers(payload["globalRules"][key]["tiersBonus"])
        changed = rule.tiers_rfa != rfa or rule.tiers_bonus != bonus
        rule.tiers_rfa = rfa
        rule.tiers_bonus = bonus
        rule.updated_at = datetime.now(timezone.utc)
        session.add(rule)
        changes.append({"key": key, "changed": changed, "tiers_rfa": rfa, "tiers_bonus": bonus})

    description_changed = contract.description != payload["notes"]
    contract.description = payload["notes"]
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)

    try:
        session.flush()
        after_rules = _rules_fingerprint(session, target_ids)
        after_contracts = _contracts_fingerprint(session, [contract.id])
        after_assignments = _assignments_fingerprint(session)
        if (
            after_rules != before_rules
            or after_contracts != before_contracts
            or after_assignments != before_assignments
        ):
            session.rollback()
            raise SyncRefused(
                "Effet de bord détecté (autre contrat, règle tripartite ou affectation). "
                "Transaction annulée."
            )
        summary = {
            "applied": bool(apply),
            "contract_id": contract.id,
            "contract_name": contract.name,
            "description_changed": description_changed,
            "rules": changes,
        }
        if apply:
            session.commit()
        else:
            session.rollback()
        return summary
    except SyncRefused:
        raise
    except Exception:
        session.rollback()
        raise


def _print_summary(summary: dict) -> None:
    mode = "ÉCRIT" if summary["applied"] else "DRY-RUN, rien n'a été écrit"
    print(
        f"[{mode}] {summary['contract_name']} id={summary['contract_id']} "
        f"description_changed={summary['description_changed']}"
    )
    for rule in summary["rules"]:
        state = "modifié" if rule["changed"] else "déjà à jour"
        print(f"  - {rule['key']}: {state}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit dans la base. Sans ce drapeau, la transaction est annulée.",
    )
    parser.add_argument(
        "--emit-sql",
        action="store_true",
        help="Affiche le SQL proposé et n'ouvre pas la base.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        payload = load_contract_payload()
    except SyncRefused as exc:
        print(f"REFUS: {exc}", file=sys.stderr)
        return 2

    if args.emit_sql:
        sys.stdout.write(render_sql(payload))
        return 0

    from dotenv import load_dotenv
    from sqlmodel import Session

    load_dotenv(ROOT / ".env")
    print(f"Cible : {database_target_label()}")
    print("Mode : écriture" if args.apply else "Mode : dry-run (aucune écriture)")

    from app.database import engine

    try:
        with Session(engine) as session:
            summary = sync_apa_global_rules(session, apply=args.apply)
    except SyncRefused as exc:
        print(f"REFUS: {exc}", file=sys.stderr)
        return 2

    _print_summary(summary)
    if not args.apply:
        print("Relancer avec --apply pour écrire. Le SQL équivalent : --emit-sql")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
