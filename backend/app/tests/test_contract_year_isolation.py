"""
Tests séparation RFA 2025 / RFA 2026 dans resolve_contract.
"""
from types import SimpleNamespace

from app.services.contract_resolver import (
    apply_year_contract_policy,
    is_adherent_2026_contract,
    is_legacy_base_contract,
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

    def fake_legacy(session):
        return legacy

    monkeypatch.setattr(
        "app.services.contract_resolver._find_legacy_default",
        fake_legacy,
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


def test_year_2026_maps_bbh_and_warning_to_adherent_2026(monkeypatch):
    """Spéciaux 2025 ne suivent plus en RFA 2026 → même contrat Adhérents 2026."""
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')
    monkeypatch.setattr(
        "app.services.contract_resolver._find_adherent_2026",
        lambda session: modern,
    )
    for name in ("Contrat BBH", "Contrat Warning", "APC Auto Pièces", "Groupe Center"):
        special = SimpleNamespace(name=name, level_baremes=None)
        out = apply_year_contract_policy(special, 2026, _FakeSession())
        assert out is modern, name


def test_year_2026_keeps_true_2026_specials(monkeypatch):
    modern = SimpleNamespace(name="Adhérents 2026", level_baremes='[{"id":"CLASSIQUE"}]')
    monkeypatch.setattr(
        "app.services.contract_resolver._find_adherent_2026",
        lambda session: modern,
    )
    for name in ("APA Marseille 2026", "Groupe Discount 2026", "Otto'Parts / Codifa 2026"):
        special = SimpleNamespace(name=name, level_baremes=None)
        out = apply_year_contract_policy(special, 2026, _FakeSession())
        assert out is special, name


def test_year_2025_still_keeps_bbh(monkeypatch):
    """RFA 2025 inchangée : BBH reste BBH."""
    bbh = SimpleNamespace(name="Contrat BBH", level_baremes=None)
    out = apply_year_contract_policy(bbh, 2025, _FakeSession())
    assert out is bbh
