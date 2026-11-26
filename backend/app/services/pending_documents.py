"""Pièces déposées par l'adhérent, en attente de validation.

Le fichier va dans le dossier Drive du magasin, comme le dépôt fait par l'équipe.
L'état (en attente / refusé) est porté par les propriétés privées du fichier Drive.
Les colonnes rib_url, kbis_url et piece_identite_url de nathalie_adherents
ne sont écrites qu'à l'acceptation, pour que « document manquant » reste vrai avant.
Aucun contenu de pièce n'est journalisé.
"""
from __future__ import annotations

import io
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, UploadFile

from app.models import User, UserRole
from app.services import nathalie_adherents, nathalie_service

MAX_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "application/pdf"}
KINDS = {
    "rib": {"field": "rib_url", "label": "RIB", "missing": "RIB", "drive": "RIB"},
    "kbis": {"field": "kbis_url", "label": "Kbis", "missing": "Kbis", "drive": "Kbis"},
    "piece_identite": {
        "field": "piece_identite_url",
        "label": "Pièce d'identité",
        "missing": "Pièce d'identité",
        "drive": "Piece identite",
    },
}


def resolve_adherent_code(user: User, requested: Optional[str] = None) -> str:
    """Le code demandé est ignoré : seul le magasin lié au compte compte."""
    del requested
    if user.role != UserRole.ADHERENT:
        raise HTTPException(status_code=403, detail="Réservé à l'adhérent")
    code = (user.linked_code_union or "").strip().upper()
    if not code:
        raise HTTPException(status_code=403, detail="Aucun magasin lié à ce compte")
    return code


def _kind(kind: str) -> Dict[str, str]:
    spec = KINDS.get((kind or "").strip())
    if not spec:
        raise ValueError("Pièce inconnue. Choisissez RIB, Kbis ou pièce d'identité.")
    return spec


def _mime(file: UploadFile) -> str:
    raw = (file.content_type or "").split(";")[0].strip().lower()
    if raw == "image/jpg":
        raw = "image/jpeg"
    if raw not in ALLOWED_TYPES:
        raise ValueError("Format accepté : JPEG, PNG ou PDF.")
    return raw


def _read_limited(file: UploadFile) -> bytes:
    stream = file.file
    if hasattr(stream, "seek"):
        try:
            stream.seek(0)
        except Exception:
            pass
    data = stream.read(MAX_BYTES + 1)
    if not data:
        raise ValueError("Fichier vide.")
    if len(data) > MAX_BYTES:
        raise ValueError("Fichier trop lourd (8 Mo maximum).")
    return data


def _props(meta: Optional[Dict[str, Any]]) -> Dict[str, str]:
    raw = (meta or {}).get("appProperties") or {}
    return {str(key): str(value) for key, value in raw.items()}


def _public(item: Dict[str, Any]) -> Dict[str, Any]:
    props = _props(item)
    return {
        "file_id": item.get("id"),
        "kind": props.get("rfaKind"),
        "status": props.get("rfaStatus"),
        "reason": props.get("rfaReason") or None,
        "link": item.get("webViewLink"),
        "created_at": item.get("createdTime"),
    }


def _list_drive(folder_id: str, code: str) -> List[Dict[str, Any]]:
    drive = nathalie_service._get_drive_client()
    safe = code.replace("'", "")
    query = (
        f"'{folder_id}' in parents and trashed = false "
        f"and appProperties has {{ key='rfaCode' and value='{safe}' }}"
    )
    result = drive.files().list(
        q=query,
        fields="files(id,name,webViewLink,createdTime,appProperties)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    return list(result.get("files") or [])


def _get_drive_file(file_id: str) -> Dict[str, Any]:
    drive = nathalie_service._get_drive_client()
    return drive.files().get(
        fileId=file_id,
        fields="id,name,webViewLink,createdTime,appProperties,trashed",
        supportsAllDrives=True,
    ).execute()


def _patch_drive_props(file_id: str, props: Dict[str, str]) -> None:
    drive = nathalie_service._get_drive_client()
    drive.files().update(
        fileId=file_id,
        body={"appProperties": props},
        supportsAllDrives=True,
    ).execute()


def _trash_drive_file(file_id: str) -> None:
    drive = nathalie_service._get_drive_client()
    drive.files().update(
        fileId=file_id,
        body={"trashed": True},
        supportsAllDrives=True,
    ).execute()


def _folder(code: str) -> str:
    client = nathalie_adherents.get_by_code(code)
    if not client:
        raise ValueError("Fiche magasin introuvable")
    nom = (client.get("nom_client") or "").strip() or code
    folder_id, _, _ = nathalie_service._ensure_client_folder(client, nom)
    if not folder_id:
        raise ValueError("Dossier Drive introuvable pour ce magasin.")
    return folder_id


def _latest_by_kind(files: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    chosen: Dict[str, Dict[str, Any]] = {}
    for item in files:
        props = _props(item)
        kind = props.get("rfaKind")
        if kind not in KINDS:
            continue
        current = chosen.get(kind)
        if current is None or (item.get("createdTime") or "") > (current.get("createdTime") or ""):
            chosen[kind] = item
    return chosen


def pieces_for_adherent(code: str) -> List[Dict[str, Any]]:
    client = nathalie_adherents.get_by_code(code) or {}
    missing = set(client.get("missing_docs") or [])
    folder_id = client.get("drive_folder_id")
    latest = _latest_by_kind(_list_drive(folder_id, code)) if folder_id else {}
    rows = []
    for kind, spec in KINDS.items():
        file = latest.get(kind)
        view = _public(file) if file else None
        status = (view or {}).get("status")
        official = bool(client.get(spec["field"]))
        rows.append({
            "kind": kind,
            "label": spec["label"],
            "missing": spec["missing"] in missing or not official,
            "status": None if official else status,
            "reason": None if official or status != "refused" else (view or {}).get("reason"),
            "file_id": None if official else (view or {}).get("file_id"),
        })
    return rows


def pending_for_staff(code: str) -> List[Dict[str, Any]]:
    client = nathalie_adherents.get_by_code(code)
    if not client:
        raise ValueError("Fiche magasin introuvable")
    folder_id = client.get("drive_folder_id")
    if not folder_id:
        return []
    rows = []
    for item in _list_drive(folder_id, code):
        view = _public(item)
        if view["status"] != "pending":
            continue
        view["label"] = KINDS.get(view["kind"], {}).get("label") or view["kind"]
        rows.append(view)
    rows.sort(key=lambda row: row.get("created_at") or "")
    return rows


def submit_pending(code: str, kind: str, file: UploadFile) -> Dict[str, Any]:
    spec = _kind(kind)
    if not nathalie_service._has_upload(file):
        raise ValueError("Fichier manquant.")
    mime = _mime(file)
    payload = _read_limited(file)
    folder_id = _folder(code)
    previous = [
        item for item in _list_drive(folder_id, code)
        if _props(item).get("rfaKind") == kind and _props(item).get("rfaStatus") in {"pending", "refused"}
    ]
    from googleapiclient.http import MediaIoBaseUpload

    drive = nathalie_service._get_drive_client()
    ext = nathalie_service._file_ext(file)
    uploaded = drive.files().create(
        body={
            "name": f"EN_ATTENTE_{spec['drive']}{ext}",
            "parents": [folder_id],
            "appProperties": {
                "rfaStatus": "pending",
                "rfaKind": kind,
                "rfaCode": code,
                "rfaReason": "",
            },
        },
        media_body=MediaIoBaseUpload(io.BytesIO(payload), mimetype=mime, resumable=False),
        fields="id,webViewLink,createdTime,appProperties",
        supportsAllDrives=True,
    ).execute()
    for item in previous:
        if item.get("id"):
            _trash_drive_file(item["id"])
    return {"kind": kind, "status": "pending", "file_id": uploaded.get("id")}


def _owned_file(code: str, file_id: str) -> Dict[str, Any]:
    item = _get_drive_file(file_id)
    if item.get("trashed"):
        raise ValueError("Pièce introuvable")
    props = _props(item)
    if props.get("rfaCode") != code or props.get("rfaKind") not in KINDS:
        raise ValueError("Pièce introuvable pour ce magasin")
    if props.get("rfaStatus") != "pending":
        raise ValueError("Cette pièce n'est plus en attente")
    if not item.get("webViewLink"):
        raise ValueError("Lien Drive introuvable")
    return item


def accept_pending(code: str, file_id: str) -> Dict[str, Any]:
    item = _owned_file(code, file_id)
    props = _props(item)
    spec = KINDS[props["rfaKind"]]
    nathalie_adherents.patch_drive_docs(code, {
        spec["field"]: item["webViewLink"],
        "drive_checked_at": nathalie_adherents._now(),
    })
    _patch_drive_props(file_id, {**props, "rfaStatus": "accepted", "rfaReason": ""})
    client = nathalie_adherents.get_by_code(code)
    return {"success": True, "kind": props["rfaKind"], "client": client}


def refuse_pending(code: str, file_id: str, reason: str) -> Dict[str, Any]:
    item = _owned_file(code, file_id)
    props = _props(item)
    text = " ".join((reason or "").split())
    if not text:
        raise ValueError("Indiquez la raison du refus.")
    _patch_drive_props(file_id, {**props, "rfaStatus": "refused", "rfaReason": text[:120]})
    return {"success": True, "kind": props["rfaKind"], "status": "refused"}
