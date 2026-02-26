"""
Migration SQLite locale → Supabase PostgreSQL
Lance depuis la racine du projet :
  python migrate_to_supabase.py

Tables migrées (dans l'ordre des dépendances) :
  1. contract          (contrats union + adhérents)
  2. contractrule      (paliers / règles de chaque contrat)
  3. contractassignment (affectations code_union / groupe)
  4. contractoverride  (surcharges personnalisées par client)
  5. user              (utilisateurs)
  6. ad                (publicités)
  7. supplierlogo      (logos fournisseurs)
  8. appsettings       (paramètres app)

La table rfa_data est exclue (elle est régénérée depuis Google Sheets).
"""

import sqlite3
import psycopg2
import os
import sys
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "backend", "rfa_contracts.db")

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or "postgresql://postgres.ccoctyncllgpycagltrq:WhtCQJLV05Z58mTY@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def sqlite_rows(conn, table, order="id"):
    cur = conn.execute(f'SELECT * FROM "{table}" ORDER BY {order}')
    cols = [d[0] for d in cur.description]
    return cols, cur.fetchall()

def pg_connect(url):
    from urllib.parse import urlparse
    p = urlparse(url)
    username = p.username or ""
    # Supabase pooler : username peut contenir un point (postgres.project_ref)
    return psycopg2.connect(
        host=p.hostname,
        port=p.port or 5432,
        dbname=p.path.lstrip("/"),
        user=username,
        password=p.password,
        sslmode="require",
        options=f"-c search_path=public",
    )

# Colonnes booléennes par table (SQLite les stocke en 0/1, PG veut True/False)
BOOL_COLS = {
    "contract":         {"is_default", "is_active", "use_combined_global_rate"},
    "contractoverride": {"is_active"},
    "ad":               {"is_active"},
    "user":             {"is_active"},
    "supplierlogo":     {"is_active"},
}

def cast_row(table, cols, row):
    """Convertit les entiers 0/1 en bool pour les colonnes booléennes."""
    bools = BOOL_COLS.get(table, set())
    if not bools:
        return row
    return tuple(
        bool(v) if (col in bools and v is not None) else v
        for col, v in zip(cols, row)
    )

def upsert(pg_cur, table, cols, rows, conflict_col="id"):
    if not rows:
        print(f"  --  {table} : aucune ligne a migrer")
        return 0
    casted = [cast_row(table, cols, r) for r in rows]
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(
        f'"{c}" = EXCLUDED."{c}"' for c in cols if c != conflict_col
    )
    sql = (
        f'INSERT INTO "{table}" ({", ".join(f"{chr(34)}{c}{chr(34)}" for c in cols)}) '
        f"VALUES ({placeholders}) "
        f'ON CONFLICT ("{conflict_col}") DO UPDATE SET {updates}'
    )
    pg_cur.executemany(sql, casted)
    return len(casted)

# ── Tables & ordre ────────────────────────────────────────────────────────────

TABLES = [
    # (sqlite_table, pg_table, conflict_col, order_by)
    ("contract",           "contract",           "id",  "id"),
    ("contractrule",       "contractrule",       "id",  "id"),
    ("contractassignment", "contractassignment", "id",  "id"),
    ("contractoverride",   "contractoverride",   "id",  "id"),
    ("user",               "user",               "username", "id"),
    ("ad",                 "ad",                 "id",       "id"),
    ("supplierlogo",       "supplierlogo",       "id",       "id"),
    ("appsettings",        "appsettings",        "key",      "key"),
]

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Migration SQLite -> Supabase")
    print("=" * 60)

    if not os.path.exists(SQLITE_PATH):
        print(f"❌ Base SQLite introuvable : {SQLITE_PATH}")
        sys.exit(1)

    print(f"\n📂 Source  : {SQLITE_PATH}")
    print(f"🌐 Cible   : Supabase ({DATABASE_URL[:50]}…)\n")

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    # Liste les tables existantes dans le SQLite
    existing = {
        r[0]
        for r in sqlite_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }

    try:
        pg_conn = pg_connect(DATABASE_URL)
        pg_conn.autocommit = False
        pg_cur = pg_conn.cursor()
        print("✅ Connexion Supabase OK\n")
    except Exception as e:
        print(f"❌ Connexion Supabase échouée : {e}")
        sys.exit(1)

    total = 0
    errors = []

    for sqlite_table, pg_table, conflict_col, order_by in TABLES:
        if sqlite_table not in existing:
            print(f"  ⏭  {sqlite_table} : table absente du SQLite, ignorée")
            continue

        try:
            cols, rows = sqlite_rows(sqlite_conn, sqlite_table, order_by)
            raw_rows = [tuple(r) for r in rows]

            # appsettings : exclure id (laisser Supabase l'auto-assigner)
            # et conflicter uniquement sur la cle metier 'key'
            if sqlite_table == "appsettings" and "id" in cols:
                id_idx = cols.index("id")
                cols = [c for c in cols if c != "id"]
                raw_rows = [
                    tuple(v for i, v in enumerate(r) if i != id_idx)
                    for r in raw_rows
                ]

            n = upsert(pg_cur, pg_table, cols, raw_rows, conflict_col)
            print(f"  OK  {pg_table:<25} {n:>4} ligne(s)")
            total += n

        except Exception as e:
            errors.append((pg_table, str(e)))
            print(f"  ❌ {pg_table:<25} ERREUR : {e}")
            pg_conn.rollback()
            # Ouvrir un nouveau curseur pour continuer
            pg_cur = pg_conn.cursor()

    if not errors:
        pg_conn.commit()
        print(f"\n🎉 Migration réussie — {total} lignes poussées dans Supabase")
    else:
        pg_conn.rollback()
        print(f"\n⚠  Migration partielle — {len(errors)} erreur(s) :")
        for table, err in errors:
            print(f"   • {table} : {err}")
        print("\nAucune donnée n'a été commitée. Corrigez les erreurs et relancez.")

    pg_cur.close()
    pg_conn.close()
    sqlite_conn.close()


if __name__ == "__main__":
    main()
