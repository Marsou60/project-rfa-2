"""
Stockage en mémoire des imports.
"""
from typing import Dict, Optional, List
from datetime import datetime
import uuid


class ImportData:
    """Données d'un import."""
    def __init__(self, import_id: str, raw_columns: list, column_mapping: dict, data: list):
        self.import_id = import_id
        self.created_at = datetime.now()
        self.raw_columns = raw_columns
        self.column_mapping = column_mapping  # clé interne -> nom colonne Excel
        self.data = data  # liste de dicts (une ligne = un dict avec clés internes)
        self.by_client: Dict[str, Dict] = {}  # code_union -> ClientRecap
        self.by_group: Dict[str, Dict] = {}  # groupe_client -> GroupRecap


# ==================== PURE DATA ====================

class PureDataImport:
    """Données pure data (comparatif N/N-1)."""
    def __init__(self, import_id: str, raw_columns: list, column_mapping: dict, rows: list):
        self.import_id = import_id
        self.created_at = datetime.now()
        self.raw_columns = raw_columns
        self.column_mapping = column_mapping
        self.rows = rows  # liste de dicts normalisés


# Stockage global en mémoire
_imports: Dict[str, ImportData] = {}
_pure_data_imports: Dict[str, PureDataImport] = {}

# ID fixe pour l'import "source Sheets" (feuille connectée comme base de données RFA)
LIVE_IMPORT_ID = "sheets_live"


def create_import(raw_columns: list, column_mapping: dict, data: list) -> str:
    """Crée un nouvel import et retourne son ID."""
    import_id = str(uuid.uuid4())
    _imports[import_id] = ImportData(import_id, raw_columns, column_mapping, data)
    return import_id


def set_live_import(raw_columns: list, column_mapping: dict, data: list) -> str:
    """Enregistre ou met à jour l'import "feuille Sheets" (source RFA pour tous)."""
    _imports[LIVE_IMPORT_ID] = ImportData(LIVE_IMPORT_ID, raw_columns, column_mapping, data)
    return LIVE_IMPORT_ID


def get_import(import_id: str) -> Optional[ImportData]:
    """Récupère un import par ID."""
    return _imports.get(import_id)


def get_live_import() -> Optional[ImportData]:
    """Récupère l'import issu de la feuille Sheets connectée, s'il existe."""
    return _imports.get(LIVE_IMPORT_ID)


def list_imports() -> List[str]:
    """Liste tous les IDs d'imports."""
    return list(_imports.keys())


def create_pure_data_import(raw_columns: list, column_mapping: dict, rows: list) -> str:
    import_id = str(uuid.uuid4())
    _pure_data_imports[import_id] = PureDataImport(import_id, raw_columns, column_mapping, rows)
    return import_id


def get_pure_data_import(import_id: str) -> Optional[PureDataImport]:
    return _pure_data_imports.get(import_id)

