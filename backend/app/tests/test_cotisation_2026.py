"""Tests barèmes cotisations 2026."""
from app.services.cotisation_2026 import (
    default_cotisation_2026,
    merge_cotisation_status,
    resolve_cotisation_2026_for_entity,
    special_cotisation_amount,
)


def test_level_amounts():
    assert default_cotisation_2026(
        entity_key="M0999", level_based=True, level_id="CLASSIQUE"
    )["amount"] == 500
    assert default_cotisation_2026(
        entity_key="M0999", level_based=True, level_id="SILVER"
    )["amount"] == 1000
    assert default_cotisation_2026(
        entity_key="M0999", level_based=True, level_id="GOLD"
    )["amount"] == 1800


def test_special_fiche_amounts():
    assert special_cotisation_amount("M0027") == 1000  # fiche 5
    assert special_cotisation_amount("M0163") == 500   # fiche 8
    assert special_cotisation_amount("M0248") == 500   # fiche 14
    assert special_cotisation_amount("GROUPE DISCOUNT") == 1800  # fiche 11
    assert special_cotisation_amount("CODIFA") == 1800  # fiche 21
    assert special_cotisation_amount("M0110") == 1800  # Warning


def test_special_overrides_level():
    # Même si level_based, le mapping spécial prime
    d = default_cotisation_2026(
        entity_key="M0110", level_based=True, level_id="CLASSIQUE"
    )
    assert d["amount"] == 1800
    assert d["source"] == "special"


def test_offrir_status():
    default = default_cotisation_2026(
        entity_key="M0027", level_based=False, level_id=None
    )
    setting = type("S", (), {"amount": 1000, "facturee": False, "deduite": False})()
    merged = merge_cotisation_status(default, setting)
    assert merged["is_offerte"] is True
    assert merged["deducted"] == 0
    assert merged["amount"] == 1000


def test_facture_status():
    resolved = resolve_cotisation_2026_for_entity(
        entity_key="GROUPE JUMBO",
        level_based=False,
        level_id=None,
        entity_type="group",
        setting=None,
    )
    assert resolved["amount"] == 1800
    assert resolved["is_facture"] is True
    assert resolved["deducted"] == 1800


def test_group_member_pays_nothing():
    resolved = resolve_cotisation_2026_for_entity(
        entity_key="M0332",
        level_based=True,
        level_id="GOLD",
        entity_type="client",
        groupe_client="CODIFA",
    )
    assert resolved["amount"] == 0
    assert resolved["source"] == "group_member"
    assert resolved["billed_at_group"] == "CODIFA"


def test_independant_union_pays_individually():
    resolved = resolve_cotisation_2026_for_entity(
        entity_key="M0110",
        level_based=False,
        level_id=None,
        entity_type="independent",
        groupe_client="INDEPENDANT UNION",
    )
    assert resolved["amount"] == 1800
    assert resolved["source"] == "special"
