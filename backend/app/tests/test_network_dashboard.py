"""Tests dashboard réseau Pure Data."""
from app.services.pure_data_network_dashboard import build_network_dashboard
import app.services.pure_data_network_dashboard as dash


def _sample_rows():
    rows = []
    for m in range(1, 7):
        rows.append({
            "year": 2026, "month": m, "fournisseur": "DCA", "code_union": "A1",
            "raison_sociale": "Client A", "marque": "SBS", "famille": "FREINAGE",
            "sous_famille": "PLAQUETTES", "groupe_client": "GA",
            "ca": 1000, "commercial": "Bob", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2025, "month": m, "fournisseur": "DCA", "code_union": "A1",
            "raison_sociale": "Client A", "marque": "SBS", "famille": "FREINAGE",
            "sous_famille": "PLAQUETTES", "groupe_client": "GA",
            "ca": 800, "commercial": "Bob", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2026, "month": m, "fournisseur": "EXADIS", "code_union": "B1",
            "raison_sociale": "Client B", "marque": "TRW", "famille": "FREINAGE",
            "sous_famille": "DISQUES", "groupe_client": "GB",
            "ca": 500, "commercial": "Rayane", "region_commerciale": "IDF",
        })
        rows.append({
            "year": 2025, "month": m, "fournisseur": "EXADIS", "code_union": "B1",
            "raison_sociale": "Client B", "marque": "TRW", "famille": "FREINAGE",
            "sous_famille": "DISQUES", "groupe_client": "GB",
            "ca": 400, "commercial": "Rayane", "region_commerciale": "IDF",
        })
    # Client mono en baisse forte
    rows.append({
        "year": 2025, "month": 1, "fournisseur": "ACR", "code_union": "C1",
        "raison_sociale": "Client C", "marque": "VALEO", "famille": "EMBRAYAGE",
        "sous_famille": "KIT", "groupe_client": "GC",
        "ca": 20000, "commercial": "Bob", "region_commerciale": "SUD",
    })
    rows.append({
        "year": 2026, "month": 1, "fournisseur": "ACR", "code_union": "C1",
        "raison_sociale": "Client C", "marque": "VALEO", "famille": "EMBRAYAGE",
        "sous_famille": "KIT", "groupe_client": "GC",
        "ca": 5000, "commercial": "Bob", "region_commerciale": "SUD",
    })
    # Client fidèle multi
    for plat in ("DCA", "EXADIS", "ACR", "ALLIANCE"):
        rows.append({
            "year": 2026, "month": 2, "fournisseur": plat, "code_union": "D1",
            "raison_sociale": "Client D", "marque": "SBS", "famille": "FREINAGE",
            "sous_famille": "PLAQUETTES", "groupe_client": "GD",
            "ca": 1000, "commercial": "Rayane", "region_commerciale": "IDF",
        })
    return rows


def test_build_network_dashboard_kpis_and_platforms(monkeypatch):
    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: (_sample_rows(), "cumulative"))

    payload = build_network_dashboard(
        year_current=2026,
        year_previous=2025,
        objectif=21000000,
        ca_n1_realise=12000,
        platform_months={"DCA": 6, "EXADIS": 7},
    )
    assert payload["available"] is True
    k = payload["kpis"]
    assert k["ca_ytd"] > 0
    assert k["objectif"] == 21000000
    assert k["best_month"] is not None
    assert len(payload["platforms"]) >= 2
    assert payload["top_marques"]
    assert payload["alertes"]["n_crit"] >= 1
    assert payload["cross"]["mono"] >= 1
    assert payload["commerciaux"]
    assert payload["regions"]


def test_build_network_dashboard_empty(monkeypatch):
    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: ([], ""))
    payload = build_network_dashboard()
    assert payload["available"] is False


def test_rankings_exclude_prev_only_zeros(monkeypatch):
    rows = [
        {"year": 2026, "month": 1, "fournisseur": "DCA", "code_union": "A1",
         "raison_sociale": "Client A", "marque": "", "famille": "",
         "sous_famille": "", "groupe_client": "", "ca": 1000,
         "commercial": "", "region_commerciale": ""},
        {"year": 2025, "month": 1, "fournisseur": "DCA", "code_union": "A1",
         "raison_sociale": "Client A", "marque": "SBS", "famille": "FREINAGE",
         "sous_famille": "PLAQUETTES", "groupe_client": "GA", "ca": 800,
         "commercial": "Bob", "region_commerciale": "IDF"},
    ]
    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: (rows, "cumulative"))
    payload = build_network_dashboard()
    assert payload["kpis"]["ca_ytd"] == 1000.0
    # CA 2026 sans marque → bucket "Non renseigné", pas une table de marques à 0
    assert any(m["key"] == "Non renseigné" and m["current"] == 1000 for m in payload["marques"])
    assert all(m["current"] > 0 for m in payload["marques"])
    assert all(m["current"] > 0 for m in payload["top_marques"])


def test_alertes_and_cross(monkeypatch):
    monkeypatch.setattr(dash, "load_evolution_sales_rows", lambda: (_sample_rows(), "cumulative"))
    payload = build_network_dashboard(alert_pct=15, alert_ca_min=1000)
    A = payload["alertes"]
    assert any(c["key"] == "Client C" for c in A["clients_risque"])
    X = payload["cross"]
    assert X["n_platforms"] >= 2
    assert X["avg_platforms"] >= 1
    assert any(c["code_union"] == "D1" for c in X["loyal_clients"])
