"""
Notifications push de la PWA.

Aucune notification n'est envoyée tant que les trois conditions sont vraies :
l'appel n'est pas un essai (dry_run), PUSH_SEND_ENABLED=1, et les clés VAPID
sont dans l'environnement. Les clés ne sont jamais dans le dépôt.

Variables Railway :
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT   exemple mailto:martial@groupement-union.fr
- PUSH_SEND_ENABLED   1 pour autoriser un envoi réel (sinon refus)
- PUSH_AFTER_IMPORT   1 pour accrocher l'envoi après un import de mois (défaut : off)
- PUSH_BROADCAST_USERNAMES   liste optionnelle, défaut mourad,julien,malik,martial,vanessa

Destinataires « tout le réseau » : le username (sans casse) est dans la liste,
ou un mot du nom affiché l'est. Ainsi « Ryhan Julien » correspond à julien
même si l'identifiant est RYHAN. Les autres commerciaux ne voient que leur
portefeuille. Les adhérents ne reçoivent pas cette alerte réseau.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Callable, Dict, Iterable, List, Optional

MONTHS = [
    "",
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
]

DEFAULT_BROADCAST = ("mourad", "julien", "malik", "martial", "vanessa")


def broadcast_tokens() -> set:
    raw = os.environ.get("PUSH_BROADCAST_USERNAMES", ",".join(DEFAULT_BROADCAST))
    return {part.strip().upper() for part in raw.split(",") if part.strip()}


def receives_all_notifications(user: Any) -> bool:
    tokens = broadcast_tokens()
    username = str(getattr(user, "username", "") or "").strip().upper()
    if username in tokens:
        return True
    display = str(getattr(user, "display_name", "") or "").upper()
    words = set(re.findall(r"[A-Z0-9]+", display))
    return bool(words & tokens)


def notification_scope(user: Any) -> Optional[str]:
    """'all', un libellé commercial, ou None si la personne n'est pas destinataire."""
    role = str(getattr(getattr(user, "role", None), "value", getattr(user, "role", "")) or "").upper()
    if role == "ADHERENT":
        return None
    if role not in ("ADMIN", "COMMERCIAL"):
        return None
    if receives_all_notifications(user):
        return "all"
    from app.services.commercial_scope import has_network_full_access, resolve_commercial_scope

    if has_network_full_access(user):
        return "all"
    scope = resolve_commercial_scope(user)
    return scope or None


def atteints_message(count: int, month: Optional[int]) -> Dict[str, str]:
    label = MONTHS[month] if month and 1 <= int(month) <= 12 else "ce mois"
    noun = "adhérent a" if count == 1 else "adhérents ont"
    return {
        "title": "RFA Union (test)",
        "body": f"{count} {noun} franchi un palier en {label} — données réelles, notifications en phase de test",
        "url": "/alertes?alerte=atteints",
        "type": "palier-mois",
    }


def plan_recipients(
    users: Iterable[Any],
    counts: Dict[str, int],
    month: Optional[int],
    subscribed_user_ids: Optional[Iterable[int]] = None,
) -> List[Dict[str, Any]]:
    subscribed = {int(item) for item in (subscribed_user_ids or [])}
    plans = []
    for user in users:
        scope = notification_scope(user)
        if not scope:
            continue
        count = int(counts.get(scope, 0) or 0)
        message = atteints_message(count, month)
        user_id = getattr(user, "id", None)
        has_device = user_id is not None and int(user_id) in subscribed
        ignored = count <= 0
        plans.append({
            "user_id": user_id,
            "username": getattr(user, "username", None),
            "display_name": getattr(user, "display_name", None),
            "scope": scope,
            "count": count,
            "title": message["title"],
            "body": message["body"],
            "url": message["url"],
            "status": "ignoré" if ignored else "prévu",
            "would_push": False if ignored else has_device,
            "reason": "ignoré" if ignored else (None if has_device else "pas d'abonnement sur ce téléphone"),
        })
    return plans


def sending_allowed() -> bool:
    return os.environ.get("PUSH_SEND_ENABLED", "").strip() == "1"


def _push_error(exc: Exception) -> str:
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    if status:
        return f"HTTP {status}"
    return type(exc).__name__


def deliver_planned(
    recipients: Iterable[Dict[str, Any]],
    subscriptions: Iterable[Dict[str, Any]],
    sender: Callable[[Dict[str, Any], str], None],
) -> List[Dict[str, Any]]:
    """Un envoi par abonnement des comptes prévus. Les compteurs à 0 ne partent pas."""
    by_user: Dict[int, List[Dict[str, Any]]] = {}
    for sub in subscriptions:
        by_user.setdefault(int(sub["user_id"]), []).append(sub)
    results = []
    for row in recipients:
        base = {
            "user_id": row.get("user_id"),
            "username": row.get("username"),
            "count": row.get("count"),
            "title": row.get("title"),
            "body": row.get("body"),
        }
        if row.get("status") == "ignoré" or int(row.get("count") or 0) <= 0:
            results.append({**base, "result": "ignoré", "sent": 0, "failed": 0})
            continue
        if not row.get("would_push"):
            results.append({**base, "result": "pas d'abonnement", "sent": 0, "failed": 0})
            continue
        payload = json.dumps(
            {"title": row.get("title"), "body": row.get("body"), "url": row.get("url")},
            ensure_ascii=False,
        )
        sent = 0
        failed = 0
        errors: List[str] = []
        for sub in by_user.get(int(row["user_id"]), []):
            try:
                sender(sub, payload)
                sent += 1
            except Exception as exc:
                failed += 1
                errors.append(_push_error(exc))
        if sent and not failed:
            result = "envoyé"
        elif failed:
            result = "échec"
        else:
            result = "pas d'abonnement"
        results.append({**base, "result": result, "sent": sent, "failed": failed, "errors": errors})
    return results


def vapid_sender() -> Callable[[Dict[str, Any], str], None]:
    private = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    subject = os.environ.get("VAPID_SUBJECT", "").strip()
    if not private or not subject:
        raise RuntimeError("clés VAPID absentes")

    def send(sub: Dict[str, Any], payload: str) -> None:
        from pywebpush import webpush

        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=payload,
            vapid_private_key=private,
            vapid_claims={"sub": subject},
        )

    return send


def after_import_enabled() -> bool:
    return os.environ.get("PUSH_AFTER_IMPORT", "").strip() == "1"


def note_after_import(month: Optional[int] = None) -> Dict[str, Any]:
    """Accroche après import. Désactivée par défaut : aucun envoi."""
    if not after_import_enabled():
        return {"skipped": True, "reason": "PUSH_AFTER_IMPORT n'est pas à 1"}
    if not sending_allowed():
        return {"skipped": True, "reason": "PUSH_SEND_ENABLED n'est pas à 1"}
    return {"skipped": True, "reason": "envoi après import non branché sur un envoi automatique", "month": month}


def _unique_codes(rows: Iterable[Dict[str, Any]]) -> int:
    return len({str(row.get("code_union") or "").strip().upper() for row in rows if row.get("code_union")})


def fetch_atteints(commercial: Optional[str]):
    from app.database import engine, lease_session
    from app.services.contract_resolver import BatchContractResolver
    from app.services.palier_alerts import build_palier_alerts
    from app.services.pure_data_sales_source import load_evolution_sales_rows
    from app.services.rfa_calculator import load_contract_rules
    from app.api import _effective_platform_months

    rows, source = load_evolution_sales_rows()
    with lease_session(engine) as calc_session:
        platform_months = _effective_platform_months(calc_session, 2026)
    resolver = BatchContractResolver()
    rules_cache: dict = {}

    def rules_for(contract):
        cid = getattr(contract, "id", None)
        if cid not in rules_cache:
            rules_cache[cid] = load_contract_rules(contract)
        return rules_cache[cid]

    built = build_palier_alerts(
        rows,
        year=2026,
        resolve=lambda code, groupe: resolver.resolve(code_union=code, groupe_client=groupe, year=2026),
        rules_for=rules_for,
        commercial=commercial,
        data_source=source,
        platform_months=platform_months,
    )
    return built.get("atteints") or [], built.get("month")


def compose_palier_preview(session) -> Dict[str, Any]:
    from sqlmodel import select

    from app.models import User

    users = list(session.exec(select(User).where(User.is_active == True)).all())  # noqa: E712
    scopes: List[str] = []
    for user in users:
        scope = notification_scope(user)
        if scope and scope not in scopes:
            scopes.append(scope)
    counts: Dict[str, int] = {}
    month = None
    for scope in scopes:
        atteints, found = fetch_atteints(None if scope == "all" else scope)
        counts[scope] = _unique_codes(atteints)
        month = found or month
    ready = False
    subscribed: List[int] = []
    try:
        from app.services.push_store import subscribed_user_ids, table_exists
        ready = table_exists()
        subscribed = subscribed_user_ids() if ready else []
    except Exception:
        ready = False
    recipients = plan_recipients(users, counts, month, subscribed)
    if not ready:
        for row in recipients:
            if row.get("status") == "ignoré":
                continue
            row["would_push"] = False
            row["reason"] = "table pwa_push_subscriptions pas encore créée"
    return {
        "dry_run": True,
        "sent": False,
        "month": month,
        "month_label": MONTHS[month] if month and 1 <= int(month) <= 12 else None,
        "table_ready": ready,
        "recipients": recipients,
    }

