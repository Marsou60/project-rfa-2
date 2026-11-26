"""Tests séparation année APA/Discount + Codifa combined + APA 12%."""
import importlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.contract_resolver import (
    SPECIAL_CONTRACT_YEAR_UPGRADES,
    apply_year_contract_policy,
    is_year_2026_only_contract,
)
from app.services.rfa_calculator import (
    calculate_rfa,
    evaluate_apa_nord_franchise,
    is_apa_2026_contract,
)


def test_special_upgrades_map_covers_apa_and_discount():
    assert "Groupe Discount" in SPECIAL_CONTRACT_YEAR_UPGRADES
    assert SPECIAL_CONTRACT_YEAR_UPGRADES["Groupe Discount"] == "Groupe Discount 2026"
    apa_keys = [k for k in SPECIAL_CONTRACT_YEAR_UPGRADES if "APA" in k.upper()]
    assert apa_keys
    assert SPECIAL_CONTRACT_YEAR_UPGRADES[apa_keys[0]] == "APA Marseille 2026"


def test_year_2026_only_names():
    c = SimpleNamespace(name="Otto'Parts / Codifa 2026")
    assert is_year_2026_only_contract(c) is True
    assert is_year_2026_only_contract(SimpleNamespace(name="Groupe Discount")) is False


def test_2025_keeps_legacy_apa_contract():
    """year < 2026 : le contrat APA 2025 n'est pas remplacé."""
    apa_2025 = SimpleNamespace(
        id=7,
        name="APA Marseille – Avenant Union Nord + Franchise",
        level_baremes=None,
    )

    class FakeSession:
        pass

    out = apply_year_contract_policy(apa_2025, 2025, FakeSession())
    assert out is apa_2025


def test_2026_upgrades_discount_when_2026_exists():
    discount_2025 = SimpleNamespace(
        id=13,
        name="Groupe Discount",
        level_baremes=None,
        is_default=False,
    )
    discount_2026 = SimpleNamespace(
        id=99,
        name="Groupe Discount 2026",
        level_baremes=None,
        is_default=False,
        is_active=True,
        scope="ADHERENT",
    )

    class FakeSession:
        def exec(self, statement):
            class R:
                def first(self_inner):
                    return discount_2026
            return R()

    out = apply_year_contract_policy(discount_2025, 2026, FakeSession())
    assert out is discount_2026


def _rule(key, scope, tiers_rfa=None, tiers_bonus=None, tiers=None, label=None):
    return SimpleNamespace(
        key=key,
        scope=scope,
        tiers_rfa=json.dumps(tiers_rfa) if tiers_rfa is not None else None,
        tiers_bonus=json.dumps(tiers_bonus) if tiers_bonus is not None else None,
        tiers=json.dumps(tiers) if tiers is not None else None,
        label=label or key,
        bonus_groups=None,
    )


def test_codifa_combined_alliance_acr_only():
    from app.models import RuleScope

    contract = SimpleNamespace(
        id=100,
        name="Otto'Parts / Codifa 2026",
        use_combined_global_rate=True,
        level_baremes=None,
    )
    tiers = [
        {"min": 400000, "rate": 0.06},
        {"min": 500000, "rate": 0.07},
        {"min": 600000, "rate": 0.08},
    ]
    rules = {
        "GLOBAL_ALLIANCE": _rule("GLOBAL_ALLIANCE", RuleScope.GLOBAL, tiers_rfa=tiers, tiers_bonus=[]),
        "GLOBAL_ACR": _rule("GLOBAL_ACR", RuleScope.GLOBAL, tiers_rfa=tiers, tiers_bonus=[]),
        "GLOBAL_DCA": _rule("GLOBAL_DCA", RuleScope.GLOBAL, tiers_rfa=[], tiers_bonus=[]),
        "GLOBAL_EXADIS": _rule("GLOBAL_EXADIS", RuleScope.GLOBAL, tiers_rfa=[], tiers_bonus=[]),
    }
    recap = {
        "global": {
            "GLOBAL_ALLIANCE": 400000,
            "GLOBAL_ACR": 200000,
            "GLOBAL_DCA": 100000,
            "GLOBAL_EXADIS": 50000,
        },
        "tri": {},
    }
    with patch("app.services.rfa_calculator.load_contract_rules", return_value=rules):
        result = calculate_rfa(recap, contract=contract, year=2026)

    # 600k consolidé Alliance+ACR → 8%
    assert abs(result["global"]["GLOBAL_ALLIANCE"]["rfa"]["rate"] - 0.08) < 1e-9
    assert abs(result["global"]["GLOBAL_ACR"]["rfa"]["rate"] - 0.08) < 1e-9
    # DCA/EXADIS hors périmètre
    assert result["global"]["GLOBAL_DCA"]["rfa"]["rate"] == 0
    assert result["global"]["GLOBAL_EXADIS"]["rfa"]["rate"] == 0


def test_apa_nord_franchise_triggers_at_2m():
    contract = SimpleNamespace(name="APA Marseille 2026")
    assert is_apa_2026_contract(contract)
    recap = {
        "global": {
            "GLOBAL_ALLIANCE": 450000,
            "GLOBAL_ACR": 450000,
            "GLOBAL_EXADIS": 450000,
            "GLOBAL_DCA": 650000,
        },
        "tri": {},
    }
    boost = evaluate_apa_nord_franchise(recap, contract, year=2026)
    assert boost is not None
    assert boost["triggered"] is True

    boost_2025 = evaluate_apa_nord_franchise(recap, contract, year=2025)
    assert boost_2025 is None


def test_apa_nord_franchise_applied_in_calculate_rfa():
    from app.models import RuleScope

    contract = SimpleNamespace(
        id=7,
        name="APA Marseille 2026",
        use_combined_global_rate=False,
        level_baremes=None,
    )
    rules = {
        "GLOBAL_ALLIANCE": _rule(
            "GLOBAL_ALLIANCE", RuleScope.GLOBAL, tiers_rfa=[{"min": 450000, "rate": 0.11}], tiers_bonus=[]
        ),
        "GLOBAL_ACR": _rule(
            "GLOBAL_ACR", RuleScope.GLOBAL, tiers_rfa=[{"min": 450000, "rate": 0.11}], tiers_bonus=[]
        ),
        "GLOBAL_EXADIS": _rule(
            "GLOBAL_EXADIS", RuleScope.GLOBAL, tiers_rfa=[{"min": 450000, "rate": 0.11}], tiers_bonus=[]
        ),
        "GLOBAL_DCA": _rule(
            "GLOBAL_DCA", RuleScope.GLOBAL, tiers_rfa=[{"min": 150000, "rate": 0.105}], tiers_bonus=[]
        ),
    }
    recap = {
        "global": {
            "GLOBAL_ALLIANCE": 500000,
            "GLOBAL_ACR": 500000,
            "GLOBAL_EXADIS": 500000,
            "GLOBAL_DCA": 500000,
        },
        "tri": {},
    }
    with patch("app.services.rfa_calculator.load_contract_rules", return_value=rules):
        result = calculate_rfa(recap, contract=contract, year=2026)

    assert abs(result["global"]["GLOBAL_ALLIANCE"]["rfa"]["rate"] - 0.12) < 1e-9
    assert abs(result["global"]["GLOBAL_ACR"]["rfa"]["rate"] - 0.12) < 1e-9
    assert abs(result["global"]["GLOBAL_EXADIS"]["rfa"]["rate"] - 0.11) < 1e-9
    assert result["apa_nord_franchise"]["triggered"] is True


def _load_contract_json(filename: str) -> dict:
    path = Path(__file__).resolve().parents[2] / "contracts" / filename
    data = json.loads(path.read_text(encoding="utf-8"))
    assert len(data["contracts"]) == 1
    return data["contracts"][0]


def _rules_from_global(contract_json: dict) -> dict:
    from app.models import RuleScope

    return {
        key: _rule(
            key,
            RuleScope.GLOBAL,
            tiers_rfa=rule["tiersRfa"],
            tiers_bonus=rule["tiersBonus"],
        )
        for key, rule in contract_json["globalRules"].items()
    }


def test_apa_marseille_2026_follows_discount_base_then_addendum():
    """Sous le seuil : tableau de base (modèle Groupe Discount 2026). Au seuil : avenant, bonus à 0."""
    discount = _load_contract_json("contrat_groupe_discount_2026.json")
    discount_alliance = discount["globalRules"]["GLOBAL_ALLIANCE"]
    base_rfa = discount_alliance["tiersRfa"][:6]
    base_bonus = discount_alliance["tiersBonus"][:6]
    assert discount["useCombinedGlobalRate"] is True
    assert discount_alliance["tiersRfa"][6]["min"] == 800000
    assert discount_alliance["tiersBonus"][-1] == {"min": 800000, "rate": 0.0}

    apa = _load_contract_json("contrat_apa_marseille_2026.json")
    assert apa["name"] == "APA Marseille 2026"
    assert apa["useCombinedGlobalRate"] is False
    for key in ("GLOBAL_ALLIANCE", "GLOBAL_ACR", "GLOBAL_EXADIS"):
        assert apa["globalRules"][key]["tiersRfa"] == base_rfa + [{"min": 450000, "rate": 0.11}]
        assert apa["globalRules"][key]["tiersBonus"] == base_bonus + [{"min": 450000, "rate": 0.0}]
    assert apa["globalRules"]["GLOBAL_DCA"]["tiersRfa"] == (
        [tier for tier in base_rfa if tier["min"] < 150000] + [{"min": 150000, "rate": 0.105}]
    )
    assert apa["globalRules"]["GLOBAL_DCA"]["tiersBonus"] == (
        [tier for tier in base_bonus if tier["min"] < 150000] + [{"min": 150000, "rate": 0.0}]
    )
    # Les tripartites du livret ne bougent pas.
    assert apa["triRules"]["TRI_ALLIANCE_DELPHI"]["tiers"] == [{"min": 50000, "rate": 0.08}]


def test_apa_marseille_2026_october_projection_uses_base_table():
    """
    Projection fin octobre 2026 (facteur 12/10 déjà appliqué aux CA) :
    Alliance ~342 575 € → 6,5 % → ~22 267 €
    DCA ~134 046 € → 4,5 % → ~6 032 €
    ACR et EXADIS sous 450 k€ suivent le même tableau de base.
    """
    apa = _load_contract_json("contrat_apa_marseille_2026.json")
    contract = SimpleNamespace(
        id=37,
        name="APA Marseille 2026",
        use_combined_global_rate=False,
        level_baremes=None,
    )
    recap = {
        "global": {
            "GLOBAL_ALLIANCE": 342575,
            "GLOBAL_DCA": 134046,
            "GLOBAL_ACR": 80000,
            "GLOBAL_EXADIS": 60000,
        },
        "tri": {},
    }
    result = calculate_rfa(recap, contract=contract, contract_rules=_rules_from_global(apa), year=2026)

    alliance = result["global"]["GLOBAL_ALLIANCE"]
    dca = result["global"]["GLOBAL_DCA"]
    acr = result["global"]["GLOBAL_ACR"]
    exadis = result["global"]["GLOBAL_EXADIS"]

    assert abs(alliance["total"]["rate"] - 0.065) < 1e-9
    assert alliance["rfa"]["rate"] == 0.035
    assert alliance["bonus"]["rate"] == 0.03
    assert round(alliance["total"]["value"], 2) == 22267.38

    assert abs(dca["total"]["rate"] - 0.045) < 1e-9
    assert dca["rfa"]["rate"] == 0.025
    assert dca["bonus"]["rate"] == 0.02
    assert round(dca["total"]["value"], 2) == 6032.07

    assert abs(acr["total"]["rate"] - 0.035) < 1e-9
    assert acr["total"]["value"] == 2800.0
    assert abs(exadis["total"]["rate"] - 0.025) < 1e-9
    assert exadis["total"]["value"] == 1500.0
    assert result["apa_nord_franchise"]["triggered"] is False

    # Juste sous 20 k€ : toujours 0. Au seuil DCA, l'avenant remplace le tableau.
    below = calculate_rfa(
        {"global": {"GLOBAL_ALLIANCE": 19999, "GLOBAL_DCA": 149999}, "tri": {}},
        contract=contract,
        contract_rules=_rules_from_global(apa),
        year=2026,
    )
    assert below["global"]["GLOBAL_ALLIANCE"]["total"]["rate"] == 0
    assert abs(below["global"]["GLOBAL_DCA"]["total"]["rate"] - 0.045) < 1e-9

    at_addendum = calculate_rfa(
        {
            "global": {
                "GLOBAL_ALLIANCE": 450000,
                "GLOBAL_ACR": 0,
                "GLOBAL_EXADIS": 450000,
                "GLOBAL_DCA": 150000,
            },
            "tri": {},
        },
        contract=contract,
        contract_rules=_rules_from_global(apa),
        year=2026,
    )
    assert abs(at_addendum["global"]["GLOBAL_ALLIANCE"]["total"]["rate"] - 0.11) < 1e-9
    assert at_addendum["global"]["GLOBAL_ALLIANCE"]["bonus"]["rate"] == 0
    assert abs(at_addendum["global"]["GLOBAL_EXADIS"]["total"]["rate"] - 0.11) < 1e-9
    assert at_addendum["global"]["GLOBAL_EXADIS"]["bonus"]["rate"] == 0
    assert abs(at_addendum["global"]["GLOBAL_DCA"]["rfa"]["rate"] - 0.105) < 1e-9
    assert at_addendum["global"]["GLOBAL_DCA"]["bonus"]["rate"] == 0
    assert at_addendum["global"]["GLOBAL_DCA"]["total"]["value"] == 15750.0
    assert at_addendum["apa_nord_franchise"]["triggered"] is False


def test_apa_nord_franchise_still_overrides_base_and_addendum():
    """Le bonus 12 % reste prioritaire en 2026, et ne s'applique pas en vue 2025."""
    apa = _load_contract_json("contrat_apa_marseille_2026.json")
    contract = SimpleNamespace(
        id=37,
        name="APA Marseille 2026",
        use_combined_global_rate=False,
        level_baremes=None,
    )
    recap = {
        "global": {
            "GLOBAL_ALLIANCE": 500000,
            "GLOBAL_ACR": 500000,
            "GLOBAL_EXADIS": 500000,
            "GLOBAL_DCA": 500000,
        },
        "tri": {},
    }
    rules = _rules_from_global(apa)
    result = calculate_rfa(recap, contract=contract, contract_rules=rules, year=2026)
    assert result["apa_nord_franchise"]["triggered"] is True
    assert abs(result["global"]["GLOBAL_ALLIANCE"]["rfa"]["rate"] - 0.12) < 1e-9
    assert result["global"]["GLOBAL_ALLIANCE"]["bonus"]["rate"] == 0
    assert abs(result["global"]["GLOBAL_ACR"]["rfa"]["rate"] - 0.12) < 1e-9
    assert abs(result["global"]["GLOBAL_EXADIS"]["rfa"]["rate"] - 0.11) < 1e-9
    assert abs(result["global"]["GLOBAL_DCA"]["rfa"]["rate"] - 0.105) < 1e-9

    legacy_view = calculate_rfa(recap, contract=contract, contract_rules=rules, year=2025)
    assert legacy_view.get("apa_nord_franchise") is None
    assert abs(legacy_view["global"]["GLOBAL_ALLIANCE"]["rfa"]["rate"] - 0.11) < 1e-9


def _aware_now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def test_sync_apa_2026_updates_only_its_global_rules():
    from sqlmodel import Session, SQLModel, create_engine, select

    from app.models import Contract, ContractRule, RuleScope
    import _sync_apa_marseille_2026_base_and_addendum as sync

    engine = create_engine("sqlite://")
    now = _aware_now()
    SQLModel.metadata.create_all(engine)

    def seed():
        with Session(engine) as session:
            legacy = Contract(
                id=7,
                name=sync.PROTECTED_2025_NAME,
                description="contrat 2025 intact",
                use_combined_global_rate=False,
                created_at=now,
                updated_at=now,
            )
            apa = Contract(
                id=37,
                name=sync.TARGET_NAME,
                description="ancien avenant seul",
                use_combined_global_rate=False,
                created_at=now,
                updated_at=now,
            )
            discount = Contract(
                id=36,
                name="Groupe Discount 2026",
                description="ne pas toucher",
                use_combined_global_rate=True,
                created_at=now,
                updated_at=now,
            )
            session.add(legacy)
            session.add(apa)
            session.add(discount)
            session.commit()
            session.add(
                ContractRule(
                    contract_id=7,
                    key="GLOBAL_ALLIANCE",
                    scope=RuleScope.GLOBAL,
                    label="Alliance",
                    tiers_rfa='[{"min": 450000, "rate": 0.11}]',
                    tiers_bonus=None,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.add(
                ContractRule(
                    contract_id=36,
                    key="GLOBAL_ALLIANCE",
                    scope=RuleScope.GLOBAL,
                    label="Alliance",
                    tiers_rfa="KEEP-DISCOUNT",
                    tiers_bonus="KEEP-BONUS",
                    created_at=now,
                    updated_at=now,
                )
            )
            for key in sync.GLOBAL_KEYS:
                session.add(
                    ContractRule(
                        contract_id=37,
                        key=key,
                        scope=RuleScope.GLOBAL,
                        label=key,
                        tiers_rfa='[{"min": 450000, "rate": 0.11}]',
                        tiers_bonus=None,
                        created_at=now,
                        updated_at=now,
                    )
                )
            session.add(
                ContractRule(
                    contract_id=37,
                    key="TRI_ALLIANCE_DELPHI",
                    scope=RuleScope.TRI,
                    label="Delphi",
                    tiers='[{"min": 50000, "rate": 0.08}]',
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

    def snapshot():
        with Session(engine) as session:
            legacy = session.get(Contract, 7)
            discount = session.get(Contract, 36)
            apa = session.get(Contract, 37)
            tri = session.exec(
                select(ContractRule).where(
                    ContractRule.contract_id == 37,
                    ContractRule.key == "TRI_ALLIANCE_DELPHI",
                )
            ).one()
            return {
                "legacy_name": legacy.name,
                "legacy_description": legacy.description,
                "legacy_tiers": session.exec(
                    select(ContractRule).where(ContractRule.contract_id == 7)
                ).one().tiers_rfa,
                "discount_tiers": session.exec(
                    select(ContractRule).where(ContractRule.contract_id == 36)
                ).one().tiers_rfa,
                "discount_description": discount.description,
                "apa_description": apa.description,
                "tri": tri.tiers,
                "globals": {
                    rule.key: (rule.tiers_rfa, rule.tiers_bonus)
                    for rule in session.exec(
                        select(ContractRule).where(
                            ContractRule.contract_id == 37,
                            ContractRule.scope == RuleScope.GLOBAL,
                        )
                    ).all()
                },
            }

    seed()
    before = snapshot()
    with Session(engine) as session:
        dry = sync.sync_apa_global_rules(session, apply=False)
    assert dry["applied"] is False
    assert snapshot() == before

    with Session(engine) as session:
        written = sync.sync_apa_global_rules(session, apply=True)
    assert written["applied"] is True
    assert written["contract_id"] == 37
    after = snapshot()
    assert after["legacy_name"] == before["legacy_name"]
    assert after["legacy_description"] == before["legacy_description"]
    assert after["legacy_tiers"] == before["legacy_tiers"]
    assert after["discount_tiers"] == "KEEP-DISCOUNT"
    assert after["discount_description"] == "ne pas toucher"
    assert after["tri"] == '[{"min": 50000, "rate": 0.08}]'
    payload = sync.load_contract_payload()
    assert after["apa_description"] == payload["notes"]
    for key in sync.GLOBAL_KEYS:
        rule = payload["globalRules"][key]
        assert after["globals"][key] == (
            sync.dumps_tiers(rule["tiersRfa"]),
            sync.dumps_tiers(rule["tiersBonus"]),
        )

    with Session(engine) as session:
        again = sync.sync_apa_global_rules(session, apply=True)
    assert snapshot()["globals"] == after["globals"]
    assert all(not rule["changed"] for rule in again["rules"])


def test_sync_refuses_duplicate_global_rule_without_writing():
    from sqlmodel import Session, SQLModel, create_engine, select

    from app.models import Contract, ContractRule, RuleScope
    import _sync_apa_marseille_2026_base_and_addendum as sync

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    now = _aware_now()
    with Session(engine) as session:
        session.add(
            Contract(
                id=37,
                name=sync.TARGET_NAME,
                description="avant",
                use_combined_global_rate=False,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
        for key in sync.GLOBAL_KEYS:
            session.add(
                ContractRule(
                    contract_id=37,
                    key=key,
                    scope=RuleScope.GLOBAL,
                    label=key,
                    tiers_rfa="[]",
                    created_at=now,
                    updated_at=now,
                )
            )
        session.add(
            ContractRule(
                contract_id=37,
                key="GLOBAL_DCA",
                scope=RuleScope.GLOBAL,
                label="doublon",
                tiers_rfa="DOUBLON",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    with Session(engine) as session:
        try:
            sync.sync_apa_global_rules(session, apply=True)
            raised = False
        except sync.SyncRefused:
            raised = True
    assert raised
    with Session(engine) as session:
        rows = session.exec(
            select(ContractRule).where(
                ContractRule.contract_id == 37,
                ContractRule.key == "GLOBAL_DCA",
            )
        ).all()
        assert {row.tiers_rfa for row in rows} == {"[]", "DOUBLON"}
        assert session.get(Contract, 37).description == "avant"


def test_proposed_sql_matches_apa_json_and_guards_2025():
    sync = importlib.import_module("_sync_apa_marseille_2026_base_and_addendum")
    payload = sync.load_contract_payload()
    sql = sync.SQL_PATH.read_text(encoding="utf-8")
    assert sql == sync.render_sql(payload)
    assert "BEGIN;" in sql and sql.strip().endswith("COMMIT;")
    assert sync.PROTECTED_2025_NAME in sql
    assert "WHERE name = 'APA Marseille 2026'" in sql
    assert "KEEP" not in sql
    for key in sync.GLOBAL_KEYS:
        rule = payload["globalRules"][key]
        assert sync.dumps_tiers(rule["tiersRfa"]) in sql
        assert sync.dumps_tiers(rule["tiersBonus"]) in sql
    assert '"min": 20000' in sql
    assert '"min": 450000, "rate": 0.11' in sql
    assert '"min": 150000, "rate": 0.105' in sql
    assert '"min": 450000, "rate": 0.0' in sql
