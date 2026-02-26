"""
Upload des images locales vers Supabase Storage + mise a jour des URLs en base.

Usage :
  python upload_images_supabase.py

Necessite :
  pip install requests psycopg2-binary

Variables a renseigner en haut du script :
  SUPABASE_URL      -> https://<project_ref>.supabase.co
  SUPABASE_KEY      -> service_role key (Settings > API > service_role)
  DATABASE_URL      -> connexion Supabase PostgreSQL
"""

import os
import re
import sys
import mimetypes
import requests
import psycopg2

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://ccoctyncllgpycagltrq.supabase.co"
SUPABASE_KEY = ""   # service_role key (Settings > API > service_role)

DATABASE_URL = (
    "postgresql://postgres.ccoctyncllgpycagltrq:WhtCQJLV05Z58mTY"
    "@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
)

BUCKET = "uploads"   # nom du bucket Supabase Storage (sera créé si absent)

LOCAL_BASE = os.path.join(os.path.dirname(__file__), "backend", "uploads")

# Dossiers à uploader et leur chemin dans le bucket
FOLDERS = [
    ("ads",            "ads"),
    ("supplier_logos", "supplier-logos"),
    ("logos",          "logos"),
    # ("avatars",      "avatars"),  # désactivé (données personnelles)
]

# ── Helpers Supabase Storage ──────────────────────────────────────────────────

def storage_headers():
    return {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
    }

def ensure_bucket():
    """Crée le bucket s'il n'existe pas."""
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET}",
        headers=storage_headers(),
    )
    if r.status_code == 200:
        print(f"Bucket '{BUCKET}' existe deja.")
        return
    # Créer le bucket public
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/bucket",
        headers={**storage_headers(), "Content-Type": "application/json"},
        json={"id": BUCKET, "name": BUCKET, "public": True},
    )
    if r.status_code in (200, 201):
        print(f"Bucket '{BUCKET}' cree.")
    else:
        print(f"Impossible de creer le bucket : {r.text}")
        sys.exit(1)

def upload_file(local_path, storage_path):
    """Upload un fichier, retourne l'URL publique."""
    mime, _ = mimetypes.guess_type(local_path)
    mime = mime or "application/octet-stream"
    with open(local_path, "rb") as f:
        data = f.read()

    # Upsert (remplace si existe)
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}",
        headers={
            **storage_headers(),
            "Content-Type": mime,
            "x-upsert": "true",
        },
        data=data,
    )
    if r.status_code in (200, 201):
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"
        return public_url
    else:
        raise RuntimeError(f"Upload echoue ({r.status_code}): {r.text}")

# ── Mise à jour PostgreSQL ────────────────────────────────────────────────────

def pg_connect():
    m = re.match(
        r"(?:postgresql|postgres)://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)",
        DATABASE_URL,
    )
    return psycopg2.connect(
        host=m.group(3), port=int(m.group(4)), dbname=m.group(5),
        user=m.group(1), password=m.group(2), sslmode="require",
    )

def update_db_url(pg_conn, table, col, old_pattern, new_url):
    """Met à jour l'URL dans la table si elle contient old_pattern."""
    cur = pg_conn.cursor()
    cur.execute(
        f'UPDATE "{table}" SET "{col}" = %s WHERE "{col}" LIKE %s',
        (new_url, f"%{old_pattern}%"),
    )
    count = cur.rowcount
    cur.close()
    return count

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_KEY:
        print("ERREUR : renseigne SUPABASE_KEY dans le script avant de lancer.")
        print("  Supabase -> Settings -> API -> service_role (secret)")
        sys.exit(1)

    print("=" * 60)
    print("  Upload images -> Supabase Storage")
    print("=" * 60)

    ensure_bucket()

    pg_conn = pg_connect()
    pg_conn.autocommit = False

    total_uploaded = 0
    total_updated  = 0

    for local_folder, storage_folder in FOLDERS:
        local_dir = os.path.join(LOCAL_BASE, local_folder)
        if not os.path.isdir(local_dir):
            print(f"\n[SKIP] {local_folder} : dossier absent")
            continue

        files = [f for f in os.listdir(local_dir) if os.path.isfile(os.path.join(local_dir, f))]
        print(f"\n[{local_folder}] {len(files)} fichier(s)")

        for filename in files:
            local_path   = os.path.join(local_dir, filename)
            storage_path = f"{storage_folder}/{filename}"

            try:
                public_url = upload_file(local_path, storage_path)
                print(f"  OK  {filename}")
                total_uploaded += 1

                # Mettre à jour la base : table ad (image_url)
                if local_folder == "ads":
                    n = update_db_url(pg_conn, "ad", "image_url", filename, public_url)
                    total_updated += n

                # Mettre à jour la base : table supplierlogo (image_url)
                elif local_folder == "supplier_logos":
                    n = update_db_url(pg_conn, "supplierlogo", "image_url", filename, public_url)
                    total_updated += n

                # Mettre à jour la base : table appsettings (company_logo)
                elif local_folder == "logos":
                    n = update_db_url(pg_conn, "appsettings", "value", filename, public_url)
                    total_updated += n

            except Exception as e:
                print(f"  ERR {filename} : {e}")

    pg_conn.commit()
    pg_conn.close()

    print(f"\n{'=' * 60}")
    print(f"  {total_uploaded} image(s) uploadees dans Supabase Storage")
    print(f"  {total_updated} URL(s) mises a jour en base")
    print(f"{'=' * 60}")
    print("\nLes images sont desormais servies depuis Supabase Storage.")
    print("Vercel peut lire les URLs directement sans acces au filesystem.")

if __name__ == "__main__":
    main()
