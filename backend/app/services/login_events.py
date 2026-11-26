"""Journal des connexions réussies (mot de passe), web ou mobile.

Une ligne est écrite dans la même session que la mise à jour de last_login.
Si l'insertion échoue, un savepoint est annulé et la connexion de l'utilisateur
aboutit quand même. /auth/me n'écrit rien.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models import LoginEvent

logger = logging.getLogger(__name__)

CHANNELS = ("web", "mobile")
USER_AGENT_MAX = 300


def normalize_channel(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    channel = value.strip().lower()
    if channel in CHANNELS:
        return channel
    return None


def _short_user_agent(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = "".join(ch for ch in value if ch.isprintable()).strip()
    if not cleaned:
        return None
    return cleaned[:USER_AGENT_MAX]


def record_login_event(
    session: Session,
    user_id: Optional[int],
    channel: Optional[str],
    user_agent: Optional[str],
    logged_at: datetime,
) -> None:
    """Ajoute une ligne, ou ne fait rien si le canal est absent ou inconnu.

    last_login doit déjà avoir été flush dans la transaction courante.
    L'insertion passe par un savepoint : un échec (table absente, contrainte)
    n'annule pas last_login et n'ouvre pas une deuxième connexion.
    """
    known = normalize_channel(channel)
    if user_id is None or known is None:
        return
    try:
        with session.begin_nested():
            session.add(
                LoginEvent(
                    user_id=user_id,
                    logged_at=logged_at,
                    channel=known,
                    user_agent=_short_user_agent(user_agent),
                )
            )
            session.flush()
    except Exception as exc:
        logger.warning(
            "Connexion non journalisée (user_id=%s) : %s",
            user_id,
            exc,
        )


def _as_utc(value):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def list_login_activity(session: Session, recent_limit: int = 20) -> list:
    """Dernière connexion web, mobile, volumes 7/30 jours, événements récents.

    Lecture admin, hors du chemin de login. Un passage sur le journal suffit :
    le volume est une ligne par mot de passe saisi.
    """
    limit = max(1, min(int(recent_limit), 50))
    since_7 = datetime.now(timezone.utc) - timedelta(days=7)
    since_30 = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        rows = session.exec(
            select(LoginEvent).order_by(LoginEvent.logged_at.desc(), LoginEvent.id.desc())
        ).all()
    except Exception as exc:
        session.rollback()
        logger.warning("Lecture du journal de connexion impossible : %s", exc)
        return []

    by_user = {}
    for row in rows:
        logged_at = _as_utc(row.logged_at)
        if logged_at is None:
            continue
        bucket = by_user.get(row.user_id)
        if bucket is None:
            bucket = {
                "user_id": row.user_id,
                "last_login_web": None,
                "last_login_mobile": None,
                "logins_7d": 0,
                "logins_30d": 0,
                "recent": [],
            }
            by_user[row.user_id] = bucket
        if row.channel == "web" and (
            bucket["last_login_web"] is None or logged_at > bucket["last_login_web"]
        ):
            bucket["last_login_web"] = logged_at
        if row.channel == "mobile" and (
            bucket["last_login_mobile"] is None or logged_at > bucket["last_login_mobile"]
        ):
            bucket["last_login_mobile"] = logged_at
        if logged_at >= since_7:
            bucket["logins_7d"] += 1
        if logged_at >= since_30:
            bucket["logins_30d"] += 1
        if len(bucket["recent"]) < limit:
            bucket["recent"].append(
                {
                    "logged_at": logged_at,
                    "channel": row.channel,
                    "user_agent": row.user_agent,
                }
            )
    return list(by_user.values())
