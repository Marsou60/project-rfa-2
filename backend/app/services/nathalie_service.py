"""
Service Nathalie — Ouverture de comptes adhérents.

- Annuaire adhérents : table Supabase `nathalie_adherents` (source de vérité).
- LISTE CLIENT 2 (Google Sheets) : copie de sécurité, alimentée en best-effort.
- Contacts fournisseurs + tâches : Google Sheets (CONTACT FOURNISSEURS, TACHE CLIENTS).
- Pièces : Google Drive. Envoi ouvertures : Gmail.
"""
from __future__ import annotations

import base64
import os
import re
from typing import List, Dict, Optional, Any, Tuple
from fastapi import UploadFile

from app.services import nathalie_adherents

PHOTO_SLOTS = [
    {
        "file_key": "photo_devanture",
        "url_key": "photo_devanture_url",
        "kind": "photo_devanture",
        "drive_name": "PHOTO 1 - Devanture",
        "patterns": (r"devanture", r"facade", r"façade", r"photo\s*1\b"),
    },
    {
        "file_key": "photo_comptoir",
        "url_key": "photo_comptoir_url",
        "kind": "photo_comptoir",
        "drive_name": "PHOTO 2 - Comptoir",
        "patterns": (r"comptoir", r"photo\s*2\b"),
    },
    {
        "file_key": "photo_stock",
        "url_key": "photo_stock_url",
        "kind": "photo_stock",
        "drive_name": "PHOTO 3 - Stock",
        "patterns": (r"\bstock\b", r"entrepot", r"entrepôt", r"photo\s*3\b"),
    },
    {
        "file_key": "photo_autre_1",
        "url_key": "photo_autre_1_url",
        "kind": "photo_autre_1",
        "drive_name": "PHOTO 4",
        "patterns": (r"photo\s*4\b",),
    },
    {
        "file_key": "photo_autre_2",
        "url_key": "photo_autre_2_url",
        "kind": "photo_autre_2",
        "drive_name": "PHOTO 5",
        "patterns": (r"photo\s*5\b",),
    },
]

# ── Constantes ───────────────────────────────────────────────────────────────

SPREADSHEET_ID = "1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0"
DRIVE_ROOT_ID = "1MYSliOgtVE89YJ4aUqPVj0NdTkx_HeS5"

SHEET_CLIENTS    = "LISTE CLIENT 2"
# Feuille contacts fournisseurs (si renommée, définir CONTACT_FOURNISSEURS_SHEET dans .env)
SHEET_SUPPLIERS  = os.environ.get("CONTACT_FOURNISSEURS_SHEET", "CONTACT FOURNISSEURS ")
SHEET_TASKS      = "TACHE CLIENTS"

# IDs des dossiers Drive par groupe (sous ADHERENTS)
DRIVE_FOLDERS = {
    "INDEPENDANT": "1GRcpfjc4PqGQT1cwMRFn1LFZ2suctiwk",
    "MAGASIN":     "1GRcpfjc4PqGQT1cwMRFn1LFZ2suctiwk",
    "JUMBO":       "1f3st2KMi-OvIjgK7PDvRhe8Im2HFSmGw",
    "EMERIC":      "1Ko3a16Ppn_VrVLPjHKgXHs2lMjN28kEL",
    "APA":         "1IDG1y8w2ccLgJid0w2D-QxrAlqpoBv5C",
    "MOURAD":      "1p3bZxj1F-NE6CclZKQ5fNhE1590sZ3X8",
    "DISCOUNT":    "1tPB595WC7alCuhtVGaJDbyrwZjWoWLYN",
    "LYONNAIS":    "1d57aZjaFRw8RSDbosWNWgCLM3IFQd0PE",
    "STARCOM":     "1cljTqnufHf6PC6xJ7kGn6jIYRkPa0MZF",
    "CENTER":      "1i7eoeaRvZeKXHq_yZE9sCkoEzkFs4ZQV",
    "CODIFA":      "1Ko3a16Ppn_VrVLPjHKgXHs2lMjN28kEL",
}

# Colonnes de LISTE CLIENT 2 (0-indexed) - Pour lecture ET écriture
COL = {
    "id_client":        0,
    "code_union":       1,
    "nom_client":       2,
    "groupe":           3,
    "contact_agent":    4,
    "total_2024":       5,
    "adherent_alliance":6,
    "region":           7,
    "contact_magasin":  8,
    "adresse":          9,
    "code_postal":      10,
    "departement":      11,
    "ville":            12,
    "telephone":        13,
    "responsable_pdv":  14,
    "contact_appro":    15,
    "mail":             16,
    "siret":            17,
    "rib":              18,
    "kbis":             19,
    "piece_identite":   20,
    "ouverture_chez":   21,
    "agent_union":      22,
    "contrat_union":    23,
    "note_generale":    24,
    "photo_enseigne":   25,
}

# Colonnes CONTACT FOURNISSEURS (fallback si lecture par en-têtes échoue)
# La feuille peut avoir une structure mise à jour : on lit les en-têtes pour mapper.
COL_SUP_FALLBACK = {
    "entreprise": 0,
    "logo":       1,
    "nom":        2,
    "prenom":     3,
    "poste":      4,
    "telephone":  5,
    "mail":       6,
}

# Correspondance en-tête Sheet -> clé interne (normalisation : minuscules, sans accents)
SUPPLIER_HEADER_ALIASES = {
    "entreprise": ["entreprise", "société", "societe", "company", "fournisseur", "enseigne"],
    "logo":        ["logo", "logo url", "url logo", "image"],
    "nom":         ["nom", "nom contact", "nom du contact", "nom de famille"],
    "prenom":      ["prenom", "prénom", "prenom contact", "prenom du contact"],
    "poste":       ["poste", "fonction", "titre", "poste contact"],
    "telephone":   ["telephone", "tél", "tel", "téléphone", "phone", "mobile", "portable"],
    "mail":        ["mail", "email", "e-mail", "courriel", "adresse mail", "adresse email"],
}

# Colonnes TACHE CLIENTS
COL_TASK = {
    "id_tache":     0,
    "id_client":    1,
    "code_union":   2,
    "type_rappel":  3,
    "description":  4,
    "date_creation":5,
    "date_echeance":6,
    "statut":       7,
    "createur":     8,
    "assigne_a":    9,
    "priorite":     10,
    "commentaires": 11,
    "terminee":     12,
}

# ── Clients Google ─────────────────────────────────────────────────────────────

def _get_google_service_account_info() -> dict:
    """Lit les credentials du compte de service depuis le fichier ou la variable d'env JSON."""
    import json as _json
    # Priorité 1 : variable d'env contenant le JSON complet (Vercel)
    raw = os.environ.get("GOOGLE_CREDENTIALS_JSON", "").strip()
    if raw:
        return _json.loads(raw)
    # Priorité 2 : fichier local (développement)
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if path and os.path.isfile(path):
        with open(path) as f:
            return _json.load(f)
    raise ValueError(
        "Credentials Google manquants : définir GOOGLE_CREDENTIALS_JSON (Vercel) "
        "ou GOOGLE_APPLICATION_CREDENTIALS (local)"
    )


def _get_sheets_creds():
    """Credentials compte de service pour Sheets (lecture/écriture)."""
    try:
        from google.oauth2 import service_account
    except ImportError:
        raise ImportError("Installez : pip install -r requirements-sheets.txt")
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    return service_account.Credentials.from_service_account_info(
        _get_google_service_account_info(), scopes=scopes
    )


def _get_drive_creds():
    """Credentials OAuth utilisateur pour Drive (upload fichiers)."""
    try:
        from google.oauth2.credentials import Credentials
    except ImportError:
        raise ImportError("Installez : pip install google-auth-oauthlib")

    client_id     = os.environ.get("DRIVE_CLIENT_ID")
    client_secret = os.environ.get("DRIVE_CLIENT_SECRET")
    refresh_token = os.environ.get("DRIVE_REFRESH_TOKEN")

    if not all([client_id, client_secret, refresh_token]):
        raise ValueError(
            "Variables DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN manquantes dans .env"
        )

    return Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/gmail.send",
        ],
    )


def _get_sheets_client():
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=_get_sheets_creds())


def _get_drive_client():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=_get_drive_creds())


def _get_gmail_creds():
    """Credentials OAuth pour Gmail (envoi d'emails). Même compte que Drive.
    Le refresh token doit avoir été obtenu avec le scope gmail.send (voir doc config)."""
    try:
        from google.oauth2.credentials import Credentials
    except ImportError:
        raise ImportError("Installez : pip install google-auth-oauthlib")
    client_id = os.environ.get("DRIVE_CLIENT_ID")
    client_secret = os.environ.get("DRIVE_CLIENT_SECRET")
    refresh_token = os.environ.get("DRIVE_REFRESH_TOKEN")
    if not all([client_id, client_secret, refresh_token]):
        raise ValueError(
            "Variables DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN manquantes (utilisées aussi pour Gmail)"
        )
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/gmail.send",
        ],
    )


def _get_gmail_client():
    from googleapiclient.discovery import build
    return build("gmail", "v1", credentials=_get_gmail_creds())


def _read_sheet(sheet_name: str, max_col: str = "Z") -> List[List[str]]:
    """Lit toutes les lignes d'une feuille (hors en-tête)."""
    client = _get_sheets_client()
    result = (
        client.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{sheet_name}!A1:{max_col}3000")
        .execute()
    )
    values = result.get("values", [])
    return values  # ligne 0 = en-têtes, lignes 1+ = données


def _client_to_sheet_row(client: Dict[str, Any]) -> List[str]:
    """Ligne LISTE CLIENT 2 (même ordre de colonnes qu'historiquement)."""
    max_idx = max(COL.values())
    row = [""] * (max_idx + 1)
    code = (client.get("code_union") or "").strip()
    row[COL["id_client"]] = code
    row[COL["code_union"]] = code
    row[COL["nom_client"]] = client.get("nom_client") or ""
    row[COL["groupe"]] = client.get("groupe") or ""
    row[COL["region"]] = client.get("region_commerciale") or client.get("region") or ""
    row[COL["contact_magasin"]] = client.get("contact_magasin") or client.get("gerant") or ""
    row[COL["adresse"]] = client.get("adresse") or ""
    row[COL["code_postal"]] = client.get("code_postal") or ""
    row[COL["departement"]] = client.get("departement") or ""
    row[COL["ville"]] = client.get("ville") or ""
    row[COL["telephone"]] = client.get("telephone") or ""
    row[COL["responsable_pdv"]] = client.get("contact_responsable_pdv") or ""
    row[COL["contact_appro"]] = client.get("contact_appro") or ""
    row[COL["mail"]] = client.get("mail") or ""
    row[COL["siret"]] = client.get("siret") or ""
    row[COL["rib"]] = client.get("rib_url") or client.get("rib") or ""
    row[COL["kbis"]] = client.get("kbis_url") or client.get("kbis") or ""
    row[COL["piece_identite"]] = client.get("piece_identite_url") or client.get("piece_identite") or ""
    row[COL["ouverture_chez"]] = client.get("ouverture_chez") or ""
    row[COL["agent_union"]] = client.get("agent_union") or ""
    row[COL["contrat_union"]] = client.get("contrat_union") or client.get("contrat_type") or ""
    notes = client.get("notes") or client.get("note_generale") or ""
    tel_resp = client.get("telephone_responsable") or ""
    if tel_resp and "Tél responsable" not in notes:
        notes = f"{notes}\nTél responsable magasin : {tel_resp}".strip()
    row[COL["note_generale"]] = notes
    row[COL["photo_enseigne"]] = client.get("photo_devanture_url") or client.get("photo_devanture") or ""
    return row


def _find_liste_client_row(code_union: str) -> Tuple[Optional[int], Optional[List[str]]]:
    """Numéro de ligne Sheets (1 = en-tête) + contenu. (None, None) si absent."""
    code = (code_union or "").strip().upper()
    if not code:
        return None, None
    rows = _read_sheet(SHEET_CLIENTS, max_col="Z")
    for i, row in enumerate(rows[1:], start=2):
        if _safe(row, COL["code_union"]).upper() == code:
            return i, row
    return None, None


def _preserve_sheet_backup_columns(new_row: List[str], existing: Optional[List[str]]) -> List[str]:
    """Garde CA / Alliance / contact agent historiques si on met à jour une ligne existante."""
    if not existing:
        if not new_row[COL["contact_agent"]]:
            new_row[COL["contact_agent"]] = new_row[COL["agent_union"]]
        return new_row
    for key in ("contact_agent", "total_2024", "adherent_alliance"):
        idx = COL[key]
        old = _safe(existing, idx)
        if old:
            new_row[idx] = old
    return new_row


def _liste_client_sheet_id(sheets) -> int:
    meta = sheets.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets.properties",
    ).execute()
    for sheet in meta.get("sheets") or []:
        props = sheet.get("properties") or {}
        if props.get("title") == SHEET_CLIENTS:
            return int(props["sheetId"])
    raise ValueError(f"Feuille {SHEET_CLIENTS} introuvable")


def _upsert_liste_client_2_row(client: Dict[str, Any]) -> str:
    """Crée ou met à jour la ligne. Retourne 'created' | 'updated'."""
    sheets = _get_sheets_client()
    code = (client.get("code_union") or "").strip()
    row_number, existing_row = _find_liste_client_row(code)
    values = [_preserve_sheet_backup_columns(_client_to_sheet_row(client), existing_row)]
    if row_number:
        sheets.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_CLIENTS}!A{row_number}",
            valueInputOption="USER_ENTERED",
            body={"values": values},
        ).execute()
        return "updated"
    sheets.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_CLIENTS}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": values},
    ).execute()
    return "created"


def _delete_liste_client_2_row(code_union: str) -> bool:
    row_number, _ = _find_liste_client_row(code_union)
    if not row_number:
        return False
    sheets = _get_sheets_client()
    sheet_id = _liste_client_sheet_id(sheets)
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={
            "requests": [{
                "deleteDimension": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": row_number - 1,
                        "endIndex": row_number,
                    }
                }
            }]
        },
    ).execute()
    return True


def _sync_liste_client_2(
    client: Optional[Dict[str, Any]] = None,
    *,
    delete_code: Optional[str] = None,
) -> Optional[str]:
    """Best-effort : n'empêche jamais la création / MAJ / suppression Supabase."""
    try:
        if delete_code:
            _delete_liste_client_2_row(delete_code)
            return None
        if client:
            _upsert_liste_client_2_row(client)
        return None
    except Exception as exc:
        return str(exc)


def _safe(row: List[str], idx: int) -> str:
    if idx < 0:
        return ""
    try:
        return str(row[idx]).strip()
    except IndexError:
        return ""


def _normalize_header(h: str) -> str:
    """Normalise un en-tête pour le matching (minuscules, sans accents, sans espaces superflus)."""
    if not h:
        return ""
    s = str(h).strip().lower()
    for old, new in [("é", "e"), ("è", "e"), ("ê", "e"), ("à", "a"), ("ù", "u"), ("ô", "o"), ("ç", "c"), ("'", " ")]:
        s = s.replace(old, new)
    return " ".join(s.split())


def _extract_drive_file_id(link: str) -> Optional[str]:
    """Extrait l'ID d'un fichier depuis un lien Drive (webViewLink ou open?id=)."""
    if not link or not link.strip():
        return None
    # https://drive.google.com/file/d/XXX/view  ou  https://drive.google.com/open?id=XXX
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", link)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", link)
    if m:
        return m.group(1)
    return None


def _download_drive_file(file_id: str) -> Tuple[bytes, str, str]:
    """Télécharge un fichier depuis Drive. Retourne (contenu, nom_fichier, mimetype)."""
    drive = _get_drive_client()
    meta = drive.files().get(fileId=file_id, fields="name,mimeType").execute()
    name = meta.get("name", "piece_jointe")
    mime = meta.get("mimeType", "application/octet-stream")
    content = drive.files().get_media(fileId=file_id).execute()
    return content, name, mime


def _send_email_gmail(
    to_email: str,
    cc_emails: List[str],
    subject: str,
    body_plain: str,
    attachments: List[Tuple[bytes, str, str]],
) -> str:
    """
    Envoie un email via l'API Gmail (compte OAuth).
    attachments: liste de (contenu_bytes, nom_fichier, mimetype).
    Retourne l'id du message envoyé.
    """
    from email.message import EmailMessage
    if not to_email or "@" not in to_email:
        raise ValueError("Destinataire email invalide")
    gmail = _get_gmail_client()
    message = EmailMessage()
    message["To"] = to_email
    if cc_emails:
        message["Cc"] = ", ".join(cc_emails)
    message["Subject"] = subject
    message.set_content(body_plain)
    for content, filename, mime_type in attachments:
        maintype, _, subtype = (mime_type or "application/octet-stream").partition("/")
        if not subtype:
            subtype = "octet-stream"
        message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = gmail.users().messages().send(userId="me", body={"raw": raw}).execute()
    return sent.get("id", "")


def _build_supplier_col_map(headers: List[str]) -> Dict[str, int]:
    """
    Construit le mapping colonne -> clé à partir de la ligne d'en-têtes CONTACT FOURNISSEURS.
    Retourne un dict { "entreprise": 0, "mail": 5, ... } selon les alias définis.
    """
    col_map: Dict[str, int] = {}
    for col_idx, raw in enumerate(headers):
        norm = _normalize_header(raw)
        if not norm:
            continue
        for key, aliases in SUPPLIER_HEADER_ALIASES.items():
            if key in col_map:
                continue
            if norm in aliases or any(a in norm for a in aliases):
                col_map[key] = col_idx
                break
    return col_map if col_map else None


# ── Logique Métier : Création Client ───────────────────────────────────────────

def get_next_code_union() -> str:
    """Prochain Mxxxx = dernier code de l'annuaire (liste clients) + 1.

    Le Drive n'est pas la source : il peut être en retard ou contenir des dossiers orphelins.
    """
    return nathalie_adherents.next_code_union("M")


def _drive_parent_exists(drive, folder_id: str) -> bool:
    try:
        meta = drive.files().get(
            fileId=folder_id,
            fields="id,trashed",
            supportsAllDrives=True,
        ).execute()
        return not meta.get("trashed")
    except Exception:
        return False


def _resolve_drive_parent(drive, parent_id: str) -> str:
    """Si l'ID mappé a été déplacé / supprimé, retombe sur INDEPENDANTS puis ADHERENTS."""
    if parent_id and _drive_parent_exists(drive, parent_id):
        return parent_id
    independants = DRIVE_FOLDERS.get("INDEPENDANT") or DRIVE_ROOT_ID
    if _drive_parent_exists(drive, independants):
        return independants
    return DRIVE_ROOT_ID


def create_drive_folder(parent_id: str, name: str) -> str:
    """Crée un dossier dans Drive et retourne son ID."""
    drive = _get_drive_client()
    parent_id = _resolve_drive_parent(drive, parent_id)
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    file = drive.files().create(
        body=metadata,
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return file.get("id")


def trash_drive_folder(folder_id: str) -> None:
    """Met le dossier client à la corbeille Drive (pas une suppression définitive Google)."""
    drive = _get_drive_client()
    try:
        drive.files().update(
            fileId=folder_id,
            body={"trashed": True},
            supportsAllDrives=True,
        ).execute()
    except Exception:
        drive.files().update(fileId=folder_id, body={"trashed": True}).execute()


def upload_file_to_drive(parent_id: str, file: UploadFile, filename: Optional[str] = None) -> str:
    """Upload un fichier dans Drive et retourne son lien WebView."""
    from googleapiclient.http import MediaIoBaseUpload
    drive = _get_drive_client()
    name = filename or file.filename

    metadata = {"name": name, "parents": [parent_id]}
    stream = file.file
    if hasattr(stream, "seek"):
        try:
            stream.seek(0)
        except Exception:
            pass
    media = MediaIoBaseUpload(stream, mimetype=file.content_type or "application/octet-stream", resumable=True)

    uploaded = drive.files().create(
        body=metadata,
        media_body=media,
        fields="id, webViewLink",
        supportsAllDrives=True,
    ).execute()
    return uploaded.get("webViewLink")


_DOC_KIND_PATTERNS = {
    "rib": (
        r"\brib\b",
        r"\biban\b",
        r"relev[eé]\s*d['’ ]?identit",
        r"identit[eé]\s*bancaire",
        r"domiciliation",
    ),
    "kbis": (
        r"kbis",
        r"k[\s\-]?bis",
        r"extrait",
        r"immatriculation",
        r"infogreffe",
        r"\binpi\b",
        r"rcs",
    ),
    "piece_identite": (
        r"\bcni\b",
        r"identit",
        r"passeport",
        r"passport",
        r"permis",
        r"carte\s*id",
    ),
}


def classify_drive_filename(name: str) -> Optional[str]:
    """Classe un fichier Drive : rib | kbis | piece_identite | photo_*, sinon None."""
    raw = (name or "").lower()
    for old, new in (("é", "e"), ("è", "e"), ("ê", "e"), ("à", "a"), ("’", "'"), ("'", " ")):
        raw = raw.replace(old, new)
    for slot in PHOTO_SLOTS:
        if any(re.search(p, raw) for p in slot["patterns"]):
            return slot["kind"]
    for kind, patterns in _DOC_KIND_PATTERNS.items():
        if any(re.search(p, raw) for p in patterns):
            return kind
    return None


def score_drive_folder_name(folder_name: str, code_union: str, nom_client: str = "") -> int:
    """Plus le dossier ressemble à « M0160 : Magasin », plus le score est élevé."""
    name = (folder_name or "").strip().upper()
    code = (code_union or "").strip().upper()
    if not name or not code:
        return 0
    nom = (nom_client or "").strip().upper()
    rest = name.split(":", 1)[-1].strip() if ":" in name else name
    name_ok = _drive_names_overlap(nom, rest) if nom else True
    if name.startswith(f"{code} :") or name.startswith(f"{code}:"):
        return 100 if name_ok else 15
    if name.startswith(f"{code} ") or name == code:
        return 80 if name_ok else 15
    if re.search(rf"\b{re.escape(code)}\b", name):
        return 70 if name_ok else 15
    return 0


def _drive_names_overlap(nom_client: str, folder_rest: str) -> bool:
    def blob(s: str) -> str:
        t = (s or "").upper()
        for old, new in (("É", "E"), ("È", "E"), ("Ê", "E"), ("À", "A"), ("Ç", "C"), ("'", " ")):
            t = t.replace(old, new)
        return re.sub(r"[^A-Z0-9]+", " ", t).strip()

    nom = blob(nom_client)
    rest = blob(folder_rest)
    if not nom or not rest:
        return True
    if nom in rest or rest in nom:
        return True
    tokens = [t for t in nom.split() if len(t) >= 4]
    return bool(tokens) and any(t in rest for t in tokens)


def _list_drive_files(drive, **kwargs) -> List[Dict[str, Any]]:
    params = {
        "pageSize": kwargs.pop("pageSize", 50),
        "fields": kwargs.pop("fields", "files(id,name,mimeType,webViewLink,parents)"),
        **kwargs,
    }
    try:
        return drive.files().list(
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            **params,
        ).execute().get("files") or []
    except Exception:
        return drive.files().list(**params).execute().get("files") or []


def _search_drive_folders(drive, code_union: str) -> List[Dict[str, Any]]:
    safe = (code_union or "").replace("'", "\\'")
    if not safe:
        return []
    q = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and trashed=false and name contains '{safe}'"
    )
    return _list_drive_files(drive, q=q, pageSize=25)


def _list_folder_children(drive, folder_id: str) -> List[Dict[str, Any]]:
    safe = folder_id.replace("'", "\\'")
    q = f"'{safe}' in parents and trashed=false"
    return _list_drive_files(
        drive,
        q=q,
        pageSize=80,
        fields="files(id,name,mimeType,webViewLink,modifiedTime)",
    )


def inspect_client_drive(code_union: str, *, persist: bool = True) -> Dict[str, Any]:
    """
    Retrouve le dossier Drive d'un adhérent existant et vérifie RIB / Kbis.
    Ne crée rien. Met à jour les liens en base si des pièces sont trouvées.
    """
    client = get_client_by_code(code_union)
    if not client:
        raise ValueError(f"Client {code_union} introuvable")
    code = (client.get("code_union") or code_union).strip().upper()
    empty = {
        "code_union": code,
        "folder_found": False,
        "folder_id": None,
        "folder_name": None,
        "drive_link": None,
        "rib": None,
        "kbis": None,
        "piece_identite": None,
        "files": [],
        "has_rib": False,
        "has_kbis": False,
        "docs_ok": False,
    }

    def _fail(exc: Exception) -> Dict[str, Any]:
        msg = str(exc)
        if "invalid_grant" in msg.lower():
            empty["error"] = "Connexion Google Drive expirée. Il faut renouveler DRIVE_REFRESH_TOKEN."
        else:
            empty["error"] = msg
        return empty

    try:
        drive = _get_drive_client()
        folder = None
        folder_id = client.get("drive_folder_id")
        if folder_id:
            try:
                folder = drive.files().get(
                    fileId=folder_id,
                    fields="id,name,webViewLink,mimeType,trashed",
                    supportsAllDrives=True,
                ).execute()
                if folder.get("trashed") or folder.get("mimeType") != "application/vnd.google-apps.folder":
                    folder = None
            except Exception:
                try:
                    folder = drive.files().get(fileId=folder_id, fields="id,name,webViewLink,mimeType").execute()
                except Exception:
                    folder = None

        if not folder:
            candidates = _search_drive_folders(drive, code)
            ranked = sorted(
                candidates,
                key=lambda f: score_drive_folder_name(f.get("name") or "", code, client.get("nom_client") or ""),
                reverse=True,
            )
            folder = next(
                (f for f in ranked if score_drive_folder_name(f.get("name") or "", code, client.get("nom_client") or "") >= 80),
                None,
            )

        if not folder:
            if persist:
                nathalie_adherents.patch_drive_docs(code, {
                    "drive_checked_at": nathalie_adherents._now(),
                })
            empty["error"] = f"Aucun dossier Drive trouvé pour {code}"
            empty["drive_checked"] = True
            return empty

        children = _list_folder_children(drive, folder["id"])
        classified: Dict[str, Dict[str, Any]] = {}
        files_out = []
        for item in children:
            kind = classify_drive_filename(item.get("name") or "")
            info = {
                "id": item.get("id"),
                "name": item.get("name"),
                "mime": item.get("mimeType"),
                "link": item.get("webViewLink"),
                "kind": kind,
            }
            files_out.append(info)
            if kind and kind not in classified:
                classified[kind] = info

        rib = classified.get("rib")
        kbis = classified.get("kbis")
        piece = classified.get("piece_identite")
        photos = {slot["kind"]: classified.get(slot["kind"]) for slot in PHOTO_SLOTS}
        result = {
            "code_union": code,
            "folder_found": True,
            "folder_id": folder.get("id"),
            "folder_name": folder.get("name"),
            "drive_link": folder.get("webViewLink") or f"https://drive.google.com/drive/folders/{folder.get('id')}",
            "rib": rib,
            "kbis": kbis,
            "piece_identite": piece,
            **photos,
            "files": files_out,
            "has_rib": bool(rib),
            "has_kbis": bool(kbis),
            "docs_ok": bool(rib and kbis),
        }
        if persist:
            patch = {
                "drive_folder_id": result["folder_id"],
                "drive_link": result["drive_link"],
                "rib_url": (rib or {}).get("link"),
                "kbis_url": (kbis or {}).get("link"),
                "piece_identite_url": (piece or {}).get("link"),
                "drive_checked_at": nathalie_adherents._now(),
            }
            for slot in PHOTO_SLOTS:
                link = (photos.get(slot["kind"]) or {}).get("link")
                if link:
                    patch[slot["url_key"]] = link
            nathalie_adherents.patch_drive_docs(code, patch)
        return result
    except Exception as exc:
        return _fail(exc)


_FOLDER_CODE_RE = re.compile(r"^([A-Z]\d{3,5})\b", re.IGNORECASE)


def extract_code_from_folder_name(name: str) -> Optional[str]:
    match = _FOLDER_CODE_RE.match((name or "").strip())
    return match.group(1).upper() if match else None


def _list_child_folders(drive, parent_id: str) -> List[Dict[str, Any]]:
    safe = parent_id.replace("'", "\\'")
    q = (
        f"'{safe}' in parents and mimeType='application/vnd.google-apps.folder' "
        "and trashed=false"
    )
    return _list_drive_files(drive, q=q, pageSize=1000)


def sync_drive_dossiers() -> Dict[str, Any]:
    """
    Parcourt les dossiers Drive par groupe, rattache chaque code Union,
    et note RIB / Kbis manquants. Alimente la file « dossiers en cours ».
    """
    drive = _get_drive_client()
    parent_ids = list(dict.fromkeys([DRIVE_ROOT_ID, *DRIVE_FOLDERS.values()]))
    folders_by_code: Dict[str, Dict[str, Any]] = {}
    folders_seen = 0
    for parent_id in parent_ids:
        for folder in _list_child_folders(drive, parent_id):
            folders_seen += 1
            code = extract_code_from_folder_name(folder.get("name") or "")
            if not code:
                continue
            prev = folders_by_code.get(code)
            score = score_drive_folder_name(folder.get("name") or "", code)
            if not prev or score > score_drive_folder_name(prev.get("name") or "", code):
                folders_by_code[code] = folder

    checked = 0
    matched = 0
    en_cours = 0
    complets = 0
    now = nathalie_adherents._now()
    for client in nathalie_adherents.list_clients():
        code = (client.get("code_union") or "").upper()
        if not code:
            continue
        folder = folders_by_code.get(code)
        if folder:
            matched += 1
            children = _list_folder_children(drive, folder["id"])
            classified: Dict[str, Dict[str, Any]] = {}
            for item in children:
                kind = classify_drive_filename(item.get("name") or "")
                if kind and kind not in classified:
                    classified[kind] = {
                        "link": item.get("webViewLink"),
                        "name": item.get("name"),
                    }
            rib = classified.get("rib")
            kbis = classified.get("kbis")
            piece = classified.get("piece_identite")
            nathalie_adherents.patch_drive_docs(code, {
                "drive_folder_id": folder.get("id"),
                "drive_link": folder.get("webViewLink") or f"https://drive.google.com/drive/folders/{folder.get('id')}",
                "rib_url": (rib or {}).get("link"),
                "kbis_url": (kbis or {}).get("link"),
                "piece_identite_url": (piece or {}).get("link"),
                "drive_checked_at": now,
            })
            if rib and kbis:
                complets += 1
            else:
                en_cours += 1
        else:
            nathalie_adherents.patch_drive_docs(code, {"drive_checked_at": now})
            en_cours += 1
        checked += 1

    return {
        "folders_seen": folders_seen,
        "folders_matched": matched,
        "checked": checked,
        "en_cours": en_cours,
        "complets": complets,
    }


def _has_upload(file: Optional[UploadFile]) -> bool:
    if isinstance(file, (list, tuple)):
        file = file[0] if file else None
    return bool(file and getattr(file, "filename", None))


def _file_ext(file: UploadFile) -> str:
    name = file.filename or ""
    _, ext = os.path.splitext(name)
    return ext if ext else ".jpg"


def _upload_client_files(folder_id: str, files: Optional[Dict[str, UploadFile]]) -> Dict[str, str]:
    links: Dict[str, str] = {}
    files = files or {}
    for key in ("rib", "kbis", "piece_identite"):
        f = files.get(key)
        if isinstance(f, (list, tuple)):
            f = f[0] if f else None
        if _has_upload(f):
            links[key] = upload_file_to_drive(folder_id, f)
    for slot in PHOTO_SLOTS:
        f = files.get(slot["file_key"])
        if isinstance(f, (list, tuple)):
            f = f[0] if f else None
        if _has_upload(f):
            links[slot["file_key"]] = upload_file_to_drive(
                folder_id, f, f"{slot['drive_name']}{_file_ext(f)}"
            )
    return links


def _ensure_client_folder(client: Dict[str, Any], nom: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    folder_id = client.get("drive_folder_id")
    drive_link = client.get("drive_link")
    if folder_id:
        return folder_id, drive_link, None
    groupe_key = _normalize_group_key(client.get("groupe") or "")
    parent_folder_id = DRIVE_FOLDERS.get(groupe_key, DRIVE_FOLDERS["MAGASIN"])
    code = client.get("code_union")
    folder_name = f"{code} : {nom}"
    folder_id = create_drive_folder(parent_folder_id, folder_name)
    drive_link = f"https://drive.google.com/drive/folders/{folder_id}"
    return folder_id, drive_link, None


async def create_client_full(
    data: Dict[str, Any],
    files: Dict[str, UploadFile]
) -> Dict[str, Any]:
    """
    Orchestre la création complète :
    1. Générer Code Union
    2. Créer dossier Drive (selon groupe) + upload pièces / photos (best-effort)
    3. Enregistrer l'adhérent dans Supabase
    """
    nom = (data.get("nom_client") or "").strip()
    if not nom:
        raise ValueError("nom_client requis")

    from app.services.nathalie_entreprise import resolve_siret_for_storage
    siret = resolve_siret_for_storage(data.get("siret"))
    if not siret:
        raise ValueError(
            "SIRET (14 chiffres) requis pour enregistrer l’adhérent. "
            "Le RCS sert uniquement à retrouver l’entreprise."
        )
    data["siret"] = siret

    code_union = get_next_code_union()
    data["code_union"] = code_union
    folder_name = f"{code_union} : {nom}"
    folder_id = None
    drive_link = None
    drive_warning = None
    links: Dict[str, str] = {}

    try:
        groupe_key = _normalize_group_key(data.get("groupe", ""))
        parent_folder_id = DRIVE_FOLDERS.get(groupe_key, DRIVE_FOLDERS["MAGASIN"])
        folder_id = create_drive_folder(parent_folder_id, folder_name)
        drive_link = f"https://drive.google.com/drive/folders/{folder_id}"
        links = _upload_client_files(folder_id, files)
    except Exception as exc:
        drive_warning = str(exc)

    now = nathalie_adherents._now()
    nathalie_adherents.upsert_client({
        **data,
        "code_union": code_union,
        "nom_client": nom,
        "contact_magasin": data.get("contact_magasin") or data.get("gerant") or data.get("contact"),
        "contact_responsable_pdv": data.get("contact_responsable_pdv") or data.get("responsable_magasin"),
        "telephone_responsable": data.get("telephone_responsable"),
        "rib": links.get("rib"),
        "kbis": links.get("kbis"),
        "piece_identite": links.get("piece_identite"),
        "photo_devanture": links.get("photo_devanture"),
        "photo_comptoir": links.get("photo_comptoir"),
        "photo_stock": links.get("photo_stock"),
        "photo_autre_1": links.get("photo_autre_1"),
        "photo_autre_2": links.get("photo_autre_2"),
        "drive_folder_id": folder_id,
        "drive_link": drive_link,
        "drive_checked_at": now,
        "date_creation_compte": now,
        "source": "manuel",
    }, keep_docs=False)

    created = nathalie_adherents.get_by_code(code_union)
    sheet_warning = _sync_liste_client_2(created)

    result = {
        "success": True,
        "code_union": code_union,
        "folder_name": folder_name,
        "drive_link": drive_link,
        "date_creation_compte": now if isinstance(now, str) else getattr(now, "isoformat", lambda: now)(),
    }
    if hasattr(result["date_creation_compte"], "isoformat"):
        result["date_creation_compte"] = result["date_creation_compte"].isoformat()
    if drive_warning:
        result["drive_warning"] = drive_warning
    if sheet_warning:
        result["sheet_warning"] = sheet_warning
    return result


async def update_client_full(
    code_union: str,
    data: Dict[str, Any],
    files: Optional[Dict[str, UploadFile]] = None,
) -> Dict[str, Any]:
    existing = nathalie_adherents.get_by_code(code_union)
    if not existing:
        raise ValueError(f"Client {code_union} introuvable")
    code = existing["code_union"]
    nom = (data.get("nom_client") or existing.get("nom_client") or "").strip()
    if not nom:
        raise ValueError("nom_client requis")
    if not (data.get("agent_union") or "").strip():
        data["agent_union"] = existing.get("agent_union")
    if not (data.get("region_commerciale") or "").strip():
        data["region_commerciale"] = existing.get("region_commerciale")
    if not (data.get("groupe") or "").strip():
        data["groupe"] = existing.get("groupe")

    siret_in = data.get("siret")
    if siret_in:
        from app.services.nathalie_entreprise import resolve_siret_for_storage
        stored = resolve_siret_for_storage(siret_in)
        if stored:
            data["siret"] = stored

    old_agent = (existing.get("agent_union") or "").strip()
    old_region = (existing.get("region_commerciale") or "").strip()

    folder_id = existing.get("drive_folder_id")
    drive_link = existing.get("drive_link")
    drive_warning = None
    links: Dict[str, str] = {}
    has_files = any(_has_upload((files or {}).get(k)) for k in [
        "rib", "kbis", "piece_identite",
        *(s["file_key"] for s in PHOTO_SLOTS),
    ])
    if has_files:
        try:
            folder_id, drive_link, _ = _ensure_client_folder({**existing, **data, "code_union": code}, nom)
            links = _upload_client_files(folder_id, files)
        except Exception as exc:
            drive_warning = str(exc)

    payload = {
        **data,
        "code_union": code,
        "nom_client": nom,
        "source": existing.get("source") or "manuel",
        "drive_folder_id": folder_id,
        "drive_link": drive_link,
        "rib": links.get("rib"),
        "kbis": links.get("kbis"),
        "piece_identite": links.get("piece_identite"),
        "photo_devanture": links.get("photo_devanture"),
        "photo_comptoir": links.get("photo_comptoir"),
        "photo_stock": links.get("photo_stock"),
        "photo_autre_1": links.get("photo_autre_1"),
        "photo_autre_2": links.get("photo_autre_2"),
    }
    client = nathalie_adherents.upsert_client(payload, keep_docs=True)

    new_agent = (client.get("agent_union") or "").strip()
    new_region = (client.get("region_commerciale") or "").strip()
    reassigned = {}
    if new_agent != old_agent or new_region != old_region:
        reassigned = nathalie_adherents.reassign_code_union_portfolio(
            code, new_agent or None, new_region or None,
        )

    result = {
        "success": True,
        "client": client,
        "reassigned": reassigned,
        "agent_changed": new_agent != old_agent,
    }
    if drive_warning:
        result["drive_warning"] = drive_warning
    sheet_warning = _sync_liste_client_2(client)
    if sheet_warning:
        result["sheet_warning"] = sheet_warning
    return result


def delete_client_full(code_union: str, *, trash_drive: bool = True) -> Dict[str, Any]:
    existing = nathalie_adherents.get_by_code(code_union)
    if not existing:
        raise ValueError(f"Client {code_union} introuvable")
    drive_warning = None
    drive_trashed = False
    folder_id = existing.get("drive_folder_id")
    if trash_drive and folder_id:
        try:
            trash_drive_folder(folder_id)
            drive_trashed = True
        except Exception as exc:
            drive_warning = str(exc)
    nathalie_adherents.delete_client(code_union)
    sheet_warning = _sync_liste_client_2(delete_code=existing.get("code_union"))
    result = {
        "success": True,
        "deleted": existing.get("code_union"),
        "nom_client": existing.get("nom_client"),
        "drive_trashed": drive_trashed,
    }
    if drive_warning:
        result["drive_warning"] = drive_warning
    if sheet_warning:
        result["sheet_warning"] = sheet_warning
    return result


def _normalize_group_key(groupe_input: str) -> str:
    """Normalise le nom du groupe pour trouver l'ID Drive."""
    s = groupe_input.upper()
    if "JUMBO" in s: return "JUMBO"
    if "EMERIC" in s: return "EMERIC"
    if "APA" in s: return "APA"
    if "MOURAD" in s: return "MOURAD"
    if "DISCOUNT" in s: return "DISCOUNT"
    if "LYONNAIS" in s: return "LYONNAIS"
    if "STARCOM" in s: return "STARCOM"
    if "CENTER" in s: return "CENTER"
    if "CODIFA" in s: return "CODIFA"
    return "MAGASIN" # Par défaut indépendant


# ── Modèles de données (Lecture) ──────────────────────────────────────────────

def _row_to_client(row: List[str]) -> Dict[str, Any]:
    return {
        "id_client":         _safe(row, COL["id_client"]),
        "code_union":        _safe(row, COL["code_union"]),
        "nom_client":        _safe(row, COL["nom_client"]),
        "groupe":            _safe(row, COL["groupe"]),
        "contact_agent":     _safe(row, COL["contact_agent"]),
        "region":            _safe(row, COL["region"]),
        "adresse":           _safe(row, COL["adresse"]),
        "code_postal":       _safe(row, COL["code_postal"]),
        "ville":             _safe(row, COL["ville"]),
        "telephone":         _safe(row, COL["telephone"]),
        "mail":              _safe(row, COL["mail"]),
        "siret":             _safe(row, COL["siret"]),
        "rib":               _safe(row, COL["rib"]),
        "kbis":              _safe(row, COL["kbis"]),
        "piece_identite":    _safe(row, COL["piece_identite"]),
        "ouverture_chez":    _safe(row, COL["ouverture_chez"]),
        "agent_union":       _safe(row, COL["agent_union"]),
        "contrat_union":     _safe(row, COL["contrat_union"]),
        "note_generale":     _safe(row, COL["note_generale"]),
        # Statut calculé
        "docs_complets":     bool(
            _safe(row, COL["rib"]) and
            _safe(row, COL["kbis"]) and
            _safe(row, COL["piece_identite"])
        ),
    }


def _row_to_supplier(row: List[str], col_map: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """Convertit une ligne CONTACT FOURNISSEURS en dict. col_map = mapping dynamique (en-têtes)."""
    c = col_map or COL_SUP_FALLBACK
    return {
        "entreprise": _safe(row, c.get("entreprise", -1)),
        "nom":        _safe(row, c.get("nom", -1)),
        "prenom":     _safe(row, c.get("prenom", -1)),
        "poste":      _safe(row, c.get("poste", -1)),
        "telephone":  _safe(row, c.get("telephone", -1)),
        "mail":       _safe(row, c.get("mail", -1)),
    }


def _row_to_task(row: List[str]) -> Dict[str, Any]:
    return {
        "id_tache":      _safe(row, COL_TASK["id_tache"]),
        "id_client":     _safe(row, COL_TASK["id_client"]),
        "code_union":    _safe(row, COL_TASK["code_union"]),
        "type_rappel":   _safe(row, COL_TASK["type_rappel"]),
        "description":   _safe(row, COL_TASK["description"]),
        "date_creation": _safe(row, COL_TASK["date_creation"]),
        "date_echeance": _safe(row, COL_TASK["date_echeance"]),
        "statut":        _safe(row, COL_TASK["statut"]),
        "createur":      _safe(row, COL_TASK["createur"]),
        "assigne_a":     _safe(row, COL_TASK["assigne_a"]),
        "priorite":      _safe(row, COL_TASK["priorite"]),
        "commentaires":  _safe(row, COL_TASK["commentaires"]),
        "terminee":      _safe(row, COL_TASK["terminee"]).upper() == "TRUE",
    }


# ── API publique du service ───────────────────────────────────────────────────

def get_clients(with_ouverture_only: bool = False) -> List[Dict[str, Any]]:
    """Liste des adhérents Union (table nathalie_adherents)."""
    return nathalie_adherents.list_clients(with_ouverture_only=with_ouverture_only)


def get_suppliers() -> List[Dict[str, Any]]:
    """
    Retourne la liste des contacts fournisseurs depuis CONTACT FOURNISSEURS.
    La structure de la feuille peut avoir changé : on lit la première ligne comme en-têtes
    et on mappe dynamiquement les colonnes (entreprise, nom, prénom, mail, etc.).
    """
    rows = _read_sheet(SHEET_SUPPLIERS)
    if not rows:
        return []
    headers = rows[0]
    col_map = _build_supplier_col_map(headers)
    if not col_map:
        col_map = COL_SUP_FALLBACK
    idx_entreprise = col_map.get("entreprise", 0)
    return [
        _row_to_supplier(row, col_map)
        for row in rows[1:]
        if _safe(row, idx_entreprise)
    ]


def get_tasks(code_union: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retourne les tâches, optionnellement filtrées par code union."""
    rows = _read_sheet(SHEET_TASKS)
    if not rows:
        return []
    tasks = [_row_to_task(row) for row in rows[1:] if _safe(row, COL_TASK["id_tache"])]
    if code_union:
        tasks = [t for t in tasks if t["code_union"] == code_union]
    return tasks


def get_client_by_code(code_union: str) -> Optional[Dict[str, Any]]:
    """Retourne un adhérent précis par code union."""
    return nathalie_adherents.get_by_code(code_union)


# ── Génération d'email fournisseur ────────────────────────────────────────────

EMAIL_TEMPLATES: Dict[str, str] = {
    "DEFAULT": """Bonjour {prenom_contact} {nom_contact},

Je me permets de vous contacter au nom du Groupement Union afin de vous demander de bien vouloir procéder à l'ouverture d'un compte pour l'un de nos adhérents.

Informations adhérent :
- Raison sociale : {nom_client}
- Code Union : {code_union}
- SIRET : {siret}
- Adresse : {adresse}, {code_postal} {ville}
- Contact : {mail} — {telephone}

Les documents nécessaires (RIB, Kbis, pièce d'identité) ont été transmis ou sont disponibles sur demande.

Merci de bien vouloir nous confirmer l'ouverture du compte dès que possible.

Cordialement,
{agent_union}
Groupement Union""",

    "ACR": """Bonjour {prenom_contact} {nom_contact},

Dans le cadre du développement de notre réseau, nous souhaitons procéder à l'affiliation de l'adhérent suivant à la plateforme ACR :

- Raison sociale : {nom_client}
- Code Union : {code_union}
- SIRET : {siret}
- Adresse : {adresse}, {code_postal} {ville}
- Référent commercial : {agent_union}

Pourriez-vous nous indiquer la marche à suivre pour finaliser cette ouverture ?

Dans l'attente de votre retour,
Cordialement,
{agent_union}
Groupement Union""",

    "ALLIANCE": """Bonjour {prenom_contact} {nom_contact},

Nous vous contactons pour l'ouverture d'un compte Alliance pour l'adhérent suivant :

- Raison sociale : {nom_client}
- Code Union : {code_union}
- SIRET : {siret}
- Adresse : {adresse}, {code_postal} {ville}

Merci de nous confirmer la création du compte et le numéro de compte attribué.

Cordialement,
{agent_union}
Groupement Union""",
}


def generate_email(
    client: Dict[str, Any],
    supplier: Dict[str, Any],
    template_key: Optional[str] = None,
) -> Dict[str, str]:
    """
    Génère un email prêt à envoyer pour un fournisseur donné.
    Retourne {"sujet": ..., "corps": ..., "destinataire": ...}
    """
    key = (template_key or supplier.get("entreprise", "DEFAULT")).upper()
    template = EMAIL_TEMPLATES.get(key, EMAIL_TEMPLATES["DEFAULT"])

    corps = template.format(
        nom_client=client.get("nom_client", ""),
        code_union=client.get("code_union", ""),
        siret=client.get("siret", ""),
        adresse=client.get("adresse", ""),
        code_postal=client.get("code_postal", ""),
        ville=client.get("ville", ""),
        mail=client.get("mail", ""),
        telephone=client.get("telephone", ""),
        agent_union=client.get("agent_union", "Groupement Union"),
        nom_contact=supplier.get("nom", ""),
        prenom_contact=supplier.get("prenom", ""),
        entreprise=supplier.get("entreprise", ""),
    )

    return {
        "destinataire": supplier.get("mail", ""),
        "sujet": f"Ouverture de compte adhérent — {client.get('nom_client', '')} ({client.get('code_union', '')})",
        "corps": corps,
        "fournisseur": supplier.get("entreprise", ""),
        "nom_client": client.get("nom_client", ""),
        "code_union": client.get("code_union", ""),
    }


# ── Envoi réel par Gmail (avec pièces jointes depuis Drive) ─────────────────────

def _get_cc_emails_from_env() -> List[str]:
    """Liste des emails en copie (config .env NATHALIE_CC_EMAILS, séparés par des virgules)."""
    raw = os.environ.get("NATHALIE_CC_EMAILS", "").strip()
    if not raw:
        return []
    return [e.strip() for e in raw.split(",") if e.strip() and "@" in e]


def send_emails_to_suppliers(
    code_union: str,
    supplier_names: List[str],
    cc_emails: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Envoie un email par fournisseur (confidentialité), avec pièces jointes RIB/Kbis/pièce d'identité.
    Chaque email est envoyé via Gmail API ; les pièces sont téléchargées depuis Drive.
    Retourne une liste de { "fournisseur", "success", "message_id" ou "error" }.
    """
    client = get_client_by_code(code_union)
    if not client:
        raise ValueError(f"Client {code_union} introuvable")
    cc = cc_emails if cc_emails is not None else _get_cc_emails_from_env()
    all_suppliers = get_suppliers()
    sup_map = {s["entreprise"].upper(): s for s in all_suppliers if s.get("entreprise")}

    # Pièces jointes : télécharger depuis Drive une seule fois pour tous les mails
    attachments: List[Tuple[bytes, str, str]] = []
    for key, link in [
        ("rib", client.get("rib", "")),
        ("kbis", client.get("kbis", "")),
        ("piece_identite", client.get("piece_identite", "")),
    ]:
        if not link:
            continue
        file_id = _extract_drive_file_id(link)
        if not file_id:
            continue
        try:
            content, name, mime = _download_drive_file(file_id)
            attachments.append((content, name, mime))
        except Exception:
            pass  # on ignore les pièces injoignables

    results = []
    for name in supplier_names:
        supplier = sup_map.get(name.upper())
        if not supplier:
            results.append({
                "fournisseur": name,
                "success": False,
                "error": "Contact fournisseur introuvable (pas d'email dans CONTACT FOURNISSEURS)",
            })
            continue
        to_email = (supplier.get("mail") or "").strip()
        if not to_email or "@" not in to_email:
            results.append({
                "fournisseur": name,
                "success": False,
                "error": "Email du contact fournisseur manquant ou invalide",
            })
            continue
        try:
            email_data = generate_email(client, supplier)
            msg_id = _send_email_gmail(
                to_email=to_email,
                cc_emails=cc,
                subject=email_data["sujet"],
                body_plain=email_data["corps"],
                attachments=attachments,
            )
            results.append({
                "fournisseur": name,
                "success": True,
                "message_id": msg_id,
            })
        except Exception as e:
            results.append({
                "fournisseur": name,
                "success": False,
                "error": str(e),
            })
    return results
