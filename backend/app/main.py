"""
Application FastAPI principale.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # gardé pour compatibilité
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

# Origines statiques toujours autorisées
_static_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost",
    "tauri://localhost",
    "https://project-rfa-2.vercel.app",
    *_extra_origins,
]

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

def _add_cors_headers(response: StarletteResponse, origin: str, allowed: bool) -> None:
    if allowed and origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """Accepte les origines statiques + tous les sous-domaines *.vercel.app.
    Ajoute toujours les en-têtes CORS sur la réponse (y compris en cas d'erreur 500)
    pour que le frontend reçoive une réponse valide et affiche l'erreur."""
    async def dispatch(self, request: StarletteRequest, call_next):
        origin = request.headers.get("origin", "")
        allowed = (
            origin in _static_origins
            or origin.endswith(".vercel.app")
            or origin.startswith("http://localhost")
        )
        if request.method == "OPTIONS":
            response = StarletteResponse(status_code=200)
            _add_cors_headers(response, origin, allowed)
            return response
        try:
            response = await call_next(request)
        except Exception as e:
            import traceback
            traceback.print_exc()
            body = b'{"detail":"Internal server error"}'
            response = StarletteResponse(
                content=body,
                status_code=500,
                media_type="application/json",
            )
        _add_cors_headers(response, origin, allowed)
        return response

app.add_middleware(DynamicCORSMiddleware)

app.include_router(router, prefix="/api", tags=["api"])


@app.get("/")
async def root():
    return {"message": "RFA Excel Import API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}



