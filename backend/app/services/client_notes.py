"""Journal de notes terrain (`notes_clients` dans Supabase)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.database import engine

MAX_NOTE = 8000


def note_author(user: Any) -> str:
    raw = (getattr(user, "display_name", None) or getattr(user, "username", None) or "Union").strip()
    return raw[:120] or "Union"


def clean_note(value: Optional[str]) -> str:
    text_value = (value or "").strip()
    if not text_value:
        raise ValueError("Écrivez une note avant d'enregistrer.")
    if len(text_value) > MAX_NOTE:
        raise ValueError("La note est trop longue.")
    return text_value


def _public(row) -> Dict[str, Any]:
    data = dict(row)
    for key in ("created_at", "date_rappel"):
        val = data.get(key)
        if hasattr(val, "isoformat"):
            data[key] = val.isoformat()
    data["traite"] = bool(data.get("traite"))
    return data


def list_notes(code_union: str, limit: int = 80) -> List[Dict[str, Any]]:
    code = (code_union or "").strip().upper()
    if not code:
        return []
    sql = """
        SELECT id, code_union, type_note, note_simple, note_ia, auteur,
               date_rappel, traite, created_at
        FROM notes_clients
        WHERE UPPER(TRIM(code_union)) = :code
        ORDER BY created_at DESC, id DESC
        LIMIT :lim
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), {"code": code, "lim": max(1, min(limit, 200))}).mappings().all()
    return [_public(row) for row in rows]


def add_note(code_union: str, note: str, auteur: str, type_note: str = "NOTE SIMPLE") -> Dict[str, Any]:
    code = (code_union or "").strip().upper()
    if not code:
        raise ValueError("Code Union manquant.")
    body = clean_note(note)
    kind = (type_note or "NOTE SIMPLE").strip()[:40] or "NOTE SIMPLE"
    sql = """
        INSERT INTO notes_clients
            (code_union, type_note, note_simple, auteur, traite, sheets_synced, imported)
        VALUES
            (:code, :type_note, :note, :auteur, false, false, false)
        RETURNING id, code_union, type_note, note_simple, note_ia, auteur,
                  date_rappel, traite, created_at
    """
    with engine.begin() as conn:
        row = conn.execute(text(sql), {
            "code": code,
            "type_note": kind,
            "note": body,
            "auteur": (auteur or "Union")[:120],
        }).mappings().one()
    return _public(row)
