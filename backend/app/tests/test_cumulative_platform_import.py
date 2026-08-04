"""
Tests import Pure Data cumulatif par plateforme + projection décalée.
"""
from app.services.pure_data_cumulative_supabase import (
    filter_rows_for_platform,
    normalize_platform,
    write_cumulative_platform_rows,
    read_cumulative_rows,
    count_cumulative_rows_by_platform,
)
from app.services.pure_data_network_rfa import scale_recap_by_platform_months


def test_normalize_platform():
    assert normalize_platform("dca") == "DCA"
    assert normalize_platform("EXADIS") == "EXADIS"
    assert normalize_platform("Alliance Automotive") == "ALLIANCE"
    assert normalize_platform("inconnu") is None


def test_filter_rows_for_platform_assigns_empty_and_skips_others():
    rows = [
        {"fournisseur": "DCA", "ca": 10, "mois": 1, "annee": 2026},
        {"fournisseur": "", "ca": 20, "mois": 2, "annee": 2026},
        {"fournisseur": "EXADIS", "ca": 30, "mois": 3, "annee": 2026},
    ]
    kept, skipped = filter_rows_for_platform(rows, "DCA")
    assert skipped == 1
    assert len(kept) == 2
    assert all(r["fournisseur"] == "DCA" for r in kept)


def test_scale_recap_by_platform_months_lag():
    recap = {
        "global": {"GLOBAL_DCA": 60000.0, "GLOBAL_EXADIS": 70000.0},
        "tri": {"TRI_DCA_SBS": 1000.0},
    }
    projected, display_factor, display_month = scale_recap_by_platform_months(
        recap,
        platform_months={"DCA": 6, "EXADIS": 7},
        fallback_month=6,
    )
    assert projected is not None
    # DCA juin → ×2 ; EXADIS juillet → ×12/7
    assert projected["global"]["GLOBAL_DCA"] == 120000.0
    assert abs(projected["global"]["GLOBAL_EXADIS"] - round(70000 * 12 / 7, 2)) < 0.01
    assert abs(projected["tri"]["TRI_DCA_SBS"] - 2000.0) < 0.01
    assert display_month == 6
    assert abs(display_factor - 2.0) < 0.01


def test_write_cumulative_platform_rows_keeps_months_and_isolates_platforms(tmp_path, monkeypatch):
    """Replace par plateforme sans écraser les autres ; mois fichier conservés."""
    import app.services.pure_data_cumulative_supabase as cum
    from sqlalchemy import create_engine

    db_path = tmp_path / "test_cumul.db"
    test_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(cum, "engine", test_engine)

    dca_rows = [
        {
            "mois": 1, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "DCA",
            "marque": "SBS", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 100, "commercial": "Bob",
        },
        {
            "mois": 6, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "DCA",
            "marque": "SBS", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 200, "commercial": "Bob",
        },
    ]
    exadis_rows = [
        {
            "mois": 7, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "EXADIS",
            "marque": "TRW", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 50, "commercial": "Bob",
        },
    ]

    r1 = write_cumulative_platform_rows(dca_rows, fournisseur="DCA", reporting_month=6, reporting_year=2026)
    assert r1["rows_inserted"] == 2
    assert r1["months_in_file"] == [1, 6]

    r2 = write_cumulative_platform_rows(exadis_rows, fournisseur="EXADIS", reporting_month=7, reporting_year=2026)
    assert r2["rows_inserted"] == 1

    counts = count_cumulative_rows_by_platform()
    assert counts["DCA"] == 2
    assert counts["EXADIS"] == 1

    # Remplacer DCA jan→juil ne touche pas EXADIS
    dca_july = [
        {
            "mois": m, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "DCA",
            "marque": "SBS", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 10 * m, "commercial": "Bob",
        }
        for m in range(1, 8)
    ]
    r3 = write_cumulative_platform_rows(dca_july, fournisseur="DCA", reporting_month=7, reporting_year=2026)
    assert r3["rows_inserted"] == 7
    assert r3["rows_deleted"] == 2

    counts = count_cumulative_rows_by_platform()
    assert counts["DCA"] == 7
    assert counts["EXADIS"] == 1

    rows, _, _ = read_cumulative_rows()
    dca = [r for r in rows if r["fournisseur"] == "DCA"]
    assert sorted(r["month"] for r in dca) == list(range(1, 8))
    exadis = [r for r in rows if r["fournisseur"] == "EXADIS"]
    assert len(exadis) == 1
    assert exadis[0]["month"] == 7


def test_failed_replace_rolls_back_and_keeps_old_rows(tmp_path, monkeypatch):
    """Si l'INSERT echoue apres le DELETE, rollback → anciennes lignes intactes."""
    import app.services.pure_data_cumulative_supabase as cum
    from sqlalchemy import create_engine, event

    db_path = tmp_path / "test_rollback.db"
    test_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(cum, "engine", test_engine)

    seed = [
        {
            "mois": 1, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "EXADIS",
            "marque": "TRW", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 42, "commercial": "Bob",
        }
    ]
    write_cumulative_platform_rows(seed, fournisseur="EXADIS", reporting_month=1, reporting_year=2026)
    assert count_cumulative_rows_by_platform()["EXADIS"] == 1

    boom = {"n": 0}

    @event.listens_for(test_engine, "before_cursor_execute")
    def _boom(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().upper().startswith("INSERT"):
            boom["n"] += 1
            if boom["n"] >= 1:
                raise RuntimeError("insert simulated failure")

    new_rows = [
        {
            "mois": m, "annee": 2026, "code_union": "A1", "raison_sociale": "Client A",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "EXADIS",
            "marque": "TRW", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 1, "commercial": "Bob",
        }
        for m in range(1, 4)
    ]
    try:
        write_cumulative_platform_rows(new_rows, fournisseur="EXADIS", reporting_month=3, reporting_year=2026)
        assert False, "should have raised"
    except RuntimeError:
        pass

    rows, _, _ = read_cumulative_rows()
    exadis = [r for r in rows if r["fournisseur"] == "EXADIS"]
    assert len(exadis) == 1
    assert float(exadis[0]["ca"]) == 42.0
