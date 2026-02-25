"""
Service de TEST pour l'import de fichiers bruts.
Ce fichier est complètement isolé et ne modifie pas le code existant.
"""
import pandas as pd
import re
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from app.core.normalize import normalize_header, sanitize_amount


# Mapping des colonnes du fichier BRUT (avec beaucoup d'aliases possibles)
RAW_FIELD_DEFINITIONS = [
    ("annee", "Année", [
        "annee", "année", "year", "an", "annee", "date", "periode",
        "année", "année de vente", "année vente", "year of sale"
    ]),
    ("mois", "Mois", [
        "mois", "month", "mois de vente", "month of sale", "periode mois"
    ]),
    ("code_union", "Code Union", [
        "code union", "code_union", "codeunion", "code", "union code",
        "code client", "client code", "numero client", "numéro client",
        "code adhérent", "code adherent", "adhérent", "adherent"
    ]),
    ("nom_client", "Nom Client", [
        "nom client", "raison sociale", "raison_sociale", "client", "nom",
        "client name", "name", "raison", "nom du client", "nom de l'adhérent",
        "nom adherent", "nom adhérent", "client nom"
    ]),
    ("groupe_client", "Groupe Client", [
        "groupe client", "groupe_client", "groupe", "group", "groupe client",
        "groupe adhérent", "groupe adherent", "groupe adhérents", "groupe adherents"
    ]),
    ("region_commerciale", "Région Commerciale", [
        "region commerciale", "région commerciale", "region", "région",
        "region com", "région com", "commercial region", "zone commerciale"
    ]),
    ("commercial", "COMMERCIAL", [
        "commercial", "commercial name", "nom commercial", "vendeur", "seller",
        "commercial responsable", "responsable commercial"
    ]),
    ("fournisseur", "Fournisseur", [
        "fournisseur", "supplier", "frs", "fournisseur", "supplier name",
        "nom fournisseur", "fournisseur nom", "frs nom", "frs name"
    ]),
    ("marque", "Marque", [
        "marque", "brand", "marque produit", "marque", "brand name",
        "nom marque", "marque nom", "produit marque", "product brand"
    ]),
    ("groupe_frs", "Groupe FRS", [
        "groupe frs", "groupe_frs", "groupe fournisseur", "groupe_fournisseur",
        "supplier group", "frs group", "groupe fournisseurs", "groupe fournisseur",
        "groupe frs", "groupefrs"
    ]),
    ("famille", "Famille", [
        "famille", "family", "categorie", "category", "famille produit",
        "product family", "categorie produit", "product category", "type produit"
    ]),
    ("sous_famille", "Sous-famille", [
        "sous famille", "sous_famille", "sous-famille", "subfamily",
        "sous famille produit", "sub family", "sous-categorie", "sous categorie",
        "sub category", "sous categorie produit"
    ]),
    ("ca", "CA", [
        "ca", "chiffre d'affaires", "chiffre d'affaire", "montant", "amount", "€",
        "chiffre affaires", "chiffre affaire", "ca €", "ca (€)", "montant €",
        "revenue", "sales", "turnover", "chiffre d'affaires (€)", "ca en €"
    ]),
]


def get_raw_field_mapping() -> Dict[str, Tuple[str, str]]:
    """Retourne un mapping : alias normalisé -> (clé interne, label)."""
    mapping = {}
    for key, label, aliases in RAW_FIELD_DEFINITIONS:
        for alias in aliases:
            mapping[alias] = (key, label)
    return mapping


def suggest_field_for_column(column_name: str) -> Optional[str]:
    """Suggère quel champ pourrait correspondre à une colonne non reconnue."""
    normalized = normalize_header(column_name)
    
    # Chercher des mots-clés dans le nom de colonne
    suggestions = []
    for key, label, aliases in RAW_FIELD_DEFINITIONS:
        # Vérifier si un alias est présent dans le nom de colonne
        for alias in aliases:
            if alias in normalized:
                suggestions.append(f"{label} ({key})")
                break
    
    return ", ".join(suggestions[:3]) if suggestions else "Aucune suggestion"


def normalize_text(value) -> str:
    """Normalise un texte (majuscules, trim, espaces)."""
    if value is None:
        return ""
    text = str(value).upper().strip()
    text = re.sub(r'\s+', ' ', text)  # Remplacer tous les espaces multiples par un seul
    return text


def normalize_compact(value) -> str:
    """Normalise un texte en supprimant espaces et ponctuation."""
    text = normalize_text(value)
    return re.sub(r'[^A-Z0-9]', '', text)


def normalize_family(value) -> str:
    """
    Normalise les familles avec des variantes courantes
    (ex: FREIN -> FREINAGE, FILTRE -> FILTRATION).
    """
    text = normalize_text(value)
    if not text:
        return ""
    if "FREIN" in text:
        return "FREINAGE"
    if "EMBRAY" in text or "CLUTCH" in text:
        return "EMBRAYAGE"
    if "FILTRE" in text or "FILTR" in text:
        return "FILTRATION"
    if "DISTRIB" in text:
        return "DISTRIBUTION"
    return text


# Mapping pour normaliser les noms de fournisseurs vers les noms standards
# Ce mapping permet de gérer les variations de noms (ex: "ACR Industries" -> "ACR")
SUPPLIER_NORMALIZATION = {
    # ACR et variantes
    "ACR": "ACR",
    "ACR INDUSTRIES": "ACR",
    "ACR INDUSTRIE": "ACR",
    "A.C.R.": "ACR",
    # ALLIANCE et variantes
    "ALLIANCE": "ALLIANCE",
    "ALLIANCE AUTOMOTIVE": "ALLIANCE",
    "ALLIANCE AUTO": "ALLIANCE",
    # DCA et variantes
    "DCA": "DCA",
    "D.C.A.": "DCA",
    # EXADIS et variantes
    "EXADIS": "EXADIS",
    # AUTODISTRIBUTION et variantes
    "AUTODISTRIBUTION": "AUTODISTRIBUTION",
    "AUTO DISTRIBUTION": "AUTODISTRIBUTION",
    "AD": "AUTODISTRIBUTION",
    # PHE et variantes
    "PHE": "PHE",
    "P.H.E.": "PHE",
    # IDLP
    "IDLP": "IDLP",
    # DOYEN AUTO
    "DOYEN AUTO": "DOYEN AUTO",
    "DOYEN": "DOYEN AUTO",
}


def normalize_supplier_name(raw_name: str) -> str:
    """
    Normalise un nom de fournisseur vers le nom standard.
    Ex: "ACR Industries" -> "ACR", "Alliance Automotive" -> "ALLIANCE"
    """
    if not raw_name:
        return ""
    
    # Nettoyer et mettre en MAJUSCULES
    cleaned = str(raw_name).upper().strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    
    # Chercher une correspondance exacte d'abord
    if cleaned in SUPPLIER_NORMALIZATION:
        return SUPPLIER_NORMALIZATION[cleaned]
    
    # Chercher une correspondance partielle (si le nom contient une clé connue)
    for key, standard_name in SUPPLIER_NORMALIZATION.items():
        if key in cleaned:
            return standard_name
    
    # Si pas de correspondance, retourner tel quel en MAJUSCULES
    return cleaned


# Règles RFA (identiques au script AppScript)
# Les règles GLOBALES sont créées DYNAMIQUEMENT à partir des fournisseurs détectés
# Ne pas les définir ici statiquement !

RFA_RULES = [
    # DCA
    {"key": "TRI_DCA_SBS", "fournisseur": "DCA", "marque": "NK", "type": "tri", "seuil": 25000, "taux": 0.03},
    {"key": "TRI_DCA_FREINAGE", "fournisseur": "DCA", "marqueList": ["MINTEX", "TEXTAR"], "type": "tri", "seuil": 25000, "taux": 0.04},
    
    # ACR
    {"key": "TRI_ACR_FREINAGE", "fournisseur": "ACR", "famille": "FREINAGE", "type": "tri", "seuil": 50000, "taux": 0.04},
    {"key": "TRI_ACR_EMBRAYAGE", "fournisseur": "ACR", "famille": "EMBRAYAGE", "type": "tri", "seuil": 50000, "taux": 0.04},
    {"key": "TRI_ACR_FILTRE", "fournisseur": "ACR", "famille": "FILTRATION", "type": "tri", "seuil": 25000, "seuil_max": 50000, "taux": 0.015},
    {"key": "TRI_ACR_DISTRIBUTION", "fournisseur": "ACR", "famille": "DISTRIBUTION", "type": "tri", "seuil": 25000, "seuil_max": 50000, "taux": 0.03},
    
    # EXADIS
    {"key": "TRI_EXADIS_EMBRAYAGE", "fournisseur": "EXADIS", "marqueList": ["LUK", "SACHS"], "type": "tri", "seuil": 50000, "taux": 0.04},
    {"key": "TRI_EXADIS_FILTRATION", "fournisseur": "EXADIS", "famille": "FILTRATION", "type": "tri", "seuil": 25000, "seuil_max": 50000, "taux": 0.02},
    {"key": "TRI_EXADIS_DISTRIBUTION", "fournisseur": "EXADIS", "sous_famille": "KIT DE DISTRIBUTION", "type": "tri", "seuil": 25000, "seuil_max": 50000, "taux": 0.03},
    {"key": "TRI_EXADIS_ETANCHEITE", "fournisseur": "EXADIS", "marque": "ELRING", "type": "tri", "seuil": 5000, "taux": 0.02},
    {"key": "TRI_EXADIS_THERMIQUE", "fournisseur": "EXADIS", "marque": "NRF", "type": "tri", "seuil": 5000, "taux": 0.015},
    {"key": "TRI_EXADIS_FREINAGE", "fournisseur": "EXADIS", "famille": "FREINAGE", "type": "tri", "seuil": 25000, "taux": 0.04},
    
    # ALLIANCE
    {"key": "TRI_SCHAEFFLER", "fournisseur": "ALLIANCE", "groupeFrsList": ["SCHAEFFLER"], "type": "tri", "seuil": 50000, "taux": 0.05},
    {"key": "TRI_ALLIANCE_DELPHI", "fournisseur": "ALLIANCE", "marque": "DELPHI", "type": "tri", "seuil": 50000, "taux": 0.08},
    {"key": "TRI_ALLIANCE_BREMBO", "fournisseur": "ALLIANCE", "marque": "BREMBO", "type": "tri", "seuil": 50000, "taux": 0.08},
    {"key": "TRI_ALLIANCE_SOGEFI", "fournisseur": "ALLIANCE", "groupeFrsList": ["SOGEFI"], "type": "tri", "seuil": 50000, "taux": 0.04},
    {"key": "TRI_ALLIANCE_SKF", "fournisseur": "ALLIANCE", "marque": "SKF", "type": "tri", "seuil": 50000, "taux": 0.05},
    {"key": "TRI_ALLIANCE_NAPA", "fournisseur": "ALLIANCE", "marque": "NAPA", "type": "tri", "seuil": 50000, "taux": 0.05},
]


def detect_file_format(raw_columns: List[str]) -> str:
    """Détecte le format du fichier : 'raw' (brut) ou 'large' (format large)."""
    normalized_cols = [normalize_header(col) for col in raw_columns]
    
    # Si on trouve "fournisseur", "marque", "famille" -> format BRUT
    if any("fournisseur" in col or "marque" in col or "famille" in col for col in normalized_cols):
        return "raw"
    
    # Si on trouve "ca rfa globale" -> format LARGE
    if any("ca rfa globale" in col or "ca rfa nk" in col for col in normalized_cols):
        return "large"
    
    return "raw"


def load_excel_raw(file_path: str) -> Tuple[List[Dict], List[str], Dict[str, str], Optional[int], Optional[int], str]:
    """
    Charge un fichier Excel BRUT (format ligne par ligne).
    Retourne : data, raw_columns, column_mapping, detected_month, detected_year, mapping_method
    """
    df = pd.read_excel(file_path, engine='openpyxl')
    raw_columns = list(df.columns)
    
    # Normaliser les en-têtes
    normalized_headers = {col: normalize_header(col) for col in raw_columns}
    
    # Mapping des champs bruts
    raw_field_mapping = get_raw_field_mapping()
    column_mapping = {}
    mapping_method = "name"  # "name" ou "position"
    
    # MÉTHODE 1 : Essayer de matcher par nom de colonne
    for excel_col, normalized in normalized_headers.items():
        # Chercher dans le mapping
        if normalized in raw_field_mapping:
            internal_key, _ = raw_field_mapping[normalized]
            column_mapping[internal_key] = excel_col
        else:
            # Essayer un matching partiel (si le nom contient un alias)
            for alias, (internal_key, _) in raw_field_mapping.items():
                if alias in normalized or normalized in alias:
                    # Ne pas écraser si déjà trouvé
                    if internal_key not in column_mapping:
                        column_mapping[internal_key] = excel_col
                        break
    
    # MÉTHODE 2 : Si certaines colonnes ne sont pas trouvées, utiliser les positions comme AppScript
    # AppScript utilise : COL_ANNEE: 1, COL_CODE_UNION: 2, COL_RAISON_SOCIALE: 3, COL_GROUPE_CLIENT: 4,
    #                     (colonne 5 sautée), COL_FOURNISSEUR: 6, COL_MARQUE: 7, COL_GROUPE_FRS: 8,
    #                     COL_FAMILLE: 9, COL_SOUS_FAMILLE: 10, COL_CA: 11
    # En Python, les indices commencent à 0, donc : 0, 1, 2, 3, (4 sautée), 5, 6, 7, 8, 9, 10
    
    position_mapping = {
        "annee": 0,           # COL_ANNEE: 1 -> index 0
        "code_union": 1,      # COL_CODE_UNION: 2 -> index 1
        "nom_client": 2,      # COL_RAISON_SOCIALE: 3 -> index 2
        "groupe_client": 3,   # COL_GROUPE_CLIENT: 4 -> index 3
        # index 4 est sautée (colonne 5)
        "fournisseur": 5,     # COL_FOURNISSEUR: 6 -> index 5
        "marque": 6,         # COL_MARQUE: 7 -> index 6
        "groupe_frs": 7,     # COL_GROUPE_FRS: 8 -> index 7
        "famille": 8,        # COL_FAMILLE: 9 -> index 8
        "sous_famille": 9,   # COL_SOUS_FAMILLE: 10 -> index 9
        "ca": 10,            # COL_CA: 11 -> index 10
    }
    
    # Vérifier si on doit utiliser le mapping par position
    missing_fields = [key for key in position_mapping.keys() if key not in column_mapping]
    
    if len(missing_fields) > 3:  # Si plus de 3 champs manquants, utiliser la position
        mapping_method = "position"
        column_mapping = {}
        for field_key, col_index in position_mapping.items():
            if col_index < len(raw_columns):
                column_mapping[field_key] = raw_columns[col_index]
    elif len(missing_fields) > 0:
        # Compléter avec la position pour les champs manquants
        mapping_method = "mixed"
        for field_key in missing_fields:
            col_index = position_mapping.get(field_key)
            if col_index is not None and col_index < len(raw_columns):
                column_mapping[field_key] = raw_columns[col_index]
    
    # Construire les données ligne par ligne
    data = []
    years_in_file = set()
    
    # Statistiques de diagnostic
    stats = {
        "total_lignes": 0,
        "lignes_sans_code_union": 0,
        "lignes_ca_zero": 0,
        "lignes_valides": 0,
        "exemples_lignes_rejetees": [],
        "exemples_annees": set(),
        "exemples_ca": []
    }
    
    for idx, row in df.iterrows():
        stats["total_lignes"] += 1
        row_dict = {}
        
        # Pour chaque champ brut défini
        for key, _, _ in RAW_FIELD_DEFINITIONS:
            if key in column_mapping:
                excel_col = column_mapping[key]
                try:
                    value = row[excel_col]
                except (KeyError, IndexError):
                    value = None
                
                # Nettoyer selon le type
                if key == "annee":
                    value = str(value).strip() if pd.notna(value) else ""
                    if value:
                        # Extraire l'année
                        year_match = re.search(r'(\d{4})', value)
                        if year_match:
                            year_val = int(year_match.group(1))
                            years_in_file.add(year_val)
                            if len(stats["exemples_annees"]) < 5:
                                stats["exemples_annees"].add(value)
                elif key in ["code_union", "nom_client", "groupe_client", "fournisseur", "marque", "groupe_frs", "famille", "sous_famille"]:
                    row_dict[key] = str(value).strip() if pd.notna(value) else ""
                elif key == "ca":
                    row_dict[key] = sanitize_amount(value)
                    if len(stats["exemples_ca"]) < 5:
                        stats["exemples_ca"].append({"raw": value, "cleaned": row_dict[key]})
                else:
                    row_dict[key] = str(value).strip() if pd.notna(value) else ""
            else:
                # Colonne absente : valeur par défaut
                if key == "ca":
                    row_dict[key] = 0.0
                else:
                    row_dict[key] = ""
        
        # Diagnostic : pourquoi la ligne est rejetée
        code_union = row_dict.get("code_union", "").strip()
        ca_value = row_dict.get("ca", 0)
        
        if not code_union:
            stats["lignes_sans_code_union"] += 1
            if len(stats["exemples_lignes_rejetees"]) < 3:
                stats["exemples_lignes_rejetees"].append({
                    "reason": "Code Union vide",
                    "code_union": code_union,
                    "ca": ca_value,
                    "annee": row_dict.get("annee", ""),
                    "fournisseur": row_dict.get("fournisseur", "")[:50]
                })
        elif ca_value <= 0:
            stats["lignes_ca_zero"] += 1
            if len(stats["exemples_lignes_rejetees"]) < 3:
                stats["exemples_lignes_rejetees"].append({
                    "reason": "CA à zéro ou vide",
                    "code_union": code_union,
                    "ca": ca_value,
                    "annee": row_dict.get("annee", ""),
                    "fournisseur": row_dict.get("fournisseur", "")[:50]
                })
        else:
            # Ligne valide
            stats["lignes_valides"] += 1
            if not row_dict.get("groupe_client"):
                row_dict["groupe_client"] = "Sans groupe"
            data.append(row_dict)
    
    # Détecter l'année principale
    detected_year = max(years_in_file) if years_in_file else datetime.now().year
    
    # Détecter le mois depuis le nom du fichier
    detected_month = extract_month_from_filename(file_path)
    
    # Convertir le set en liste pour JSON
    stats["exemples_annees"] = list(stats["exemples_annees"])
    
    # Ajouter des exemples de lignes brutes (premières lignes) pour diagnostic
    stats["exemples_lignes_brutes"] = []
    for idx in range(min(5, len(df))):
        row = df.iloc[idx]
        exemple = {}
        for key in column_mapping:
            excel_col = column_mapping[key]
            try:
                valeur = row[excel_col]
                exemple[key] = str(valeur) if pd.notna(valeur) else "(vide)"
            except:
                exemple[key] = "(erreur)"
        stats["exemples_lignes_brutes"].append(exemple)
    
    return data, raw_columns, column_mapping, detected_month, detected_year, mapping_method, stats


def extract_month_from_filename(filename: str) -> Optional[int]:
    """Extrait le mois du nom de fichier."""
    months = {
        'janvier': 1, 'fevrier': 2, 'mars': 3, 'avril': 4,
        'mai': 5, 'juin': 6, 'juillet': 7, 'aout': 8,
        'septembre': 9, 'octobre': 10, 'novembre': 11, 'decembre': 12
    }
    
    filename_lower = filename.lower()
    for month_name, month_num in months.items():
        if month_name in filename_lower:
            return month_num
    
    # Chercher un numéro de mois
    month_match = re.search(r'[_-](\d{1,2})[_.]', filename)
    if month_match:
        month = int(month_match.group(1))
        if 1 <= month <= 12:
            return month
    
    return None


def matches_rule(row: Dict, rule: Dict) -> Tuple[bool, List[str]]:
    """
    Vérifie si une ligne correspond à une règle RFA.
    Retourne (matches, debug_info).
    """
    debug_info = []
    # Normaliser le fournisseur (approche AppScript : contient / variations)
    fournisseur_raw = row.get("fournisseur", "")
    fournisseur_norm = normalize_supplier_name(fournisseur_raw)
    fournisseur_text = normalize_text(fournisseur_raw)
    fournisseur_norm_text = normalize_text(fournisseur_norm)
    rule_frs = normalize_text(rule.get("fournisseur", ""))

    debug_info.append(
        f"Fournisseur ligne: '{fournisseur_raw}' -> '{fournisseur_norm}' vs règle: '{rule_frs}'"
    )

    if not rule_frs or (rule_frs not in fournisseur_text and rule_frs not in fournisseur_norm_text):
        debug_info.append("❌ Fournisseur ne correspond pas")
        return False, debug_info
    
    debug_info.append("✅ Fournisseur correspond")
    
    # Vérifier les critères spécifiques
    if "marque" in rule:
        marque = normalize_text(row.get("marque", ""))
        marque_compact = normalize_compact(marque)
        rule_marque = normalize_text(rule["marque"])
        rule_marque_compact = normalize_compact(rule["marque"])
        if rule_marque not in marque and rule_marque_compact not in marque_compact:
            debug_info.append(f"❌ Marque '{marque}' ne contient pas '{rule_marque}'")
            return False, debug_info
        debug_info.append(f"✅ Marque correspond: '{marque}'")
    
    if "marqueList" in rule:
        marque = normalize_text(row.get("marque", ""))
        marque_compact = normalize_compact(marque)
        found = any(
            normalize_text(m) in marque or normalize_compact(m) in marque_compact
            for m in rule["marqueList"]
        )
        if not found:
            debug_info.append(f"❌ Marque '{marque}' ne correspond à aucune de {rule['marqueList']}")
            return False, debug_info
        debug_info.append(f"✅ Marque correspond à une de {rule['marqueList']}")
    
    if "groupeFrsList" in rule:
        groupe_frs = normalize_text(row.get("groupe_frs", ""))
        found = any(normalize_text(g) in groupe_frs for g in rule["groupeFrsList"])
        if not found:
            debug_info.append(f"❌ Groupe FRS '{groupe_frs}' ne correspond à aucune de {rule['groupeFrsList']}")
            return False, debug_info
        debug_info.append(f"✅ Groupe FRS correspond à une de {rule['groupeFrsList']}")
    
    if "famille" in rule:
        famille = normalize_text(row.get("famille", ""))
        famille_norm = normalize_family(famille)
        rule_famille = normalize_family(rule["famille"])
        if rule_famille not in famille and rule_famille not in famille_norm:
            debug_info.append(f"❌ Famille '{famille}' ne contient pas '{rule_famille}'")
            return False, debug_info
        debug_info.append(f"✅ Famille correspond: '{famille}'")
    
    rule_sous_famille_value = rule.get("sous_famille") or rule.get("sousFamille")
    if rule_sous_famille_value:
        sous_famille = normalize_text(row.get("sous_famille", ""))
        sous_famille_compact = normalize_compact(sous_famille)
        rule_sous_famille = normalize_text(rule_sous_famille_value)
        rule_sous_famille_compact = normalize_compact(rule_sous_famille_value)
        if rule_sous_famille not in sous_famille and rule_sous_famille_compact not in sous_famille_compact:
            debug_info.append(f"❌ Sous-famille '{sous_famille}' ne contient pas '{rule_sous_famille}'")
            return False, debug_info
        debug_info.append(f"✅ Sous-famille correspond: '{sous_famille}'")
    
    return True, debug_info


def validate_rules() -> Dict:
    """Valide que toutes les règles sont bien définies."""
    validation = {
        "total_rules": len(RFA_RULES),
        "rules_by_type": {},
        "rules_details": [],
        "errors": [],
        "warnings": []
    }
    
    for rule in RFA_RULES:
        rule_type = rule.get("type", "unknown")
        if rule_type not in validation["rules_by_type"]:
            validation["rules_by_type"][rule_type] = 0
        validation["rules_by_type"][rule_type] += 1
        
        rule_detail = {
            "key": rule.get("key"),
            "type": rule_type,
            "fournisseur": rule.get("fournisseur"),
            "has_seuil": "seuil" in rule,
            "has_taux": "taux" in rule,
            "criteria": {}
        }
        
        if "marque" in rule:
            rule_detail["criteria"]["marque"] = rule["marque"]
        if "marqueList" in rule:
            rule_detail["criteria"]["marqueList"] = rule["marqueList"]
        if "groupeFrsList" in rule:
            rule_detail["criteria"]["groupeFrsList"] = rule["groupeFrsList"]
        if "famille" in rule:
            rule_detail["criteria"]["famille"] = rule["famille"]
        if "sous_famille" in rule:
            rule_detail["criteria"]["sous_famille"] = rule["sous_famille"]
        
        validation["rules_details"].append(rule_detail)
        
        if not rule.get("key"):
            validation["errors"].append(f"Règle sans clé: {rule}")
        if rule_type == "tri" and not rule.get("seuil"):
            validation["warnings"].append(f"Règle tri sans seuil: {rule.get('key')}")
    
    return validation


def detect_global_suppliers(data: List[Dict]) -> Tuple[List[str], Dict[str, str]]:
    """
    Détecte automatiquement les fournisseurs uniques dans le fichier brut.
    Retourne:
    - La liste des fournisseurs NORMALISÉS (ACR, ALLIANCE, DCA, EXADIS, etc.)
    - Un mapping valeur_brute -> valeur_normalisée pour le diagnostic
    """
    suppliers_map = {}  # valeur_normalisée -> valeur_brute (première occurrence)
    raw_to_normalized = {}  # pour le diagnostic
    
    for row in data:
        fournisseur_raw = str(row.get("fournisseur", "")).strip()
        if fournisseur_raw:
            # Normaliser via le mapping standard (ACR Industries -> ACR)
            fournisseur_normalized = normalize_supplier_name(fournisseur_raw)
            if fournisseur_normalized:
                raw_to_normalized[fournisseur_raw] = fournisseur_normalized
                if fournisseur_normalized not in suppliers_map:
                    suppliers_map[fournisseur_normalized] = fournisseur_raw
    
    # Trier pour avoir un ordre prévisible
    suppliers_list = sorted(list(suppliers_map.keys()))
    return suppliers_list, raw_to_normalized


def create_dynamic_global_rules(suppliers: List[str]) -> List[Dict]:
    """
    Crée automatiquement les règles GLOBALES pour chaque fournisseur détecté.
    """
    dynamic_rules = []
    for supplier in suppliers:
        # Créer une règle globale pour ce fournisseur
        rule = {
            "key": f"GLOBAL_{supplier}",
            "fournisseur": supplier,
            "type": "global",
            "label": f"RFA GLOBALE {supplier}"
        }
        dynamic_rules.append(rule)
    return dynamic_rules


def calculate_rfa_from_raw(
    data: List[Dict], 
    year_filter: int
) -> Dict:
    """
    Calcule les RFA depuis les données brutes (comme le script AppScript).
    ÉTAPE 1 : Détecte les fournisseurs uniques et crée les règles GLOBALES dynamiquement
    ÉTAPE 2 : Agrège par client et par fournisseur
    ÉTAPE 3 : Applique les règles RFA sur les agrégats
    """
    from app.core.fields import get_global_fields, get_tri_fields
    
    client_map = {}
    debug_log = []
    
    # Filtrer par année
    filtered_data = [row for row in data if str(year_filter) in str(row.get("annee", ""))]
    
    debug_log.append(f"📊 Total lignes: {len(data)}, filtrées pour {year_filter}: {len(filtered_data)}")
    
    # DIAGNOSTIC : Afficher quelques exemples de lignes brutes
    if filtered_data:
        debug_log.append("📋 Exemples de lignes brutes (5 premières):")
        for i, row in enumerate(filtered_data[:5]):
            frs = row.get("fournisseur", "")
            code = row.get("code_union", "")
            ca = row.get("ca", 0)
            debug_log.append(f"  Ligne {i+1}: code_union='{code}', fournisseur='{frs}', ca={ca}")
    
    # DÉTECTION AUTOMATIQUE DES FOURNISSEURS
    detected_suppliers, suppliers_raw_map = detect_global_suppliers(filtered_data)
    debug_log.append(f"🔍 Fournisseurs détectés ({len(detected_suppliers)}): {', '.join(detected_suppliers)}")
    
    # Diagnostic des fournisseurs
    if suppliers_raw_map:
        debug_log.append("📦 Valeurs brutes → normalisées:")
        for norm, raw in list(suppliers_raw_map.items())[:10]:
            debug_log.append(f"  '{raw}' → '{norm}'")
    
    # CRÉER LES RÈGLES GLOBALES DYNAMIQUEMENT
    dynamic_global_rules = create_dynamic_global_rules(detected_suppliers)
    debug_log.append(f"✅ {len(dynamic_global_rules)} règles GLOBALES créées automatiquement")
    
    # COMBINER LES RÈGLES : dynamiques (globales) + statiques (tri-partites)
    all_rules = dynamic_global_rules + RFA_RULES  # RFA_RULES ne contient que les TRI maintenant
    
    # ÉTAPE 1 : AGRÉGATION PAR CLIENT ET PAR FOURNISSEUR (comme AppScript)
    # Le script AppScript fait : clientReportMap[clientKey].suppliers[supKey].ca += ca
    client_suppliers_map = {}  # code_union -> {fournisseur_normalized -> {"ca": total, "lignes": count}}
    client_additionals_map = {}  # code_union -> {rule_key -> {"ca": total, "lignes": count}}
    
    for idx, row in enumerate(filtered_data):
        code_union = str(row.get("code_union", "")).strip()
        if not code_union:
            continue
        
        ca = float(row.get("ca", 0) or 0)
        if ca <= 0:
            continue
        
        # Initialiser les structures
        if code_union not in client_map:
            # Créer les champs globaux dynamiquement à partir des fournisseurs détectés
            global_fields = [f"GLOBAL_{s}" for s in detected_suppliers]
            client_map[code_union] = {
                "code_union": code_union,
                "nom_client": row.get("nom_client", "").strip(),
                "groupe_client": row.get("groupe_client", "").strip(),
                "global": {key: 0.0 for key in global_fields},
                "tri": {key: 0.0 for key in get_tri_fields()},
            }
            client_suppliers_map[code_union] = {}
            client_additionals_map[code_union] = {}
        
        # Garder les valeurs brutes pour le debug, et les normaliser pour le matching
        fournisseur_raw = str(row.get("fournisseur", "")).strip()
        fournisseur = normalize_supplier_name(fournisseur_raw)  # Normaliser via le mapping (ACR Industries -> ACR)
        marque = normalize_text(row.get("marque", ""))
        groupe_frs = normalize_text(row.get("groupe_frs", ""))
        famille = normalize_text(row.get("famille", ""))
        sous_famille = normalize_text(row.get("sous_famille", ""))
        
        # AGRÉGER PAR FOURNISSEUR (pour les règles GLOBALES)
        # Comme AppScript : suppliers[supKey].ca += ca
        # La clé est le fournisseur en MAJUSCULES (ACR, ALLIANCE, DCA, EXADIS...)
        if fournisseur:
            if fournisseur not in client_suppliers_map[code_union]:
                client_suppliers_map[code_union][fournisseur] = {"ca": 0.0, "lignes": 0}
            client_suppliers_map[code_union][fournisseur]["ca"] += ca
            client_suppliers_map[code_union][fournisseur]["lignes"] += 1
        
        # AGRÉGER PAR RÈGLE TRI-PARTITE (pour les règles TRI)
        # Comme AppScript : additionals[rule.key].ca += ca
        for rule in all_rules:
            if rule["type"] == "tri":
                matches, _ = matches_rule(row, rule)
                if matches:
                    rule_key = rule["key"]
                    if rule_key not in client_additionals_map[code_union]:
                        client_additionals_map[code_union][rule_key] = {"ca": 0.0, "lignes": 0}
                    client_additionals_map[code_union][rule_key]["ca"] += ca
                    client_additionals_map[code_union][rule_key]["lignes"] += 1
    
    debug_log.append(f"✅ Agrégation terminée : {len(client_map)} clients trouvés")
    
    # DIAGNOSTIC : Afficher les fournisseurs agrégés pour le premier client
    if client_suppliers_map:
        first_client = list(client_suppliers_map.keys())[0]
        first_suppliers = client_suppliers_map[first_client]
        debug_log.append(f"📦 Fournisseurs agrégés pour client '{first_client}':")
        for sup, data in list(first_suppliers.items())[:10]:
            debug_log.append(f"  - {sup}: CA={data['ca']:.2f}€, {data['lignes']} lignes")
    
    # ÉTAPE 2 : APPLIQUER LES RÈGLES RFA SUR LES AGRÉGATS
    rule_stats = {rule["key"]: {"matched": 0, "ca_total": 0.0, "lignes": []} for rule in all_rules}
    
    for code_union, client_data in client_map.items():
        # Appliquer les règles GLOBALES (agrégation par fournisseur)
        suppliers = client_suppliers_map.get(code_union, {})
        for rule in all_rules:
            if rule["type"] == "global":
                # Le fournisseur de la règle est déjà en MAJUSCULES (créé par create_dynamic_global_rules)
                rule_frs = rule["fournisseur"]
                
                if rule_frs in suppliers:
                    ca_total = suppliers[rule_frs]["ca"]
                    lignes_count = suppliers[rule_frs]["lignes"]
                    if ca_total > 0:
                        # Créer la colonne GLOBAL_XXX
                        global_key = f"GLOBAL_{rule_frs}"
                        if global_key in client_data["global"]:
                            client_data["global"][global_key] = ca_total
                            rule_stats[rule["key"]]["matched"] += lignes_count  # Compter les lignes brutes
                            rule_stats[rule["key"]]["ca_total"] += ca_total
                            if len(debug_log) < 50:  # Limiter les logs
                                debug_log.append(f"✅ Client {code_union}: {global_key} = {ca_total}€ ({lignes_count} lignes)")
        
        # Appliquer les règles TRI-PARTITES (agrégation par règle)
        additionals = client_additionals_map.get(code_union, {})
        for rule in all_rules:
            if rule["type"] == "tri":
                rule_key = rule["key"]
                if rule_key in additionals:
                    ca_total = additionals[rule_key]["ca"]
                    lignes_count = additionals[rule_key]["lignes"]
                    if ca_total > 0:
                        if rule_key in client_data["tri"]:
                            client_data["tri"][rule_key] = ca_total
                            rule_stats[rule["key"]]["matched"] += lignes_count  # Compter les lignes brutes
                            rule_stats[rule["key"]]["ca_total"] += ca_total
                            if len(debug_log) < 50:  # Limiter les logs
                                debug_log.append(f"✅ Client {code_union}: {rule_key} = {ca_total}€ ({lignes_count} lignes)")
    
    # Calculer les totaux
    for code_union, client_data in client_map.items():
        global_total = sum(client_data["global"].values())
        tri_total = sum(client_data["tri"].values())
        client_data["global_total"] = global_total
        client_data["tri_total"] = tri_total
        client_data["grand_total"] = global_total + tri_total
    
    # Calcul des totaux par fournisseur pour diagnostic
    suppliers_totals = {}
    for code_union, suppliers_data in client_suppliers_map.items():
        for sup, data in suppliers_data.items():
            if sup not in suppliers_totals:
                suppliers_totals[sup] = {"ca": 0.0, "lignes": 0, "clients": 0}
            suppliers_totals[sup]["ca"] += data["ca"]
            suppliers_totals[sup]["lignes"] += data["lignes"]
            suppliers_totals[sup]["clients"] += 1
    
    return {
        "client_map": client_map,
        "rule_stats": rule_stats,
        "total_clients": len(client_map),
        "total_lignes_traitees": len(filtered_data),
        "debug_log": debug_log,
        "detected_suppliers": detected_suppliers,
        "dynamic_global_rules": dynamic_global_rules,
        "all_rules": all_rules,
        "suppliers_totals": suppliers_totals
    }


def generate_validation_report(
    data: List[Dict],
    rfa_results: Dict,
    rules_validation: Dict,
    column_mapping: Dict,
    raw_columns: List[str],
    year_filter: int
) -> Dict:
    """Génère un rapport complet de validation."""
    # Diagnostic détaillé des colonnes
    columns_diagnostic = []
    for field_key, field_label, aliases in RAW_FIELD_DEFINITIONS:
        found = field_key in column_mapping
        excel_col = column_mapping.get(field_key, None)
        columns_diagnostic.append({
            "field": field_key,
            "label": field_label,
            "found": found,
            "excel_column": excel_col if found else None,
            "expected_aliases": aliases[:5],  # Afficher les 5 premiers aliases
            "status": "✅ Reconnue" if found else "❌ Non reconnue"
        })
    
    # Colonnes non mappées
    mapped_excel_cols = set(column_mapping.values())
    unmapped_columns = [
        {
            "column_name": col,
            "normalized": normalize_header(col),
            "suggestion": suggest_field_for_column(col)
        }
        for col in raw_columns
        if col not in mapped_excel_cols
    ]
    
    report = {
        "summary": {
            "total_lignes_brutes": len(data),
            "annee_filtree": year_filter,
            "total_clients_trouves": rfa_results.get("total_clients", 0),
            "total_lignes_traitees": rfa_results.get("total_lignes_traitees", 0),
            "colonnes_reconnues": len(column_mapping),
            "colonnes_totales": len(raw_columns),
            "fournisseurs_detectes": rfa_results.get("detected_suppliers", []),
            "regles_globales_creees": len(rfa_results.get("dynamic_global_rules", [])),
        },
        "suppliers_totals": rfa_results.get("suppliers_totals", {}),
        "columns_validation": {
            "mapped_columns": column_mapping,
            "columns_diagnostic": columns_diagnostic,
            "unmapped_columns": unmapped_columns,
            "all_raw_columns": raw_columns,
        },
        "rules_validation": rules_validation,
        "rules_statistics": rfa_results.get("rule_stats", {}),
        "platforms_validation": {},
        "tripartites_validation": {},
        "clients_summary": [],
        "debug_log": rfa_results.get("debug_log", [])[:100],  # Limiter à 100 premières lignes
        "warnings": [],
        "errors": []
    }
    
    # Validation des plateformes globales (utiliser les règles dynamiques)
    client_map = rfa_results.get("client_map", {})
    dynamic_global_rules = rfa_results.get("dynamic_global_rules", [])
    
    # Créer les champs globaux à partir des règles dynamiques
    global_fields = [rule["key"] for rule in dynamic_global_rules]
    
    for platform in global_fields:
        total_ca = sum(client_data["global"].get(platform, 0) for client_data in client_map.values())
        rule_stat = rfa_results.get("rule_stats", {}).get(platform, {})
        report["platforms_validation"][platform] = {
            "total_ca": total_ca,
            "lignes_matchées": rule_stat.get("matched", 0),
            "clients_with_ca": len([c for c in client_map.values() if c["global"].get(platform, 0) > 0]),
            "status": "✅ OK" if rule_stat.get("matched", 0) > 0 else "⚠️ Aucune ligne matchée"
        }
    
    # Validation des tri-partites
    tri_fields = [
        "TRI_DCA_SBS", "TRI_DCA_FREINAGE",
        "TRI_ACR_FREINAGE", "TRI_ACR_EMBRAYAGE", "TRI_ACR_FILTRE", "TRI_ACR_DISTRIBUTION",
        "TRI_EXADIS_EMBRAYAGE", "TRI_EXADIS_FILTRATION", "TRI_EXADIS_DISTRIBUTION",
        "TRI_EXADIS_ETANCHEITE", "TRI_EXADIS_THERMIQUE", "TRI_EXADIS_FREINAGE",
        "TRI_SCHAEFFLER", "TRI_ALLIANCE_DELPHI", "TRI_ALLIANCE_BREMBO",
        "TRI_ALLIANCE_SOGEFI", "TRI_ALLIANCE_SKF", "TRI_ALLIANCE_NAPA"
    ]
    
    for tri_field in tri_fields:
        total_ca = sum(client_data["tri"].get(tri_field, 0) for client_data in client_map.values())
        rule_stat = rfa_results.get("rule_stats", {}).get(tri_field, {})
        report["tripartites_validation"][tri_field] = {
            "total_ca": total_ca,
            "lignes_matchées": rule_stat.get("matched", 0),
            "clients_with_ca": len([c for c in client_map.values() if c["tri"].get(tri_field, 0) > 0]),
            "status": "✅ OK" if rule_stat.get("matched", 0) > 0 else "⚠️ Aucune ligne matchée"
        }
    
    # Résumé par client (top 10)
    clients_sorted = sorted(
        client_map.items(),
        key=lambda x: x[1].get("grand_total", 0),
        reverse=True
    )[:10]
    
    for code_union, client_data in clients_sorted:
        report["clients_summary"].append({
            "code_union": code_union,
            "nom_client": client_data.get("nom_client"),
            "groupe_client": client_data.get("groupe_client"),
            "global_total": client_data.get("global_total", 0),
            "tri_total": client_data.get("tri_total", 0),
            "grand_total": client_data.get("grand_total", 0),
        })
    
    # Vérifier les règles qui n'ont jamais match
    rule_stats = rfa_results.get("rule_stats", {})
    for rule_key, stats in rule_stats.items():
        if stats["matched"] == 0:
            report["warnings"].append(
                f"Règle '{rule_key}' n'a jamais matché (0 lignes)"
            )
    
    # Vérifier les clients sans RFA
    clients_without_rfa = [
        code for code, data in client_map.items()
        if data.get("grand_total", 0) == 0
    ]
    if clients_without_rfa:
        report["warnings"].append(
            f"{len(clients_without_rfa)} clients sans RFA calculée: {clients_without_rfa[:5]}..."
        )
    
    return report
