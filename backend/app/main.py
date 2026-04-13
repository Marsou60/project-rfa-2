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

# Charger le profil d'environnement depuis backend/
# - dev: .env.dev (isole les tests locaux de la prod)
# - prod: .env.prod puis .env (compat historique)
_backend_dir = Path(__file__).parent.parent
_profile = os.environ.get("RFA_ENV")
if not _profile:
    _profile = "prod" if os.environ.get("RAILWAY_ENVIRONMENT") else "dev"
if _profile == "prod":
    load_dotenv(_backend_dir / ".env.prod", override=False)
    load_dotenv(_backend_dir / ".env", override=False)
else:
    load_dotenv(_backend_dir / ".env.dev", override=False)

app = FastAPI(title="RFA Excel Import API", version="0.2.0")


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    """Retourne le message d'erreur réel (500) ou préserve HTTPException (401, 403, etc.)."""
    from fastapi.responses import JSONResponse
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    import traceback
    traceback.print_exc()
    detail = str(exc) if str(exc) else "Internal server error"
    return JSONResponse(status_code=500, content={"detail": detail})


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
    "https://tauri.localhost",
    "https://project-rfa-2.vercel.app",
    *_extra_origins,
]

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse
from fastapi import HTTPException
import json

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
            or "tauri" in origin.lower()
        )
        if request.method == "OPTIONS":
            response = StarletteResponse(status_code=200)
            _add_cors_headers(response, origin, allowed)
            return response
        try:
            response = await call_next(request)
        except HTTPException as he:
            body = json.dumps({"detail": he.detail}).encode()
            response = StarletteResponse(
                content=body,
                status_code=he.status_code,
                media_type="application/json",
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            detail = str(e) if str(e) else "Internal server error"
            body = json.dumps({"detail": detail}).encode()
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



