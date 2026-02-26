"""
Synchronisation Pure Data : Google Sheets "global New" → Supabase
Lance depuis la racine du projet :
  python sync_pure_data.py

Prérequis :
  pip install google-auth google-auth-httplib2 google-api-python-client psycopg2-binary openpyxl
"""

import os
import sys
import re
import json
import unicodedata
import psycopg2
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

SPREADSHEET_ID = "16Hog9Dc43vwj_JmjRBLlIPaYoHoxLKVB7eSrBVXOLM0"
SHEET_NAME     = "global New"

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or "postgresql://postgres.ccoctyncllgpycagltrq:WhtCQJLV05Z58mTY@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
)

CREDS_PATH = os.path.join(os.path.dirname(__file__), "backend", "groupement-union-hub-905cde5a76bc.json")

COLUMNS = [
    "mois", "annee", "code_union", "raison_sociale", "groupe_client",
    "region_commerciale", "fournisseur", "marque", "groupe_frs",
    "famille", "sous_famille", "ca", "commercial",
]

FIELD_ALIASES = {
    "mois":               ["mois", "month", "periode mois", "periode"],
    "annee":              ["annee", "annee", "year"],
    "code_union":         ["code union", "code_union", "code", "code client"],
    "raison_sociale":     ["raison sociale", "raison_sociale", "nom client", "client"],
    "groupe_client":      ["groupe client", "groupe", "groupe_client"],
    "region_commerciale": ["region commerciale", "region commerciale", "region", "region"],
    "fournisseur":        ["fournisseur", "frs", "supplier"],
    "marque":             ["marque", "brand"],
    "groupe_frs":         ["groupe frs", "groupe_frs", "groupe fournisseur"],
    "famille":            ["famille", "family"],
    "sous_famille":       ["sous famille", "sous-famille", "sous_famille", "subfamily"],
    "ca":                 ["ca", "ca ", "ca (e)", "ca ()", "chiffre d affaires", "chiffre d affaire"],
    "commercial":         ["commercial", "vendeur", "sales"],
}

MONTH_NAMES = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}


def normalize(text):
    if not text:
        return ""
    s = str(text).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[€()/]", " ", s)
    return " ".join(s.split())


def build_alias_map():
    m = {}
    for key, aliases in FIELD_ALIASES.items():
        for a in aliases:
            m[normalize(a)] = key
    return m


def parse_month(val):
    if val is None:
        return None
    t = normalize(str(val))
    try:
        v = int(float(t))
        return v if 1 <= v <= 12 else None
    except (ValueError, TypeError):
        pass
    for name, num in MONTH_NAMES.items():
        if name in t:
            return num
    m = re.search(r"(\d{1,2})", t)
    if m:
        v = int(m.group(1))
        return v if 1 <= v <= 12 else None
    return None


def parse_year(val):
    if val is None:
        return None
    m = re.search(r"(20\d{2})", str(val))
    return int(m.group(1)) if m else None


def parse_ca(val):
    if val is None:
        return 0.0
    try:
        s = str(val).replace(" ", "").replace("\xa0", "").replace(",", ".").replace("€", "")
        return float(s)
    except (ValueError, TypeError):
        return 0.0


# ── Google Sheets ─────────────────────────────────────────────────────────────

def load_from_sheets():
    print(f"📊 Lecture de la feuille '{SHEET_NAME}'...")
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    with open(CREDS_PATH) as f:
        info = json.load(f)

    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    client  = build("sheets", "v4", credentials=creds)
    result  = (
        client.spreadsheets().values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_NAME}!A1:Z500000")
        .execute()
    )
    values = result.get("values", [])
    if not values:
        print("  ⚠  Feuille vide !")
        return []

    headers  = values[0]
    alias_map = build_alias_map()
    col_index = {}  # index → clé canonique
    for i, h in enumerate(headers):
        n = normalize(h)
        if n in alias_map:
            key = alias_map[n]
            if key not in col_index.values():
                col_index[i] = key

    rows = []
    for raw in values[1:]:
        if not any(c.strip() for c in raw if c):
            continue
        row = {col: None for col in COLUMNS}
        for i, val in enumerate(raw):
            if i in col_index:
                key = col_index[i]
                text = str(val).strip() if val else None
                if key == "ca":
                    row[key] = parse_ca(text)
                elif key == "annee":
                    row[key] = parse_year(text)
                elif key == "mois":
                    row[key] = parse_month(text)
                else:
                    row[key] = text or None
        rows.append(row)

    print(f"  ✅ {len(rows)} lignes lues depuis Google Sheets")
    return rows


# ── Supabase ──────────────────────────────────────────────────────────────────

def pg_connect():
    m = re.match(r"(?:postgresql|postgres)://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)", DATABASE_URL)
    return psycopg2.connect(
        host=m.group(3), port=int(m.group(4)), dbname=m.group(5),
        user=m.group(1), password=m.group(2), sslmode="require",
    )


def write_to_supabase(rows):
    """
    Utilise PostgreSQL COPY FROM STDIN — 1 seul aller-retour réseau
    quel que soit le nombre de lignes. 89 000 lignes en ~30 secondes.
    """
    import io
    import csv

    print(f"💾 Ecriture dans Supabase ({len(rows)} lignes) via COPY...")
    col_list = ", ".join(f'"{c}"' for c in COLUMNS)

    # Préparer les données en CSV en mémoire (séparateur tab, NULL = chaîne vide)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='\t', quotechar='"',
                        quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
    for row in rows:
        line = []
        for col in COLUMNS:
            val = row.get(col)
            if val is None:
                line.append('')           # NULL en mode COPY
            elif col == "ca":
                line.append(str(float(val)))
            else:
                line.append(str(val))
        writer.writerow(line)
    buf.seek(0)

    conn = pg_connect()
    cur  = conn.cursor()

    # Vider la table
    cur.execute('DELETE FROM "pure_data"')
    print("  Table videe")

    # COPY en un seul envoi — ultra-rapide
    copy_sql = (
        f'COPY "pure_data" ({col_list}) FROM STDIN '
        f"WITH (FORMAT CSV, DELIMITER E'\\t', NULL '', QUOTE '\"')"
    )
    cur.copy_expert(copy_sql, buf)

    conn.commit()
    cur.close()
    conn.close()
    print(f"  ✅ {len(rows)} lignes dans Supabase")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  Sync Pure Data : Google Sheets → Supabase")
    print("=" * 55)
    print(f"  Feuille  : {SHEET_NAME}")
    print(f"  Supabase : {DATABASE_URL[:50]}...")
    print()

    if not os.path.exists(CREDS_PATH):
        print(f"❌ Fichier credentials introuvable : {CREDS_PATH}")
        sys.exit(1)

    rows = load_from_sheets()
    if not rows:
        print("❌ Aucune donnee a importer.")
        sys.exit(1)

    write_to_supabase(rows)

    print()
    print("=" * 55)
    print(f"  🎉 Synchronisation terminee — {len(rows)} lignes")
    print("     Les donnees sont disponibles sur Vercel.")
    print("=" * 55)


if __name__ == "__main__":
    main()
