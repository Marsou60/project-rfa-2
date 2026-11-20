"""Copie nocturne notes_clients → onglet dédié. Google et la base sont simulés."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.services import notes_clients_sheet_copy as copy

SA_JSON = json.dumps({
    "type": "service_account",
    "client_email": "rfa-notes-copy@example.iam.gserviceaccount.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n",
    "token_uri": "https://oauth2.googleapis.com/token",
})
PARIS = ZoneInfo("Europe/Paris")
SPREADSHEET = copy.DEFAULT_SPREADSHEET_ID


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class RecordingConn:
    def __init__(self, columns, records):
        self.columns = columns
        self.records = records
        self.statements = []

    def execute(self, statement, params=None):
        sql = getattr(statement, "text", str(statement))
        self.statements.append(sql)
        if "information_schema" in sql:
            return _Rows([{"column_name": name} for name in self.columns])
        return _Rows(self.records)


class _Call:
    def __init__(self, log, kind, kwargs, result, error=None):
        self.log = log
        self.kind = kind
        self.kwargs = kwargs
        self.result = result
        self.error = error

    def execute(self):
        self.log.append((self.kind, self.kwargs))
        if self.error:
            raise self.error
        return self.result


class FakeSheets:
    """Client Sheets minimal. spreadsheets() et values() renvoient le même objet."""

    def __init__(self, titles, fail_add=False):
        self.titles = list(titles)
        self.log = []
        self.fail_add = fail_add

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **kwargs):
        sheets = [
            {"properties": {"sheetId": index + 1, "title": title}}
            for index, title in enumerate(self.titles)
        ]
        return _Call(self.log, "get", kwargs, {"sheets": sheets})

    def batchUpdate(self, **kwargs):
        title = kwargs["body"]["requests"][0]["addSheet"]["properties"]["title"]
        result = {"replies": [{"addSheet": {"properties": {"sheetId": 50, "title": title}}}]}
        error = None
        if self.fail_add:
            self.titles.append(title)
            error = RuntimeError("already exists")
            self.fail_add = False
        else:
            self.titles.append(title)
        return _Call(self.log, "batch", kwargs, result, error)

    def clear(self, **kwargs):
        return _Call(self.log, "clear", kwargs, {})

    def update(self, **kwargs):
        return _Call(self.log, "update", kwargs, {})


class LockConn:
    def __init__(self, acquired=True, fail_rollback=False):
        self.acquired = acquired
        self.fail_rollback = fail_rollback
        self.calls = []
        self.invalidated = False
        self.closed = False

    def execute(self, statement, params=None):
        sql = getattr(statement, "text", str(statement))
        self.calls.append((sql, params))

        class _Scalar:
            def scalar(_self):
                return self.acquired

        return _Scalar()

    def commit(self):
        self.calls.append(("commit", None))

    def rollback(self):
        self.calls.append(("rollback", None))
        if self.fail_rollback:
            raise RuntimeError("rollback boom")

    def invalidate(self):
        self.invalidated = True

    def close(self):
        self.closed = True


def _engine(conn, dialect="postgresql"):
    return SimpleNamespace(dialect=SimpleNamespace(name=dialect), connect=lambda: conn)


def _forbid_db():
    raise AssertionError("la base ne doit pas être touchée")


def _use_existing_account(monkeypatch, raw=SA_JSON):
    """Compte déjà utilisé par le backend. Pas d'override, pas de fichier, pas d'OAuth Drive."""
    monkeypatch.delenv(copy.SA_ENV, raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", raw)
    monkeypatch.setenv("DRIVE_REFRESH_TOKEN", "personal-refresh-token")
    monkeypatch.setenv("DRIVE_CLIENT_SECRET", "drive-client-secret")


def test_select_is_read_only_and_limited_to_notes_clients():
    sql = copy.build_notes_select(["id", "note_simple", "sheets_synced"])
    upper = sql.upper()
    assert upper.startswith("SELECT ")
    assert "FROM PUBLIC.NOTES_CLIENTS" in upper
    assert 'ORDER BY "id"' in sql
    for forbidden in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "EXPENSE_REPORTS"):
        assert forbidden not in upper
    with pytest.raises(ValueError):
        copy.build_notes_select(["id", "note_simple; delete from expense_reports"])


def test_fetch_issues_only_selects():
    created = datetime(2026, 11, 20, 16, 40, tzinfo=timezone.utc)
    conn = RecordingConn(
        ["id", "code_union", "note_simple", "traite", "created_at"],
        [{
            "id": 7,
            "code_union": "M0001",
            "note_simple": "Passage magasin",
            "traite": False,
            "created_at": created,
        }],
    )
    columns, records = copy.fetch_notes_clients(conn)
    assert columns[0] == "id"
    assert records[0]["note_simple"] == "Passage magasin"
    joined = " ".join(conn.statements).upper()
    assert joined.count("SELECT") == 2
    assert "NOTES_CLIENTS" in joined
    for forbidden in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "EXPENSE_REPORTS"):
        assert forbidden not in joined


def test_cell_values_are_stable_text():
    created = datetime(2026, 11, 20, 16, 40, tzinfo=timezone.utc)
    assert copy.to_cell(None) == ""
    assert copy.to_cell(True) == "true"
    assert copy.to_cell(False) == "false"
    assert copy.to_cell(7) == 7
    assert copy.to_cell(created) == "2026-11-20 17:40:00+01:00"
    assert copy.to_cell("=1+1") == "=1+1"
    long_note = "é" * (copy.MAX_CELL + 25)
    assert len(copy.to_cell(long_note)) == copy.MAX_CELL
    matrix, truncated = copy.to_matrix(["note_simple"], [{"note_simple": long_note}])
    assert truncated == 1
    assert matrix[0] == ["note_simple"]
    assert matrix[1][0] == "é" * copy.MAX_CELL


def test_missing_credentials_skips_without_touching_google_or_db(monkeypatch, capsys):
    monkeypatch.delenv(copy.SA_ENV, raising=False)
    monkeypatch.delenv("GOOGLE_CREDENTIALS_JSON", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.setattr(copy, "_db_engine", _forbid_db)
    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: (_ for _ in ()).throw(AssertionError("sheets")))
    result = copy.run_notes_sheet_copy()
    assert result == {"status": "skipped", "reason": "missing_credentials"}
    assert "GOOGLE_CREDENTIALS_JSON absent" in capsys.readouterr().out


def test_invalid_json_does_not_leak_the_secret(monkeypatch, capsys):
    monkeypatch.setenv(copy.SA_ENV, '{"private_key": "super-secret", "truncated": true')
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps({
        "type": "service_account",
        "client_email": "fallback-should-not-run@example.iam.gserviceaccount.com",
        "private_key": "fallback-key",
    }))
    monkeypatch.setattr(copy, "_db_engine", _forbid_db)
    result = copy.run_notes_sheet_copy()
    assert result["status"] == "error"
    blob = result["error"] + capsys.readouterr().out
    assert "SHEETS_COPY_SA_JSON" in result["error"]
    assert "super-secret" not in blob
    assert "fallback-key" not in blob
    assert "BEGIN PRIVATE KEY" not in blob


def test_refuses_to_target_frozen_tabs(monkeypatch):
    _use_existing_account(monkeypatch)
    monkeypatch.setenv("SHEETS_COPY_TAB", "NOTES CLIENT")
    monkeypatch.setattr(copy, "_db_engine", _forbid_db)
    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: (_ for _ in ()).throw(AssertionError("sheets")))
    result = copy.run_notes_sheet_copy()
    assert result["status"] == "error"
    assert "NOTES CLIENT" in result["error"]
    sheets = FakeSheets(["NOTES CLIENT", "LISTE CLIENT 2", "Frais"])
    for title in ("NOTES CLIENT", "liste client 2", "Frais"):
        with pytest.raises(ValueError):
            copy.replace_tab(sheets, SPREADSHEET, title, [["id"]])
    assert sheets.log == []


def test_full_replace_is_idempotent_and_leaves_other_tabs_alone():
    sheets = FakeSheets(["NOTES CLIENT", "LISTE CLIENT 2", "Frais", copy.DEFAULT_TAB])
    records = [
        {"id": 1, "note_simple": "=1+1"},
        {"id": 2, "note_simple": "première"},
    ]
    matrix, _truncated = copy.to_matrix(["id", "note_simple"], records)
    copy.replace_tab(sheets, SPREADSHEET, copy.DEFAULT_TAB, matrix, chunk_rows=2)
    records[1]["note_simple"] = "corrigée"
    edited, _truncated = copy.to_matrix(["id", "note_simple"], records)
    copy.replace_tab(sheets, SPREADSHEET, copy.DEFAULT_TAB, edited, chunk_rows=2)

    kinds = [kind for kind, _kwargs in sheets.log]
    assert kinds == ["get", "clear", "update", "update", "get", "clear", "update", "update"]
    clears = [kwargs for kind, kwargs in sheets.log if kind == "clear"]
    updates = [kwargs for kind, kwargs in sheets.log if kind == "update"]
    assert len(clears) == 2
    assert all(item["range"] == f"'{copy.DEFAULT_TAB}'!A:ZZ" for item in clears)
    assert all(item["valueInputOption"] == "RAW" for item in updates)
    assert all(item["spreadsheetId"] == SPREADSHEET for item in clears + updates)

    first = []
    for item in updates[:2]:
        first.extend(item["body"]["values"])
    second = []
    for item in updates[2:]:
        second.extend(item["body"]["values"])
    assert first == [["id", "note_simple"], [1, "=1+1"], [2, "première"]]
    assert second == [["id", "note_simple"], [1, "=1+1"], [2, "corrigée"]]
    blob = json.dumps(sheets.log)
    for forbidden in ("NOTES CLIENT", "LISTE CLIENT 2", "Frais", "expense_reports"):
        assert forbidden not in blob


def test_missing_tab_is_created_and_a_race_does_not_touch_other_tabs():
    sheets = FakeSheets(["NOTES CLIENT", "LISTE CLIENT 2", "Frais"])
    written = copy.replace_tab(sheets, SPREADSHEET, copy.DEFAULT_TAB, [["id"], [1]])
    assert written == 1
    batches = [kwargs for kind, kwargs in sheets.log if kind == "batch"]
    assert batches == [{
        "spreadsheetId": SPREADSHEET,
        "body": {"requests": [{"addSheet": {"properties": {"title": copy.DEFAULT_TAB}}}]},
    }]

    race = FakeSheets(["NOTES CLIENT"], fail_add=True)
    copy.replace_tab(race, SPREADSHEET, copy.DEFAULT_TAB, [["id"], [3]])
    kinds = [kind for kind, _kwargs in race.log]
    assert kinds == ["get", "batch", "get", "clear", "update"]
    assert "NOTES CLIENT" not in json.dumps([item for item in race.log if item[0] != "get"])


def test_quoted_tab_name_is_escaped():
    sheets = FakeSheets([])
    title = "Notes d'adhérents"
    copy.replace_tab(sheets, SPREADSHEET, title, [["id"]])
    cleared = [kwargs["range"] for kind, kwargs in sheets.log if kind == "clear"]
    assert cleared == ["'Notes d''adhérents'!A:ZZ"]


def test_lock_busy_skips_the_copy(monkeypatch, capsys):
    _use_existing_account(monkeypatch)
    conn = LockConn(acquired=False)
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(conn))
    monkeypatch.setattr(copy, "fetch_notes_clients", lambda conn=None: (_ for _ in ()).throw(AssertionError("fetch")))
    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: (_ for _ in ()).throw(AssertionError("sheets")))
    result = copy.run_notes_sheet_copy()
    assert result["status"] == "skipped"
    assert result["reason"] == "locked"
    assert conn.closed
    assert ("commit", None) in conn.calls
    assert any(
        "pg_try_advisory_xact_lock" in sql and params == {"key": copy.LOCK_KEY}
        for sql, params in conn.calls
    )
    assert "déjà en cours" in capsys.readouterr().out


def test_sheet_error_is_contained_and_releases_the_lock(monkeypatch, capsys):
    _use_existing_account(monkeypatch)
    conn = LockConn(acquired=True)
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(conn))
    monkeypatch.setattr(
        copy,
        "fetch_notes_clients",
        lambda conn=None: (["id"], [{"id": 1}]),
    )

    class Boom:
        def spreadsheets(self):
            raise RuntimeError("sheets down private_key=should-not-leak")

    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: Boom())
    result = copy.run_notes_sheet_copy()
    assert result["status"] == "error"
    assert "sheets down" not in result["error"]
    assert "should-not-leak" not in result["error"]
    assert conn.closed
    assert ("rollback", None) in conn.calls
    assert ("commit", None) not in conn.calls
    assert any("pg_try_advisory_xact_lock" in sql for sql, _params in conn.calls)
    assert "should-not-leak" not in capsys.readouterr().out


def test_rollback_failure_discards_the_connection(monkeypatch):
    conn = LockConn(fail_rollback=True)
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(conn))
    with pytest.raises(RuntimeError, match="copy failed"):
        with copy.hold_copy_lock() as acquired:
            assert acquired is True
            raise RuntimeError("copy failed")
    assert conn.invalidated
    assert conn.closed


def test_sqlite_does_not_take_a_postgres_lock(monkeypatch):
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(None, dialect="sqlite"))
    with copy.hold_copy_lock() as acquired:
        assert acquired is True


def test_run_logs_row_counts(monkeypatch, capsys):
    _use_existing_account(monkeypatch)
    monkeypatch.delenv("SHEETS_COPY_TAB", raising=False)
    conn = LockConn()
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(conn))
    records = [{"id": 1, "note_simple": "a"}, {"id": 2, "note_simple": "b"}]
    monkeypatch.setattr(copy, "fetch_notes_clients", lambda conn=None: (["id", "note_simple"], records))
    sheets = FakeSheets([copy.DEFAULT_TAB])
    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: sheets)

    first = copy.run_notes_sheet_copy()
    records[1] = {"id": 2, "note_simple": "b modifié"}
    second = copy.run_notes_sheet_copy()

    assert first["rows_read"] == first["rows_written"] == 2
    assert second["rows_written"] == 2
    assert second["tab"] == copy.DEFAULT_TAB
    assert second["spreadsheet_id"] == SPREADSHEET
    assert conn.calls.count(("commit", None)) == 2
    assert any(
        "pg_try_advisory_xact_lock" in sql and params == {"key": copy.LOCK_KEY}
        for sql, params in conn.calls
    )
    out = capsys.readouterr().out
    assert "rows_read=2" in out
    assert "rows_written=2" in out
    assert "BEGIN PRIVATE KEY" not in out
    assert "not-a-real-key" not in out
    values = []
    for _kind, kwargs in sheets.log:
        if _kind == "update":
            values.extend(kwargs["body"]["values"])
    assert [1, "a"] in values
    assert [2, "b"] in values
    assert [2, "b modifié"] in values


def _capture_sheets_client(monkeypatch):
    captured = {}

    def fake_from_info(info, scopes=None):
        captured["email"] = info.get("client_email")
        captured["scopes"] = list(scopes or [])
        captured["blob"] = json.dumps({key: value for key, value in info.items() if key != "private_key"})
        return SimpleNamespace()

    def fake_build(api, version, credentials=None, **_kwargs):
        captured["api"] = (api, version)
        return "sheets-client"

    import google.oauth2.service_account as service_account
    import googleapiclient.discovery as discovery

    monkeypatch.setattr(service_account.Credentials, "from_service_account_info", staticmethod(fake_from_info))
    monkeypatch.setattr(discovery, "build", fake_build)
    return captured


def test_reuses_google_credentials_json_and_ignores_drive_oauth(monkeypatch):
    _use_existing_account(monkeypatch, json.dumps({
        "type": "service_account",
        "client_email": "existing-sa@example.iam.gserviceaccount.com",
        "private_key": "existing-key-material",
    }))
    captured = _capture_sheets_client(monkeypatch)
    assert copy.build_sheets_client() == "sheets-client"
    assert captured["email"] == "existing-sa@example.iam.gserviceaccount.com"
    assert captured["scopes"] == [copy.SHEETS_SCOPE]
    assert captured["api"] == ("sheets", "v4")
    assert "personal-refresh-token" not in captured["blob"]
    assert "drive-client-secret" not in captured["blob"]
    assert "existing-key-material" not in captured["blob"]


def test_application_credentials_file_is_the_same_fallback_as_nathalie(monkeypatch, tmp_path):
    monkeypatch.delenv(copy.SA_ENV, raising=False)
    monkeypatch.delenv("GOOGLE_CREDENTIALS_JSON", raising=False)
    path = tmp_path / "sa.json"
    path.write_text(json.dumps({
        "type": "service_account",
        "client_email": "file-sa@example.iam.gserviceaccount.com",
        "private_key": "file-key-material",
    }), encoding="utf-8")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", str(path))
    monkeypatch.setenv("DRIVE_REFRESH_TOKEN", "personal-refresh-token")
    captured = _capture_sheets_client(monkeypatch)
    assert copy.build_sheets_client() == "sheets-client"
    assert captured["email"] == "file-sa@example.iam.gserviceaccount.com"
    assert "file-key-material" not in captured["blob"]
    assert "personal-refresh-token" not in captured["blob"]


def test_sheets_copy_sa_json_can_override_the_existing_account(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps({
        "type": "service_account",
        "client_email": "existing-sa@example.iam.gserviceaccount.com",
        "private_key": "existing-key-material",
    }))
    monkeypatch.setenv("DRIVE_REFRESH_TOKEN", "personal-refresh-token")
    monkeypatch.setenv(copy.SA_ENV, SA_JSON)
    captured = _capture_sheets_client(monkeypatch)
    assert copy.build_sheets_client() == "sheets-client"
    assert captured["email"] == "rfa-notes-copy@example.iam.gserviceaccount.com"
    assert "existing-sa@" not in captured["blob"]
    assert "personal-refresh-token" not in captured["blob"]
    assert "not-a-real-key" not in captured["blob"]


def test_schedule_is_two_am_paris_and_configurable(monkeypatch):
    monkeypatch.delenv("SHEETS_COPY_AT", raising=False)
    monkeypatch.delenv("SHEETS_COPY_TZ", raising=False)
    before = datetime(2026, 11, 20, 1, 15, tzinfo=PARIS)
    assert copy.next_run_at(before) == datetime(2026, 11, 20, 2, 0, tzinfo=PARIS)
    assert copy.seconds_until_next_run(before) == 45 * 60

    exactly = datetime(2026, 11, 20, 2, 0, tzinfo=PARIS)
    assert copy.next_run_at(exactly) == datetime(2026, 11, 21, 2, 0, tzinfo=PARIS)

    after = datetime(2026, 11, 20, 18, 40, tzinfo=PARIS)
    assert copy.next_run_at(after) == datetime(2026, 11, 21, 2, 0, tzinfo=PARIS)

    gap = datetime(2026, 3, 29, 1, 30, tzinfo=PARIS)
    assert copy.next_run_at(gap) == datetime(2026, 3, 29, 3, 0, tzinfo=PARIS)
    after_gap = datetime(2026, 3, 29, 3, 30, tzinfo=PARIS)
    assert copy.next_run_at(after_gap) == datetime(2026, 3, 30, 2, 0, tzinfo=PARIS)

    monkeypatch.setenv("SHEETS_COPY_AT", "03:30")
    assert copy.next_run_at(before) == datetime(2026, 11, 20, 3, 30, tzinfo=PARIS)
    monkeypatch.setenv("SHEETS_COPY_AT", "pas une heure")
    assert copy.next_run_at(before) == datetime(2026, 11, 20, 2, 0, tzinfo=PARIS)


def test_schedule_enabled_defaults_to_railway(monkeypatch):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("SHEETS_COPY_ENABLED", raising=False)
    assert copy.schedule_enabled() is False
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    assert copy.schedule_enabled() is True
    monkeypatch.setenv("SHEETS_COPY_ENABLED", "0")
    assert copy.schedule_enabled() is False


def test_loop_keeps_running_after_an_error(monkeypatch, capsys):
    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) >= 3:
            raise asyncio.CancelledError()

    def boom():
        raise RuntimeError("PRIVATE KEY in the failure")

    monkeypatch.setattr(copy, "_sleep", fake_sleep)
    monkeypatch.setattr(copy, "seconds_until_next_run", lambda now=None: 12)
    monkeypatch.setattr(copy, "run_notes_sheet_copy", boom)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(copy.notes_sheet_copy_loop())
    assert sleeps == [12, 3600, 12]
    assert "PRIVATE KEY" not in capsys.readouterr().out


def test_admin_endpoint_returns_the_job_result(monkeypatch):
    monkeypatch.setattr(
        "app.services.notes_clients_sheet_copy.run_notes_sheet_copy",
        lambda: {"status": "ok", "rows_read": 2, "rows_written": 2, "tab": copy.DEFAULT_TAB},
    )
    from app.api import copy_notes_clients_to_sheet

    result = asyncio.run(copy_notes_clients_to_sheet(SimpleNamespace()))
    assert result["rows_read"] == 2
    assert result["rows_written"] == 2


def test_admin_endpoint_turns_a_copy_error_into_http_502(monkeypatch):
    monkeypatch.setattr(
        "app.services.notes_clients_sheet_copy.run_notes_sheet_copy",
        lambda: {"status": "error", "error": "RuntimeError"},
    )
    from app.api import copy_notes_clients_to_sheet

    with pytest.raises(HTTPException) as caught:
        asyncio.run(copy_notes_clients_to_sheet(SimpleNamespace()))
    assert caught.value.status_code == 502
    assert caught.value.detail == "RuntimeError"


def test_route_is_admin_only():
    from app.api import require_admin, router

    routes = [
        route for route in router.routes
        if getattr(route, "path", None) == "/admin/notes-clients/sheet-copy"
    ]
    assert len(routes) == 1
    calls = []
    stack = [routes[0].dependant]
    while stack:
        item = stack.pop()
        if item.call:
            calls.append(item.call)
        stack.extend(item.dependencies)
    assert require_admin in calls


def test_column_letter_and_quote():
    assert copy.column_letter(1) == "A"
    assert copy.column_letter(14) == "N"
    assert copy.column_letter(26) == "Z"
    assert copy.column_letter(27) == "AA"
    assert copy.quote_tab("SUPABASE notes_clients") == "'SUPABASE notes_clients'"
