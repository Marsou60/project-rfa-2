"""
Équivalence des lectures ciblées, threadpool des routes bloquantes, plafond de pool.
Données synthétiques locales. Aucune base distante.
"""
from __future__ import annotations

import asyncio
import inspect
import threading
import time
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import TimeoutError as SATimeout
from sqlalchemy.pool import QueuePool


def _engine(tmp_path, name="scope.db"):
    return create_engine(
        f"sqlite:///{tmp_path / name}",
        connect_args={"check_same_thread": False},
    )


def _bind(monkeypatch, engine):
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon

    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    return cum, mon


def _insert(engine, table, rows):
    if not rows:
        return
    cols = list(rows[0].keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    holders = ", ".join(f":{c}" for c in cols)
    with engine.begin() as conn:
        conn.execute(text(f'INSERT INTO "{table}" ({col_sql}) VALUES ({holders})'), rows)


def _base_row(**overrides):
    row = {
        "mois": 3,
        "annee": 2026,
        "code_union": "M0001",
        "raison_sociale": "Garage",
        "groupe_client": "GROUPE A",
        "region_commerciale": "NORD",
        "fournisseur": "ACR",
        "marque": "BREMBO",
        "groupe_frs": "",
        "famille": "FREINAGE",
        "sous_famille": "PLAQUETTES",
        "ca": 10.0,
        "commercial": "Ada",
    }
    row.update(overrides)
    return row


def _legacy_filter(rows, *, code_union=None, code_unions=None, groupe_client=None, year=None):
    from app.services.entity_directory import filter_rows_for_entity
    from app.services.rfa_fusion import filter_rows_for_codes

    if code_unions:
        rows = filter_rows_for_codes(rows, code_unions)
        if year is not None:
            rows = [r for r in rows if r.get("year") == year]
        return rows
    return filter_rows_for_entity(
        rows, code_union=code_union, groupe_client=groupe_client, year=year
    )


def test_scoped_reads_match_full_scan_on_edge_cases(tmp_path, monkeypatch):
    cum, mon = _bind(monkeypatch, _engine(tmp_path))
    cum._ensure_table()
    mon._ensure_table()

    rows = [
        _base_row(code_union="M0001", raison_sociale="Ancien", annee=2024, ca=0.1, mois=1),
        _base_row(code_union="M0001", raison_sociale="Nouveau", annee=2026, ca=0.1, mois=2, fournisseur="ACR PLUS"),
        _base_row(code_union="M0001", raison_sociale="Nouveau", annee=2025, ca=0.2, mois=None, marque="LUK", famille="TRANSMISSION ET EMBRAYAGE"),
        _base_row(code_union="  m0002 ", raison_sociale="Deux", groupe_client="Autre", ca=None, annee=2026),
        _base_row(code_union="M0003", raison_sociale="Trois", ca=15.5, annee=2026),
        _base_row(code_union="M0003 - MON GARAGE", raison_sociale="Trois libellé", ca=-3.25, annee=2026),
        _base_row(code_union="M0003X", raison_sociale="Pas le préfixe", ca=999.0, annee=2026),
        _base_row(code_union="étab", raison_sociale="Accent", groupe_client="Société Été", ca=7.0, annee=2026),
        _base_row(code_union="ÉTAB", raison_sociale="Accent 2", groupe_client="société été", ca=1.5, annee=2025),
        _base_row(code_union="M0004", raison_sociale="Année texte", annee="Année 2026", ca=4.0, fournisseur="EXADIS", marque="PRODEX"),
        _base_row(code_union="M0004", raison_sociale="Faux 2026", annee=20260, ca=12345.67),
        _base_row(code_union="M0004", raison_sociale="Nulle", annee=None, ca=8.0),
        _base_row(code_union="M0005", raison_sociale="Kbis", groupe_client="", ca=2.0, annee=2026, fournisseur="ALLIANCE", marque="DELPHI", famille="FREINAGE"),
        _base_row(code_union="M0005 - Kbis", raison_sociale="Kbis long", groupe_client="   ", ca=3.0, annee=2026),
        _base_row(code_union="M0006", raison_sociale="", groupe_client=None, ca=5.0, annee=2026),
        _base_row(code_union="M0007\n", raison_sociale="Saut de ligne", groupe_client="GROUPE A", ca=6.5, annee=2026),
        _base_row(code_union="M0001\u00a0", raison_sociale="Insecable", groupe_client="GROUPE A", ca=1.25, annee=2026),
        _base_row(code_union="ZZZZ", raison_sociale="Bruit", groupe_client="INDEPENDANT UNION", ca=50.0, annee=2025, fournisseur="DCA", marque="DAYCO"),
    ]
    # Intercaler beaucoup de 0,1 pour que l'ordre de somme soit visible.
    for i in range(30):
        rows.append(_base_row(
            code_union="M0001" if i % 2 == 0 else "ZZZZ",
            annee=2026 if i % 3 else 2025,
            ca=0.1,
            mois=(i % 12) + 1,
            marque="BOSCH" if i % 2 == 0 else "DAYCO",
            fournisseur="ACR" if i % 2 == 0 else "DCA",
            famille="FREINAGE",
        ))
    _insert(cum.engine, cum.PURE_DATA_CUMULATIVE_TABLE, rows)
    _insert(mon.engine, mon.PURE_DATA_MONTHLY_TABLE, rows)

    full, _, _ = cum.read_cumulative_rows()
    directory = cum.read_cumulative_directory_rows()
    assert [
        (r.get("code_union"), r.get("raison_sociale"), r.get("groupe_client"))
        for r in full
    ] == [
        (r.get("code_union"), r.get("raison_sociale"), r.get("groupe_client"))
        for r in directory
    ]

    from app.services.entity_directory import _ingest_rows

    left_c, left_g, right_c, right_g = {}, {}, {}, {}
    _ingest_rows(full, left_c, left_g)
    _ingest_rows(directory, right_c, right_g)
    assert left_c == right_c
    assert left_g == right_g
    assert left_c["M0001"]["nom_client"] == "Ancien"

    queries = [
        {"code_union": "M0001"},
        {"code_union": "m0002"},
        {"code_union": "M0003 - MON GARAGE"},
        {"code_union": "ÉTAB"},
        {"code_union": "M0007"},
        {"code_union": "M0001", "years": [2026]},
        {"code_union": "M0004", "years": [2026]},
        {"groupe_client": "GROUPE A"},
        {"groupe_client": "Société Été"},
        {"groupe_client": ""},
        {"code_unions": ["M0001", "M0005 - Kbis"]},
        {"code_unions": ["M0001", "M0005"], "years": [2025, 2026]},
        {"years": [2026]},
        {"code_union": "ABSENT"},
        {"groupe_client": "PERSONNE"},
    ]
    from app.services.pure_data_cumulative_service import build_cumulative_dashboard
    from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows

    for query in queries:
        scoped, _, _ = cum.read_cumulative_rows_scoped(**query)
        year = query["years"][0] if query.get("years") and len(query["years"]) == 1 else None
        if query.get("years") and len(query["years"]) != 1:
            legacy = _legacy_filter(
                full,
                code_union=query.get("code_union"),
                code_unions=query.get("code_unions"),
                groupe_client=query.get("groupe_client"),
            )
            wanted = set(query["years"])
            legacy = [r for r in legacy if r.get("year") in wanted]
        else:
            legacy = _legacy_filter(
                full,
                code_union=query.get("code_union"),
                code_unions=query.get("code_unions"),
                groupe_client=query.get("groupe_client"),
                year=year,
            )
        assert scoped == legacy, query
        assert compute_recap_ca_from_rows(scoped) == compute_recap_ca_from_rows(legacy)

        monthly_scoped, _, _ = mon.read_monthly_rows_scoped(**query)
        monthly_full, _, _ = mon.read_monthly_rows()
        if query.get("years") and len(query["years"]) != 1:
            monthly_legacy = _legacy_filter(
                monthly_full,
                code_union=query.get("code_union"),
                code_unions=query.get("code_unions"),
                groupe_client=query.get("groupe_client"),
            )
            monthly_legacy = [r for r in monthly_legacy if r.get("year") in set(query["years"])]
        else:
            monthly_legacy = _legacy_filter(
                monthly_full,
                code_union=query.get("code_union"),
                code_unions=query.get("code_unions"),
                groupe_client=query.get("groupe_client"),
                year=year,
            )
        assert monthly_scoped == monthly_legacy, query

    dash_queries = [
        {"code_union": "M0001", "groupe_client": None, "code_unions": None},
        {"code_union": "M0003 - MON GARAGE", "groupe_client": None, "code_unions": None},
        {"code_union": "ÉTAB", "groupe_client": None, "code_unions": None},
        {"code_union": None, "groupe_client": "Société Été", "code_unions": None},
        {"code_union": None, "groupe_client": "GROUPE A", "code_unions": None},
        {"code_union": None, "groupe_client": None, "code_unions": ["M0001", "M0005 - Kbis"]},
    ]
    for kwargs in dash_queries:
        scope = {k: kwargs[k] for k in ("code_union", "groupe_client", "code_unions") if kwargs[k]}
        # code_union / groupe vides ne doivent pas être passés comme filtre SQL
        if kwargs["code_unions"]:
            scope = {"code_unions": kwargs["code_unions"]}
        elif kwargs["code_union"]:
            scope = {"code_union": kwargs["code_union"]}
        else:
            scope = {"groupe_client": kwargs["groupe_client"]}
        scoped_rows, _, _ = cum.read_cumulative_rows_scoped(**scope)
        common = dict(
            year_current=2026,
            year_previous=2025,
            fournisseur="ACR",
            **kwargs,
        )
        assert build_cumulative_dashboard(full, **common) == build_cumulative_dashboard(scoped_rows, **common)
        common["fournisseur"] = None
        assert build_cumulative_dashboard(full, **common) == build_cumulative_dashboard(scoped_rows, **common)


def test_entity_loader_uses_cumulative_then_monthly(tmp_path, monkeypatch):
    cum, mon = _bind(monkeypatch, _engine(tmp_path, "loader.db"))
    cum._ensure_table()
    mon._ensure_table()
    _insert(cum.engine, cum.PURE_DATA_CUMULATIVE_TABLE, [
        _base_row(code_union="ONLYCUM", annee=2026, ca=11.0),
        _base_row(code_union="BOTH", annee=2026, ca=3.0),
    ])
    _insert(mon.engine, mon.PURE_DATA_MONTHLY_TABLE, [
        _base_row(code_union="ONLYMON", annee=2026, ca=9.0),
        _base_row(code_union="BOTH", annee=2026, ca=100.0),
    ])
    from app.services.entity_directory import load_pure_data_rows_for_entity
    from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows

    cum_rows, src = load_pure_data_rows_for_entity(code_union="ONLYCUM", year=2026)
    assert src == "cumulative"
    assert compute_recap_ca_from_rows(cum_rows)["global"]["GLOBAL_ACR"] == 11.0

    mon_rows, src = load_pure_data_rows_for_entity(code_union="ONLYMON", year=2026)
    assert src == "monthly"
    assert compute_recap_ca_from_rows(mon_rows)["global"]["GLOBAL_ACR"] == 9.0

    both, src = load_pure_data_rows_for_entity(code_union="BOTH", year=2026)
    assert src == "cumulative"
    assert round(sum(r["ca"] for r in both), 2) == 3.0

    empty, src = load_pure_data_rows_for_entity(code_union="NOPE", year=2026)
    assert empty == []
    assert src == ""


def test_code_union_index_is_used_by_sqlite(tmp_path, monkeypatch):
    cum, _mon = _bind(monkeypatch, _engine(tmp_path, "plan.db"))
    cum._ensure_table()
    _insert(cum.engine, cum.PURE_DATA_CUMULATIVE_TABLE, [
        _base_row(code_union=f"M{i:04d}", ca=float(i)) for i in range(50)
    ])
    with cum.engine.begin() as conn:
        before = conn.execute(text(
            'EXPLAIN QUERY PLAN SELECT ca FROM pure_data_cumulative WHERE "code_union" = \'M0001\''
        )).fetchall()
        conn.execute(text(
            "CREATE INDEX idx_pure_data_cumulative_code_annee ON pure_data_cumulative (code_union, annee)"
        ))
        after = conn.execute(text(
            'EXPLAIN QUERY PLAN SELECT ca FROM pure_data_cumulative WHERE "code_union" = \'M0001\''
        )).fetchall()
    before_txt = " | ".join(str(row) for row in before)
    after_txt = " | ".join(str(row) for row in after)
    assert "SCAN" in before_txt.upper()
    assert "idx_pure_data_cumulative_code_annee" in after_txt
    assert "USING INDEX" in after_txt.upper()


def test_preloaded_lookups_stay_on_their_thread():
    from app.services.rfa_calculator import load_contract_rules, use_preloaded_rfa_lookups

    barrier = threading.Barrier(2)
    found = {}

    def work(name):
        with use_preloaded_rfa_lookups(lambda _c, name=name: {name: name}, lambda *_a: {"no": []}):
            barrier.wait(timeout=2)
            time.sleep(0.05)
            found[name] = load_contract_rules(SimpleNamespace(id=1))

    threads = [threading.Thread(target=work, args=(name,)) for name in ("aa", "bb")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert found == {"aa": {"aa": "aa"}, "bb": {"bb": "bb"}}


def test_pool_defaults_are_five_plus_five_for_one_process(monkeypatch):
    from app.database import (
        APP_DB_CONNECTION_BUDGET,
        DEFAULT_DB_MAX_OVERFLOW,
        DEFAULT_DB_POOL_SIZE,
        RECOMMENDED_MAX_WORKERS,
        postgres_pool_settings,
    )

    monkeypatch.delenv("DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("DB_MAX_OVERFLOW", raising=False)
    assert DEFAULT_DB_POOL_SIZE == 5
    assert DEFAULT_DB_MAX_OVERFLOW == 5
    assert RECOMMENDED_MAX_WORKERS == 1
    per_process = DEFAULT_DB_POOL_SIZE + DEFAULT_DB_MAX_OVERFLOW
    assert per_process == APP_DB_CONNECTION_BUDGET
    assert APP_DB_CONNECTION_BUDGET < 60
    settings = postgres_pool_settings()
    assert settings["pool_size"] == 5
    assert settings["max_overflow"] == 5
    assert settings["pool_pre_ping"] is True
    monkeypatch.setenv("DB_POOL_SIZE", "2")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "1")
    narrowed = postgres_pool_settings()
    assert narrowed["pool_size"] == 2
    assert narrowed["max_overflow"] == 1


def test_queue_pool_never_exceeds_two_connections():
    engine = create_engine(
        "sqlite://",
        poolclass=QueuePool,
        pool_size=2,
        max_overflow=0,
        pool_timeout=0.2,
        connect_args={"check_same_thread": False},
    )
    state = {"out": 0, "max": 0}
    lock = threading.Lock()

    from sqlalchemy import event

    @event.listens_for(engine, "checkout")
    def _checkout(*_args):
        with lock:
            state["out"] += 1
            state["max"] = max(state["max"], state["out"])

    @event.listens_for(engine, "checkin")
    def _checkin(*_args):
        with lock:
            state["out"] -= 1

    first = engine.connect()
    second = engine.connect()
    with pytest.raises(SATimeout):
        engine.connect()
    assert state["max"] == 2
    first.close()
    second.close()
    engine.dispose()


async def _asgi_get(app, path: str, query: bytes = b""):
    status = {}
    chunks = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status["code"] = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body") or b"")

    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": query,
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("test", 80),
    }
    await app(scope, receive, send)
    return status["code"], b"".join(chunks)


def test_blocking_routes_run_together_and_real_routes_are_offloaded():
    from fastapi import APIRouter, FastAPI

    from app.threadpool_route import ThreadpoolAPIRoute

    app = FastAPI()
    router = APIRouter(route_class=ThreadpoolAPIRoute)

    @router.get("/block")
    async def block():
        time.sleep(0.35)
        return {"ok": True}

    @router.get("/ping")
    async def ping():
        await asyncio.sleep(0.05)
        return {"ok": True}

    @router.get("/echo")
    async def echo(n: int = 1):
        return {"n": n}

    app.include_router(router)

    async def _run():
        started = time.perf_counter()
        results = await asyncio.gather(
            _asgi_get(app, "/block"),
            _asgi_get(app, "/block"),
            _asgi_get(app, "/block"),
            _asgi_get(app, "/ping"),
            _asgi_get(app, "/echo", b"n=4"),
        )
        return time.perf_counter() - started, results

    elapsed, results = asyncio.run(_run())
    assert [code for code, _body in results] == [200, 200, 200, 200, 200]
    assert b'"n":4' in results[-1][1].replace(b" ", b"")
    # 3 × 0,35 s en série = 1,05 s. Le chevauchement reste sous 0,8 s.
    assert elapsed < 0.8, elapsed

    from app.api import router as api_router

    dashboard = next(
        route for route in api_router.routes
        if getattr(route, "path", "") == "/pure-data/cumulative/client-dashboard"
    )
    upload = next(route for route in api_router.routes if getattr(route, "path", "") == "/upload")
    rfa = next(
        route for route in api_router.routes
        if getattr(route, "path", "") == "/pure-data/cumulative/client-rfa"
    )
    assert not asyncio.iscoroutinefunction(dashboard.endpoint)
    assert not asyncio.iscoroutinefunction(rfa.endpoint)
    assert asyncio.iscoroutinefunction(upload.endpoint)
    assert "code_union" in inspect.signature(dashboard.endpoint).parameters
    assert "groupe_client" in inspect.signature(rfa.endpoint).parameters
