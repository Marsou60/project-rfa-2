"""Copie nocturne de public.notes_clients vers un onglet dédié du Google Sheet.

La table Supabase reste la source. L'onglet est une copie intégrale : on le vide,
puis on réécrit l'en-tête et toutes les lignes. Les autres onglets (NOTES CLIENT,
LISTE CLIENT 2, Frais) ne sont ni lus ni modifiés. Aucune écriture en base.

Le compte Google est celui déjà utilisé par le backend (`GOOGLE_CREDENTIALS_JSON`,
le même que LISTE CLIENT 2). `SHEETS_COPY_SA_JSON` ne sert que de remplacement
optionnel. Les variables OAuth `DRIVE_*` ne sont pas lues.
"""
from __future__ import annotations

import json
import os
import re
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterator, Optional, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import text

DEFAULT_SPREADSHEET_ID = "1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0"
DEFAULT_TAB = "SUPABASE notes_clients"
DEFAULT_AT = "02:00"
DEFAULT_TZ = "Europe/Paris"
SA_ENV = "SHEETS_COPY_SA_JSON"
EXISTING_SA_ENV = "GOOGLE_CREDENTIALS_JSON"
# Verrou de session, propre à cette copie. Ne pas le réutiliser ailleurs.
LOCK_KEY = 7482910031202602
CHUNK_ROWS = 200
MAX_CELL = 49000
# Taille d'un onglet Google Sheets neuf. On ne s'y fie pas : la grille est élargie avant l'écriture.
DEFAULT_GRID_ROWS = 1000
DEFAULT_GRID_COLS = 26
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
# Onglets déjà utilisés. Un mauvais SHEETS_COPY_TAB ne doit pas les vider.
FROZEN_TABS = frozenset({"notes client", "liste client 2", "frais"})
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SECRET_MARKERS = ("PRIVATE KEY", "private_key", "refresh_token")

COLUMNS_SQL = """
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notes_clients'
ORDER BY ordinal_position
"""

PARIS = ZoneInfo(DEFAULT_TZ)


def _db_engine():
    from app.database import engine
    return engine


def schedule_enabled() -> bool:
    """Boucle nocturne : active sur Railway, sauf SHEETS_COPY_ENABLED=0."""
    default = "1" if os.environ.get("RAILWAY_ENVIRONMENT") else "0"
    return os.environ.get("SHEETS_COPY_ENABLED", default).strip().lower() in {
        "1", "true", "yes", "on",
    }


def public_error(exc: BaseException) -> str:
    """Message d'erreur sans secret et sans contenu de note."""
    name = type(exc).__name__
    detail = str(exc).replace("\n", " ").strip()
    if any(marker in detail for marker in _SECRET_MARKERS):
        return name
    if len(detail) > 240:
        detail = detail[:240] + "…"
    return f"{name}: {detail}" if detail else name


def parse_service_account_json(raw: str, source: str = EXISTING_SA_ENV) -> dict:
    try:
        info = json.loads(raw)
        if isinstance(info, str):
            info = json.loads(info)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{source} n'est pas du JSON valide") from exc
    return _require_service_account(info, source)


def _require_service_account(info: Any, source: str) -> dict:
    if not isinstance(info, dict):
        raise ValueError(f"{source} doit être un objet JSON")
    if info.get("type") != "service_account" or not info.get("client_email") or not info.get("private_key"):
        raise ValueError(f"{source} n'est pas une clé de compte de service")
    return info


def credentials_available() -> bool:
    """Vrai si l'override ou le compte de service déjà utilisé par le backend est présent."""
    if os.environ.get(SA_ENV, "").strip():
        return True
    if os.environ.get(EXISTING_SA_ENV, "").strip():
        return True
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    return bool(path and os.path.isfile(path))


def load_service_account_info() -> dict:
    """Compte de service : override optionnel, sinon le même JSON que le reste du backend.

    Ordre : SHEETS_COPY_SA_JSON, puis GOOGLE_CREDENTIALS_JSON, puis le fichier
    GOOGLE_APPLICATION_CREDENTIALS (comme nathalie_service). Jamais DRIVE_*.
    """
    override = os.environ.get(SA_ENV, "").strip()
    if override:
        return parse_service_account_json(override, SA_ENV)
    raw = os.environ.get(EXISTING_SA_ENV, "").strip()
    if raw:
        return parse_service_account_json(raw, EXISTING_SA_ENV)
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if path and os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as handle:
                loaded = json.load(handle)
        except json.JSONDecodeError as exc:
            raise ValueError("GOOGLE_APPLICATION_CREDENTIALS n'est pas du JSON valide") from exc
        return _require_service_account(loaded, "GOOGLE_APPLICATION_CREDENTIALS")
    raise ValueError(f"{EXISTING_SA_ENV} absent")


def configured_spreadsheet_id() -> str:
    raw = os.environ.get("SHEETS_COPY_SPREADSHEET_ID", "").strip()
    return raw or DEFAULT_SPREADSHEET_ID


def assert_dedicated_tab(title: str) -> str:
    cleaned = (title or "").strip()
    if not cleaned:
        raise ValueError("Onglet de copie vide")
    if cleaned.casefold() in FROZEN_TABS:
        raise ValueError(
            f"Onglet « {cleaned} » protégé. La copie écrit uniquement dans un onglet "
            f"dédié (par défaut « {DEFAULT_TAB} »)."
        )
    if len(cleaned) > 100:
        raise ValueError("Nom d'onglet trop long")
    return cleaned


def configured_tab() -> str:
    raw = os.environ.get("SHEETS_COPY_TAB", "").strip()
    return assert_dedicated_tab(raw or DEFAULT_TAB)


def quote_ident(name: str) -> str:
    if not _IDENT.match(name or ""):
        raise ValueError(f"Colonne refusée: {name!r}")
    return '"' + name.replace('"', '""') + '"'


def build_notes_select(columns: Sequence[str]) -> str:
    """SELECT en lecture seule, limité à public.notes_clients."""
    if not columns:
        raise ValueError("notes_clients n'a aucune colonne")
    quoted = [quote_ident(column) for column in columns]
    order = quote_ident("id" if "id" in columns else columns[0])
    return (
        "SELECT " + ", ".join(quoted)
        + " FROM public.notes_clients ORDER BY " + order
    )


def fetch_notes_clients(conn=None) -> tuple[list[str], list[dict]]:
    def _read(connection) -> tuple[list[str], list[dict]]:
        column_rows = connection.execute(text(COLUMNS_SQL)).mappings().all()
        columns = [row["column_name"] for row in column_rows]
        if not columns:
            raise ValueError("Table public.notes_clients introuvable ou sans colonne")
        records = connection.execute(text(build_notes_select(columns))).mappings().all()
        return columns, [dict(row) for row in records]

    if conn is not None:
        return _read(conn)
    with _db_engine().connect() as owned:
        return _read(owned)


def to_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(PARIS)
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return ""
        return value
    if isinstance(value, Decimal):
        return format(value, "f")
    rendered = str(value)
    if len(rendered) > MAX_CELL:
        return rendered[:MAX_CELL]
    return rendered


def to_matrix(columns: Sequence[str], records: Sequence[dict]) -> tuple[list[list], int]:
    truncated = 0
    matrix: list[list] = [list(columns)]
    for record in records:
        row = []
        for column in columns:
            cell = to_cell(record.get(column))
            if isinstance(cell, str) and len(cell) == MAX_CELL:
                original = record.get(column)
                if isinstance(original, str) and len(original) > MAX_CELL:
                    truncated += 1
            row.append(cell)
        matrix.append(row)
    return matrix, truncated


def column_letter(index: int) -> str:
    if index < 1:
        raise ValueError("Les colonnes commencent à 1")
    letters = []
    while index:
        index, rem = divmod(index - 1, 26)
        letters.append(chr(65 + rem))
    return "".join(reversed(letters))


def quote_tab(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def _parse_hhmm(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", (value or "").strip())
    if not match:
        return 2, 0
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return 2, 0
    return hour, minute


def copy_schedule() -> tuple[int, int, ZoneInfo]:
    tz_name = (os.environ.get("SHEETS_COPY_TZ") or DEFAULT_TZ).strip() or DEFAULT_TZ
    at = (os.environ.get("SHEETS_COPY_AT") or DEFAULT_AT).strip() or DEFAULT_AT
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo(DEFAULT_TZ)
    hour, minute = _parse_hhmm(at)
    return hour, minute, tz


def _local_clock(day: datetime, hour: int, minute: int) -> datetime:
    """Heure locale du même jour. Si le changement d'heure saute ce créneau, on prend l'heure suivante."""
    tz = day.tzinfo
    if tz is None:
        raise ValueError("fuseau manquant")
    local = day.astimezone(tz)
    for extra in range(0, 4):
        slot_hour = hour + extra
        slot_minute = minute if extra == 0 else 0
        if slot_hour > 23:
            break
        candidate = datetime(
            local.year, local.month, local.day, slot_hour, slot_minute, tzinfo=tz,
        )
        back = candidate.astimezone(timezone.utc).astimezone(tz)
        if (back.date(), back.hour, back.minute) == (
            candidate.date(), candidate.hour, candidate.minute,
        ):
            return candidate
    raise RuntimeError("Heure de copie introuvable dans le fuseau")


def next_run_at(now: Optional[datetime] = None) -> datetime:
    hour, minute, tz = copy_schedule()
    if now is None:
        current = datetime.now(tz)
    elif now.tzinfo is None:
        current = now.replace(tzinfo=tz)
    else:
        current = now.astimezone(tz)
    target = _local_clock(current, hour, minute)
    if target <= current:
        target = _local_clock(current + timedelta(days=1), hour, minute)
    return target


def seconds_until_next_run(now: Optional[datetime] = None) -> float:
    hour, minute, tz = copy_schedule()
    if now is None:
        current = datetime.now(tz)
    elif now.tzinfo is None:
        current = now.replace(tzinfo=tz)
    else:
        current = now.astimezone(tz)
    delta = (next_run_at(current) - current).total_seconds()
    if delta <= 0:
        return 24 * 60 * 60
    return delta


def build_sheets_client(info: Optional[dict] = None):
    """Client Sheets du compte de service déjà utilisé par le backend."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    payload = info if info is not None else load_service_account_info()
    credentials = service_account.Credentials.from_service_account_info(
        payload,
        scopes=[SHEETS_SCOPE],
    )
    return build("sheets", "v4", credentials=credentials)


def _sheet_properties(service, spreadsheet_id: str) -> list[dict]:
    meta = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
    ).execute()
    properties = []
    for sheet in meta.get("sheets") or []:
        props = sheet.get("properties") or {}
        properties.append(props)
    return properties


def _grid_size(props: dict) -> tuple[int, int]:
    grid = props.get("gridProperties") or {}
    try:
        rows = int(grid.get("rowCount") or 0)
    except (TypeError, ValueError):
        rows = 0
    try:
        cols = int(grid.get("columnCount") or 0)
    except (TypeError, ValueError):
        cols = 0
    return rows, cols


def ensure_tab(service, spreadsheet_id: str, title: str) -> tuple[int, int, int]:
    """Crée l'onglet dédié s'il manque. N'envoie jamais d'autre modification.

    Retourne l'identifiant de l'onglet et la taille actuelle de sa grille.
    """
    title = assert_dedicated_tab(title)
    for props in _sheet_properties(service, spreadsheet_id):
        if props.get("title") == title:
            rows, cols = _grid_size(props)
            return int(props["sheetId"]), rows, cols
    try:
        created = service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
        ).execute()
    except Exception:
        for props in _sheet_properties(service, spreadsheet_id):
            if props.get("title") == title:
                rows, cols = _grid_size(props)
                return int(props["sheetId"]), rows, cols
        raise
    replies = created.get("replies") or [{}]
    props = (replies[0].get("addSheet") or {}).get("properties") or {}
    rows, cols = _grid_size(props)
    return int(props.get("sheetId")), rows or DEFAULT_GRID_ROWS, cols or DEFAULT_GRID_COLS


def expand_tab_grid(
    service,
    spreadsheet_id: str,
    sheet_id: int,
    current_rows: int,
    current_cols: int,
    needed_rows: int,
    needed_cols: int,
) -> None:
    """Agrandit la grille. Un onglet neuf n'a que 1000 lignes : au-delà, l'API les abandonne."""
    known_rows = current_rows or DEFAULT_GRID_ROWS
    known_cols = current_cols or DEFAULT_GRID_COLS
    target_rows = max(known_rows, needed_rows)
    target_cols = max(known_cols, needed_cols)
    if target_rows == known_rows and target_cols == known_cols:
        return
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{
            "updateSheetProperties": {
                "properties": {
                    "sheetId": sheet_id,
                    "gridProperties": {
                        "rowCount": target_rows,
                        "columnCount": target_cols,
                    },
                },
                "fields": "gridProperties.rowCount,gridProperties.columnCount",
            }
        }]},
    ).execute()


def _iter_chunks(rows: Sequence[list], size: int) -> Iterator[tuple[int, Sequence[list]]]:
    step = max(1, size)
    for offset in range(0, len(rows), step):
        yield offset, rows[offset:offset + step]


class SheetWriteMismatch(RuntimeError):
    """L'onglet ne contient pas toutes les lignes lues en base."""

    def __init__(self, expected: int, written: int):
        self.expected = expected
        self.written = written
        super().__init__(
            f"Écriture incomplète : rows_read={expected} rows_written={written}"
        )


def _data_rows_in_column(values: Sequence[Sequence[Any]]) -> int:
    rows = list(values or [])
    while rows and not (rows[-1] and str(rows[-1][0]).strip() != ""):
        rows.pop()
    if not rows:
        return 0
    return len(rows) - 1


def _count_written_data_rows(service, spreadsheet_id: str, title: str) -> int:
    quoted = quote_tab(title)
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{quoted}!A:A",
    ).execute()
    return _data_rows_in_column(result.get("values") or [])


def replace_tab(
    service,
    spreadsheet_id: str,
    title: str,
    matrix: Sequence[Sequence[Any]],
    chunk_rows: int = CHUNK_ROWS,
) -> int:
    """Agrandit l'onglet, le vide, réécrit la matrice, puis compte les lignes réellement présentes."""
    title = assert_dedicated_tab(title)
    rows = [list(row) for row in matrix]
    width = max((len(row) for row in rows), default=1)
    sheet_id, current_rows, current_cols = ensure_tab(service, spreadsheet_id, title)
    expand_tab_grid(
        service,
        spreadsheet_id,
        sheet_id,
        current_rows,
        current_cols,
        max(len(rows), 1),
        width,
    )
    quoted = quote_tab(title)
    service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"{quoted}!A:ZZ",
        body={},
    ).execute()
    if not rows:
        return 0
    end_col = column_letter(width)
    short_write = False
    for offset, chunk in _iter_chunks(rows, chunk_rows):
        start = offset + 1
        end = start + len(chunk) - 1
        response = service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{quoted}!A{start}:{end_col}{end}",
            valueInputOption="RAW",
            body={"values": chunk},
        ).execute() or {}
        updated = response.get("updatedRows")
        if updated is not None and int(updated) != len(chunk):
            short_write = True
    expected = max(0, len(rows) - 1)
    observed = _count_written_data_rows(service, spreadsheet_id, title)
    if short_write or observed != expected:
        raise SheetWriteMismatch(expected, observed)
    return observed


@contextmanager
def hold_copy_lock():
    """Un seul passage à la fois quand plusieurs instances Railway partagent Postgres.

    Verrou de transaction (pas de session) : il reste posé pendant la lecture et
    l'écriture Sheets, puis tombe au commit ou au rollback. Ça reste fiable si
    le pooler ne garde une connexion que le temps d'une transaction.
    """
    engine = _db_engine()
    if getattr(getattr(engine, "dialect", None), "name", "") != "postgresql":
        yield True
        return
    conn = engine.connect()
    try:
        acquired = bool(conn.execute(
            text("SELECT pg_try_advisory_xact_lock(:key)"),
            {"key": LOCK_KEY},
        ).scalar())
        try:
            yield acquired
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                _discard_connection(conn)
            raise
    finally:
        _close_connection(conn)


def _discard_connection(conn) -> None:
    try:
        conn.invalidate()
    except Exception:
        pass


def _close_connection(conn) -> None:
    try:
        conn.close()
    except Exception:
        _discard_connection(conn)


def _log(message: str) -> None:
    """Ligne visible tout de suite dans les logs Railway (stdout n'est pas un terminal)."""
    print(message, flush=True)


def _counts(rows_read: Optional[int], rows_written: Optional[int]) -> str:
    read = "" if rows_read is None else str(rows_read)
    written = "" if rows_written is None else str(rows_written)
    return f"rows_read={read} rows_written={written}"


def run_notes_sheet_copy() -> dict:
    """Copie complète. Ne lève pas : une erreur revient dans le dictionnaire."""
    try:
        return _run_notes_sheet_copy()
    except Exception as exc:
        message = public_error(exc)
        _log(f"[NOTES SHEET COPY] status=error {_counts(None, None)} error={message}")
        return {
            "status": "error",
            "error": message,
            "rows_read": None,
            "rows_written": None,
        }


def _run_notes_sheet_copy() -> dict:
    rows_read: Optional[int] = None
    rows_written: Optional[int] = None
    try:
        if not credentials_available():
            _log(f"[NOTES SHEET COPY] {EXISTING_SA_ENV} absent : copie ignorée")
            return {"status": "skipped", "reason": "missing_credentials"}

        info = load_service_account_info()
        tab = configured_tab()
        spreadsheet_id = configured_spreadsheet_id()

        with hold_copy_lock() as acquired:
            if not acquired:
                _log("[NOTES SHEET COPY] copie déjà en cours sur une autre instance")
                return {"status": "skipped", "reason": "locked", "tab": tab}

            columns, records = fetch_notes_clients()
            rows_read = len(records)
            matrix, truncated = to_matrix(columns, records)
            service = build_sheets_client(info)
            try:
                rows_written = replace_tab(service, spreadsheet_id, tab, matrix)
            except SheetWriteMismatch as exc:
                rows_read = exc.expected
                rows_written = exc.written
                raise
            if rows_written != rows_read:
                raise SheetWriteMismatch(rows_read, rows_written)
            _log(
                "[NOTES SHEET COPY] "
                f"status=ok {_counts(rows_read, rows_written)} "
                f"columns={len(columns)} truncated_cells={truncated} "
                f"tab={tab} spreadsheet={spreadsheet_id} "
                f"account={info.get('client_email')}"
            )
            return {
                "status": "ok",
                "rows_read": rows_read,
                "rows_written": rows_written,
                "columns": columns,
                "truncated_cells": truncated,
                "tab": tab,
                "spreadsheet_id": spreadsheet_id,
            }
    except Exception as exc:
        message = public_error(exc)
        _log(f"[NOTES SHEET COPY] status=error {_counts(rows_read, rows_written)} error={message}")
        return {
            "status": "error",
            "error": message,
            "rows_read": rows_read,
            "rows_written": rows_written,
        }


async def _sleep(seconds: float) -> None:
    import asyncio
    await asyncio.sleep(seconds)


async def notes_sheet_copy_loop() -> None:
    """Attend l'heure configurée, copie, recommence. Une erreur ne sort pas de la boucle."""
    import asyncio

    while True:
        try:
            delay = seconds_until_next_run()
            _log(f"[NOTES SHEET COPY] prochain passage dans {int(delay)}s")
            await _sleep(delay)
            result = await asyncio.to_thread(run_notes_sheet_copy)
            _log(
                "[NOTES SHEET COPY] "
                f"status={result.get('status')} "
                f"{_counts(result.get('rows_read'), result.get('rows_written'))}"
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log(
                "[NOTES SHEET COPY] "
                f"status=error {_counts(None, None)} error={public_error(exc)}"
            )
            await _sleep(3600)
