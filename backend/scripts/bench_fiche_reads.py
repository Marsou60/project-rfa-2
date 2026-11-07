"""
Benchmark local des lectures de fiche. Données synthétiques SQLite.

Ne mesure pas la production. Commande, depuis backend/ :

    python scripts/bench_fiche_reads.py

BENCH_ROWS (défaut 120000) règle la taille. Le script affiche les temps,
le volume et le plan SQLite avant / après l'index proposé.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, text  # noqa: E402

import app.services.pure_data_cumulative_supabase as cum  # noqa: E402
from app.services.entity_directory import filter_rows_for_entity  # noqa: E402
from app.services.pure_data_cumulative_service import build_cumulative_dashboard  # noqa: E402
from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows  # noqa: E402


def _build(engine, n_rows: int) -> None:
    codes = [f"M{i:04d}" for i in range(400)]
    groups = [f"GROUPE {i:02d}" for i in range(40)]
    platforms = ("ACR", "DCA", "EXADIS", "ALLIANCE")
    brands = ("BREMBO", "LUK", "DELPHI", "DAYCO", "PRODEX")
    families = ("FREINAGE", "TRANSMISSION ET EMBRAYAGE", "FILTRATION")
    batch = []
    for i in range(n_rows):
        code = codes[i % len(codes)]
        batch.append({
            "mois": (i % 12) + 1,
            "annee": 2026 if i % 3 else 2025,
            "code_union": code,
            "raison_sociale": f"Client {code}",
            "groupe_client": groups[i % len(groups)],
            "region_commerciale": "NORD",
            "fournisseur": platforms[i % 4],
            "marque": brands[i % len(brands)],
            "groupe_frs": "",
            "famille": families[i % len(families)],
            "sous_famille": "DETAIL",
            "ca": (i % 97) + (i % 10) / 10,
            "commercial": "Ada",
        })
        if len(batch) == 5000:
            _insert(engine, batch)
            batch = []
    if batch:
        _insert(engine, batch)


def _insert(engine, rows):
    cols = list(rows[0].keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    holders = ", ".join(f":{c}" for c in cols)
    with engine.begin() as conn:
        conn.execute(
            text(f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" ({col_sql}) VALUES ({holders})'),
            rows,
        )


def _plan(engine, sql: str) -> str:
    with engine.connect() as conn:
        rows = conn.execute(text("EXPLAIN QUERY PLAN " + sql)).fetchall()
    return " | ".join(str(row) for row in rows)


def main() -> None:
    n_rows = int(os.environ.get("BENCH_ROWS", "120000"))
    target = "M0001"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "bench.db"
        engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
        cum.engine = engine
        cum._ensure_table()
        t_insert = time.perf_counter()
        _build(engine, n_rows)
        insert_s = time.perf_counter() - t_insert
        size = path.stat().st_size

        t0 = time.perf_counter()
        full, _, _ = cum.read_cumulative_rows()
        full_read_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        legacy = filter_rows_for_entity(full, code_union=target, year=2026)
        legacy_filter_s = time.perf_counter() - t0
        legacy_total = full_read_s + legacy_filter_s

        t0 = time.perf_counter()
        scoped, _, _ = cum.read_cumulative_rows_scoped(code_union=target, years=[2026])
        scoped_s = time.perf_counter() - t0

        group = "GROUPE 01"
        t0 = time.perf_counter()
        legacy_group = [
            r for r in full
            if (r.get("groupe_client") or "").strip().upper() == group and r.get("year") == 2026
        ]
        legacy_group_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        scoped_group, _, _ = cum.read_cumulative_rows_scoped(groupe_client=group, years=[2026])
        scoped_group_s = time.perf_counter() - t0

        dash_old = build_cumulative_dashboard(
            full, year_current=2026, year_previous=2025, code_union=target,
        )
        t0 = time.perf_counter()
        scoped_dash_rows, _, _ = cum.read_cumulative_rows_scoped(code_union=target)
        dash_new = build_cumulative_dashboard(
            scoped_dash_rows, year_current=2026, year_previous=2025, code_union=target,
        )
        dash_s = time.perf_counter() - t0

        same_rows = scoped == legacy
        same_recap = compute_recap_ca_from_rows(scoped) == compute_recap_ca_from_rows(legacy)
        same_dash = dash_old == dash_new

        plan_before = _plan(
            engine,
            'SELECT ca FROM pure_data_cumulative WHERE "code_union" = \'M0001\'',
        )
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX idx_pure_data_cumulative_code_annee "
                "ON pure_data_cumulative (code_union, annee)"
            ))
        plan_after = _plan(
            engine,
            'SELECT ca FROM pure_data_cumulative WHERE "code_union" = \'M0001\'',
        )
        t0 = time.perf_counter()
        scoped_idx, _, _ = cum.read_cumulative_rows_scoped(code_union=target, years=[2026])
        scoped_idx_s = time.perf_counter() - t0

        report = {
            "method": "SQLite fichier temporaire, lignes synthétiques, un process, hors prod",
            "rows": n_rows,
            "clients": 400,
            "groups": 40,
            "db_bytes": size,
            "insert_s": round(insert_s, 3),
            "target": target,
            "legacy_rows_materialized": len(full),
            "scoped_rows_returned": len(scoped),
            "group_target": group,
            "group_rows": len(scoped_group),
            "group_rows_equal": scoped_group == legacy_group,
            "legacy_group_filter_s": round(legacy_group_s, 4),
            "legacy_group_total_s": round(full_read_s + legacy_group_s, 4),
            "scoped_group_s": round(scoped_group_s, 4),
            "legacy_full_read_s": round(full_read_s, 4),
            "legacy_python_filter_s": round(legacy_filter_s, 4),
            "legacy_total_s": round(legacy_total, 4),
            "scoped_s": round(scoped_s, 4),
            "scoped_with_index_s": round(scoped_idx_s, 4),
            "dashboard_scoped_s": round(dash_s, 4),
            "speedup_vs_full_read": round(legacy_total / scoped_s, 2) if scoped_s else None,
            "rows_equal": same_rows and scoped_idx == legacy,
            "recap_equal": same_recap,
            "dashboard_equal": same_dash,
            "explain_before_index": plan_before,
            "explain_after_index": plan_after,
            "limits": [
                "SQLite local, pas Postgres ni le volume réseau de la prod",
                "Le plan concerne l'égalité code_union, forme utilisée après résolution des graphies",
                "L'index n'est créé que dans ce fichier temporaire",
            ],
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if not (same_rows and same_recap and same_dash):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
