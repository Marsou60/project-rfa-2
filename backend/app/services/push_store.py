"""Stockage des abonnements push. La table n'est pas créée au démarrage."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.database import engine


def _is_postgres() -> bool:
    return engine.dialect.name == "postgresql"


def table_exists() -> bool:
    with engine.connect() as conn:
        if _is_postgres():
            found = conn.execute(text("SELECT to_regclass('public.pwa_push_subscriptions')")).scalar()
            return bool(found)
        found = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pwa_push_subscriptions'")
        ).scalar()
        return bool(found)


def upsert_subscription(user_id: int, payload: Dict[str, Any], user_agent: str = "") -> None:
    if not table_exists():
        raise RuntimeError("table_missing")
    endpoint = str(payload.get("endpoint") or "").strip()
    keys = payload.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        raise ValueError("Abonnement incomplet.")
    statement = text(
        """
        INSERT INTO pwa_push_subscriptions (user_id, endpoint, p256dh, auth_secret, user_agent)
        VALUES (:user_id, :endpoint, :p256dh, :auth_secret, :user_agent)
        ON CONFLICT (endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth_secret = excluded.auth_secret,
            user_agent = excluded.user_agent
        """
    )
    with engine.begin() as conn:
        conn.execute(
            statement,
            {
                "user_id": int(user_id),
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth_secret": auth,
                "user_agent": (user_agent or "")[:300],
            },
        )


def delete_subscription(user_id: int, endpoint: str) -> None:
    if not table_exists():
        return
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM pwa_push_subscriptions WHERE user_id = :user_id AND endpoint = :endpoint"),
            {"user_id": int(user_id), "endpoint": endpoint},
        )


def subscribed_user_ids() -> List[int]:
    if not table_exists():
        return []
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT DISTINCT user_id FROM pwa_push_subscriptions")).fetchall()
    return [int(row[0]) for row in rows]


def subscriptions_for(user_ids: List[int]) -> List[Dict[str, Any]]:
    if not user_ids or not table_exists():
        return []
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT user_id, endpoint, p256dh, auth_secret FROM pwa_push_subscriptions"
        )).fetchall()
    wanted = {int(item) for item in user_ids}
    return [
        {"user_id": int(row[0]), "endpoint": row[1], "p256dh": row[2], "auth": row[3]}
        for row in rows
        if int(row[0]) in wanted
    ]
