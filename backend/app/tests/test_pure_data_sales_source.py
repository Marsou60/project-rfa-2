"""Tests source hybride evolution (cumulatif detaille + mensuel fallback)."""
from app.services.pure_data_sales_source import load_evolution_sales_rows
import app.services.pure_data_sales_source as src


def test_load_evolution_prefers_multi_month_cumulative(monkeypatch):
    cum = [
        {"fournisseur": "EXADIS", "month": 1, "year": 2026, "ca": 10, "code_union": "A"},
        {"fournisseur": "EXADIS", "month": 2, "year": 2026, "ca": 20, "code_union": "A"},
        {"fournisseur": "DCA", "month": 6, "year": 2026, "ca": 99, "code_union": "A"},  # mono-mois
    ]
    mon = [
        {"fournisseur": "DCA", "month": 1, "year": 2026, "ca": 5, "code_union": "A"},
        {"fournisseur": "DCA", "month": 2, "year": 2026, "ca": 7, "code_union": "A"},
        {"fournisseur": "ACR", "month": 1, "year": 2026, "ca": 3, "code_union": "A"},
    ]

    monkeypatch.setattr(src, "count_cumulative_rows", lambda: len(cum))
    monkeypatch.setattr(src, "read_cumulative_rows", lambda: (cum, [], {}))
    monkeypatch.setattr(src, "count_monthly_rows", lambda: len(mon))
    monkeypatch.setattr(src, "read_monthly_rows", lambda: (mon, [], {}))
    monkeypatch.setattr(src, "_platforms_from_meta", lambda: set())

    rows, source = load_evolution_sales_rows()
    assert source == "hybrid"
    frs = {(r["fournisseur"], r["month"], r["ca"]) for r in rows}
    assert ("EXADIS", 1, 10) in frs
    assert ("EXADIS", 2, 20) in frs
    assert ("DCA", 1, 5) in frs
    assert ("DCA", 2, 7) in frs
    assert ("ACR", 1, 3) in frs
    assert ("DCA", 6, 99) not in frs


def test_load_evolution_keeps_cum_when_no_monthly_for_platform(monkeypatch):
    """Mono-mois cumulatif sans mensuel pour la plateforme → on garde le cumulatif (évite CA=0)."""
    cum = [
        {"fournisseur": "EXADIS", "month": 6, "year": 2026, "ca": 10, "code_union": "A"},
        {"fournisseur": "DCA", "month": 6, "year": 2026, "ca": 20, "code_union": "A"},
    ]
    mon = [
        {"fournisseur": "EXADIS", "month": 1, "year": 2026, "ca": 1, "code_union": "A"},
    ]
    monkeypatch.setattr(src, "count_cumulative_rows", lambda: len(cum))
    monkeypatch.setattr(src, "read_cumulative_rows", lambda: (cum, [], {}))
    monkeypatch.setattr(src, "count_monthly_rows", lambda: len(mon))
    monkeypatch.setattr(src, "read_monthly_rows", lambda: (mon, [], {}))
    monkeypatch.setattr(src, "_platforms_from_meta", lambda: set())

    rows, source = load_evolution_sales_rows()
    assert source == "hybrid"
    frs = {(r["fournisseur"], r["ca"]) for r in rows}
    assert ("EXADIS", 1) in frs  # monthly preferred (cum weak)
    assert ("DCA", 20) in frs  # cum kept — no monthly DCA


def test_load_evolution_meta_forces_cumulative(monkeypatch):
    cum = [
        {"fournisseur": "DCA", "month": 6, "year": 2026, "ca": 99, "code_union": "A"},
    ]
    mon = [
        {"fournisseur": "DCA", "month": 1, "year": 2026, "ca": 5, "code_union": "A"},
    ]
    monkeypatch.setattr(src, "count_cumulative_rows", lambda: len(cum))
    monkeypatch.setattr(src, "read_cumulative_rows", lambda: (cum, [], {}))
    monkeypatch.setattr(src, "count_monthly_rows", lambda: len(mon))
    monkeypatch.setattr(src, "read_monthly_rows", lambda: (mon, [], {}))
    monkeypatch.setattr(src, "_platforms_from_meta", lambda: {"DCA"})

    rows, source = load_evolution_sales_rows()
    assert source == "cumulative"
    assert rows[0]["ca"] == 99
