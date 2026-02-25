"""
Configuration de la base de données SQLite.
"""
from sqlmodel import SQLModel, create_engine, Session, select
from app.models import Contract, ContractRule, ContractAssignment, ContractOverride, Ad, User, UserRole, AppSettings, SupplierLogo
import os
import sqlite3
import hashlib

# Si DATABASE_URL est défini (Vercel + Supabase), on l'utilise.
# Sinon on reste sur SQLite en local.
_SUPABASE_URL = os.environ.get("DATABASE_URL", "")
if _SUPABASE_URL:
    # pg8000 = driver PostgreSQL pur Python (pas de dépendance binaire)
    _base = _SUPABASE_URL
    for prefix in ("postgresql://", "postgres://"):
        if _base.startswith(prefix):
            _base = _base.replace(prefix, "postgresql+pg8000://", 1)
            break
    # Ajoute SSL requis par Supabase
    DATABASE_URL  = _base + ("&" if "?" in _base else "?") + "ssl_context=true"
    DATABASE_PATH = None
else:
    DATABASE_URL  = "sqlite:///./rfa_contracts.db"
    DATABASE_PATH = "./rfa_contracts.db"

# Dossiers pour les uploads
_IS_VERCEL = os.environ.get("VERCEL") == "1"
_UPLOAD_BASE = "/tmp/uploads" if _IS_VERCEL else os.path.join(os.path.dirname(__file__), "..", "uploads")
UPLOADS_DIR        = os.path.join(_UPLOAD_BASE, "ads")
AVATARS_DIR        = os.path.join(_UPLOAD_BASE, "avatars")
LOGOS_DIR          = os.path.join(_UPLOAD_BASE, "logos")
SUPPLIER_LOGOS_DIR = os.path.join(_UPLOAD_BASE, "supplier_logos")

# Créer le moteur
# check_same_thread uniquement pour SQLite
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)


def hash_password(password: str) -> str:
    """Hash un mot de passe avec SHA-256 (simple, sans bcrypt pour éviter les dépendances)."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Vérifie un mot de passe."""
    return hash_password(password) == password_hash


def run_migrations():
    """Execute les migrations manuelles (SQLite uniquement — Supabase a le bon schéma d'emblée)."""
    if not DATABASE_PATH or not os.path.exists(DATABASE_PATH):
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    def table_exists(name: str) -> bool:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,))
        return cursor.fetchone() is not None
    
    # Migration: ajouter use_combined_global_rate a la table contract
    if table_exists("contract"):
        try:
            cursor.execute("SELECT use_combined_global_rate FROM contract LIMIT 1")
        except sqlite3.OperationalError:
            print("[MIGRATION] Ajout de la colonne use_combined_global_rate a la table contract...")
            cursor.execute("ALTER TABLE contract ADD COLUMN use_combined_global_rate BOOLEAN DEFAULT 0")
            conn.commit()
            print("[MIGRATION] Colonne ajoutee avec succes!")
    
    # Migration: ajouter avatar_url a la table user
    if table_exists("user"):
        try:
            cursor.execute("SELECT avatar_url FROM user LIMIT 1")
        except sqlite3.OperationalError:
            print("[MIGRATION] Ajout de la colonne avatar_url a la table user...")
            cursor.execute("ALTER TABLE user ADD COLUMN avatar_url TEXT")
            conn.commit()
            print("[MIGRATION] Colonne avatar_url ajoutee avec succes!")
    
    # Migration: ajouter scope a la table contract
    if table_exists("contract"):
        try:
            cursor.execute("SELECT scope FROM contract LIMIT 1")
        except sqlite3.OperationalError:
            print("[MIGRATION] Ajout de la colonne scope a la table contract...")
            cursor.execute("ALTER TABLE contract ADD COLUMN scope TEXT DEFAULT 'ADHERENT'")
            conn.commit()
            print("[MIGRATION] Colonne scope ajoutee avec succes!")
        
        # Migration: ajouter marketing_rules a la table contract
        try:
            cursor.execute("SELECT marketing_rules FROM contract LIMIT 1")
        except sqlite3.OperationalError:
            print("[MIGRATION] Ajout de la colonne marketing_rules a la table contract...")
            cursor.execute("ALTER TABLE contract ADD COLUMN marketing_rules TEXT")
            conn.commit()
            print("[MIGRATION] Colonne marketing_rules ajoutee avec succes!")
        
        # Migration: normaliser les valeurs scope en UPPERCASE
        try:
            cursor.execute("SELECT COUNT(*) FROM contract WHERE scope = 'adherent'")
            count_lowercase = cursor.fetchone()[0]
            if count_lowercase > 0:
                print(f"[MIGRATION] Normalisation de {count_lowercase} valeurs scope en UPPERCASE...")
                cursor.execute("UPDATE contract SET scope = 'ADHERENT' WHERE scope = 'adherent'")
                cursor.execute("UPDATE contract SET scope = 'UNION' WHERE scope = 'union'")
                conn.commit()
                print("[MIGRATION] Valeurs scope normalisees avec succes!")
        except Exception as e:
            print(f"[MIGRATION] Erreur lors de la normalisation scope: {e}")
    
    # Migration: ajouter bonus_groups a la table contractrule
    if table_exists("contractrule"):
        try:
            cursor.execute("SELECT bonus_groups FROM contractrule LIMIT 1")
        except sqlite3.OperationalError:
            print("[MIGRATION] Ajout de la colonne bonus_groups a la table contractrule...")
            cursor.execute("ALTER TABLE contractrule ADD COLUMN bonus_groups TEXT")
            conn.commit()
            print("[MIGRATION] Colonne bonus_groups ajoutee avec succes!")
    
    conn.close()


def seed_admin_user():
    """Crée l'utilisateur admin par défaut s'il n'existe pas."""
    with Session(engine) as session:
        statement = select(User).where(User.username == "admin")
        existing = session.exec(statement).first()
        if not existing:
            print("[SEED] Création de l'utilisateur admin par défaut...")
            admin = User(
                username="admin",
                password_hash=hash_password("admin123"),  # Mot de passe par défaut
                display_name="Administrateur",
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(admin)
            session.commit()
            print("[SEED] Utilisateur admin créé (login: admin / mdp: admin123)")


def init_db():
    """Crée les tables si elles n'existent pas et execute les migrations."""
    # Créer les dossiers uploads si nécessaire
    for d in [UPLOADS_DIR, AVATARS_DIR, LOGOS_DIR, SUPPLIER_LOGOS_DIR]:
        try:
            os.makedirs(d, exist_ok=True)
        except Exception:
            pass

    # Migrations SQLite uniquement
    run_migrations()

    # Crée les tables manquantes (sans supprimer l'existant)
    # Sur PostgreSQL/Supabase, checkfirst=True évite les conflits de type enum
    try:
        SQLModel.metadata.create_all(engine, checkfirst=True)
    except Exception as e:
        print(f"[INIT_DB] create_all warning (tables existent peut-être déjà): {e}")

    run_migrations()
    seed_admin_user()


def get_session():
    """Retourne une session de base de données."""
    try:
        with Session(engine) as session:
            yield session
    except Exception as e:
        raise RuntimeError(f"Impossible de se connecter à la base de données: {e}")

