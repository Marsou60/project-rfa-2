"""
Application FastAPI principale.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import router
from app.database import init_db
from app.services.seed import seed_base_standard

# Charger le .env situé dans le dossier backend/ (un niveau au-dessus de app/)
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(_env_path)

app = FastAPI(title="RFA Excel Import API", version="0.2.0")

# Initialiser la base de données au démarrage
@app.on_event("startup")
def on_startup():
    try:
        init_db()
    except Exception as e:
        print(f"[STARTUP] init_db warning: {e}")
    try:
        seed_base_standard()
    except Exception as e:
        print(f"[STARTUP] seed warning: {e}")

# CORS pour le frontend
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost",
        "tauri://localhost",
        *_extra_origins,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api", tags=["api"])


@app.get("/")
async def root():
    return {"message": "RFA Excel Import API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/debug")
async def debug():
    """Endpoint de diagnostic — à supprimer après résolution."""
    import sys
    db_url = os.environ.get("DATABASE_URL", "NON DEFINI")
    db_url_masked = db_url[:30] + "..." if len(db_url) > 30 else db_url
    result = {
        "python": sys.version,
        "database_url_set": bool(db_url and db_url != "NON DEFINI"),
        "database_url_preview": db_url_masked,
        "vercel": os.environ.get("VERCEL", "non"),
    }
    try:
        from sqlmodel import Session, select, text
        from app.database import engine
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
            result["db_connection"] = "OK"
    except Exception as e:
        result["db_connection"] = f"ERREUR: {str(e)}"
    return result

