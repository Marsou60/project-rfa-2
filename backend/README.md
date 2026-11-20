# Backend - RFA Excel Import

## Installation

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

## Lancement

Depuis le dossier `backend` :

```bash
uvicorn app.main:app --reload --port 8000
```

Ou utiliser le script :

```bash
python run.py
```

L'API sera accessible sur `http://localhost:8000`

## Documentation API

Une fois le serveur lancé, la documentation interactive est disponible sur :
- Swagger UI : `http://localhost:8000/docs`
- ReDoc : `http://localhost:8000/redoc`

## Copie nocturne des notes clients vers Google Sheets

Chaque nuit, vers 02:00 (Europe/Paris), le backend recopie `public.notes_clients` dans l'onglet dédié `SUPABASE notes_clients` du tableur APPLICATION APPSHEET UNION. L'onglet est vidé puis réécrit. `NOTES CLIENT`, `LISTE CLIENT 2` et les notes de frais ne sont pas touchés. Aucune écriture en base.

Elle utilise le compte de service déjà présent dans `GOOGLE_CREDENTIALS_JSON` (le même que l’onglet LISTE CLIENT 2). Aucune nouvelle clé n’est nécessaire. `SHEETS_COPY_ENABLED=0` arrête la copie.

Détail des variables et du retour arrière : [docs/NOTES_CLIENTS_SHEET_COPY.md](docs/NOTES_CLIENTS_SHEET_COPY.md).

Déclenchement manuel (administrateur) : `POST /api/admin/notes-clients/sheet-copy`.




