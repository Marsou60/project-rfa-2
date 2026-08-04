"""Tests dashboard réseau Pure Data."""
from app.services.pure_data_network_dashboard import build_network_dashboard
import app.services.pure_data_network_dashboard as dash


def test_build_network_dashboard_kpis_and_platforms(monkeypatch):
    rows = []
    for m in range(1, 7):
        rows.append({
            "year": 2026, "month": m, "fournisseur": "DCA", "code_union": "A1",
            "raison_sociale": "Client A", "marque": "SBS", "famille": "FREINAGE",
            "ca": 1000, "commercial": "Bob", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2025, "month": m, "fournisseur": "DCA", "code_union": "A1",
            "raison_sociale": "Client A", "marque": "SBS", "famille": "FREINAGE",
            "ca": 800, "commercial": "Bob", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2026, "month": m, "fournisseur": "EXADIS", "code_union": "B1",
            "raison_sociale": "Client B", "marque": "TRW", "famille": "FREINAGE",
            "ca": 500, "commercial": "Rayane", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2025, "month": m, "fournisseur": "EXADIS", "code_union": "B1",
            "raison_sociale": "Client B", "marque": "TRW", "famille": "FREINAGE",
            "ca": 400, "commercial": "Rayane", "region_commerciale": "IDF",
        })

    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: (rows, "cumulative"))

    payload = build_network_dashboard(
        year_current=2026,
        year_previous=2025,
        objectif=21000000,
        ca_n1_realise=12000,
        platform_months={"DCA": 6, "EXADIS": 7},
    )
    assert payload["available"] is True
    k = payload["kpis"]
    # 6 mois × (1000 DCA + 500 EXADIS) = 9000
    assert k["ca_ytd"] == 9000.0
    assert k["ca_n1_same_period"] == 7200.0
    assert k["delta"] == 1800.0
    assert k["objectif"] == 21000000
    assert k["nb_clients"] == 2
    assert len(payload["platforms"]) == 2
    dca = next(p for p in payload["platforms"] if p["platform"] == "DCA")
    assert dca["current"] == 6000.0
    assert dca["reporting_month"] == 6
    assert len(payload["months"]) >= 6
    assert payload["top_marques"]


def test_build_network_dashboard_empty(monkeypatch):
    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: ([], ""))
    payload = build_network_dashboard()
    assert payload["available"] is False
