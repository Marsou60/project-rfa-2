"""Copie nocturne notes_clients → onglet dédié. Google et la base sont simulés."""
from __future__ import annotations

import asyncio
import json
import re
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
    """Grille Sheets. Par défaut 1000×26 : au-delà, les cellules sont ignorées tant que la grille n'est pas agrandie."""

    def __init__(self, titles, fail_add=False, grid_rows=1000, grid_cols=26, ignore_expand=False):
        self.log = []
        self.fail_add = fail_add
        self.ignore_expand = ignore_expand
        self.default_rows = grid_rows
        self.default_cols = grid_cols
        self.ids: dict[int, str] = {}
        self.grids: dict[str, dict] = {}
        for index, title in enumerate(titles):
            self._add_title(title, index + 1, grid_rows, grid_cols)

    def _add_title(self, title, sheet_id, rows, cols):
        self.ids[sheet_id] = title
        self.grids[title] = {"rows": rows, "cols": cols, "values": {}}

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **kwargs):
        if "range" in kwargs:
            title, _kind, _bounds = _parse_a1(kwargs["range"])
            return _Call(self.log, "values_get", kwargs, {"values": self._column_a(title)})
        sheets = []
        for sheet_id, title in self.ids.items():
            grid = self.grids[title]
            sheets.append({
                "properties": {
                    "sheetId": sheet_id,
                    "title": title,
                    "gridProperties": {
                        "rowCount": grid["rows"],
                        "columnCount": grid["cols"],
                    },
                }
            })
        return _Call(self.log, "get", kwargs, {"sheets": sheets})

    def batchUpdate(self, **kwargs):
        request = kwargs["body"]["requests"][0]
        error = None
        if "addSheet" in request:
            title = request["addSheet"]["properties"]["title"]
            new_id = 50 if 50 not in self.ids else max(self.ids) + 1
            self._add_title(title, new_id, self.default_rows, self.default_cols)
            result = {"replies": [{"addSheet": {"properties": {"sheetId": new_id, "title": title}}}]}
            if self.fail_add:
                error = RuntimeError("already exists")
                self.fail_add = False
        elif "updateSheetProperties" in request:
            props = request["updateSheetProperties"]["properties"]
            title = self.ids[props["sheetId"]]
            if not self.ignore_expand:
                grid = self.grids[title]
                grid["rows"] = props["gridProperties"]["rowCount"]
                grid["cols"] = props["gridProperties"]["columnCount"]
            result = {"replies": [{}]}
        else:
            raise AssertionError(f"requête Sheets inattendue: {sorted(request)}")
        return _Call(self.log, "batch", kwargs, result, error)

    def clear(self, **kwargs):
        title, _kind, _bounds = _parse_a1(kwargs["range"])
        self.grids[title]["values"].clear()
        return _Call(self.log, "clear", kwargs, {})

    def update(self, **kwargs):
        title, _kind, bounds = _parse_a1(kwargs["range"])
        updated = self._write(title, bounds, kwargs["body"]["values"])
        return _Call(
            self.log,
            "update",
            kwargs,
            {"updatedRows": updated, "updatedRange": kwargs["range"]},
        )

    def _write(self, title, bounds, values) -> int:
        grid = self.grids[title]
        start_row, start_col = bounds
        stored = 0
        for offset, row in enumerate(values):
            row_number = start_row + offset
            if row_number > grid["rows"]:
                break
            for column_offset, cell in enumerate(row):
                column_number = start_col + column_offset
                if column_number > grid["cols"]:
                    break
                grid["values"][(row_number, column_number)] = cell
            stored += 1
        return stored

    def _column_a(self, title):
        grid = self.grids[title]
        if not grid["values"]:
            return []
        last = min(grid["rows"], max(row for row, _col in grid["values"]))
        rows = []
        for row_number in range(1, last + 1):
            cell = grid["values"].get((row_number, 1))
            rows.append([] if cell is None else [cell])
        while rows and not rows[-1]:
            rows.pop()
        return rows


def _column_index(letters: str) -> int:
    index = 0
    for char in letters:
        index = index * 26 + ord(char) - 64
    return index


def _parse_a1(a1: str):
    if a1.startswith("'"):
        title, cells = a1[1:].split("'!", 1)
        title = title.replace("''", "'")
    else:
        title, cells = a1.split("!", 1)
    match = re.fullmatch(r"([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?", cells)
    if not match:
        raise AssertionError(f"plage inattendue: {a1}")
    start_col = _column_index(match.group(1))
    start_row = int(match.group(2) or 1)
    return title, cells, (start_row, start_col)


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
    assert kinds == [
        "get", "clear", "update", "update", "values_get",
        "get", "clear", "update", "update", "values_get",
    ]
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
    assert kinds == ["get", "batch", "get", "clear", "update", "values_get"]
    assert "NOTES CLIENT" not in json.dumps([item for item in race.log if item[0] != "get"])


def test_quoted_tab_name_is_escaped():
    sheets = FakeSheets([])
    title = "Notes d'adhérents"
    copy.replace_tab(sheets, SPREADSHEET, title, [["id"]])
    cleared = [kwargs["range"] for kind, kwargs in sheets.log if kind == "clear"]
    assert cleared == ["'Notes d''adhérents'!A:ZZ"]


def test_write_expands_past_the_default_1000_row_grid():
    """Sans agrandissement, la grille neuve de 1000 lignes abandonne tout ce qui suit l'en-tête et 999 notes."""
    data_rows = 1001
    sheets = FakeSheets([copy.DEFAULT_TAB], grid_rows=1000, grid_cols=26)
    matrix = [["id", "note_simple"]] + [[note_id, f"note {note_id}"] for note_id in range(1, data_rows + 1)]
    written = copy.replace_tab(sheets, SPREADSHEET, copy.DEFAULT_TAB, matrix, chunk_rows=400)
    assert written == data_rows
    grid_requests = [
        kwargs["body"]["requests"][0]["updateSheetProperties"]
        for kind, kwargs in sheets.log
        if kind == "batch" and "updateSheetProperties" in kwargs["body"]["requests"][0]
    ]
    assert len(grid_requests) == 1
    props = grid_requests[0]["properties"]["gridProperties"]
    assert props["rowCount"] >= data_rows + 1
    assert props["columnCount"] >= 2
    kinds = [kind for kind, _kwargs in sheets.log]
    assert kinds.index("batch") < kinds.index("clear")
    values = sheets.grids[copy.DEFAULT_TAB]["values"]
    # Ligne 1 = en-tête. L'id 1000 est donc en ligne 1001, la première qu'une grille de 1000 abandonne.
    assert values[(1001, 1)] == 1000
    assert values[(data_rows + 1, 1)] == data_rows
    assert sheets.grids[copy.DEFAULT_TAB]["rows"] >= data_rows + 1


def test_write_expands_columns_past_the_default_grid():
    sheets = FakeSheets([copy.DEFAULT_TAB], grid_rows=1000, grid_cols=26)
    width = 30
    header = [f"c{index}" for index in range(width)]
    row = list(range(width))
    assert copy.replace_tab(sheets, SPREADSHEET, copy.DEFAULT_TAB, [header, row]) == 1
    grid = sheets.grids[copy.DEFAULT_TAB]
    assert grid["cols"] >= width
    assert grid["values"][(2, width)] == width - 1


def test_truncated_write_fails_and_logs_both_counts(monkeypatch, capsys):
    _use_existing_account(monkeypatch)
    monkeypatch.setattr(copy, "_db_engine", lambda: _engine(LockConn()))
    records = [{"id": note_id, "note_simple": "n"} for note_id in range(1, 1002)]
    monkeypatch.setattr(
        copy, "fetch_notes_clients", lambda conn=None: (["id", "note_simple"], records),
    )
    sheets = FakeSheets([copy.DEFAULT_TAB], grid_rows=1000, grid_cols=26, ignore_expand=True)
    monkeypatch.setattr(copy, "build_sheets_client", lambda info=None: sheets)
    result = copy.run_notes_sheet_copy()
    assert result["status"] == "error"
    assert result["rows_read"] == 1001
    assert result["rows_written"] == 999
    output = capsys.readouterr().out
    assert "[NOTES SHEET COPY] status=error rows_read=1001 rows_written=999" in output
    assert "not-a-real-key" not in output
    assert "personal-refresh-token" not in output


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
