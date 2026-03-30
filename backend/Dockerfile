FROM python:3.11-slim

WORKDIR /app

# Dépendances système
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    fonts-dejavu-core \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Le contexte Docker est la racine du repo.
# On copie uniquement le contenu du dossier backend/ dans /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

COPY backend/ .

# Répertoires uploads (ephémères — les images sont dans Supabase Storage)
RUN mkdir -p /tmp/uploads/ads /tmp/uploads/avatars /tmp/uploads/logos /tmp/uploads/supplier_logos

# Railway injecte PORT automatiquement
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
