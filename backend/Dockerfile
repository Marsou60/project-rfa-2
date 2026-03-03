FROM python:3.11-slim

WORKDIR /app

# Dépendances système minimales (psycopg2 + google libs)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code de l'application
COPY . .

# Répertoires uploads (ephémères sur Railway — les images sont dans Supabase Storage)
RUN mkdir -p /tmp/uploads/ads /tmp/uploads/avatars /tmp/uploads/logos /tmp/uploads/supplier_logos

# PORT est injecté automatiquement par Railway
EXPOSE $PORT

# Démarrer uvicorn sur le port Railway (pas de --reload en production)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001} --workers 2
