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




