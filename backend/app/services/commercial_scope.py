"""
Périmètre commercial Pure Data.

- ADMIN → réseau entier
- COMMERCIAL Vanessa → réseau entier (comme la direction)
- Autres COMMERCIAL → uniquement leur portefeuille Pure Data
"""
from __future__ import annotations

import re
from typing import Optional

from app.models import User, UserRole

# Comptes COMMERCIAL avec vue réseau complète (direction / managers)
FULL_ACCESS_COMMERCIAL_USERNAMES = {
    "VANESSA",
}

# Mapping username app → libellé commercial Pure Data (casse libre côté filtre)
USERNAME_TO_COMMERCIAL = {
    "RAYANE": "Rayane",
    "ELMEHDI": "El Mehdi",
    "AGATHE": "Agathe",
    "ALYA": "Alya",
    "CORALIE": "Coralie",
    "EMERIC": "Emeric",
    "RYHAN": "Ryhan Julien",
    "RACHIDA": "Rachida Amazal",
    "AMAZAL": "Rachida Amazal",
    # Vanessa est full-access ; mapping utile si un jour on retire l'exception
    "VANESSA": "Vanessa",
}

CANONICAL_COMMERCIALS = {
    "VANESSA": "Vanessa",
    "EMERIC": "Emeric",
    "EL MEHDI": "El Mehdi",
    "ELMEHDI": "El Mehdi",
    "RAYANE": "Rayane",
    "AGATHE": "Agathe",
    "ALYA": "Alya",
    "CORALIE": "Coralie",
    "MARTIAL": "Martial",
    "RYHAN": "Ryhan Julien",
    "RYHAN JULIEN": "Ryhan Julien",
    "RACHIDA": "Rachida Amazal",
    "RACHIDA AMAZAL": "Rachida Amazal",
    "AMAZAL": "Rachida Amazal",
}


def agent_label_for_user(user: Optional[User]) -> Optional[str]:
    """Libellé Agent Union d'un compte : nom affiché, sinon identifiant."""
    if not user:
        return None
    uname = (getattr(user, "username", None) or "").strip().upper()
    if uname in USERNAME_TO_COMMERCIAL:
        return USERNAME_TO_COMMERCIAL[uname]
    raw = (getattr(user, "display_name", None) or getattr(user, "username", None) or "").strip()
    if not raw:
        return None
    known = set(CANONICAL_COMMERCIALS.values())
    label = canonical_commercial_label(raw)
    if label in known:
        return label
    parts = []
    for word in re.split(r"\s+", raw):
        bits = [p[:1].upper() + p[1:].lower() for p in word.split("-") if p]
        if bits:
            parts.append("-".join(bits))
    return " ".join(parts) or raw


def list_union_agents(session) -> list:
    """Comptes Union actifs (commercial ou admin). Chaque accès devient un agent."""
    from sqlmodel import select

    rows = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
    agents = []
    seen = set()
    for user in rows:
        if _role_str(user) not in (UserRole.COMMERCIAL.value, UserRole.ADMIN.value):
            continue
        label = agent_label_for_user(user)
        if not label:
            continue
        key = label.upper()
        if key in seen:
            continue
        seen.add(key)
        agents.append({
            "label": label,
            "username": user.username,
            "role": _role_str(user),
        })
    agents.sort(key=lambda item: item["label"].casefold())
    return agents


def canonical_commercial_label(value: Optional[str]) -> Optional[str]:
    """Normalise « emeric » / « El-Mehdi » vers le libellé Pure Data."""
    s = (value or "").strip()
    if not s:
        return None
    key = re.sub(r"[\s\-_]+", " ", s).upper().strip()
    compact = key.replace(" ", "")
    return CANONICAL_COMMERCIALS.get(key) or CANONICAL_COMMERCIALS.get(compact) or s


def _role_str(user: User) -> str:
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return str(getattr(r, "value", r) or "").upper()


def has_network_full_access(user: Optional[User]) -> bool:
    if not user:
        return False
    role = _role_str(user)
    if role == UserRole.ADMIN.value:
        return True
    if role == UserRole.COMMERCIAL.value:
        uname = (user.username or "").strip().upper()
        return uname in FULL_ACCESS_COMMERCIAL_USERNAMES
    return False


def resolve_commercial_scope(user: Optional[User]) -> Optional[str]:
    """
    Retourne le filtre commercial à forcer, ou None si accès réseau complet / hors scope.
    Les ADHERENT ne passent pas par ce filtre (liés via code/groupe).
    """
    if not user:
        return None
    if has_network_full_access(user):
        return None
    if _role_str(user) != UserRole.COMMERCIAL.value:
        return None

    return agent_label_for_user(user)


def entity_in_commercial_scope(
    *,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    commercial_scope: str,
) -> bool:
    """True si l'entité a au moins une ligne Pure Data sur ce commercial."""
    from app.services.pure_data_sales_source import load_evolution_sales_rows

    target = (commercial_scope or "").strip().upper()
    if not target:
        return False
    code = (code_union or "").strip().upper()
    groupe = (groupe_client or "").strip().upper()
    if not code and not groupe:
        return False

    rows, _ = load_evolution_sales_rows()
    for r in rows:
        commercial = (r.get("commercial") or "").strip().upper()
        if commercial != target:
            continue
        if code and (r.get("code_union") or "").strip().upper() == code:
            return True
        if groupe and (r.get("groupe_client") or "").strip().upper() == groupe:
            return True
    return False


def enforce_commercial_entity_access(
    user: Optional[User],
    *,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
) -> None:
    """403 si un commercial scopé tente d'ouvrir une fiche hors portefeuille."""
    from fastapi import HTTPException

    scope = resolve_commercial_scope(user)
    if not scope:
        return
    if entity_in_commercial_scope(
        code_union=code_union,
        groupe_client=groupe_client,
        commercial_scope=scope,
    ):
        return
    raise HTTPException(
        status_code=403,
        detail="Cette fiche n'appartient pas à votre portefeuille commercial.",
    )
