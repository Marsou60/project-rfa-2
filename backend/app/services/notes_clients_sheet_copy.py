"""Copie nocturne de public.notes_clients vers un onglet dédié du Google Sheet.

La table Supabase reste la source. L'onglet est une copie intégrale : on le vide,
puis on réécrit l'en-tête et toutes les lignes. Les autres onglets (NOTES CLIENT,
LISTE CLIENT 2, Frais) ne sont ni lus ni modifiés. Aucune écriture en base.
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
# Verrou de session, propre à cette copie. Ne pas le réutiliser ailleurs.
LOCK_KEY = 7482910031202602
CHUNK_ROWS = 200
MAX_CELL = 49000
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


def parse_service_account_json(raw: str) -> dict:
    try:
        info = json.loads(raw)
        if isinstance(info, str):
            info = json.loads(info)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{SA_ENV} n'est pas du JSON valide") from exc
    if not isinstance(info, dict):
        raise ValueError(f"{SA_ENV} doit être un objet JSON")
    if info.get("type") != "service_account" or not info.get("client_email") or not info.get("private_key"):
        raise ValueError(f"{SA_ENV} n'est pas une clé de compte de service")
    return info


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
    """Client Sheets authentifié uniquement par SHEETS_COPY_SA_JSON."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    payload = info if info is not None else parse_service_account_json(
        os.environ.get(SA_ENV, "").strip()
    )
    credentials = service_account.Credentials.from_service_account_info(
        payload,
        scopes=[SHEETS_SCOPE],
    )
    return build("sheets", "v4", credentials=credentials)


def _sheet_properties(service, spreadsheet_id: str) -> list[dict]:
    meta = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets.properties(sheetId,title)",
    ).execute()
    properties = []
    for sheet in meta.get("sheets") or []:
        props = sheet.get("properties") or {}
        properties.append(props)
    return properties


def ensure_tab(service, spreadsheet_id: str, title: str) -> int:
    """Crée l'onglet dédié s'il manque. N'envoie jamais d'autre modification."""
    title = assert_dedicated_tab(title)
    for props in _sheet_properties(service, spreadsheet_id):
        if props.get("title") == title:
            return int(props["sheetId"])
    try:
        created = service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
        ).execute()
    except Exception:
        for props in _sheet_properties(service, spreadsheet_id):
            if props.get("title") == title:
                return int(props["sheetId"])
        raise
    replies = created.get("replies") or [{}]
    props = (replies[0].get("addSheet") or {}).get("properties") or {}
    return int(props.get("sheetId"))


def _iter_chunks(rows: Sequence[list], size: int) -> Iterator[tuple[int, Sequence[list]]]:
    step = max(1, size)
    for offset in range(0, len(rows), step):
        yield offset, rows[offset:offset + step]


def replace_tab(
    service,
    spreadsheet_id: str,
    title: str,
    matrix: Sequence[Sequence[Any]],
    chunk_rows: int = CHUNK_ROWS,
) -> int:
    """Vide l'onglet dédié puis réécrit la matrice (en-tête compris)."""
    title = assert_dedicated_tab(title)
    ensure_tab(service, spreadsheet_id, title)
    quoted = quote_tab(title)
    service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"{quoted}!A:ZZ",
        body={},
    ).execute()
    rows = [list(row) for row in matrix]
    if not rows:
        return 0
    width = max(len(row) for row in rows)
    end_col = column_letter(width)
    written = 0
    for offset, chunk in _iter_chunks(rows, chunk_rows):
        start = offset + 1
        end = start + len(chunk) - 1
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{quoted}!A{start}:{end_col}{end}",
            valueInputOption="RAW",
            body={"values": chunk},
        ).execute()
        written += len(chunk)
    # La première ligne est l'en-tête.
    return max(0, written - 1)


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


def run_notes_sheet_copy() -> dict:
    """Copie complète. Ne lève pas : une erreur revient dans le dictionnaire."""
    try:
        return _run_notes_sheet_copy()
    except Exception as exc:
        message = public_error(exc)
        print(f"[NOTES SHEET COPY] error: {message}")
        return {"status": "error", "error": message}


def _run_notes_sheet_copy() -> dict:
    raw = os.environ.get(SA_ENV, "").strip()
    if not raw:
        print(f"[NOTES SHEET COPY] {SA_ENV} absent : copie ignorée")
        return {"status": "skipped", "reason": "missing_credentials"}

    info = parse_service_account_json(raw)
    tab = configured_tab()
    spreadsheet_id = configured_spreadsheet_id()

    with hold_copy_lock() as acquired:
        if not acquired:
            print("[NOTES SHEET COPY] copie déjà en cours sur une autre instance")
            return {"status": "skipped", "reason": "locked", "tab": tab}

        columns, records = fetch_notes_clients()
        matrix, truncated = to_matrix(columns, records)
        service = build_sheets_client(info)
        written = replace_tab(service, spreadsheet_id, tab, matrix)
        if written != len(records):
            raise RuntimeError(
                f"Écriture incomplète : {written} lignes écrites pour {len(records)} lues"
            )
        print(
            "[NOTES SHEET COPY] "
            f"status=ok rows_read={len(records)} rows_written={written} "
            f"columns={len(columns)} truncated_cells={truncated} "
            f"tab={tab} spreadsheet={spreadsheet_id} "
            f"account={info.get('client_email')}"
        )
        return {
            "status": "ok",
            "rows_read": len(records),
            "rows_written": written,
            "columns": columns,
            "truncated_cells": truncated,
            "tab": tab,
            "spreadsheet_id": spreadsheet_id,
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
            print(f"[NOTES SHEET COPY] prochain passage dans {int(delay)}s")
            await _sleep(delay)
            result = await asyncio.to_thread(run_notes_sheet_copy)
            print(
                "[NOTES SHEET COPY] "
                f"status={result.get('status')} "
                f"rows_read={result.get('rows_read')} "
                f"rows_written={result.get('rows_written')}"
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[NOTES SHEET COPY] loop error: {public_error(exc)}")
            await _sleep(3600)
