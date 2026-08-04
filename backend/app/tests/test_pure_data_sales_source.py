"""Tests source hybride evolution (cumulatif detaille + mensuel fallback)."""
from app.services.pure_data_sales_source import load_evolution_sales_rows
import app.services.pure_data_sales_source as src


def test_load_evolution_prefers_multi_month_cumulative(monkeypatch):
    cum = [
        {"fournisseur": "EXADIS", "month": 1, "year": 2026, "ca": 10, "code_union": "A"},
        {"fournisseur": "EXADIS", "month": 2, "year": 2026, "ca": 20, "code_union": "A"},
        {"fournisseur": "DCA", "month": 6, "year": 2026, "ca": 99, "code_union": "A"},  # ancien force
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
    # EXADIS from cumulative (2 months), DCA+ACR from monthly
    frs = {(r["fournisseur"], r["month"], r["ca"]) for r in rows}
    assert ("EXADIS", 1, 10) in frs
    assert ("EXADIS", 2, 20) in frs
    assert ("DCA", 1, 5) in frs
    assert ("DCA", 2, 7) in frs
    assert ("ACR", 1, 3) in frs
    # Old single-month DCA from cumulative must NOT be used
    assert ("DCA", 6, 99) not in frs


def test_load_evolution_falls_back_to_monthly_when_no_grain(monkeypatch):
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
    assert source == "monthly"
    assert len(rows) == 1
    assert rows[0]["ca"] == 1
