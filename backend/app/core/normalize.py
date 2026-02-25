"""
Normalisation des en-têtes Excel et des montants.
"""
import re
import unicodedata


def normalize_header(header: str) -> str:
    """
    Normalise un en-tête Excel pour la comparaison :
    - minuscules
    - suppression accents
    - suppression doubles espaces
    - trim
    """
    if not header:
        return ""
    
    # Convertir en string si nécessaire
    s = str(header).strip()
    
    # Minuscules
    s = s.lower()
    
    # Supprimer accents
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    
    # Remplacer tout caractère non alphanumérique par un espace
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    
    # Supprimer doubles espaces
    s = re.sub(r'\s+', ' ', s)
    
    return s.strip()


def sanitize_amount(value) -> float:
    """
    Nettoie un montant : supprime €, espaces, virgules, convertit en float.
    Retourne 0.0 si conversion impossible.
    """
    if value is None:
        return 0.0
    
    # Convertir en string
    s = str(value).strip()
    
    if not s or s == "":
        return 0.0
    
    # Supprimer €, espaces
    s = s.replace("€", "").replace("€", "").replace(" ", "").replace("\xa0", "")
    
    # Remplacer virgule par point (format français)
    s = s.replace(",", ".")
    
    # Extraire uniquement chiffres, point, signe moins
    s = re.sub(r'[^\d.\-]', '', s)
    
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0




