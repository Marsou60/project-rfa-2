"""
Point d'entrée Vercel pour l'application FastAPI.
Vercel route automatiquement /api/* vers ce fichier.
"""
import sys
import os

# Ajoute le dossier backend au path pour que les imports fonctionnent
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.main import app
