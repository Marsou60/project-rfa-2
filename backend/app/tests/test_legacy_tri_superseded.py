"""
Legacy TRI marque entière vs marque × famille (Adhérents 2026).
+ barème unique Adhérents 2026 : pas d'overrides client 2025.
"""
import json
from types import SimpleNamespace

from app.models import RuleScope
from app.services.rfa_calculator import (
    calculate_rfa,
    is_adherents_2026_contract,
    should_apply_entity_overrides,
    superseded_legacy_tri_keys,
)


def _rule(key, tiers, label=None, scope=RuleScope.TRI):
    return SimpleNamespace(
        key=key,
        label=label or key,
        scope=scope,
        tiers=json.dumps(tiers) if scope == RuleScope.TRI and tiers is not None else None,
        tiers_rfa=json.dumps(tiers) if scope == RuleScope.GLOBAL and tiers is not None else None,
        tiers_bonus=None,
    )


def test_superseded_when_family_keys_have_tiers():
    rules = {
        "TRI_ALLIANCE_DELPHI": _rule("TRI_ALLIANCE_DELPHI", []),
        "TRI_ALLIANCE_DELPHI_FREINAGE": _rule(
            "TRI_ALLIANCE_DELPHI_FREINAGE",
            [{"min": 15000, "rate": 0.025}],
        ),
        "TRI_ALLIANCE_DELPHI_PSD": _rule(
            "TRI_ALLIANCE_DELPHI_PSD",
            [{"min": 15000, "rate": 0.025}],
        ),
    }
    assert "TRI_ALLIANCE_DELPHI" in superseded_legacy_tri_keys(rules)


def test_not_superseded_when_only_legacy_has_tiers():
    rules = {
        "TRI_ALLIANCE_DELPHI": _rule(
            "TRI_ALLIANCE_DELPHI",
            [{"min": 50000, "rate": 0.1}],
        ),
    }
    assert "TRI_ALLIANCE_DELPHI" not in superseded_legacy_tri_keys(rules)


def test_adherents_2026_ignores_entity_overrides():
    contract = SimpleNamespace(name="Adhérents 2026", id=34)
    assert is_adherents_2026_contract(contract)
    assert should_apply_entity_overrides(contract, year=2026) is False
    assert should_apply_entity_overrides(contract, year=2025) is True
    special = SimpleNamespace(name="Contrat BBH", id=19)
    assert should_apply_entity_overrides(special, year=2026) is True


def test_override_legacy_delphi_ignored_when_family_rules_present():
    """BBH / Destock : override 2025 sur Delphi ne doit pas réapparaitre en 2026."""
    contract = SimpleNamespace(
        use_combined_global_rate=False,
        level_baremes=None,
        name="Adhérents 2026",
        id=34,
    )
    rules = {
        "TRI_ALLIANCE_DELPHI_FREINAGE": _rule(
            "TRI_ALLIANCE_DELPHI_FREINAGE",
            [{"min": 15000, "rate": 0.025}, {"min": 25000, "rate": 0.04}],
            "ALLIANCE – Delphi Freinage",
        ),
        "TRI_ALLIANCE_DELPHI_PSD": _rule(
            "TRI_ALLIANCE_DELPHI_PSD",
            [{"min": 15000, "rate": 0.025}, {"min": 25000, "rate": 0.04}],
            "ALLIANCE – Delphi PSD",
        ),
    }
    recap = {
        "global": {"GLOBAL_ALLIANCE": 200000.0},
        "tri": {
            "TRI_ALLIANCE_DELPHI": 38575.0,
            "TRI_ALLIANCE_DELPHI_FREINAGE": 30836.0,
            "TRI_ALLIANCE_DELPHI_PSD": 5131.0,
        },
    }
    overrides = {
        "TRI_ALLIANCE_DELPHI": {"tri": [{"min": 20000, "rate": 0.02}, {"min": 25000, "rate": 0.08}]},
    }
    result = calculate_rfa(
        recap,
        contract=contract,
        contract_rules=rules,
        entity_overrides=overrides,
        year=2026,
    )
    assert "TRI_ALLIANCE_DELPHI" not in result["tri"]
    assert "TRI_ALLIANCE_DELPHI_FREINAGE" in result["tri"]
    assert "TRI_ALLIANCE_DELPHI_PSD" in result["tri"]
    assert result["tri"]["TRI_ALLIANCE_DELPHI_FREINAGE"]["rate"] == 0.04


def test_adherents_2026_global_override_ignored():
    """Bonus/RFA custom 2025 ne doit pas modifier le barème niveaux 2026."""
    levels = [
        {
            "id": "SILVER",
            "minGlobal": 100001,
            "maxGlobal": 300000,
            "tripartitesEnabled": True,
            "tiersRfa": [{"min": 25000, "rate": 0.035}],
            "tiersBonus": [{"min": 25000, "rate": 0.02}],
        },
    ]
    contract = SimpleNamespace(
        use_combined_global_rate=False,
        level_baremes=json.dumps(levels),
        name="Adhérents 2026",
        id=34,
    )
    recap = {
        "global": {"GLOBAL_ALLIANCE": 150000.0},
        "tri": {},
    }
    overrides = {
        "GLOBAL_ALLIANCE": {"bonus": [{"min": 0, "rate": 0.99}], "rfa": [{"min": 0, "rate": 0.99}]},
    }
    result = calculate_rfa(
        recap,
        contract=contract,
        contract_rules={},
        entity_overrides=overrides,
        year=2026,
    )
    g = result["global"]["GLOBAL_ALLIANCE"]
    assert g["rfa"]["rate"] == 0.035
    assert g["bonus"]["rate"] == 0.02
    assert g["rfa"]["has_override"] is False
