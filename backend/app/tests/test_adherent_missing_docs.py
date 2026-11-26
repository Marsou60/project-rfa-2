"""Pièces manquantes : lecture seule, code forcé, aucun lien de fichier."""
import asyncio
import base64
import json
from datetime import datetime

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

import app.database as db
from app.database import hash_password
from app.models import User, UserRole
from app.services import nathalie_adherents
from app.services.adherent_missing_docs import missing_labels


def _token(user_id: int) -> str:
    raw = f"{user_id}:{datetime.now().timestamp()}"
    return base64.b64encode(raw.encode()).decode()


@pytest.fixture()
def api(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'missing.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "engine", engine)
    from app.main import app

    with Session(engine) as session:
        session.add(User(
            username="martin",
            password_hash=hash_password("secret"),
            display_name="Martin",
            role=UserRole.ADHERENT,
            linked_code_union="M0001",
            is_active=True,
        ))
        session.add(User(
            username="ada",
            password_hash=hash_password("secret"),
            display_name="Ada",
            role=UserRole.ADMIN,
            is_active=True,
        ))
        session.commit()
        adherent = session.exec(select(User).where(User.username == "martin")).first()
        admin = session.exec(select(User).where(User.username == "ada")).first()
        ids = {"adherent": adherent.id, "admin": admin.id}
    yield app, ids
    engine.dispose()


def _get(app, path, token):
    status = {}
    chunks = []
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path.split("?", 1)[0],
        "raw_path": path.encode(),
        "query_string": path.split("?", 1)[1].encode() if "?" in path else b"",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
        "client": ("127.0.0.1", 9),
        "server": ("test", 80),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status["code"] = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body") or b"")

    asyncio.run(app(scope, receive, send))
    return status.get("code"), json.loads(b"".join(chunks).decode() or "null")


def test_empty_urls_are_missing_and_links_are_not_returned():
    labels = missing_labels({"rib_url": "", "kbis_url": None, "piece_identite_url": "https://drive/cni"})
    assert labels == ["RIB", "Kbis"]
    assert "https://drive/cni" not in labels


def test_adherent_missing_docs_ignore_another_code(api, monkeypatch):
    app, ids = api
    seen = {}

    def fake_get(code):
        seen["code"] = code
        return {"code_union": code, "rib_url": "", "kbis_url": "https://drive/kbis", "piece_identite_url": ""}

    monkeypatch.setattr(nathalie_adherents, "get_by_code", fake_get)
    status, payload = _get(app, "/api/me/missing-docs?code_union=ZZ99", _token(ids["adherent"]))
    assert status == 200
    assert seen["code"] == "M0001"
    assert payload["code_union"] == "M0001"
    assert payload["missing"] == ["RIB", "Pièce d'identité"]
    assert "http" not in json.dumps(payload)


def test_staff_cannot_read_the_adherent_route(api):
    app, ids = api
    status, _payload = _get(app, "/api/me/missing-docs", _token(ids["admin"]))
    assert status == 403
