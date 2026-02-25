import sqlite3
import os

db_path = "rfa_contracts.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT avatar_url FROM user LIMIT 1")
        print("[OK] Colonne avatar_url existe deja")
    except sqlite3.OperationalError:
        print("[MIGRATION] Ajout de la colonne avatar_url...")
        cursor.execute("ALTER TABLE user ADD COLUMN avatar_url TEXT")
        conn.commit()
        print("[OK] Colonne avatar_url ajoutee avec succes!")
    conn.close()
else:
    print("[WARN] Base de donnees n'existe pas encore")
