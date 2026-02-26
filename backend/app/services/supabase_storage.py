"""
Service d'upload vers Supabase Storage.
Utilisé sur Vercel où le filesystem est éphémère.
En local, on écrit simplement sur disque.
"""
import os
import uuid
import requests

_IS_VERCEL = os.environ.get("VERCEL") == "1"
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ccoctyncllgpycagltrq.supabase.co")
_SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
_BUCKET = "uploads"

# Mapping dossier → préfixe dans le bucket
_FOLDER_MAP = {
    "ads":            "ads",
    "avatars":        "avatars",
    "logos":          "logos",
    "supplier_logos": "supplier-logos",
}


def _supabase_headers():
    return {
        "Authorization": f"Bearer {_SUPABASE_KEY}",
        "apikey": _SUPABASE_KEY,
    }


def upload_image(content: bytes, filename: str, folder: str, content_type: str) -> str:
    """
    Sauvegarde une image et retourne l'URL publique.
    - Sur Vercel : Supabase Storage
    - En local  : disque local, URL relative /api/uploads/...
    """
    if _IS_VERCEL and _SUPABASE_KEY:
        return _upload_to_supabase(content, filename, folder, content_type)
    else:
        return _upload_to_disk(content, filename, folder)


def _upload_to_supabase(content: bytes, filename: str, folder: str, content_type: str) -> str:
    bucket_folder = _FOLDER_MAP.get(folder, folder)
    storage_path = f"{bucket_folder}/{filename}"

    r = requests.post(
        f"{_SUPABASE_URL}/storage/v1/object/{_BUCKET}/{storage_path}",
        headers={
            **_supabase_headers(),
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=content,
        timeout=30,
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Supabase Storage upload failed ({r.status_code}): {r.text}")

    return f"{_SUPABASE_URL}/storage/v1/object/public/{_BUCKET}/{storage_path}"


def _upload_to_disk(content: bytes, filename: str, folder: str) -> str:
    from app.database import UPLOADS_DIR, AVATARS_DIR, LOGOS_DIR, SUPPLIER_LOGOS_DIR
    dir_map = {
        "ads":            UPLOADS_DIR,
        "avatars":        AVATARS_DIR,
        "logos":          LOGOS_DIR,
        "supplier_logos": SUPPLIER_LOGOS_DIR,
    }
    directory = dir_map.get(folder, UPLOADS_DIR)
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    # URL locale relative
    url_folder = _FOLDER_MAP.get(folder, folder)
    return f"/api/uploads/{url_folder}/{filename}"
