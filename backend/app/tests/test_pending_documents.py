"""Dépôt de pièces par l'adhérent : son code seulement, validation avant le lien officiel."""
import asyncio
import base64
import json
from datetime import datetime

import pytest
from sqlmodel import Session, SQLModel, create_engine

import app.database as db
from app.database import hash_password
from app.models import User, UserRole
from app.services import nathalie_adherents
from app.services import pending_documents as pending


def _token(user_id: int) -> str:
    raw = f"{user_id}:{datetime.now().timestamp()}"
    return base64.b64encode(raw.encode()).decode()


@pytest.fixture()
def api(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'pieces.db'}",
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
        adherent = session.exec(
            __import__("sqlmodel").select(User).where(User.username == "martin")
        ).first()
        admin = session.exec(
            __import__("sqlmodel").select(User).where(User.username == "ada")
        ).first()
        ids = {"adherent": adherent.id, "admin": admin.id}
    yield app, ids
    engine.dispose()


def _asgi(app, method, path, body=b"", headers=None, content_type="application/json"):
    status = {}
    chunks = []
    raw_headers = [(b"content-type", content_type.encode())]
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
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 9),
        "server": ("test", 80),
    }

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status["code"] = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body") or b"")

    asyncio.run(app(scope, receive, send))
    raw = b"".join(chunks)
    try:
        payload = json.loads(raw.decode() or "null")
    except Exception:
        payload = raw
    return status.get("code"), payload


def _multipart(kind="rib", code="AUTRE", content=b"%PDF-1.4\n"):
    boundary = "----rfa"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="code_union"\r\n\r\n{code}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="kind"\r\n\r\n{kind}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="rib.pdf"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def test_adherent_upload_ignores_another_code(api, monkeypatch):
    app, ids = api
    seen = {}

    def fake_submit(code, kind, file):
        seen["code"] = code
        seen["kind"] = kind
        seen["size"] = len(file.file.read())
        return {"kind": kind, "status": "pending", "file_id": "f1"}

    monkeypatch.setattr("app.services.pending_documents.submit_pending", fake_submit)
    body, ctype = _multipart(code="ZZ99")
    status, payload = _asgi(
        app,
        "POST",
        "/api/me/documents",
        body,
        headers={"authorization": f"Bearer {_token(ids['adherent'])}"},
        content_type=ctype,
    )
    assert status == 200
    assert seen["code"] == "M0001"
    assert seen["kind"] == "rib"
    assert payload["status"] == "pending"
    assert "ZZ99" not in json.dumps(payload)


def test_staff_cannot_use_the_adherent_route(api):
    app, ids = api
    body, ctype = _multipart()
    status, _payload = _asgi(
        app,
        "POST",
        "/api/me/documents",
        body,
        headers={"authorization": f"Bearer {_token(ids['admin'])}"},
        content_type=ctype,
    )
    assert status == 403


def _pending_file(code="M0001", kind="rib", status="pending"):
    return {
        "id": "file1",
        "webViewLink": "https://drive.example/rib",
        "trashed": False,
        "appProperties": {
            "rfaCode": code,
            "rfaKind": kind,
            "rfaStatus": status,
            "rfaReason": "",
        },
    }


def test_accept_writes_the_official_link_and_refuse_does_not(monkeypatch):
    written = {}
    props = {}

    monkeypatch.setattr(pending, "_get_drive_file", lambda _file_id: _pending_file())
    monkeypatch.setattr(pending, "_patch_drive_props", lambda _file_id, new: props.update(new))
    monkeypatch.setattr(
        nathalie_adherents,
        "patch_drive_docs",
        lambda code, fields, clear=False: written.update(fields) or {"code_union": code, **fields},
    )
    monkeypatch.setattr(
        nathalie_adherents,
        "get_by_code",
        lambda code: {"code_union": code, "rib_url": written.get("rib_url"), "missing_docs": [] if written.get("rib_url") else ["RIB"]},
    )
    monkeypatch.setattr(nathalie_adherents, "_now", lambda: "2026-11-26T00:00:00")

    accepted = pending.accept_pending("M0001", "file1")
    assert written["rib_url"] == "https://drive.example/rib"
    assert props["rfaStatus"] == "accepted"
    assert accepted["client"]["rib_url"] == "https://drive.example/rib"

    written.clear()
    props.clear()
    monkeypatch.setattr(pending, "_get_drive_file", lambda _file_id: _pending_file())
    refused = pending.refuse_pending("M0001", "file1", "Photo illisible")
    assert written == {}
    assert props["rfaStatus"] == "refused"
    assert props["rfaReason"] == "Photo illisible"
    assert refused["status"] == "refused"


def test_accept_rejects_another_shops_file(monkeypatch):
    monkeypatch.setattr(pending, "_get_drive_file", lambda _file_id: _pending_file(code="M0001"))
    with pytest.raises(ValueError):
        pending.accept_pending("ZZ99", "file1")
