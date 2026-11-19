"""Points de la carte adhérents.

La réponse ne contient ni rue, ni code postal, ni téléphone. Les coordonnées
viennent de adherent_positions (remplie par le script de géocodage). Le
périmètre commercial est le même que le reste de l'app.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.database import lease_connection, rollback_leased
from app.services.commercial_scope import canonical_commercial_label

# Mêmes seuils que l'écran RFA (Classique → Silver → Gold).
# « Proche » = au moins 80 % du prochain seuil, comme la jauge ambre de la fiche.
CONTRACT_THRESHOLDS = (100_001, 300_001)
NEAR_RATIO = 0.8

POINT_KEYS = (
    "code_union", "nom", "ville", "lat", "lng", "ca", "plateformes", "near_tier",
    "commercial", "palier", "fournisseur_principal",
)
UNLOCATED_KEYS = (
    "code_union", "nom", "ville", "reason", "ca", "plateformes", "near_tier",
    "commercial", "palier", "fournisseur_principal",
)
_CA_KEYS = ("ca", "montant", "amount", "ca_total")


def near_contract_tier(ca: Optional[float]) -> bool:
    if ca is None or ca <= 0:
        return False
    for threshold in CONTRACT_THRESHOLDS:
        if ca < threshold and (ca / threshold) >= NEAR_RATIO:
            return True
    return False


def contract_tier_label(ca: Optional[float]) -> Optional[str]:
    """Classique, puis Silver à 100 001 €, Gold à 300 001 €. Même barème que la fiche."""
    if ca is None:
        return None
    if ca >= CONTRACT_THRESHOLDS[1]:
        return "Gold"
    if ca >= CONTRACT_THRESHOLDS[0]:
        return "Silver"
    return "Classique"


def _platform_amount(item: dict) -> Optional[float]:
    for key in _CA_KEYS:
        if key in item:
            return _money(item.get(key))
    return None


def platform_details(raw: Any) -> tuple:
    """Libellés dans l'ordre, et le fournisseur principal.

    S'il y a des montants, le principal est le plus gros CA. Sinon c'est le
    premier libellé. Les doublons gardent le montant le plus élevé.
    """
    data = raw
    if isinstance(raw, (bytes, str)):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return [], None
    pairs: List[tuple] = []
    if isinstance(data, dict):
        for key, value in data.items():
            label = str(key or "").strip().upper()
            if not label:
                continue
            amount = _money(value.get("ca") if isinstance(value, dict) else value)
            pairs.append((label, amount))
    elif isinstance(data, list):
        for item in data:
            amount = None
            if isinstance(item, dict):
                amount = _platform_amount(item)
                item = item.get("platform") or item.get("label") or item.get("nom") or ""
            label = str(item or "").strip().upper()
            if label:
                pairs.append((label, amount))
    else:
        return [], None

    labels: List[str] = []
    amounts: Dict[str, Optional[float]] = {}
    for label, amount in pairs:
        if label not in amounts:
            labels.append(label)
            amounts[label] = amount
            continue
        current = amounts[label]
        if amount is not None and (current is None or amount > current):
            amounts[label] = amount
    scored = [(label, amounts[label]) for label in labels if amounts[label] is not None]
    if scored:
        scored.sort(key=lambda item: (-item[1], item[0]))
        return labels, scored[0][0]
    return labels, (labels[0] if labels else None)


def parse_platforms(raw: Any) -> List[str]:
    labels, _principal = platform_details(raw)
    return labels


def _flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "t", "yes"}


def _money(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _coord(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return round(number, 6)


def _commercial_label(profile: dict, card: dict) -> Optional[str]:
    raw = (profile or {}).get("commercial") or (card or {}).get("agent")
    if not raw:
        return None
    return canonical_commercial_label(str(raw)) or str(raw).strip() or None


def _same_agent(scope: str, *values: Optional[str]) -> bool:
    target = (canonical_commercial_label(scope) or scope).casefold()
    if not target:
        return False
    for value in values:
        if value is None or not str(value).strip():
            continue
        label = canonical_commercial_label(str(value)) or str(value)
        if label.casefold() == target:
            return True
    return False


def _read(sql: str) -> Optional[List[dict]]:
    try:
        with lease_connection() as conn:
            return [dict(row) for row in conn.execute(text(sql)).mappings().all()]
    except (OperationalError, ProgrammingError):
        rollback_leased()
        return None


def _directory(rows: Optional[List[dict]]) -> Dict[str, dict]:
    found: Dict[str, dict] = {}
    if not rows:
        return found
    for row in rows:
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        closed = _flag(row.get("is_closed"))
        previous = found.get(code)
        if previous is not None and not previous["closed"]:
            continue
        found[code] = {
            "nom": (row.get("nom_client") or "").strip(),
            "ville": (row.get("ville") or "").strip() or None,
            "agent": (row.get("agent_union") or "").strip() or None,
            "closed": closed,
        }
    return found


def _profiles(rows: Optional[List[dict]]) -> Dict[str, dict]:
    found: Dict[str, dict] = {}
    if not rows:
        return found
    for row in rows:
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        year = row.get("annee")
        try:
            year_n = int(year) if year is not None else 0
        except (TypeError, ValueError):
            year_n = 0
        previous = found.get(code)
        if previous is not None and previous["year"] > year_n:
            continue
        labels, principal = platform_details(row.get("plateformes"))
        found[code] = {
            "year": year_n,
            "nom": (row.get("raison_sociale") or "").strip(),
            "ca": _money(row.get("ca")),
            "plateformes": labels,
            "principal": principal,
            "commercial": (row.get("commercial") or "").strip() or None,
        }
    return found


def _positions(rows: Optional[List[dict]]) -> Dict[str, dict]:
    found: Dict[str, dict] = {}
    if not rows:
        return found
    for row in rows:
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        found[code] = {
            "lat": _coord(row.get("lat")),
            "lng": _coord(row.get("lng")),
            "status": (row.get("geocode_status") or "").strip() or "pending",
        }
    return found


def list_map_adherents(scope: Optional[str]) -> Dict[str, Any]:
    directory_rows = _read(
        "SELECT code_union, nom_client, ville, agent_union, is_closed "
        "FROM nathalie_adherents"
    )
    profile_rows = _read(
        "SELECT code_union, annee, raison_sociale, ca, plateformes, commercial "
        "FROM adherent_profils"
    )
    position_rows = _read(
        "SELECT code_union, lat, lng, geocode_status FROM adherent_positions"
    )

    directory = _directory(directory_rows)
    profiles = _profiles(profile_rows)
    positions = _positions(position_rows)
    migration_required = position_rows is None

    codes = set(directory) | set(profiles)
    visible: List[str] = []
    for code in codes:
        card = directory.get(code)
        if card is not None and card["closed"]:
            continue
        if scope:
            agent = card["agent"] if card else None
            commercial = profiles.get(code, {}).get("commercial")
            if not _same_agent(scope, agent, commercial):
                continue
        visible.append(code)

    geocode_pending = (
        not migration_required
        and not positions
        and len(visible) > 0
    )

    points: List[dict] = []
    unlocated: List[dict] = []
    for code in sorted(visible):
        card = directory.get(code) or {}
        profile = profiles.get(code) or {}
        nom = card.get("nom") or profile.get("nom") or code
        ville = card.get("ville")
        ca = profile.get("ca")
        plateformes = profile.get("plateformes") or []
        shared = {
            "code_union": code,
            "nom": nom,
            "ville": ville,
            "ca": ca,
            "plateformes": plateformes,
            "near_tier": near_contract_tier(ca),
            "commercial": _commercial_label(profile, card),
            "palier": contract_tier_label(ca),
            "fournisseur_principal": profile.get("principal"),
        }
        position = positions.get(code)
        lat = position.get("lat") if position else None
        lng = position.get("lng") if position else None
        status = position.get("status") if position else ("pending" if geocode_pending or migration_required else "no_address")
        if status == "ok" and lat is not None and lng is not None and not migration_required:
            points.append({**shared, "lat": lat, "lng": lng})
            continue
        if status not in {"no_address", "failed", "ambiguous", "pending"}:
            status = "pending" if migration_required or geocode_pending else "no_address"
        if migration_required or geocode_pending:
            status = "pending"
        unlocated.append({**shared, "reason": status})

    return {
        "points": points,
        "unlocated": unlocated,
        "migration_required": migration_required,
        "geocode_pending": geocode_pending,
        "total": len(visible),
    }
