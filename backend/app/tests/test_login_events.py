"""Journal des connexions : web / mobile, échec non bloquant, admin seulement."""
import asyncio
import json
import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine, select

import app.database as db
from app.database import hash_password
from app.models import LoginEvent, User, UserRole


@pytest.fixture()
def api(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'login.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "engine", engine)
    from app.main import app

    with Session(engine) as session:
        session.add(User(
            username="ada",
            password_hash=hash_password("secret"),
            display_name="Ada",
            role=UserRole.ADMIN,
            is_active=True,
        ))
        session.add(User(
            username="bob",
            password_hash=hash_password("secret"),
            display_name="Bob",
            role=UserRole.COMMERCIAL,
            is_active=True,
        ))
        session.commit()
    yield app, engine
    engine.dispose()


def _request(app, method, path, body=None, headers=None):
    status = {}
    chunks = []
    payload = b"" if body is None else json.dumps(body).encode()
    raw_headers = [(b"content-type", b"application/json")]
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode(), value.encode()))

    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path.split("?", 1)[0],
        "raw_path": path.encode(),
        "query_string": path.split("?", 1)[1].encode() if "?" in path else b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 9),
        "server": ("test", 80),
    }

    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status["code"] = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body") or b"")

    async def _run():
        await app(scope, receive, send)

    asyncio.run(_run())
    raw = b"".join(chunks)
    parsed = json.loads(raw) if raw else None
    return status["code"], parsed


def _login(app, username, channel=None, user_agent=None, password="secret"):
    headers = {}
    if channel is not None:
        headers["X-Rfa-Client"] = channel
    if user_agent is not None:
        headers["User-Agent"] = user_agent
    return _request(
        app,
        "POST",
        "/api/auth/login",
        body={"username": username, "password": password},
        headers=headers,
    )


def _events(engine):
    with Session(engine) as session:
        return list(session.exec(select(LoginEvent).order_by(LoginEvent.id)).all())


def test_web_and_mobile_are_recorded_on_the_same_session(api):
    app, engine = api
    captured = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("INSERT") and "login_events" in statement:
            captured.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        web_code, web = _login(app, "ada", "web", "Mozilla/5.0 (Windows NT 10.0)")
        mobile_code, mobile = _login(app, "ada", "Mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
    finally:
        event.remove(engine, "before_cursor_execute", capture)

    assert web_code == 200, web
    assert mobile_code == 200, mobile
    rows = _events(engine)
    assert [row.channel for row in rows] == ["web", "mobile"]
    assert rows[0].user_agent.startswith("Mozilla/5.0 (Windows")
    assert "iPhone" in rows[1].user_agent
    assert captured
    for statement in captured:
        head = statement.lower().split("values", 1)[0]
        assert re.search(r"\bid\b", head) is None, statement

    me_code, me = _request(
        app,
        "GET",
        "/api/auth/me",
        headers={
            "Authorization": f"Bearer {web['token']}",
            "X-Rfa-Client": "mobile",
        },
    )
    assert me_code == 200, me
    assert len(_events(engine)) == 2

    wrong_code, wrong = _login(app, "ada", "web", password="nope")
    assert wrong_code == 401, wrong
    assert len(_events(engine)) == 2

    unknown_code, unknown = _login(app, "ada", "tablette")
    assert unknown_code == 200, unknown
    assert len(_events(engine)) == 2


def test_long_user_agent_is_shortened(api):
    app, engine = api
    code, body = _login(app, "ada", "web", "A" * 500)
    assert code == 200, body
    rows = _events(engine)
    assert len(rows) == 1
    assert len(rows[0].user_agent) == 300


def test_login_succeeds_when_the_journal_table_is_missing(api):
    app, engine = api
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE login_events"))
    code, body = _login(app, "ada", "web", "Mozilla/5.0")
    assert code == 200, body
    assert body["username"] == "ada"
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "ada")).one()
        assert user.last_login is not None


def test_activity_is_admin_only_and_counts_recent_logins(api):
    app, engine = api
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        ada = session.exec(select(User).where(User.username == "ada")).one()
        session.add(LoginEvent(
            user_id=ada.id,
            logged_at=now - timedelta(days=40),
            channel="web",
            user_agent="old",
        ))
        session.add(LoginEvent(
            user_id=ada.id,
            logged_at=now - timedelta(days=10),
            channel="web",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        ))
        session.add(LoginEvent(
            user_id=ada.id,
            logged_at=now - timedelta(days=1),
            channel="mobile",
            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        ))
        session.commit()

    ada_code, ada_login = _login(app, "ada")
    bob_code, bob_login = _login(app, "bob", "mobile")
    assert ada_code == 200, ada_login
    assert bob_code == 200, bob_login

    forbidden_code, forbidden = _request(
        app,
        "GET",
        "/api/users/login-activity",
        headers={"Authorization": f"Bearer {bob_login['token']}"},
    )
    assert forbidden_code == 403, forbidden

    code, payload = _request(
        app,
        "GET",
        "/api/users/login-activity",
        headers={"Authorization": f"Bearer {ada_login['token']}"},
    )
    assert code == 200, payload
    users = {row["user_id"]: row for row in payload["users"]}
    with Session(engine) as session:
        ada = session.exec(select(User).where(User.username == "ada")).one()
        bob = session.exec(select(User).where(User.username == "bob")).one()
    ada_row = users[ada.id]
    assert ada_row["logins_7d"] == 1
    assert ada_row["logins_30d"] == 2
    assert ada_row["last_login_web"] is not None
    assert ada_row["last_login_mobile"] is not None
    assert ada_row["recent"][0]["channel"] == "mobile"
    assert len(ada_row["recent"]) == 3
    bob_row = users[bob.id]
    assert bob_row["logins_7d"] == 1
    assert bob_row["logins_30d"] == 1
    assert bob_row["last_login_web"] is None
    assert bob_row["last_login_mobile"] is not None
    assert bob_row["recent"][0]["channel"] == "mobile"
