"""
Dix sessions sur un pool borné. Fixture synthétique, pas un client de production.
Les montants 46930.94 et 62574.59 servent à vérifier l'égalité, pas la prod.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.pool import QueuePool
from sqlmodel import Session


def _engine(url: str, pool_size: int, overflow: int):
    kwargs = dict(
        poolclass=QueuePool,
        pool_size=pool_size,
        max_overflow=overflow,
        pool_timeout=3,
    )
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


def _watch(engine):
    state = {"out": 0, "max": 0}
    lock = threading.Lock()

    @event.listens_for(engine, "checkout")
    def _out(*_a):
        with lock:
            state["out"] += 1
            state["max"] = max(state["max"], state["out"])

    @event.listens_for(engine, "checkin")
    def _in(*_a):
        with lock:
            state["out"] -= 1

    return state


def _reset_cache():
    from app.services.network_cache import (
        invalidate_network_cache,
        reset_heavy_calc_stats,
        wait_for_network_refresh,
    )

    wait_for_network_refresh(1)
    invalidate_network_cache()
    reset_heavy_calc_stats()


def test_ten_waiters_share_one_compute():
    from app.services.network_cache import cached_network_value, heavy_calc_max

    _reset_cache()
    calls = {"n": 0}
    inside = threading.Event()

    def compute():
        calls["n"] += 1
        inside.set()
        time.sleep(0.2)
        return {"ca": 3}

    results = []

    def work():
        results.append(cached_network_value('{"kind":"kpi"}', compute)["ca"])

    threads = [threading.Thread(target=work) for _ in range(10)]
    for thread in threads:
        thread.start()
    assert inside.wait(2)
    time.sleep(0.05)
    assert calls["n"] == 1
    assert heavy_calc_max() == 1
    for thread in threads:
        thread.join(3)
    assert results == [3] * 10
    assert calls["n"] == 1


def test_stale_same_generation_returns_without_waiting_for_refresh():
    import app.services.network_cache as cache

    _reset_cache()
    key = '{"kind":"kpi","com":"scope-a"}'
    assert cache.cached_network_value(key, lambda: {"ca": 1})["ca"] == 1
    cache._TTL_S = 0.01
    try:
        time.sleep(0.02)
        gate = threading.Event()
        calls = {"n": 0}

        def compute():
            calls["n"] += 1
            gate.wait(2)
            return {"ca": 9}

        started = time.perf_counter()
        assert cache.cached_network_value(key, compute)["ca"] == 1
        elapsed = time.perf_counter() - started
        assert elapsed < 0.15, elapsed
        gate.set()
        cache.wait_for_network_refresh()
        cache._TTL_S = 90.0
        assert calls["n"] == 1
        assert cache.cached_network_value(key, compute)["ca"] == 9
        assert calls["n"] == 1
    finally:
        cache._TTL_S = 90.0


def test_inflight_value_is_dropped_when_generation_changes():
    from app.services.network_cache import cached_network_value, invalidate_network_cache

    _reset_cache()
    key = '{"kind":"kpi","com":"scope-b"}'
    started = threading.Event()
    release = threading.Event()
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        if calls["n"] == 1:
            started.set()
            assert release.wait(2)
            return {"ca": 1}
        return {"ca": 2}

    results = []

    def work():
        results.append(cached_network_value(key, compute)["ca"])

    threads = [threading.Thread(target=work) for _ in range(10)]
    for thread in threads:
        thread.start()
    assert started.wait(2)
    invalidate_network_cache()
    release.set()
    for thread in threads:
        thread.join(3)
    assert results == [2] * 10
    assert calls["n"] == 2


def test_leader_failure_retries_once_not_per_waiter():
    from app.services.network_cache import cached_network_value, heavy_calc_max

    _reset_cache()
    key = '{"kind":"full"}'
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("echec volontaire")
        return {"ca": 7}

    results = []

    def work():
        results.append(cached_network_value(key, compute)["ca"])

    threads = [threading.Thread(target=work) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(3)
    assert results == [7] * 10
    assert calls["n"] == 2
    assert heavy_calc_max() == 1


def test_distinct_scopes_do_not_share_values():
    from app.services.network_cache import cached_network_value

    _reset_cache()
    staff = cached_network_value('{"kind":"kpi","com":null}', lambda: {"ca": 109515.78})
    rayane = cached_network_value('{"kind":"kpi","com":"Rayane"}', lambda: {"ca": 62574.59})
    agathe = cached_network_value('{"kind":"kpi","com":"Agathe"}', lambda: {"ca": 10.25})
    assert staff["ca"] == 109515.78
    assert rayane["ca"] == 62574.59
    assert agathe["ca"] == 10.25
    assert cached_network_value('{"kind":"kpi","com":"Rayane"}', lambda: {"ca": 1})["ca"] == 62574.59


def _asgi(app, method, path, body=b"", headers=None):
    status = {}
    chunks = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status["code"] = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body") or b"")

    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path.split("?", 1)[0],
        "raw_path": path.encode(),
        "query_string": path.split("?", 1)[1].encode() if "?" in path else b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 9),
        "server": ("test", 80),
    }

    async def _run():
        await app(scope, receive, send)

    return _run, status, chunks


def _login(app, username):
    return _asgi(
        app, "POST", "/api/auth/login",
        body=json.dumps({"username": username, "password": "local-only"}).encode(),
        headers={"content-type": "application/json"},
    )


def _seed(engine):
    from datetime import datetime, timezone

    from sqlmodel import SQLModel

    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    from app.database import hash_password
    from app.models import User, UserRole
    from app.services.impayes_service import ensure_tables

    SQLModel.metadata.create_all(engine)
    cum._ensure_table()
    mon._ensure_table()
    ensure_tables()
    with Session(engine) as session:
        session.add(User(
            username="staff-local",
            password_hash=hash_password("local-only"),
            role=UserRole.ADMIN,
            is_active=True,
            display_name="Staff local",
        ))
        session.add(User(
            username="rayane",
            password_hash=hash_password("local-only"),
            role=UserRole.COMMERCIAL,
            is_active=True,
            display_name="Rayane",
        ))
        session.add(User(
            username="agathe",
            password_hash=hash_password("local-only"),
            role=UserRole.COMMERCIAL,
            is_active=True,
            display_name="Agathe",
        ))
        session.add(User(
            username="adherent-fx02",
            password_hash=hash_password("local-only"),
            role=UserRole.ADHERENT,
            is_active=True,
            display_name="Adhérent FX02",
            linked_code_union="FX02",
        ))
        session.commit()
    with engine.begin() as conn:
        conn.execute(text(
            f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" '
            "(mois, annee, code_union, raison_sociale, groupe_client, region_commerciale, "
            "fournisseur, marque, groupe_frs, famille, sous_famille, ca, commercial) VALUES "
            "(3, 2026, 'FX01', 'Fixture Ada', '', '', 'ACR', 'BREMBO', '', 'FREINAGE', '', 46930.94, 'Ada'),"
            "(3, 2026, 'FX02', 'Fixture Rayane', '', '', 'ACR', 'BREMBO', '', 'FREINAGE', '', 62574.59, 'Rayane'),"
            "(4, 2026, 'FX03', 'Fixture Agathe', '', '', 'DCA', 'VALEO', '', 'FILTRATION', '', 10.25, 'Agathe'),"
            "(3, 2025, 'FX01', 'Fixture Ada', '', '', 'ACR', 'BREMBO', '', 'FREINAGE', '', 0.1, 'Ada')"
        ))


def _bind(monkeypatch, engine):
    import app.database as db
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    import app.services.impayes_service as impayes

    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    monkeypatch.setattr(impayes, "engine", engine)


async def _auth(app, username):
    run, status, chunks = _login(app, username)
    await run()
    assert status["code"] == 200, b"".join(chunks)
    return json.loads(b"".join(chunks))["token"]


def test_waiters_do_not_keep_a_connection(tmp_path, monkeypatch):
    engine = _engine(f"sqlite:///{tmp_path / 'wait.db'}", 2, 1)
    state = _watch(engine)
    _bind(monkeypatch, engine)
    _seed(engine)
    _reset_cache()
    import app.services.pure_data_sales_source as sales

    samples = []

    def slow_grouped():
        time.sleep(0.2)
        samples.append(engine.pool.checkedout())
        time.sleep(0.2)
        samples.append(engine.pool.checkedout())
        return [], ""

    monkeypatch.setattr(sales, "load_evolution_grouped_rows", slow_grouped)
    from app.main import app

    async def scenario():
        token = await _auth(app, "staff-local")
        headers = {"authorization": f"Bearer {token}"}
        runs = [
            _asgi(app, "GET", "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025", headers=headers)
            for _ in range(10)
        ]
        await asyncio.gather(*(run() for run, _st, _ch in runs))
        return [st["code"] for _run, st, _ch in runs]

    started = time.perf_counter()
    codes = asyncio.run(scenario())
    elapsed = time.perf_counter() - started
    assert codes == [200] * 10
    assert samples and max(samples) == 1
    assert elapsed < 3, elapsed
    assert engine.pool.checkedout() == 0
    assert state["out"] == 0


def _expected_staff_ca(engine):
    from app.services.pure_data_network_dashboard import build_network_dashboard
    from app.services.pure_data_sales_source import load_evolution_grouped_rows, load_evolution_sales_rows

    detail, _src = load_evolution_sales_rows()
    grouped, source = load_evolution_grouped_rows()
    slow = build_network_dashboard(
        year_current=2026, year_previous=2025, objectif=21000000.0, preloaded_rows=detail, preloaded_source="cumulative",
    )
    fast = build_network_dashboard(
        year_current=2026, year_previous=2025, objectif=21000000.0, preloaded_rows=grouped, preloaded_source=source,
    )
    assert fast["kpis"]["ca_ytd"] == slow["kpis"]["ca_ytd"]
    assert fast["kpis"]["ca_ytd"] == 109515.78
    assert 46930.94 + 62574.59 + 10.25 == 109515.78
    rayane = build_network_dashboard(
        year_current=2026, year_previous=2025, commercial="Rayane", objectif=21000000.0,
        preloaded_rows=grouped, preloaded_source=source,
    )
    agathe = build_network_dashboard(
        year_current=2026, year_previous=2025, commercial="Agathe", objectif=21000000.0,
        preloaded_rows=grouped, preloaded_source=source,
    )
    assert rayane["kpis"]["ca_ytd"] == 62574.59
    assert agathe["kpis"]["ca_ytd"] == 10.25
    return fast["kpis"]["ca_ytd"]


def test_scopes_keep_exact_amounts(tmp_path, monkeypatch):
    engine = _engine(f"sqlite:///{tmp_path / 'amt.db'}", 2, 1)
    _bind(monkeypatch, engine)
    _seed(engine)
    _reset_cache()
    expected = _expected_staff_ca(engine)
    _reset_cache()
    from app.main import app

    async def scenario():
        staff, rayane, agathe, adherent = await asyncio.gather(
            _auth(app, "staff-local"),
            _auth(app, "rayane"),
            _auth(app, "agathe"),
            _auth(app, "adherent-fx02"),
        )
        paths = {
            "staff": (staff, "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025"),
            "rayane": (rayane, "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025&commercial=Ada"),
            "agathe": (agathe, "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025"),
            "denied": (adherent, "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025"),
            "flags": (adherent, "/api/impayes/flags"),
        }
        runs = {
            name: _asgi(app, "GET", path, headers={"authorization": f"Bearer {token}"})
            for name, (token, path) in paths.items()
        }
        await asyncio.gather(*(run() for run, _st, _ch in runs.values()))
        out = {}
        for name, (_run, status, chunks) in runs.items():
            raw = b"".join(chunks)
            out[name] = (status["code"], json.loads(raw) if raw else {})
        return out

    body = asyncio.run(scenario())
    assert body["staff"][0] == 200
    assert body["staff"][1]["kpis"]["ca_ytd"] == expected
    assert body["rayane"][0] == 200
    assert body["rayane"][1]["kpis"]["ca_ytd"] == 62574.59
    assert body["agathe"][0] == 200
    assert body["agathe"][1]["kpis"]["ca_ytd"] == 10.25
    assert body["denied"][0] == 403
    assert body["flags"][0] == 200
    assert engine.pool.checkedout() == 0


def _burst(app, token, pool_state):
    headers = {"authorization": f"Bearer {token}"}

    async def scenario():
        runs = []
        for _ in range(10):
            runs.append(_asgi(app, "GET", "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025", headers=headers))
            runs.append(_asgi(app, "GET", "/api/pure-data/cumulative/network-dashboard?year_current=2026&year_previous=2025&full=true", headers=headers))
            runs.append(_asgi(app, "GET", "/api/impayes/flags", headers=headers))
        started = time.perf_counter()
        await asyncio.gather(*(run() for run, _st, _ch in runs))
        elapsed = time.perf_counter() - started
        codes = [st["code"] for _run, st, _ch in runs]
        return elapsed, codes

    return asyncio.run(scenario())


def test_ten_of_each_endpoint_on_pool_two_plus_one(tmp_path, monkeypatch):
    from app.services.network_cache import heavy_calc_max

    engine = _engine(f"sqlite:///{tmp_path / 'burst2.db'}", 2, 1)
    state = _watch(engine)
    _bind(monkeypatch, engine)
    _seed(engine)
    _reset_cache()
    from app.main import app

    async def login():
        return await _auth(app, "staff-local")

    token = asyncio.run(login())
    elapsed, codes = _burst(app, token, state)
    assert codes == [200] * 30, codes
    assert elapsed < 8, elapsed
    assert heavy_calc_max() == 1
    assert engine.pool.checkedout() == 0
    assert state["out"] == 0


def test_ten_of_each_endpoint_on_pool_five_plus_five(tmp_path, monkeypatch):
    from app.services.network_cache import heavy_calc_max

    engine = _engine(f"sqlite:///{tmp_path / 'burst5.db'}", 5, 5)
    state = _watch(engine)
    _bind(monkeypatch, engine)
    _seed(engine)
    _reset_cache()
    from app.main import app
    token = asyncio.run(_auth(app, "staff-local"))
    elapsed, codes = _burst(app, token, state)
    assert codes == [200] * 30, codes
    assert elapsed < 8, elapsed
    assert heavy_calc_max() == 1
    assert engine.pool.checkedout() == 0


def test_import_during_compute_does_not_publish_the_old_total(tmp_path, monkeypatch):
    engine = _engine(f"sqlite:///{tmp_path / 'inv.db'}", 2, 1)
    _bind(monkeypatch, engine)
    _seed(engine)
    _reset_cache()
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_sales_source as sales
    from app.services.network_cache import invalidate_network_cache

    started = threading.Event()
    release = threading.Event()
    real = sales.load_evolution_grouped_rows
    snapshot = real()
    calls = {"n": 0}

    def blocked():
        calls["n"] += 1
        if calls["n"] == 1:
            started.set()
            assert release.wait(3)
            return snapshot
        return real()

    monkeypatch.setattr(sales, "load_evolution_grouped_rows", blocked)
    from app.main import app

    async def one():
        token = await _auth(app, "staff-local")
        run, status, chunks = _asgi(
            app, "GET",
            "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025",
            headers={"authorization": f"Bearer {token}"},
        )
        task = asyncio.create_task(run())
        return token, task, status, chunks

    async def scenario():
        token, task, status, chunks = await one()
        for _ in range(50):
            if started.is_set():
                break
            await asyncio.sleep(0.02)
        assert started.is_set()
        with engine.begin() as conn:
            conn.execute(text(
                f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" '
                "(mois, annee, code_union, raison_sociale, groupe_client, region_commerciale, "
                "fournisseur, marque, groupe_frs, famille, sous_famille, ca, commercial) "
                "VALUES (5, 2026, 'FX09', 'Ajout', '', '', 'ACR', 'BREMBO', '', 'FREINAGE', '', 1.5, 'Ada')"
            ))
        invalidate_network_cache()
        release.set()
        await task
        body = json.loads(b"".join(chunks))
        return status["code"], body

    code, body = asyncio.run(scenario())
    assert code == 200
    assert calls["n"] == 2
    assert body["kpis"]["ca_ytd"] == 109517.28
    assert engine.pool.checkedout() == 0


def test_postgres_ten_sessions_if_available(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL") or "postgresql+psycopg2://ubuntu@/rfa_lease_test?host=/var/run/postgresql"
    probe = _engine(url, 2, 1)
    try:
        with probe.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        pytest.skip(f"PostgreSQL local indisponible : {exc}")
    probe.dispose()
    from app.services.network_cache import heavy_calc_max

    engine = _engine(url, 2, 1)
    _bind(monkeypatch, engine)
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    try:
        _seed(engine)
        _reset_cache()
        from app.main import app
        token = asyncio.run(_auth(app, "staff-local"))
        elapsed, codes = _burst(app, token, None)
        assert codes == [200] * 30, codes
        assert elapsed < 8, elapsed
        assert heavy_calc_max() == 1
        assert engine.pool.checkedout() == 0
        rayane = asyncio.run(_auth(app, "rayane"))
        run, status, chunks = _asgi(
            app, "GET",
            "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025&commercial=Ada",
            headers={"authorization": f"Bearer {rayane}"},
        )
        asyncio.run(run())
        body = json.loads(b"".join(chunks))
        assert status["code"] == 200
        assert body["kpis"]["ca_ytd"] == 62574.59
    finally:
        engine.dispose()
