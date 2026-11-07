"""
Mesures locales SQLite, données synthétiques. Hors production.

    cd backend && BENCH_ROWS=300000 python scripts/bench_open_kpi.py
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

import app.database as db  # noqa: E402
import app.services.pure_data_cumulative_supabase as cum  # noqa: E402
import app.services.pure_data_monthly_supabase as mon  # noqa: E402
from app.services.network_cache import cached_network_value, invalidate_network_cache  # noqa: E402
from app.services.pure_data_network_dashboard import build_network_dashboard  # noqa: E402
from app.services.pure_data_sales_source import (  # noqa: E402
    load_evolution_grouped_rows,
    load_evolution_rows_for_entity,
    load_evolution_sales_rows,
)


def main() -> None:
    n_rows = int(os.environ.get("BENCH_ROWS", "300000"))
    with tempfile.TemporaryDirectory() as tmp:
        engine = create_engine(
            f"sqlite:///{Path(tmp) / 'bench.db'}",
            connect_args={"check_same_thread": False},
        )
        db.engine = engine
        cum.engine = engine
        mon.engine = engine
        cum._ensure_table()
        rows = []
        started = time.perf_counter()
        for i in range(n_rows):
            rows.append({
                "mois": (i % 12) + 1,
                "annee": 2026 if i % 3 else 2025,
                "code_union": f"FX{i % 400:04d}",
                "raison_sociale": "Fixture",
                "groupe_client": f"G{i % 40:02d}",
                "region_commerciale": "NORD",
                "fournisseur": ("ACR", "DCA", "EXADIS", "ALLIANCE")[i % 4],
                "marque": "BREMBO",
                "groupe_frs": "",
                "famille": "FREINAGE",
                "sous_famille": "X",
                "ca": round((i % 97) + (i % 10) / 10, 2),
                "commercial": "Ada" if i % 5 else "Bob",
            })
            if len(rows) == 5000:
                _insert(engine, rows)
                rows = []
        if rows:
            _insert(engine, rows)
        insert_s = time.perf_counter() - started
        size = (Path(tmp) / "bench.db").stat().st_size

        t0 = time.perf_counter()
        full_rows, _ = load_evolution_sales_rows()
        full_read_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        detail = build_network_dashboard(year_current=2026, year_previous=2025, preloaded_rows=full_rows, preloaded_source="cumulative")
        detail_build_s = time.perf_counter() - t0

        t0 = time.perf_counter()
        grouped, _ = load_evolution_grouped_rows()
        grouped_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        fast = build_network_dashboard(year_current=2026, year_previous=2025, preloaded_rows=grouped, preloaded_source="cumulative")
        fast_build_s = time.perf_counter() - t0

        t0 = time.perf_counter()
        legacy_entity = [r for r in full_rows if (r.get("code_union") or "") == "FX0001"]
        legacy_entity_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        scoped, _ = load_evolution_rows_for_entity(code_union="FX0001")
        scoped_s = time.perf_counter() - t0

        invalidate_network_cache()
        t0 = time.perf_counter()
        cached_network_value("bench", lambda: fast["kpis"])
        cold_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        cached_network_value("bench", lambda: fast["kpis"])
        warm_s = time.perf_counter() - t0

        report = {
            "rows": n_rows,
            "db_bytes": size,
            "insert_s": round(insert_s, 3),
            "full_read_rows": len(full_rows),
            "full_read_s": round(full_read_s, 4),
            "detail_build_s": round(detail_build_s, 4),
            "grouped_rows": len(grouped),
            "grouped_read_s": round(grouped_s, 4),
            "grouped_build_s": round(fast_build_s, 4),
            "kpi_ca_ytd_equal": detail["kpis"]["ca_ytd"] == fast["kpis"]["ca_ytd"],
            "kpi_delta_equal": detail["kpis"]["delta"] == fast["kpis"]["delta"],
            "kpi_clients_equal": detail["kpis"]["nb_clients"] == fast["kpis"]["nb_clients"],
            "entity_legacy_rows": len(legacy_entity),
            "entity_scoped_rows": len(scoped),
            "entity_filter_s": round(legacy_entity_s, 4),
            "entity_scoped_s": round(scoped_s, 4),
            "cache_cold_s": round(cold_s, 4),
            "cache_warm_s": round(warm_s, 6),
            "note": "SQLite local, fixture synthétique, pas une mesure de production",
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if not (report["kpi_ca_ytd_equal"] and report["kpi_delta_equal"] and report["kpi_clients_equal"]):
            raise SystemExit(1)


def _insert(engine, batch):
    cols = list(batch[0].keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    holders = ", ".join(f":{c}" for c in cols)
    with engine.begin() as conn:
        conn.execute(
            text(f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" ({col_sql}) VALUES ({holders})'),
            batch,
        )


if __name__ == "__main__":
    main()
