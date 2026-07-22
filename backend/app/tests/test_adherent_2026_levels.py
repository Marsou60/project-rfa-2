"""
Tests du mode niveaux Classique / Silver / Gold (contrat Adhérents 2026).
"""
import json
from types import SimpleNamespace

from app.services.rfa_calculator import (
    calculate_rfa,
    select_contract_level,
    parse_level_baremes,
)


LEVEL_BAREMES = [
    {
        "id": "CLASSIQUE",
        "minGlobal": 25000,
        "maxGlobal": 100000,
        "tripartitesEnabled": False,
        "tiersRfa": [
            {"min": 25000, "rate": 0.015},
            {"min": 50000, "rate": 0.015},
            {"min": 75000, "rate": 0.02},
        ],
        "tiersBonus": [
            {"min": 25000, "rate": 0.01},
            {"min": 50000, "rate": 0.015},
            {"min": 75000, "rate": 0.015},
        ],
    },
    {
        "id": "SILVER",
        "minGlobal": 100001,
        "maxGlobal": 300000,
        "tripartitesEnabled": True,
        "tiersRfa": [
            {"min": 25000, "rate": 0.015},
            {"min": 50000, "rate": 0.025},
            {"min": 75000, "rate": 0.03},
            {"min": 100000, "rate": 0.035},
            {"min": 150000, "rate": 0.04},
            {"min": 200000, "rate": 0.045},
        ],
        "tiersBonus": [
            {"min": 25000, "rate": 0.02},
            {"min": 50000, "rate": 0.02},
            {"min": 75000, "rate": 0.02},
            {"min": 100000, "rate": 0.02},
            {"min": 150000, "rate": 0.02},
            {"min": 200000, "rate": 0.02},
        ],
    },
    {
        "id": "GOLD",
        "minGlobal": 300001,
        "maxGlobal": None,
        "tripartitesEnabled": True,
        "tiersRfa": [
            {"min": 25000, "rate": 0.015},
            {"min": 50000, "rate": 0.025},
            {"min": 75000, "rate": 0.03},
            {"min": 100000, "rate": 0.035},
            {"min": 150000, "rate": 0.04},
            {"min": 200000, "rate": 0.045},
        ],
        "tiersBonus": [
            {"min": 25000, "rate": 0.025},
            {"min": 50000, "rate": 0.025},
            {"min": 75000, "rate": 0.025},
            {"min": 100000, "rate": 0.025},
            {"min": 150000, "rate": 0.025},
            {"min": 200000, "rate": 0.03},
        ],
    },
]


def _make_contract():
    return SimpleNamespace(
        use_combined_global_rate=False,
        level_baremes=json.dumps(LEVEL_BAREMES),
    )


def test_select_level_boundaries():
    assert select_contract_level(24999, LEVEL_BAREMES) is None
    assert select_contract_level(25000, LEVEL_BAREMES)["id"] == "CLASSIQUE"
    assert select_contract_level(100000, LEVEL_BAREMES)["id"] == "CLASSIQUE"
    assert select_contract_level(100001, LEVEL_BAREMES)["id"] == "SILVER"
    assert select_contract_level(300000, LEVEL_BAREMES)["id"] == "SILVER"
    assert select_contract_level(300001, LEVEL_BAREMES)["id"] == "GOLD"
    assert select_contract_level(900000, LEVEL_BAREMES)["id"] == "GOLD"


def test_below_25k_no_rfa():
    contract = _make_contract()
    result = calculate_rfa(
        {
            "global": {"GLOBAL_ACR": 20000.0, "GLOBAL_ALLIANCE": 0.0},
            "tri": {},
        },
        contract=contract,
        contract_rules={},
    )
    assert result["contract_level"]["id"] is None
    assert result["global"]["GLOBAL_ACR"]["rfa"]["value"] == 0.0
    assert result["totals"]["grand_total"] == 0.0


def test_gold_example_from_livret():
    """Exemple livret : Gold 600k — ACR 100k → 6%, EXADIS 30k → 4%, Alliance 200k → 7,5%."""
    contract = _make_contract()
    result = calculate_rfa(
        {
            "global": {
                "GLOBAL_ACR": 100000.0,
                "GLOBAL_EXADIS": 30000.0,
                "GLOBAL_ALLIANCE": 200000.0,
                "GLOBAL_DCA": 270000.0,
            },
            "tri": {},
        },
        contract=contract,
        contract_rules={},
    )
    assert result["contract_level"]["id"] == "GOLD"
    assert abs(result["global"]["GLOBAL_ACR"]["total"]["rate"] - 0.06) < 1e-9
    assert result["global"]["GLOBAL_ACR"]["total"]["value"] == 6000.0
    assert abs(result["global"]["GLOBAL_EXADIS"]["total"]["rate"] - 0.04) < 1e-9
    assert result["global"]["GLOBAL_EXADIS"]["total"]["value"] == 1200.0
    assert abs(result["global"]["GLOBAL_ALLIANCE"]["total"]["rate"] - 0.075) < 1e-9
    assert result["global"]["GLOBAL_ALLIANCE"]["total"]["value"] == 15000.0


def test_classique_no_tripartites():
    contract = _make_contract()
    tri_rule = SimpleNamespace(
        scope=__import__("app.models", fromlist=["RuleScope"]).RuleScope.TRI,
        tiers=json.dumps([{"min": 15000, "rate": 0.01}, {"min": 25000, "rate": 0.025}]),
        label="DCA SBS",
    )
    result = calculate_rfa(
        {
            "global": {
                "GLOBAL_ACR": 40000.0,
                "GLOBAL_DCA": 20000.0,
                "GLOBAL_ALLIANCE": 10000.0,
                "GLOBAL_EXADIS": 10000.0,
            },
            "tri": {"TRI_DCA_SBS": 30000.0},
        },
        contract=contract,
        contract_rules={"TRI_DCA_SBS": tri_rule},
    )
    assert result["contract_level"]["id"] == "CLASSIQUE"
    assert result["contract_level"]["tripartites_enabled"] is False
    assert result["tri"]["TRI_DCA_SBS"]["value"] == 0.0


def test_silver_tripartites_enabled():
    from app.models import RuleScope

    contract = _make_contract()
    tri_rule = SimpleNamespace(
        scope=RuleScope.TRI,
        tiers=json.dumps([{"min": 15000, "rate": 0.01}, {"min": 25000, "rate": 0.025}]),
        label="DCA SBS",
    )
    result = calculate_rfa(
        {
            "global": {
                "GLOBAL_ACR": 50000.0,
                "GLOBAL_DCA": 50000.0,
                "GLOBAL_ALLIANCE": 50000.0,
                "GLOBAL_EXADIS": 50000.0,
            },
            "tri": {"TRI_DCA_SBS": 30000.0},
        },
        contract=contract,
        contract_rules={"TRI_DCA_SBS": tri_rule},
    )
    assert result["contract_level"]["id"] == "SILVER"
    assert result["tri"]["TRI_DCA_SBS"]["rate"] == 0.025
    assert result["tri"]["TRI_DCA_SBS"]["value"] == 750.0


def test_parse_level_baremes():
    contract = _make_contract()
    levels = parse_level_baremes(contract)
    assert len(levels) == 3
    assert levels[0]["id"] == "CLASSIQUE"
