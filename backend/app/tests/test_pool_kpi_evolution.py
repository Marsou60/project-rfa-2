"""
Pool borné, KPI agrégés et évolution ciblée. Données synthétiques.
Les montants du type 46930.94 sont une fixture, pas une validation du client prod.
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


def _queue_engine(url: str):
    kwargs = dict(poolclass=QueuePool, pool_size=2, max_overflow=1, pool_timeout=3)
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


def test_nested_reads_share_one_checkout(tmp_path):
    from app.database import lease_connection, lease_session

    engine = _queue_engine(f"sqlite:///{tmp_path / 'lease.db'}")
    state = _watch(engine)
    import app.database as db
    original = db.engine
    db.engine = engine
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)"))
            conn.execute(text("INSERT INTO t (v) VALUES (1)"))

        def work():
            with lease_session(engine) as session:
                session.execute(text("SELECT v FROM t"))
                with lease_connection(engine) as conn:
                    conn.execute(text("SELECT v FROM t"))
                with lease_session(engine) as again:
                    again.execute(text("SELECT v FROM t"))

        threads = [threading.Thread(target=work) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert state["max"] <= 3
        assert state["out"] == 0
    finally:
        db.engine = original
        engine.dispose()


def test_grouped_kpis_match_line_by_line(tmp_path, monkeypatch):
    """Fixture financière. Pas le client de production."""
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    from app.services.pure_data_network_dashboard import build_network_dashboard
    from app.services.pure_data_sales_source import load_evolution_grouped_rows

    engine = create_engine(f"sqlite:///{tmp_path / 'kpi.db'}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    import app.database as db
    monkeypatch.setattr(db, "engine", engine)
    cum._ensure_table()
    rows = []
    amounts = [46930.94, 62574.59, 0.1, 0.2, 10.25, -3.5, None]
    for i in range(80):
        rows.append({
            "mois": (i % 6) + 1,
            "annee": 2026 if i % 2 == 0 else 2025,
            "code_union": f"FX{i % 5:02d}",
            "raison_sociale": f"Fixture {i % 5}",
            "groupe_client": "GROUPE FIXTURE" if i % 5 < 3 else None,
            "region_commerciale": "NORD",
            "fournisseur": ["ACR", "DCA", "EXADIS", "ALLIANCE"][i % 4],
            "marque": "BREMBO" if i % 3 else None,
            "groupe_frs": "",
            "famille": "FREINAGE",
            "sous_famille": "PLAQUETTES",
            "ca": amounts[i % len(amounts)],
            "commercial": "Ada" if i % 2 == 0 else "Bob",
        })
    cols = list(rows[0].keys())
    with engine.begin() as conn:
        conn.execute(text(
            f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" ({", ".join(chr(34)+c+chr(34) for c in cols)}) '
            f'VALUES ({", ".join(":"+c for c in cols)})'
        ), rows)
    detail = build_network_dashboard(year_current=2026, year_previous=2025, objectif=100000, platform_months={"ACR": 6, "DCA": 6, "EXADIS": 6, "ALLIANCE": 6})
    grouped, _source = load_evolution_grouped_rows()
    fast = build_network_dashboard(
        year_current=2026,
        year_previous=2025,
        objectif=100000,
        platform_months={"ACR": 6, "DCA": 6, "EXADIS": 6, "ALLIANCE": 6},
        preloaded_rows=grouped,
        preloaded_source="cumulative",
    )
    for key in (
        "ca_ytd", "ca_n1_same_period", "delta", "delta_pct", "nb_clients",
        "panier_moyen", "nb_clients_new", "nb_clients_lost", "best_month", "best_month_ca",
        "projection", "objectif_pct",
    ):
        assert fast["kpis"][key] == detail["kpis"][key], key
    assert [(p["platform"], p["current"], p["previous"], p["delta"]) for p in fast["platforms"]] == [
        (p["platform"], p["current"], p["previous"], p["delta"]) for p in detail["platforms"]
    ]
    assert [(m["month"], m["current"], m["previous"]) for m in fast["months"]] == [
        (m["month"], m["current"], m["previous"]) for m in detail["months"]
    ]


def test_entity_evolution_matches_full_scan(tmp_path, monkeypatch):
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    from app.services.pure_data_cumulative_service import _norm_text
    from app.services.pure_data_sales_source import (
        load_evolution_rows_for_entity,
        load_evolution_sales_rows,
    )

    engine = create_engine(f"sqlite:///{tmp_path / 'evo.db'}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    import app.database as db
    monkeypatch.setattr(db, "engine", engine)
    cum._ensure_table()
    mon._ensure_table()
    cum_rows = []
    mon_rows = []
    for i in range(40):
        base = {
            "mois": (i % 4) + 1,
            "annee": 2026 if i % 2 == 0 else "Année 2025",
            "code_union": "FX01" if i % 3 else "FX02",
            "raison_sociale": "Fixture",
            "groupe_client": "GROUPE FIXTURE",
            "region_commerciale": "",
            "fournisseur": "ACR" if i % 2 == 0 else "DCA",
            "marque": "BREMBO",
            "groupe_frs": "",
            "famille": "FREINAGE",
            "sous_famille": "",
            "ca": 100.0 + (i % 7) * 0.1,
            "commercial": "Ada",
        }
        if i % 2 == 0:
            cum_rows.append(base)
        else:
            mon_rows.append(dict(base))
    # DCA seulement en mensuel, un mois : la source globale doit rester mensuelle.
    mon_rows.append({**mon_rows[0], "fournisseur": "DCA", "mois": 2, "code_union": "FX09", "ca": 5})
    def _ins(table, batch):
        cols = list(batch[0].keys())
        with engine.begin() as conn:
            conn.execute(text(
                f'INSERT INTO "{table}" ({", ".join(chr(34)+c+chr(34) for c in cols)}) '
                f'VALUES ({", ".join(":"+c for c in cols)})'
            ), batch)
    _ins(cum.PURE_DATA_CUMULATIVE_TABLE, cum_rows)
    _ins(mon.PURE_DATA_MONTHLY_TABLE, mon_rows)

    full, _src = load_evolution_sales_rows()
    scoped, scoped_src = load_evolution_rows_for_entity(code_union="FX01")
    legacy = [r for r in full if _norm_text(r.get("code_union")) == "FX01"]

    def _sig(rows):
        return sorted(
            (r.get("year"), r.get("month"), r.get("fournisseur"), r.get("code_union"), round(float(r.get("ca") or 0), 4))
            for r in rows
        )

    assert _sig(scoped) == _sig(legacy)
    assert scoped_src == _src


def test_cache_drops_after_cumulative_write(tmp_path, monkeypatch):
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    from app.services.network_cache import cache_generation, cached_network_value, invalidate_network_cache

    engine = create_engine(f"sqlite:///{tmp_path / 'cache.db'}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    import app.database as db
    monkeypatch.setattr(db, "engine", engine)
    cum._ensure_table()
    before = cache_generation()
    calls = {"n": 0}

    def compute():
        calls["n"] += 1
        return {"ca": 1}

    assert cached_network_value("k", compute)["ca"] == 1
    assert cached_network_value("k", compute)["ca"] == 1
    assert calls["n"] == 1
    cum.write_cumulative_platform_rows(
        [{
            "mois": 1, "annee": 2026, "code_union": "FX01", "raison_sociale": "F",
            "groupe_client": "", "region_commerciale": "", "fournisseur": "ACR",
            "marque": "B", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
            "ca": 10, "commercial": "Ada",
        }],
        fournisseur="ACR",
        reporting_month=1,
    )
    assert cache_generation() > before
    assert cached_network_value("k", compute)["ca"] == 1
    assert calls["n"] == 2
    mon._ensure_table()
    before_month = cache_generation()
    mon.append_monthly_rows([{
        "mois": 2, "annee": 2026, "code_union": "FX02", "raison_sociale": "F",
        "groupe_client": "", "region_commerciale": "", "fournisseur": "DCA",
        "marque": "B", "groupe_frs": "", "famille": "FREINAGE", "sous_famille": "",
        "ca": 5, "commercial": "Bob",
    }])
    assert cache_generation() > before_month
    assert cached_network_value("k", compute)["ca"] == 1
    assert calls["n"] == 3
    before_delete = cache_generation()
    mon.delete_monthly_rows(years=[2026], months=[2], fournisseurs=["DCA"])
    assert cache_generation() > before_delete
    assert cached_network_value("k", compute)["ca"] == 1
    assert calls["n"] == 4
    invalidate_network_cache()


def test_source_settings_invalidate_network_cache(tmp_path):
    from sqlmodel import SQLModel

    import app.database as db
    from app.api import _upsert_setting
    from app.services.network_cache import cache_generation

    engine = create_engine(f"sqlite:///{tmp_path / 'settings.db'}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    original = db.engine
    db.engine = engine
    try:
        with Session(engine) as session:
            before = cache_generation()
            _upsert_setting(session, "unrelated_key", "x")
            assert cache_generation() == before
            _upsert_setting(session, "pure_data_cumulative_updated_at", "2026-03-01")
            assert cache_generation() == before + 1
            _upsert_setting(session, "ca_objectif_2026", "100")
            assert cache_generation() == before + 2
    finally:
        db.engine = original
        engine.dispose()


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

    raw_headers = []
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode(), value.encode()))
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": path.split("?", 1)[1].encode() if "?" in path else b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 9),
        "server": ("test", 80),
    }
    if "?" in path:
        scope["path"] = path.split("?", 1)[0]

    async def _run():
        await app(scope, receive, send)

    return _run, status, chunks


def _seed_fiche_fixture(engine):
    """Contrat, annuaire, notes et une ligne ACR 120,50. Fixture, pas la prod."""
    from datetime import datetime, timezone
    import uuid

    from sqlmodel import SQLModel

    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    from app.database import hash_password
    from app.models import Contract, ContractScope, User, UserRole
    from app.services.nathalie_adherents import TABLE, ensure_tables

    SQLModel.metadata.create_all(engine)
    cum._ensure_table()
    mon._ensure_table()
    ensure_tables()
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        session.add(User(
            username="staff-local",
            password_hash=hash_password("local-only"),
            role=UserRole.ADMIN,
            is_active=True,
            display_name="Staff local",
        ))
        session.add(User(
            username="adherent-fx02",
            password_hash=hash_password("local-only"),
            role=UserRole.ADHERENT,
            is_active=True,
            display_name="Adhérent FX02",
            linked_code_union="FX02",
        ))
        session.add(User(
            username="rayane",
            password_hash=hash_password("local-only"),
            role=UserRole.COMMERCIAL,
            is_active=True,
            display_name="Rayane",
        ))
        session.add(Contract(
            name="Fixture adhérent",
            scope=ContractScope.ADHERENT,
            is_default=True,
            is_active=True,
            created_at=now,
            updated_at=now,
        ))
        session.commit()
    dialect = engine.dialect.name
    traite = "0" if dialect == "sqlite" else "FALSE"
    id_sql = "id INTEGER PRIMARY KEY" if dialect == "sqlite" else "id SERIAL PRIMARY KEY"
    with engine.begin() as conn:
        conn.execute(text(
            f'INSERT INTO "{cum.PURE_DATA_CUMULATIVE_TABLE}" '
            "(mois, annee, code_union, raison_sociale, groupe_client, region_commerciale, "
            "fournisseur, marque, groupe_frs, famille, sous_famille, ca, commercial) "
            "VALUES (3, 2026, 'FX01', 'Fixture magasin', 'G', '', 'ACR', 'BREMBO', '', "
            "'FREINAGE', '', 120.5, 'Ada')"
        ))
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS notes_clients ("
            f"{id_sql}, code_union TEXT, type_note TEXT, note_simple TEXT, "
            "note_ia TEXT, auteur TEXT, date_rappel TEXT, traite "
            + ("INTEGER" if dialect == "sqlite" else "BOOLEAN")
            + ", created_at TEXT)"
        ))
        conn.execute(text(
            "INSERT INTO notes_clients (code_union, type_note, note_simple, auteur, traite, created_at) "
            f"VALUES ('FX01', 'NOTE SIMPLE', 'fixture', 'Staff local', {traite}, '2026-03-01')"
        ))
        conn.execute(text(
            f"INSERT INTO {TABLE} (id, code_union, nom_client, created_at, updated_at) "
            "VALUES (:id, 'FX01', 'Fixture magasin', :created, :updated)"
        ), {
            "id": str(uuid.uuid4()),
            "created": now,
            "updated": now,
        })


def _login(app, username):
    login, status, chunks = _asgi(
        app, "POST", "/api/auth/login",
        body=json.dumps({"username": username, "password": "local-only"}).encode(),
        headers={"content-type": "application/json"},
    )
    return login, status, chunks


async def _fiche_burst(app):
    login, status, chunks = _login(app, "staff-local")
    await login()
    assert status["code"] == 200, b"".join(chunks)
    token = json.loads(b"".join(chunks))["token"]
    headers = {"authorization": f"Bearer {token}"}
    paths = [
        "/api/pure-data/cumulative/client-dashboard?code_union=FX01&year_current=2026&year_previous=2025",
        "/api/pure-data/cumulative/client-rfa?code_union=FX01&year=2026",
        "/api/pure-data/monthly/client-evolution?code_union=FX01&year_current=2026&year_previous=2025",
        "/api/nathalie/client/FX01",
        "/api/impayes/by-adherent/FX01",
        "/api/notes/client/FX01",
        "/api/commercial/contract-pdf/meta?mode=client&id=FX01",
        "/api/supplier-logos",
    ]
    started = time.perf_counter()
    runs = [_asgi(app, "GET", path, headers=headers) for path in paths]
    await asyncio.gather(*(run() for run, _st, _ch in runs))
    elapsed = time.perf_counter() - started
    payloads = []
    for _run, st, parts in runs:
        raw = b"".join(parts).decode("utf-8", "replace")
        payloads.append((st.get("code"), json.loads(raw) if raw else {}))
    return elapsed, payloads


def _assert_fiche_numbers(elapsed, payloads, state, engine):
    assert elapsed < 8, elapsed
    assert state["max"] <= 3, state
    assert engine.pool.checkedout() == 0, engine.pool.status()
    codes = [code for code, _body in payloads]
    assert codes == [200] * 8, payloads
    dashboard, rfa, evolution, nathalie, impayes, notes, pdf_meta, logos = (body for _c, body in payloads)
    assert dashboard["available"] is True
    assert dashboard["totals"]["current"] == 120.5
    assert dashboard["totals"]["previous"] == 0.0
    assert rfa["available"] is True
    assert rfa["ca"]["global"]["GLOBAL_ACR"] == 120.5
    assert rfa["ca"]["totals"]["global_total"] == 120.5
    assert evolution["available"] is True
    assert round(sum(point["current"] for point in evolution["months"]), 2) == 120.5
    assert nathalie["client"]["code_union"] == "FX01"
    assert impayes["items"] == []
    assert notes["total"] == 1
    assert "available" in pdf_meta
    assert isinstance(logos, list)


def test_eight_authenticated_gets_do_not_deadlock(tmp_path, monkeypatch):
    engine = _queue_engine(f"sqlite:///{tmp_path / 'api.db'}")
    state = _watch(engine)
    import app.database as db
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    import app.services.nathalie_adherents as nath
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    monkeypatch.setattr(nath, "engine", engine)
    _seed_fiche_fixture(engine)
    from app.main import app
    elapsed, payloads = asyncio.run(_fiche_burst(app))
    _assert_fiche_numbers(elapsed, payloads, state, engine)


def test_postgres_fiche_burst_if_available(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        url = "postgresql+psycopg2://ubuntu@/rfa_lease_test?host=/var/run/postgresql"
    engine = _queue_engine(url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        pytest.skip(f"PostgreSQL local indisponible, salve HTTP non rejouée : {exc}")
    state = _watch(engine)
    import app.database as db
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    import app.services.nathalie_adherents as nath
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    monkeypatch.setattr(nath, "engine", engine)
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    try:
        _seed_fiche_fixture(engine)
        from app.main import app
        elapsed, payloads = asyncio.run(_fiche_burst(app))
        _assert_fiche_numbers(elapsed, payloads, state, engine)
    finally:
        engine.dispose()


def test_lease_threads_do_not_share_session():
    from app.database import bind_lease, leased_session, unbind_lease

    left, right = object(), object()
    seen = {}

    def work(name, session):
        bind_lease(session)
        seen[name] = leased_session()
        unbind_lease(None)

    threads = [
        threading.Thread(target=work, args=("left", left)),
        threading.Thread(target=work, args=("right", right)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert seen["left"] is left
    assert seen["right"] is right
    assert leased_session() is None


def test_lease_releases_connection_after_error(tmp_path):
    from app.database import lease_connection, lease_session

    engine = _queue_engine(f"sqlite:///{tmp_path / 'err.db'}")
    import app.database as db
    original = db.engine
    db.engine = engine
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE t (v INTEGER)"))
        with pytest.raises(RuntimeError):
            with lease_session(engine):
                with lease_connection(engine) as conn:
                    conn.execute(text("SELECT v FROM t"))
                    raise RuntimeError("annulation")
        assert engine.pool.checkedout() == 0
    finally:
        db.engine = original
        engine.dispose()


def test_adherent_cannot_open_another_fiche(tmp_path, monkeypatch):
    engine = _queue_engine(f"sqlite:///{tmp_path / 'authz.db'}")
    import app.database as db
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    import app.services.nathalie_adherents as nath
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    monkeypatch.setattr(nath, "engine", engine)
    _seed_fiche_fixture(engine)
    from app.main import app

    async def scenario():
        login, status, chunks = _login(app, "adherent-fx02")
        await login()
        assert status["code"] == 200
        token = json.loads(b"".join(chunks))["token"]
        headers = {"authorization": f"Bearer {token}"}
        own, own_status, own_body = _asgi(
            app, "GET",
            "/api/pure-data/cumulative/client-dashboard?code_union=FX01",
            headers=headers,
        )
        denied, denied_status, _denied_body = _asgi(
            app, "GET", "/api/impayes/by-adherent/FX01", headers=headers,
        )
        kpis, kpi_status, _kpi_body = _asgi(
            app, "GET", "/api/pure-data/cumulative/network-kpis", headers=headers,
        )
        missing, missing_status, _missing_body = _asgi(
            app, "GET", "/api/pure-data/cumulative/client-dashboard?code_union=FX01",
            headers={"authorization": "Bearer pas-un-jeton"},
        )
        await asyncio.gather(own(), denied(), kpis(), missing())
        own_json = json.loads(b"".join(own_body))
        return (
            own_status["code"],
            own_json,
            denied_status["code"],
            kpi_status["code"],
            missing_status["code"],
            engine.pool.checkedout(),
        )

    own_code, own_json, denied, kpi, anon, left = asyncio.run(scenario())
    # L'adhérent FX02 est forcé sur son code : il ne reçoit pas le CA de FX01.
    assert own_code == 200
    assert (own_json.get("totals") or {}).get("current") != 120.5
    assert denied == 403
    assert kpi == 403
    assert anon == 401
    assert left == 0


def test_commercial_kpis_stay_in_portfolio(tmp_path, monkeypatch):
    engine = _queue_engine(f"sqlite:///{tmp_path / 'scope.db'}")
    import app.database as db
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon
    import app.services.nathalie_adherents as nath
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(cum, "engine", engine)
    monkeypatch.setattr(mon, "engine", engine)
    monkeypatch.setattr(nath, "engine", engine)
    _seed_fiche_fixture(engine)
    from app.main import app

    async def scenario():
        staff_login, staff_status, staff_chunks = _login(app, "staff-local")
        rayane_login, rayane_status, rayane_chunks = _login(app, "rayane")
        await asyncio.gather(staff_login(), rayane_login())
        assert staff_status["code"] == 200
        assert rayane_status["code"] == 200
        staff_token = json.loads(b"".join(staff_chunks))["token"]
        rayane_token = json.loads(b"".join(rayane_chunks))["token"]
        staff, staff_code, staff_body = _asgi(
            app, "GET", "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025",
            headers={"authorization": f"Bearer {staff_token}"},
        )
        scoped, scoped_code, scoped_body = _asgi(
            app, "GET", "/api/pure-data/cumulative/network-kpis?year_current=2026&year_previous=2025&commercial=Ada",
            headers={"authorization": f"Bearer {rayane_token}"},
        )
        await asyncio.gather(staff(), scoped())
        return (
            staff_code["code"],
            json.loads(b"".join(staff_body)),
            scoped_code["code"],
            json.loads(b"".join(scoped_body)),
            engine.pool.checkedout(),
        )

    staff_code, staff_json, scoped_code, scoped_json, left = asyncio.run(scenario())
    assert staff_code == 200
    assert staff_json["kpis"]["ca_ytd"] == 120.5
    assert [(p["platform"], p["current"]) for p in staff_json["platforms"]] == [("ACR", 120.5)]
    # Le paramètre commercial=Ada est ignoré : Rayane reste sur son portefeuille vide.
    assert scoped_code == 200
    assert scoped_json.get("available") is False
    assert scoped_json.get("kpis") is None
    assert left == 0


def test_commercial_cache_keys_do_not_cross():
    from app.services.network_cache import cached_network_value, invalidate_network_cache

    invalidate_network_cache()
    assert cached_network_value("kpi:rayane", lambda: {"ca": 1})["ca"] == 1
    assert cached_network_value("kpi:ada", lambda: {"ca": 2})["ca"] == 2
    assert cached_network_value("kpi:rayane", lambda: {"ca": 9})["ca"] == 1
    invalidate_network_cache()


def test_postgres_lease_if_available():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL absent")
    from app.database import lease_connection, lease_session

    engine = _queue_engine(url)
    state = _watch(engine)
    import app.database as db
    original = db.engine
    db.engine = engine
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS lease_probe (v INTEGER)"))
            conn.execute(text("INSERT INTO lease_probe (v) VALUES (7)"))

        errors = []

        def work():
            try:
                with lease_session(engine) as session:
                    session.execute(text("SELECT v FROM lease_probe"))
                    with lease_connection(engine) as conn:
                        conn.execute(text("SELECT COUNT(*) FROM lease_probe"))
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=work) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert not errors
        assert state["max"] <= 3
    finally:
        db.engine = original
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS lease_probe"))
        engine.dispose()
