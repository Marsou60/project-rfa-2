"""
Script de lancement du backend.
En local : port 8001 avec reload
Sur Railway : port injecté via $PORT, pas de reload
"""
import os
import uvicorn
from dotenv import load_dotenv


def _load_env_files():
    """
    Charge un profil d'environnement sans écraser les variables déjà définies.
    - RFA_ENV=dev  -> .env.dev puis .env
    - RFA_ENV=prod -> .env.prod puis .env
    - défaut local -> dev
    """
    profile = os.environ.get("RFA_ENV")
    if not profile:
        profile = "prod" if os.environ.get("RAILWAY_ENVIRONMENT") else "dev"

    env_dir = os.path.dirname(__file__)
    if profile == "prod":
        load_dotenv(os.path.join(env_dir, ".env.prod"), override=False)
        # Compat historique: en prod on accepte .env si .env.prod absent
        load_dotenv(os.path.join(env_dir, ".env"), override=False)
    else:
        # En dev on n'injecte pas .env pour éviter d'accrocher par erreur la base prod
        load_dotenv(os.path.join(env_dir, ".env.dev"), override=False)


if __name__ == "__main__":
    _load_env_files()
    port = int(os.environ.get("PORT", 8001))
    is_prod = os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("DATABASE_URL", "").startswith("postgresql")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=not bool(is_prod),
    )




