"""Tests séparation année APA/Discount + Codifa combined + APA 12%."""
import json
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
