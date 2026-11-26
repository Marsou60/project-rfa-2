"""Lecture seule des pièces manquantes, bornée au magasin du compte."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from app.models import User, UserRole
from app.services import nathalie_adherents

_FIELDS = (
    ("rib_url", "RIB"),
    ("kbis_url", "Kbis"),
    ("piece_identite_url", "Pièce d'identité"),
)


def adherent_code(user: User, requested: Optional[str] = None) -> str:
    del requested
    if user.role != UserRole.ADHERENT:
        raise HTTPException(status_code=403, detail="Réservé à l'adhérent")
    code = (user.linked_code_union or "").strip().upper()
    if not code:
        raise HTTPException(status_code=403, detail="Aucun magasin lié à ce compte")
    return code


def missing_labels(client: Optional[dict]) -> list[str]:
    if not client:
        return []
    labels = []
    for field, label in _FIELDS:
        if not str(client.get(field) or "").strip():
            labels.append(label)
    return labels


def missing_docs_for_user(user: User, requested: Optional[str] = None) -> dict:
    code = adherent_code(user, requested)
    client = nathalie_adherents.get_by_code(code)
    return {"code_union": code, "missing": missing_labels(client)}
