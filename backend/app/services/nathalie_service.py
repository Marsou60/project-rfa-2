"""
Service Nathalie — Ouverture de comptes adhérents.
Lit/Écrit les données dans Google Sheets (LISTE CLIENT 2) + Drive (Dossiers clients).
Envoi des demandes d'ouverture par email via l'API Gmail (avec pièces jointes depuis Drive).
"""
from __future__ import annotations

import base64
import os
import re
from typing import List, Dict, Optional, Any, Tuple
from fastapi import UploadFile

# ── Constantes ───────────────────────────────────────────────────────────────

SPREADSHEET_ID = "1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0"
DRIVE_ROOT_ID = "1MYSliOgtVE89YJ4aUqPVj0NdTkx_HeS5"

SHEET_CLIENTS    = "LISTE CLIENT 2"
# Feuille contacts fournisseurs (si renommée, définir CONTACT_FOURNISSEURS_SHEET dans .env)
SHEET_SUPPLIERS  = os.environ.get("CONTACT_FOURNISSEURS_SHEET", "CONTACT FOURNISSEURS ")
SHEET_TASKS      = "TACHE CLIENTS"

# IDs des dossiers Drive par groupe (mappés depuis le frontend)
DRIVE_FOLDERS = {
    "INDEPENDANT": "1JA1g_h4dwbJ4KEAG1sAXF9S1uOxRWaDx",
    "MAGASIN":     "1JA1g_h4dwbJ4KEAG1sAXF9S1uOxRWaDx", # Alias
    "JUMBO":       "1f3st2KMi-OvIjgK7PDvRhe8Im2HFSmGw",
    "EMERIC":      "1Ko3a16Ppn_VrVLPjHKgXHs2lMjN28kEL",
    "APA":         "1IDG1y8w2ccLgJid0w2D-QxrAlqpoBv5C",
    "MOURAD":      "1p3bZxj1F-NE6CclZKQ5fNhE1590sZ3X8",
    "DISCOUNT":    "1tPB595WC7alCuhtVGaJDbyrwZjWoWLYN",
    "LYONNAIS":    "1d57aZjaFRw8RSDbosWNWgCLM3IFQd0PE",
    "STARCOM":     "1cljTqnufHf6PC6xJ7kGn6jIYRkPa0MZF",
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
    """Trouve le dernier code Mxxxx et retourne le suivant."""
    rows = _read_sheet(SHEET_CLIENTS, "B") # On lit juste les codes union
    if not rows or len(rows) < 2:
        return "M0001"
    
    last_code = "M0000"
    for row in rows[1:]: # Skip header
        code = _safe(row, COL["code_union"])
        if code.startswith("M") and code[1:].isdigit():
            # Garder le max
            try:
                if int(code[1:]) > int(last_code[1:]):
                    last_code = code
            except ValueError:
                continue
    
    next_num = int(last_code[1:]) + 1
    return f"M{next_num:04d}"


def create_drive_folder(parent_id: str, name: str) -> str:
    """Crée un dossier dans Drive et retourne son ID."""
    drive = _get_drive_client()
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id]
    }
    file = drive.files().create(body=metadata, fields="id").execute()
    return file.get("id")


def upload_file_to_drive(parent_id: str, file: UploadFile) -> str:
    """Upload un fichier dans Drive et retourne son lien WebView."""
    from googleapiclient.http import MediaIoBaseUpload
    drive = _get_drive_client()
    
    metadata = {"name": file.filename, "parents": [parent_id]}
    media = MediaIoBaseUpload(file.file, mimetype=file.content_type, resumable=True)
    
    uploaded = drive.files().create(
        body=metadata,
        media_body=media,
        fields="id, webViewLink"
    ).execute()
    return uploaded.get("webViewLink")


async def create_client_full(
    data: Dict[str, Any],
    files: Dict[str, UploadFile]
) -> Dict[str, Any]:
    """
    Orchestre la création complète :
    1. Générer Code Union
    2. Créer dossier Drive (selon groupe)
    3. Upload pièces jointes
    4. Ajouter ligne dans Sheet
    """
    # 1. Code Union
    code_union = get_next_code_union()
    data["code_union"] = code_union
    
    # 2. Dossier Drive
    groupe_key = _normalize_group_key(data.get("groupe", ""))
    parent_folder_id = DRIVE_FOLDERS.get(groupe_key, DRIVE_FOLDERS["MAGASIN"]) # Fallback magasin
    
    folder_name = f"{code_union} : {data.get('nom_client', 'Nouveau Client')}"
    folder_id = create_drive_folder(parent_folder_id, folder_name)
    
    # 3. Upload fichiers
    links = {}
    for key, file in files.items():
        if file:
            link = upload_file_to_drive(folder_id, file)
            links[key] = link
            
    # 4. Préparer la ligne Sheet
    # On construit une liste de la taille max des colonnes
    max_idx = max(COL.values())
    row = [""] * (max_idx + 1)
    
    # Mapping champs form -> colonnes Sheet
    # ID CLIENT généré ? On met code_union pour l'instant ou vide
    row[COL["code_union"]] = code_union
    row[COL["nom_client"]] = data.get("nom_client", "")
    row[COL["groupe"]] = data.get("groupe", "")
    row[COL["adresse"]] = data.get("adresse", "")
    row[COL["code_postal"]] = data.get("code_postal", "")
    row[COL["ville"]] = data.get("ville", "")
    row[COL["telephone"]] = data.get("telephone", "")
    row[COL["mail"]] = data.get("mail", "") # Contact principal
    row[COL["siret"]] = data.get("siret", "")
    row[COL["agent_union"]] = data.get("agent_union", "")
    row[COL["contrat_union"]] = data.get("contrat_type", "")
    row[COL["note_generale"]] = data.get("notes", "")
    
    # Liens Drive
    row[COL["rib"]] = links.get("rib", "")
    row[COL["kbis"]] = links.get("kbis", "")
    row[COL["piece_identite"]] = links.get("piece_identite", "")
    
    # Append to Sheet
    sheets = _get_sheets_client()
    sheets.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_CLIENTS}!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [row]}
    ).execute()
    
    return {
        "success": True,
        "code_union": code_union,
        "folder_name": folder_name,
        "drive_link": f"https://drive.google.com/drive/folders/{folder_id}"
    }


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
    """
    Retourne la liste des clients depuis LISTE CLIENT 2.
    Si with_ouverture_only=True, ne retourne que ceux avec OUVERTURE CHEZ renseigné.
    """
    rows = _read_sheet(SHEET_CLIENTS)
    if not rows:
        return []
    clients = [_row_to_client(row) for row in rows[1:] if _safe(row, COL["code_union"])]
    if with_ouverture_only:
        clients = [c for c in clients if c["ouverture_chez"]]
    return clients


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
    """Retourne un client précis par code union."""
    clients = get_clients()
    for c in clients:
        if c["code_union"] == code_union:
            return c
    return None


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
