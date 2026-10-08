"""Challenge ACR M0291 : +2,5 points sur le palier RFA au-delà de 65 000 €, cotisation offerte."""
import json
from types import SimpleNamespace
from unittest.mock import patch

from app.models import RuleScope
from app.services.cotisation_2026 import apply_m0291_acr_cotisation
from app.services.rfa_calculator import calculate_rfa, evaluate_m0291_acr_challenge


def _rule(key, scope, tiers_rfa=None, tiers_bonus=None, label=None):
    return SimpleNamespace(
        key=key,
        scope=scope,
        tiers_rfa=json.dumps(tiers_rfa) if tiers_rfa is not None else None,
        tiers_bonus=json.dumps(tiers_bonus) if tiers_bonus is not None else None,
        tiers=None,
        label=label or key,
        bonus_groups=None,
    )


def _contract(level_baremes=None):
    return SimpleNamespace(
        id=291,
        name="Adhérents 2026",
        use_combined_global_rate=False,
        level_baremes=level_baremes,
    )


def test_m0291_projection_2_5_plus_2_becomes_fixed_7():
    """2,5 % + 2 % = 4,5 % sont remplacés par 7 % fixe. Le bonus n'est pas ajouté en plus."""
    rules = {
        "GLOBAL_ACR": _rule(
            "GLOBAL_ACR",
            RuleScope.GLOBAL,
            tiers_rfa=[{"min": 25000, "rate": 0.025}],
            tiers_bonus=[{"min": 25000, "rate": 0.02}],
        ),
    }
    recap = {"global": {"GLOBAL_ACR": 80000}, "tri": {}}
    with patch("app.services.rfa_calculator.load_contract_rules", return_value=rules):
        result = calculate_rfa(recap, contract=_contract(), code_union="M0291", year=2026)

    acr = result["global"]["GLOBAL_ACR"]
    assert abs(acr["total"]["rate"] - 0.07) < 1e-9
    assert abs(acr["rfa"]["rate"] - 0.07) < 1e-9
    assert acr["bonus"]["rate"] == 0
    assert abs(acr["total"]["value"] - 5600) < 0.01
    challenge = result["acr_challenge"]
    assert challenge["triggered"] is True
    assert abs(challenge["base_rate"] - 0.045) < 1e-9
    assert abs(challenge["boosted_rate"] - 0.07) < 1e-9
    assert challenge["fixed_rate"] is True


def test_m0291_exact_threshold_does_not_trigger():
    rules = {
        "GLOBAL_ACR": _rule(
            "GLOBAL_ACR",
            RuleScope.GLOBAL,
            tiers_rfa=[{"min": 25000, "rate": 0.035}],
            tiers_bonus=[],
        ),
    }
    recap = {"global": {"GLOBAL_ACR": 65000}, "tri": {}}
    with patch("app.services.rfa_calculator.load_contract_rules", return_value=rules):
        result = calculate_rfa(recap, contract=_contract(), code_union="m0291", year=2026)

    assert abs(result["global"]["GLOBAL_ACR"]["rfa"]["rate"] - 0.035) < 1e-9
    assert result["acr_challenge"]["triggered"] is False
    assert result["acr_challenge"]["missing"] == 0


def test_other_client_and_2025_are_untouched():
    recap = {"global": {"GLOBAL_ACR": 90000}, "tri": {}}
    assert evaluate_m0291_acr_challenge(recap, "M0005", year=2026) is None
    assert evaluate_m0291_acr_challenge(recap, "M0291", year=2025) is None

    rules = {
        "GLOBAL_ACR": _rule(
            "GLOBAL_ACR",
            RuleScope.GLOBAL,
            tiers_rfa=[{"min": 25000, "rate": 0.035}],
            tiers_bonus=[],
        ),
    }
    with patch("app.services.rfa_calculator.load_contract_rules", return_value=rules):
        result = calculate_rfa(recap, contract=_contract(), code_union="M0005", year=2026)
    assert "acr_challenge" not in result
    assert abs(result["global"]["GLOBAL_ACR"]["rfa"]["rate"] - 0.035) < 1e-9


def test_m0291_level_bareme_classique_combined_goes_from_3_5_to_6():
    """Classique ≥ 75 k€ : RFA 2 % + bonus 1,5 % = 3,5 % remplacés par 6 % fixe."""
    levels = json.dumps([
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
        }
    ])
    recap = {
        "global": {"GLOBAL_ACR": 80000, "GLOBAL_ALLIANCE": 0, "GLOBAL_DCA": 0, "GLOBAL_EXADIS": 0},
        "tri": {},
    }
    with patch("app.services.rfa_calculator.load_contract_rules", return_value={}):
        result = calculate_rfa(
            recap,
            contract=_contract(level_baremes=levels),
            code_union="M0291",
            year=2026,
        )

    acr = result["global"]["GLOBAL_ACR"]
    assert abs(acr["total"]["rate"] - 0.06) < 1e-9
    assert acr["bonus"]["rate"] == 0
    assert abs(acr["total"]["value"] - 4800) < 0.01
    assert abs(result["acr_challenge"]["base_rate"] - 0.035) < 1e-9
    assert abs(result["acr_challenge"]["boosted_rate"] - 0.06) < 1e-9


def test_cotisation_offerte_only_when_acr_exceeds_threshold():
    base = {
        "amount": 500.0,
        "facturee": True,
        "deduite": True,
        "is_offerte": False,
        "is_facture": True,
        "deducted": 500.0,
        "source": "level",
        "label": "Adhérents 2026 · Classique",
    }
    under = apply_m0291_acr_cotisation(dict(base), code_union="M0291", acr_ca=65000, year=2026)
    assert under["is_facture"] is True
    assert under["deducted"] == 500.0
    assert under["acr_challenge"]["triggered"] is False

    over = apply_m0291_acr_cotisation(dict(base), code_union="M0291", acr_ca=65000.01, year=2026)
    assert over["is_offerte"] is True
    assert over["is_facture"] is False
    assert over["deducted"] == 0.0
    assert over["amount"] == 500.0
    assert over["acr_challenge_cotisation"] is True

    other = apply_m0291_acr_cotisation(dict(base), code_union="M0005", acr_ca=90000, year=2026)
    assert other["is_facture"] is True
    assert "acr_challenge" not in other
