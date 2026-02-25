"""
Service de calcul et agrégation par Code Union et par Groupe.
"""
from typing import Dict, List, Optional
from app.core.fields import get_global_fields, get_tri_fields, get_field_by_key
from app.schemas import ClientSummary, ClientDetail, AmountItem, GroupDetail, EntityDetailWithRfa, RfaResult, GlobalRfaItem, TriRfaItem, MarketingItem, TierResult, RecapGlobalRfa, PlatformRfaDetail, RecapGlobalRfa
from app.storage import ImportData
from app.services.aggregation import aggregate_by_client, aggregate_by_group
from app.services.rfa_calculator import calculate_rfa
from app.services.contract_resolver import resolve_contract, get_contract_by_id


def compute_aggregations(import_data: ImportData):
    """
    Calcule et stocke les agrégations par client et par groupe.
    """
    import_data.by_client = aggregate_by_client(import_data.data)
    import_data.by_group = aggregate_by_group(import_data.data)


def get_clients_summary(import_data: ImportData) -> List[ClientSummary]:
    """Retourne la liste des clients avec totaux."""
    if len(import_data.by_client) == 0:
        compute_aggregations(import_data)
    
    clients = []
    for code_union, data in import_data.by_client.items():
        clients.append(ClientSummary(
            code_union=code_union,
            nom_client=data.get("nom_client"),
            groupe_client=data.get("groupe_client"),
            global_total=data["global_total"],
            tri_total=data["tri_total"],
            grand_total=data["grand_total"],
        ))
    
    # Trier par code_union
    clients.sort(key=lambda x: x.code_union)
    
    return clients


def get_client_detail(import_data: ImportData, code_union: str) -> ClientDetail:
    """Retourne le détail d'un client."""
    if len(import_data.by_client) == 0:
        compute_aggregations(import_data)
    
    if code_union not in import_data.by_client:
        raise ValueError(f"Client {code_union} non trouvé")
    
    data = import_data.by_client[code_union]
    
    # Construire les listes global et tri
    global_items = []
    for key in get_global_fields():
        _, label = get_field_by_key(key)
        global_items.append(AmountItem(
            key=key,
            label=label,
            amount=data["global"][key]
        ))
    
    tri_items = []
    for key in get_tri_fields():
        _, label = get_field_by_key(key)
        tri_items.append(AmountItem(
            key=key,
            label=label,
            amount=data["tri"][key]
        ))
    
    return ClientDetail(
        code_union=code_union,
        nom_client=data.get("nom_client"),
        groupe_client=data.get("groupe_client"),
        global_items=global_items,
        tri=tri_items,
        totals={
            "global_total": data["global_total"],
            "tri_total": data["tri_total"],
            "grand_total": data["grand_total"],
        }
    )


def get_group_detail(import_data: ImportData, groupe_client: str) -> GroupDetail:
    """Retourne le détail d'un groupe."""
    if len(import_data.by_group) == 0:
        compute_aggregations(import_data)
    
    if groupe_client not in import_data.by_group:
        raise ValueError(f"Groupe {groupe_client} non trouvé")
    
    data = import_data.by_group[groupe_client]
    
    # Construire les listes global et tri
    global_items = []
    for key in get_global_fields():
        _, label = get_field_by_key(key)
        global_items.append(AmountItem(
            key=key,
            label=label,
            amount=data["global"][key]
        ))
    
    tri_items = []
    for key in get_tri_fields():
        _, label = get_field_by_key(key)
        tri_items.append(AmountItem(
            key=key,
            label=label,
            amount=data["tri"][key]
        ))
    
    return GroupDetail(
        groupe_client=groupe_client,
        nb_comptes=data["nb_comptes"],
        codes_union=data["codes_union"],
        global_items=global_items,
        tri=tri_items,
        totals={
            "global_total": data["global_total"],
            "tri_total": data["tri_total"],
            "grand_total": data["grand_total"],
        }
    )


def get_entity_detail_with_rfa(
    import_data: ImportData, 
    mode: str, 
    entity_id: str,
    contract_id: Optional[int] = None
) -> EntityDetailWithRfa:
    """
    Retourne le détail d'une entité (client ou groupe) avec calcul RFA.
    
    Args:
        import_data: Données de l'import
        mode: "client" ou "group"
        entity_id: code_union ou groupe_client
        contract_id: ID du contrat à utiliser (optionnel, pour simulation)
    """
    if mode == "client":
        if len(import_data.by_client) == 0:
            compute_aggregations(import_data)
        
        if entity_id not in import_data.by_client:
            raise ValueError(f"Client {entity_id} non trouvé")
        
        data = import_data.by_client[entity_id]
        code_union = entity_id
        groupe_client = data.get("groupe_client", "").strip()
        
        # Résoudre le contrat (priorité : Code Union > Groupe Client > Défaut)
        if contract_id:
            contract = get_contract_by_id(contract_id)
            if not contract:
                raise ValueError(f"Contrat {contract_id} non trouvé")
        else:
            # Normaliser les valeurs pour la résolution
            code_union_norm = code_union.strip().upper() if code_union else None
            groupe_client_norm = groupe_client.strip().upper() if groupe_client else None
            contract = resolve_contract(
                code_union=code_union_norm if code_union_norm else None,
                groupe_client=groupe_client_norm if groupe_client_norm else None
            )
        
        # Préparer les données CA pour le calculateur RFA
        recap_ca = {
            "global": data["global"],
            "tri": data["tri"]
        }
        
        # Calculer RFA avec le contrat ET les overrides du client
        rfa_result = calculate_rfa(recap_ca, contract=contract, code_union=entity_id)
        
        # Convertir en schemas Pydantic
        global_rfa_items = {}
        for key, rfa_data in rfa_result["global"].items():
            global_rfa_items[key] = GlobalRfaItem(
                label=rfa_data["label"],
                ca=rfa_data["ca"],
                rfa=TierResult(**rfa_data["rfa"]),
                bonus=TierResult(**rfa_data["bonus"]),
                total=rfa_data["total"],
                triggered=rfa_data["triggered"],
                has_override=rfa_data.get("has_override", False)
            )
        
        tri_rfa_items = {}
        for key, tri_data in rfa_result["tri"].items():
            tri_rfa_items[key] = TriRfaItem(
                label=tri_data["label"],
                ca=tri_data["ca"],
                selected_min=tri_data["selected_min"],
                min_threshold=tri_data.get("min_threshold"),
                rate=tri_data["rate"],
                value=tri_data["value"],
                triggered=tri_data["triggered"],
                has_override=tri_data.get("has_override", False)
            )
        
        rfa_schema = RfaResult(
            global_items=global_rfa_items,
            tri_items=tri_rfa_items,
            totals=rfa_result["totals"]
        )
        
        return EntityDetailWithRfa(
            code_union=entity_id,
            nom_client=data.get("nom_client"),
            groupe_client=data.get("groupe_client"),
            ca={
                "global": data["global"],
                "tri": data["tri"],
                "totals": {
                    "global_total": data["global_total"],
                    "tri_total": data["tri_total"],
                    "grand_total": data["grand_total"]
                }
            },
            rfa=rfa_schema,
            contract_applied={
                "id": contract.id,
                "name": contract.name
            }
        )
    
    else:  # mode == "group"
        if len(import_data.by_group) == 0:
            compute_aggregations(import_data)
        
        if entity_id not in import_data.by_group:
            raise ValueError(f"Groupe {entity_id} non trouvé")
        
        data = import_data.by_group[entity_id]
        groupe_client = entity_id.strip().upper()  # Normaliser
        
        # Résoudre le contrat pour le groupe
        # Note: Un groupe contient plusieurs Code Union (clients)
        # On résout au niveau du groupe, pas des clients individuels
        if contract_id:
            contract = get_contract_by_id(contract_id)
            if not contract:
                raise ValueError(f"Contrat {contract_id} non trouvé")
        else:
            contract = resolve_contract(groupe_client=groupe_client)
        
        # Préparer les données CA pour le calculateur RFA
        recap_ca = {
            "global": data["global"],
            "tri": data["tri"]
        }
        
        # Calculer RFA avec le contrat ET les overrides du groupe
        rfa_result = calculate_rfa(recap_ca, contract=contract, groupe_client=groupe_client)
        
        # Convertir en schemas Pydantic
        global_rfa_items = {}
        for key, rfa_data in rfa_result["global"].items():
            global_rfa_items[key] = GlobalRfaItem(
                label=rfa_data["label"],
                ca=rfa_data["ca"],
                rfa=TierResult(**rfa_data["rfa"]),
                bonus=TierResult(**rfa_data["bonus"]),
                total=rfa_data["total"],
                triggered=rfa_data["triggered"],
                has_override=rfa_data.get("has_override", False)
            )
        
        tri_rfa_items = {}
        for key, tri_data in rfa_result["tri"].items():
            tri_rfa_items[key] = TriRfaItem(
                label=tri_data["label"],
                ca=tri_data["ca"],
                selected_min=tri_data["selected_min"],
                min_threshold=tri_data.get("min_threshold"),
                rate=tri_data["rate"],
                value=tri_data["value"],
                triggered=tri_data["triggered"],
                has_override=tri_data.get("has_override", False)
            )
        
        rfa_schema = RfaResult(
            global_items=global_rfa_items,
            tri_items=tri_rfa_items,
            totals=rfa_result["totals"]
        )
        
        return EntityDetailWithRfa(
            groupe_client=entity_id,
            nb_comptes=data["nb_comptes"],
            codes_union=data["codes_union"],
            ca={
                "global": data["global"],
                "tri": data["tri"],
                "totals": {
                    "global_total": data["global_total"],
                    "tri_total": data["tri_total"],
                    "grand_total": data["grand_total"]
                }
            },
            rfa=rfa_schema,
            contract_applied={
                "id": contract.id,
                "name": contract.name
            }
        )


def get_global_recap_rfa(import_data: ImportData, dissolved_groups: Optional[set] = None) -> RecapGlobalRfa:
    """
    Calcule le récapitulatif global RFA sans double comptage.
    
    Stratégie :
    - Compter les clients qui n'ont PAS de groupe_client (ou groupe_client vide)
    - Compter les groupes (qui incluent déjà leurs clients)
    - Pour les groupes dissous : traiter chaque client individuellement au lieu d'agréger
    Cela évite de compter deux fois les clients qui sont dans un groupe.
    
    Args:
        dissolved_groups: Set des noms de groupes à traiter individuellement (normalisés en majuscules)
    """
    from app.core.fields import EXCLUDED_GROUPS
    if dissolved_groups is None:
        dissolved_groups = set()
    # Toujours inclure les groupes fictifs
    dissolved_groups = dissolved_groups | EXCLUDED_GROUPS
    if len(import_data.by_client) == 0 or len(import_data.by_group) == 0:
        compute_aggregations(import_data)
    
    # Initialiser les totaux par plateforme globale
    global_rfa_by_platform = {key: 0.0 for key in get_global_fields()}
    platform_details = {key: [] for key in get_global_fields()}  # Détails par plateforme
    total_global_rfa = 0.0
    total_global_bonus = 0.0
    total_tri = 0.0
    
    # 1. Compter les clients qui n'ont PAS de groupe OU qui sont dans un groupe dissous
    for code_union, client_data in import_data.by_client.items():
        groupe_client = client_data.get("groupe_client", "").strip()
        groupe_client_norm = groupe_client.upper() if groupe_client else ""
        
        # Si le client n'a pas de groupe OU si son groupe est dissous, on le compte individuellement
        if not groupe_client or groupe_client_norm in dissolved_groups:
            # Résoudre le contrat pour ce client
            code_union_norm = code_union.strip().upper() if code_union else None
            contract = resolve_contract(code_union=code_union_norm)
            
            # Préparer les données CA
            recap_ca = {
                "global": client_data["global"],
                "tri": client_data["tri"]
            }
            
            # Calculer RFA
            rfa_result = calculate_rfa(recap_ca, contract=contract)
            
            # Construire le label du client
            nom_client = client_data.get("nom_client", "").strip()
            entity_label = code_union
            if nom_client:
                entity_label = f"{code_union} - {nom_client}"
            
            # Ajouter les RFA par plateforme et les détails
            for key in get_global_fields():
                if key in rfa_result["global"]:
                    rfa_data = rfa_result["global"][key]
                    # Utiliser total.value (RFA + Bonus) pour correspondre au "Total €" du modal client
                    total_value = rfa_data["total"]["value"]  # RFA + Bonus
                    ca_value = rfa_data["ca"]
                    # Calculer le taux réel : (Total / CA) même si le palier n'est pas atteint
                    rfa_rate_real = (total_value / ca_value) if ca_value > 0 else 0.0
                    
                    global_rfa_by_platform[key] += total_value
                    
                    # Ajouter le détail
                    platform_details[key].append(PlatformRfaDetail(
                        entity_id=code_union,
                        entity_label=entity_label,
                        entity_type="client",
                        rfa_value=round(total_value, 2),  # Total (RFA + Bonus)
                        ca_value=round(ca_value, 2),
                        rfa_rate=round(rfa_rate_real, 4)  # Taux réel calculé (Total/CA)
                    ))
            
            # Ajouter les totaux
            totals = rfa_result["totals"]
            total_global_rfa += totals.get("global_rfa", 0)
            total_global_bonus += totals.get("global_bonus", 0)
            total_tri += totals.get("tri_total", 0)
    
    # 2. Compter les groupes (qui incluent déjà leurs clients) SAUF les groupes dissous
    for groupe, group_data in import_data.by_group.items():
        groupe_norm = groupe.strip().upper() if groupe else None
        
        # Ignorer les groupes dissous (leurs clients sont déjà comptés individuellement)
        if groupe_norm in dissolved_groups:
            continue
        # Résoudre le contrat pour ce groupe
        groupe_norm = groupe.strip().upper() if groupe else None
        contract = resolve_contract(groupe_client=groupe_norm)
        
        # Préparer les données CA
        recap_ca = {
            "global": group_data["global"],
            "tri": group_data["tri"]
        }
        
        # Calculer RFA
        rfa_result = calculate_rfa(recap_ca, contract=contract)
        
        # Ajouter les RFA par plateforme et les détails
        for key in get_global_fields():
            if key in rfa_result["global"]:
                rfa_data = rfa_result["global"][key]
                # Utiliser total.value (RFA + Bonus) pour correspondre au "Total €" du modal client
                total_value = rfa_data["total"]["value"]  # RFA + Bonus
                ca_value = rfa_data["ca"]
                # Calculer le taux réel : (Total / CA) même si le palier n'est pas atteint
                rfa_rate_real = (total_value / ca_value) if ca_value > 0 else 0.0
                
                global_rfa_by_platform[key] += total_value
                
                # Ajouter le détail
                platform_details[key].append(PlatformRfaDetail(
                    entity_id=groupe,
                    entity_label=groupe,
                    entity_type="group",
                    rfa_value=round(total_value, 2),  # Total (RFA + Bonus)
                    ca_value=round(ca_value, 2),
                    rfa_rate=round(rfa_rate_real, 4)  # Taux réel calculé (Total/CA)
                ))
        
        # Ajouter les totaux
        totals = rfa_result["totals"]
        total_global_rfa += totals.get("global_rfa", 0)
        total_global_bonus += totals.get("global_bonus", 0)
        total_tri += totals.get("tri_total", 0)
    
    # Calculer les totaux finaux
    total_global = total_global_rfa + total_global_bonus
    grand_total = total_global + total_tri
    
    return RecapGlobalRfa(
        global_rfa_by_platform=global_rfa_by_platform,
        platform_details=platform_details,
        total_global_rfa=round(total_global_rfa, 2),
        total_global_bonus=round(total_global_bonus, 2),
        total_global=round(total_global, 2),
        total_tri=round(total_tri, 2),
        grand_total=round(grand_total, 2)
    )


def get_union_detail_with_rfa(import_data: ImportData) -> EntityDetailWithRfa:
    """
    Calcule le détail Union (agrégation globale tous clients) avec calcul RFA.
    Applique les contrats Union (scope="union") par fournisseur.
    """
    if len(import_data.by_client) == 0:
        compute_aggregations(import_data)
    
    # Agréger tous les clients (global et tri) — initialiser avec toutes les clés connues pour inclure les nouvelles tri (ex. ACR Machine tournante / Liaison au sol)
    aggregated_global = {key: 0.0 for key in get_global_fields()}
    aggregated_tri = {key: 0.0 for key in get_tri_fields()}
    ca_by_groupe = {}  # {groupe_client: {field_key: ca}}
    
    for code_union, data in import_data.by_client.items():
        groupe = data.get("groupe_client", "")
        if groupe and groupe not in ca_by_groupe:
            ca_by_groupe[groupe] = {
                "global": {k: 0.0 for k in get_global_fields()},
                "tri": {k: 0.0 for k in get_tri_fields()},
            }
        for key, amount in data.get("global", {}).items():
            if key in aggregated_global:
                aggregated_global[key] = aggregated_global.get(key, 0.0) + amount
            if groupe and key in ca_by_groupe[groupe]["global"]:
                ca_by_groupe[groupe]["global"][key] = ca_by_groupe[groupe]["global"].get(key, 0.0) + amount
        for key, amount in data.get("tri", {}).items():
            if key in aggregated_tri:
                aggregated_tri[key] = aggregated_tri.get(key, 0.0) + amount
            if groupe and key in ca_by_groupe[groupe]["tri"]:
                ca_by_groupe[groupe]["tri"][key] = ca_by_groupe[groupe]["tri"].get(key, 0.0) + amount
    
    global_total = sum(aggregated_global.values())
    tri_total = sum(aggregated_tri.values())
    grand_total = global_total + tri_total
    
    # Récupérer TOUS les contrats Union actifs (un par fournisseur)
    from app.services.contract_resolver import get_all_union_contracts
    union_contracts = get_all_union_contracts()
    
    if not union_contracts or len(union_contracts) == 0:
        # Pas de contrat Union configuré : retourner les données brutes sans RFA
        print("[UNION] ATTENTION : Aucun contrat Union actif trouve !")
        print("[UNION] Allez dans Contrats > Contrats Union (DAF) et importez les contrats fournisseurs")
        return EntityDetailWithRfa(
            groupe_client="GROUPEMENT UNION",
            nb_comptes=len(import_data.by_client),
            ca={
                "global": aggregated_global,
                "tri": aggregated_tri,
                "totals": {
                    "global_total": global_total,
                    "tri_total": tri_total,
                    "grand_total": grand_total
                }
            },
            rfa={
                "global": {},
                "tri": {},
                "totals": {"global_rfa": 0, "global_bonus": 0, "tri_total": 0, "grand_total": 0}
            },
            contract_applied={"id": 0, "name": "Aucun contrat configuré"}
        )
    
    print(f"[UNION] {len(union_contracts)} contrat(s) Union trouve(s)")
    
    # Calculer RFA en combinant tous les contrats Union
    from app.services.rfa_calculator import calculate_rfa_multi_contracts
    
    # Préparer les données CA pour le calculateur RFA
    recap_ca = {
        "global": aggregated_global,
        "tri": aggregated_tri
    }
    
    # Calculer RFA avec tous les contrats Union
    rfa_result = calculate_rfa_multi_contracts(recap_ca, contracts=union_contracts, ca_by_groupe=ca_by_groupe)
    
    # Convertir en schemas Pydantic
    global_rfa_items = {}
    for key, rfa_data in rfa_result["global"].items():
        global_rfa_items[key] = GlobalRfaItem(
            label=rfa_data["label"],
            ca=rfa_data["ca"],
            rfa=TierResult(**rfa_data["rfa"]),
            bonus=TierResult(**rfa_data["bonus"]),
            total=rfa_data["total"],
            triggered=rfa_data["triggered"],
            has_override=rfa_data.get("has_override", False)
        )
    
    tri_rfa_items = {}
    for key, tri_data in rfa_result["tri"].items():
        tri_rfa_items[key] = TriRfaItem(
            label=tri_data["label"],
            ca=tri_data["ca"],
            selected_min=tri_data["selected_min"],
            min_threshold=tri_data.get("min_threshold"),
            rate=tri_data["rate"],
            value=tri_data["value"],
            triggered=tri_data["triggered"],
            has_override=tri_data.get("has_override", False)
        )
    # Garantir que toutes les clés tri (dont ACR Machine tournante / Liaison au sol) sont présentes
    for key in get_tri_fields():
        if key not in tri_rfa_items:
            _, default_label = get_field_by_key(key)
            ca_val = aggregated_tri.get(key, 0.0)
            tri_rfa_items[key] = TriRfaItem(
                label=default_label,
                ca=ca_val,
                selected_min=None,
                min_threshold=None,
                rate=0.0,
                value=0.0,
                triggered=False,
                has_override=False
            )
    
    marketing_items = {}
    for key, m_data in rfa_result.get("marketing", {}).items():
        marketing_items[key] = MarketingItem(
            label=m_data["label"],
            amount=m_data["amount"],
            calculation_type=m_data["calculation_type"],
            rate=m_data.get("rate"),
            base_amount=m_data.get("base_amount")
        )

    rfa_schema = RfaResult(
        global_items=global_rfa_items,
        tri_items=tri_rfa_items,
        marketing_items=marketing_items,
        totals=rfa_result["totals"],
        bonus_groups=rfa_result.get("bonus_groups", [])
    )
    
    # Nom du contrat : liste des contrats actifs
    contract_names = [c.name for c in union_contracts]
    contract_name_display = ", ".join(contract_names) if len(contract_names) <= 3 else f"{len(contract_names)} contrats actifs"
    
    return EntityDetailWithRfa(
        groupe_client="GROUPEMENT UNION",
        nb_comptes=len(import_data.by_client),
        ca={
            "global": aggregated_global,
            "tri": aggregated_tri,
            "totals": {
                "global_total": global_total,
                "tri_total": tri_total,
                "grand_total": grand_total
            }
        },
        rfa=rfa_schema,
        contract_applied={
            "id": union_contracts[0].id if union_contracts else 0,
            "ids": [c.id for c in union_contracts],
            "name": contract_name_display
        }
    )

