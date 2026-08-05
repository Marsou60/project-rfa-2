"""
Tests séparation RFA 2025 / RFA 2026 dans resolve_contract.
"""
from types import SimpleNamespace

from app.services.contract_resolver import (
    apply_year_contract_policy,
    is_adherent_2026_contract,
    is_legacy_base_contract,
    is_special_kept_in_2026,
)


class _FakeSession:
    pass


def test_is_adherent_2026_by_name():
    c = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"GOLD"}]')
    assert is_adherent_2026_contract(c) is True


def test_is_legacy_base():
    assert is_legacy_base_contract(SimpleNamespace(name="BASE_STANDARD")) is True
    assert is_legacy_base_contract(SimpleNamespace(name="Privilege 2")) is True
    assert is_legacy_base_contract(SimpleNamespace(name="Contrat Warning")) is False


def test_year_2025_never_keeps_adherent_2026(monkeypatch):
    legacy = SimpleNamespace(name="BASE_STANDARD", level_baremes=None)
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')

    monkeypatch.setattr(
        "app.services.contract_resolver._find_legacy_default",
        lambda session: legacy,
    )
    out = apply_year_contract_policy(modern, 2025, _FakeSession())
    assert out is legacy


def test_year_2026_maps_base_to_adherent_2026(monkeypatch):
    legacy = SimpleNamespace(name="BASE_STANDARD", level_baremes=None)
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')

    monkeypatch.setattr(
        "app.services.contract_resolver._find_adherent_2026",
        lambda session: modern,
    )
    out = apply_year_contract_policy(legacy, 2026, _FakeSession())
    assert out is modern


def test_year_2026_keeps_warning_and_list_specials(monkeypatch):
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')
    monkeypatch.setattr(
        "app.services.contract_resolver._find_adherent_2026",
        lambda session: modern,
    )
    for name in (
        "Contrat Warning",
        "Contrat APC",
        "DPA Montreuil",
        "Groupe Center Pièces Auto",
        "Kit Auto 92",
    ):
        special = SimpleNamespace(name=name, level_baremes=None)
        assert is_special_kept_in_2026(special) is True
        out = apply_year_contract_policy(special, 2026, _FakeSession())
        assert out is special, name


def test_year_2026_maps_bbh_to_adherent_2026(monkeypatch):
    """BBH était spécial 2025 mais est passé sur Adhérents 2026."""
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')
    monkeypatch.setattr(
        "app.services.contract_resolver._find_adherent_2026",
        lambda session: modern,
    )
    bbh = SimpleNamespace(name="Contrat BBH", level_baremes=None)
    assert is_special_kept_in_2026(bbh) is False
    out = apply_year_contract_policy(bbh, 2026, _FakeSession())
    assert out is modern


def test_year_2025_still_keeps_bbh():
    bbh = SimpleNamespace(name="Contrat BBH", level_baremes=None)
    out = apply_year_contract_policy(bbh, 2025, _FakeSession())
    assert out is bbh
