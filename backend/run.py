"""
Script de lancement du backend.
En local : port 8001 avec reload
Sur Railway : port injecté via $PORT, pas de reload
"""
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    is_prod = os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("DATABASE_URL", "").startswith("postgresql")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=not bool(is_prod),
    )




