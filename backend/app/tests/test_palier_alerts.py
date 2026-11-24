"""Paliers proches et paliers atteints : CA à date, mois déduit des lignes."""
import json
from types import SimpleNamespace

from app.services.palier_alerts import build_palier_alerts
from app.tests.test_adherent_2026_levels import LEVEL_BAREMES


def _contract():
    return SimpleNamespace(
        id=1,
        name="Adhérents 2026",
        level_baremes=json.dumps(LEVEL_BAREMES),
        use_combined_global_rate=False,
    )


def _rules(_contract):
    return {
        "TRI_EXADIS_EMBRAYAGE": SimpleNamespace(
            label="Embrayage LuK",
            tiers=json.dumps([
                {"min": 10000, "rate": 0.02},
                {"min": 20000, "rate": 0.04},
            ]),
            tiers_rfa="[]",
            tiers_bonus="[]",
        )
    }


def _row(**kwargs):
    base = {
        "year": 2026,
        "month": 10,
        "fournisseur": "ACR",
        "code_union": "A1",
        "raison_sociale": "Client A",
        "marque": "TRW",
        "famille": "FREINAGE",
        "sous_famille": "",
        "groupe_client": "",
        "ca": 0,
        "commercial": "Bob",
    }
    base.update(kwargs)
    return base


def test_gap_is_ytd_and_month_comes_from_rows():
    rows = [
        _row(code_union="CLOSE", raison_sociale="Proche", ca=48000, month=10),
        _row(code_union="CROSS", raison_sociale="Franchi", ca=40000, month=9),
        _row(code_union="CROSS", raison_sociale="Franchi", ca=12000, month=10),
        _row(code_union="TRI", raison_sociale="Tripartite", fournisseur="ACR", ca=100000, month=9, marque="TRW"),
        _row(code_union="TRI", raison_sociale="Tripartite", fournisseur="EXADIS", marque="LUK", ca=18000, month=9),
        _row(code_union="TRI", raison_sociale="Tripartite", fournisseur="EXADIS", marque="LUK", ca=3000, month=10),
        _row(code_union="OTHER", raison_sociale="Hors portefeuille", ca=49000, commercial="Rayane"),
    ]
    payload = build_palier_alerts(
        rows,
        year=2026,
        resolve=lambda code, groupe: _contract(),
        rules_for=_rules,
        commercial="Bob",
    )
    assert payload["basis"] == "ca_a_date"
    assert payload["month"] == 10
    assert all(row["code_union"] != "OTHER" for row in payload["proches"] + payload["atteints"])

    close = next(
        row for row in payload["proches"]
        if row["code_union"] == "CLOSE" and row["objective"] == "ACR"
    )
    assert close["current"] == 48000
    assert close["next_palier"] == 50000
    assert close["missing"] == 2000

    crossed = [
        row for row in payload["atteints"]
        if row["code_union"] == "CROSS" and row["objective"] == "ACR"
    ]
    assert [row["palier"] for row in crossed] == [50000.0]

    tri_hit = next(
        row for row in payload["atteints"]
        if row["code_union"] == "TRI" and row["kind"] == "tripartite"
    )
    assert tri_hit["palier"] == 20000
    assert tri_hit["objective"] == "Embrayage LuK"


def test_later_import_moves_the_month():
    rows = [
        _row(ca=40000, month=10),
        _row(ca=12000, month=11),
    ]
    payload = build_palier_alerts(
        rows,
        year=2026,
        resolve=lambda code, groupe: _contract(),
        rules_for=_rules,
    )
    assert payload["month"] == 11
    assert any(row["palier"] == 50000 for row in payload["atteints"])
