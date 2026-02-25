"""
Service d'agrégation par client et par groupe.
"""
from typing import Dict, List
from app.core.fields import get_global_fields, get_tri_fields, get_field_by_key
from app.schemas import ClientRecap, GroupRecap, AmountItem


def aggregate_by_client(data: List[Dict]) -> Dict[str, Dict]:
    """
    Agrège les données par Code Union.
    Retourne un dict : code_union -> ClientRecap.
    """
    aggregated = {}
    
    for row in data:
        code_union = row.get("code_union", "").strip()
        if not code_union:
            continue
        
        if code_union not in aggregated:
            aggregated[code_union] = {
                "code_union": code_union,
                "nom_client": row.get("nom_client", "").strip() or None,
                "groupe_client": (row.get("groupe_client", "").strip() or "").upper(),  # Normaliser en majuscules
                "global": {key: 0.0 for key in get_global_fields()},
                "tri": {key: 0.0 for key in get_tri_fields()},
            }
        
        # Sommer les valeurs global
        for key in get_global_fields():
            aggregated[code_union]["global"][key] += row.get(key, 0.0)
        
        # Sommer les valeurs tri
        for key in get_tri_fields():
            aggregated[code_union]["tri"][key] += row.get(key, 0.0)
    
    # Calculer les totaux
    for code_union, client_data in aggregated.items():
        global_total = sum(client_data["global"].values())
        tri_total = sum(client_data["tri"].values())
        grand_total = global_total + tri_total
        
        client_data["global_total"] = global_total
        client_data["tri_total"] = tri_total
        client_data["grand_total"] = grand_total
    
    return aggregated


def aggregate_by_group(data: List[Dict]) -> Dict[str, Dict]:
    """
    Agrège les données par Groupe Client.
    Retourne un dict : groupe_client -> GroupRecap.
    """
    # D'abord, on a besoin de la liste des codes union par groupe
    group_codes = {}  # groupe -> set de codes union
    
    for row in data:
        groupe = (row.get("groupe_client", "").strip() or "").upper()  # Normaliser en majuscules
        code_union = row.get("code_union", "").strip()
        
        if not groupe or not code_union:
            continue
        
        if groupe not in group_codes:
            group_codes[groupe] = set()
        group_codes[groupe].add(code_union)
    
    # Maintenant, agréger les montants par groupe
    aggregated = {}
    
    for row in data:
        groupe = (row.get("groupe_client", "").strip() or "").upper()  # Normaliser en majuscules
        if not groupe:
            continue
        
        if groupe not in aggregated:
            aggregated[groupe] = {
                "groupe_client": groupe,
                "nb_comptes": len(group_codes.get(groupe, set())),
                "codes_union": sorted(list(group_codes.get(groupe, set()))),
                "global": {key: 0.0 for key in get_global_fields()},
                "tri": {key: 0.0 for key in get_tri_fields()},
            }
        
        # Sommer les valeurs global
        for key in get_global_fields():
            aggregated[groupe]["global"][key] += row.get(key, 0.0)
        
        # Sommer les valeurs tri
        for key in get_tri_fields():
            aggregated[groupe]["tri"][key] += row.get(key, 0.0)
    
    # Calculer les totaux
    for groupe, group_data in aggregated.items():
        global_total = sum(group_data["global"].values())
        tri_total = sum(group_data["tri"].values())
        grand_total = global_total + tri_total
        
        group_data["global_total"] = global_total
        group_data["tri_total"] = tri_total
        group_data["grand_total"] = grand_total
    
    return aggregated

