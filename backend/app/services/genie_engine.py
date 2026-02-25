"""
Moteur d'analyse commerciale "Génie RFA".
Compare contrats ENTRANTS (Union ← fournisseurs) vs SORTANTS (Union → adhérents).
Identifie marges, pertes et leviers à double effet.
"""
import json
from typing import Dict, List, Optional, Any
from app.core.fields import get_global_fields, get_tri_fields, get_field_by_key, TRI_TO_GLOBAL, GLOBAL_TO_TRIS, EXCLUDED_GROUPS
from app.services.compute import compute_aggregations, get_entity_detail_with_rfa
from app.services.pdf_export import _parse_tiers, _get_tier_progress, _get_rate_for_threshold, _load_rules_map
from app.storage import ImportData


def _fmt(v: float) -> str:
    return f"{v:,.0f} €".replace(",", " ")


def _fmt_pct(v: float) -> str:
    return f"{v * 100:.2f}%"


def _load_union_rules_map() -> Dict[str, Dict]:
    """Charge les règles de TOUS les contrats Union actifs (multi-contrats fournisseurs)."""
    from app.services.contract_resolver import get_all_union_contracts
    from app.services.rfa_calculator import load_contract_rules

    union_contracts = get_all_union_contracts()
    rules_map = {}
    for contract in union_contracts:
        rules = load_contract_rules(contract)
        for key, rule in rules.items():
            tiers_rfa = _parse_tiers(rule.tiers_rfa)
            tiers_bonus = _parse_tiers(rule.tiers_bonus)
            tiers = _parse_tiers(rule.tiers)
            # Ne garder que les règles qui ont de vrais paliers
            if tiers_rfa or tiers_bonus or tiers:
                rules_map[key] = {
                    "tiers_rfa": tiers_rfa,
                    "tiers_bonus": tiers_bonus,
                    "tiers": tiers,
                    "has_override_rfa": False,
                    "has_override_bonus": False,
                    "has_override_tri": False,
                }
    return rules_map


def _analyze_entity(entity_data: Dict, mode: str, entity_id: str, is_union: bool = False) -> Dict:
    """Analyse une entité et retourne ses objectifs avec progression."""
    if is_union:
        # Union = plusieurs contrats fournisseurs → charger TOUS les contrats Union
        rules_map = _load_union_rules_map()
    else:
        contract_applied = entity_data.get("contract_applied") or {}
        contract_id = contract_applied.get("id")
        if not contract_id:
            return {"global_rows": [], "tri_rows": [], "rfa_by_key": {}}
        rules_map = _load_rules_map(contract_id, mode, entity_id)
    rfa_by_key = {}  # key -> rfa_amount (ce que cette entité touche)

    # Global
    global_rfa = entity_data.get("rfa", {}).get("global", {})
    global_rows = []
    for key in get_global_fields():
        if key not in global_rfa:
            continue
        item = global_rfa[key]
        if not isinstance(item, dict):
            continue
        label = item.get("label", key)
        ca = float(item.get("ca", 0) or 0)
        total_dict = item.get("total", {})
        current_value = float(total_dict.get("value", 0) or 0)
        current_rate = float(total_dict.get("rate", 0) or 0)
        rule = rules_map.get(key, {})
        tiers_rfa = rule.get("tiers_rfa") or []
        tiers_bonus = rule.get("tiers_bonus") or []
        if not tiers_rfa and not tiers_bonus:
            continue
        rfa_prog = _get_tier_progress(ca, tiers_rfa)
        bonus_prog = _get_tier_progress(ca, tiers_bonus)
        next_mins = [x for x in [rfa_prog["next_min"], bonus_prog["next_min"]] if x is not None]
        combined_next_min = min(next_mins) if next_mins else None
        combined_progress = min((ca / combined_next_min * 100), 100.0) if combined_next_min else (100.0 if ca > 0 else 0.0)
        combined_rate = (rfa_prog["rate"] or 0) + (bonus_prog["rate"] or 0)
        next_rfa_rate = _get_rate_for_threshold(tiers_rfa, combined_next_min) if combined_next_min else 0
        next_bonus_rate = _get_rate_for_threshold(tiers_bonus, combined_next_min) if combined_next_min else 0
        next_combined_rate = (next_rfa_rate + next_bonus_rate) if combined_next_min else None
        missing_ca = max((combined_next_min or 0) - ca, 0) if combined_next_min else None
        projected_rfa = (next_combined_rate * combined_next_min) if (combined_next_min and next_combined_rate is not None) else None
        projected_gain = max((projected_rfa or 0) - current_value, 0) if projected_rfa is not None else None
        achieved = combined_next_min is None and (rfa_prog["min_reached"] is not None or bonus_prog["min_reached"] is not None)
        near = combined_next_min is not None and combined_progress >= 80

        rfa_by_key[key] = current_value
        global_rows.append({
            "key": key, "label": label, "ca": ca,
            "current_rfa": current_value, "rate": combined_rate,
            "next_min": combined_next_min, "progress": combined_progress,
            "missing_ca": missing_ca, "projected_gain": projected_gain,
            "achieved": achieved, "near": near,
        })

    # Tri
    tri_rfa = entity_data.get("rfa", {}).get("tri", {})
    tri_rows = []
    for key in get_tri_fields():
        if key not in tri_rfa:
            continue
        item = tri_rfa[key]
        if not isinstance(item, dict):
            continue
        label = item.get("label", key)
        ca = float(item.get("ca", 0) or 0)
        current_value = float(item.get("value", 0) or 0)
        current_rate = float(item.get("rate", 0) or 0)
        rule = rules_map.get(key, {})
        tiers = rule.get("tiers") or []
        if not tiers:
            continue
        tri_prog = _get_tier_progress(ca, tiers)
        next_min = tri_prog["next_min"]
        next_rate = _get_rate_for_threshold(tiers, next_min) if next_min else None
        missing_ca = max((next_min or 0) - ca, 0) if next_min else None
        projected_rfa = (next_rate * next_min) if (next_min and next_rate is not None) else None
        projected_gain = max((projected_rfa or 0) - current_value, 0) if projected_rfa is not None else None
        achieved = next_min is None and tri_prog["min_reached"] is not None
        near = next_min is not None and tri_prog["progress"] >= 80

        rfa_by_key[key] = current_value
        tri_rows.append({
            "key": key, "label": label, "ca": ca,
            "current_rfa": current_value, "rate": current_rate,
            "next_min": next_min, "progress": tri_prog["progress"],
            "missing_ca": missing_ca, "projected_gain": projected_gain,
            "achieved": achieved, "near": near,
        })

    return {"global_rows": global_rows, "tri_rows": tri_rows, "rfa_by_key": rfa_by_key}


def _rfa_for_ca_global(ca: float, rule: Dict) -> float:
    """Calcule le RFA global pour un CA donné (tiers_rfa + tiers_bonus)."""
    tiers_rfa = rule.get("tiers_rfa") or []
    tiers_bonus = rule.get("tiers_bonus") or []
    if not tiers_rfa and not tiers_bonus:
        return 0.0
    rfa_prog = _get_tier_progress(ca, tiers_rfa)
    bonus_prog = _get_tier_progress(ca, tiers_bonus)
    rate = (rfa_prog["rate"] or 0) + (bonus_prog["rate"] or 0)
    return ca * rate


def _rfa_for_ca_tri(ca: float, rule: Dict) -> float:
    """Calcule le RFA tri-partite pour un CA donné."""
    tiers = rule.get("tiers") or []
    if not tiers:
        return 0.0
    prog = _get_tier_progress(ca, tiers)
    return ca * (prog["rate"] or 0)


def genie_full_analysis(import_data: ImportData) -> Dict:
    """
    Analyse complète : compare ENTRANT (Union reçoit des fournisseurs) vs SORTANT (Union paie aux adhérents).
    Utilise BatchContractResolver pour charger tous les contrats en 3 requêtes (au lieu de N×3).
    """
    if len(import_data.by_client) == 0:
        compute_aggregations(import_data)

    # Pré-charge tous les contrats et assignments en 3 requêtes pour éviter le N+1
    from app.services.contract_resolver import BatchContractResolver
    _batch_resolver = BatchContractResolver()

    # Monkey-patch temporaire de resolve_contract pour cette analyse
    import app.services.rfa_calculator as _calc_mod
    import app.services.contract_resolver as _resolver_mod
    _orig_resolve = _resolver_mod.resolve_contract
    _resolver_mod.resolve_contract = lambda code_union=None, groupe_client=None: _batch_resolver.resolve(code_union, groupe_client)
    _calc_mod.resolve_contract = _resolver_mod.resolve_contract

    # =====================================================================
    # 1) Analyser chaque ADHÉRENT (contrats sortants : ce que Union paie)
    # =====================================================================
    all_near = []
    all_achieved = []
    client_rfa_by_key = {}  # key -> total RFA payée à tous les adhérents
    client_details = {}  # code_union -> analysis

    for code_union in list(import_data.by_client.keys()):
        try:
            detail = get_entity_detail_with_rfa(import_data, "client", code_union)
            entity_dict = detail.model_dump(by_alias=True, mode="json")
            analysis = _analyze_entity(entity_dict, "client", code_union)
            nom = import_data.by_client[code_union].get("nom_client", code_union)
            client_details[code_union] = analysis

            # Agréger les RFA sortantes par key
            for key, rfa_val in analysis["rfa_by_key"].items():
                client_rfa_by_key[key] = client_rfa_by_key.get(key, 0) + rfa_val

            for row in analysis["global_rows"] + analysis["tri_rows"]:
                entry = {
                    **row,
                    "entity_id": code_union,
                    "entity_label": f"{code_union} - {nom}" if nom else code_union,
                    "entity_type": "client",
                }
                if row.get("near"):
                    all_near.append(entry)
                if row.get("achieved"):
                    all_achieved.append(entry)
        except Exception:
            continue

    # =====================================================================
    # 1b) Analyser chaque GROUPE (les RFA sont souvent calculées au niveau groupe)
    # =====================================================================
    group_details = {}  # groupe -> analysis
    group_rfa_by_key = {}  # key -> total RFA groupes (pour comparaison sortant)

    for groupe_name in list(import_data.by_group.keys()):
        group_data = import_data.by_group[groupe_name]
        # Ignorer les groupes avec un seul client (= le client individuel)
        if group_data.get("nb_comptes", 1) <= 1:
            continue
        # Ignorer les groupes fictifs (pas de consolidation)
        if groupe_name.strip().upper() in EXCLUDED_GROUPS:
            continue
        try:
            detail = get_entity_detail_with_rfa(import_data, "group", groupe_name)
            entity_dict = detail.model_dump(by_alias=True, mode="json")
            analysis = _analyze_entity(entity_dict, "group", groupe_name)
            group_details[groupe_name] = analysis
            codes = group_data.get("codes_union", [])
            nb = group_data.get("nb_comptes", len(codes))
            elabel = f"{groupe_name} ({nb} clients)"

            # Agréger les RFA sortantes par key (pour les groupes)
            for key, rfa_val in analysis["rfa_by_key"].items():
                group_rfa_by_key[key] = group_rfa_by_key.get(key, 0) + rfa_val

            for row in analysis["global_rows"] + analysis["tri_rows"]:
                entry = {
                    **row,
                    "entity_id": groupe_name,
                    "entity_label": elabel,
                    "entity_type": "group",
                    "codes_union": codes,
                    "nb_comptes": nb,
                }
                if row.get("near"):
                    all_near.append(entry)
                if row.get("achieved"):
                    all_achieved.append(entry)
        except Exception:
            continue

    # Utiliser la RFA sortante la plus haute entre clients individuels et groupes
    # (les groupes incluent leurs clients, donc on ne double-compte pas)
    # On prend le MAX pour chaque key : soit la somme clients individuels, soit la somme groupes
    # En réalité il faudrait prendre les groupes quand ils existent et les clients isolés sinon
    # Pour simplifier : on recalcule sortant = somme des RFA de chaque entité "finale"
    # (groupes pour les clients groupés + clients isolés)
    final_sortant_by_key = {}
    grouped_codes = set()
    for groupe_name, analysis in group_details.items():
        if groupe_name.strip().upper() in EXCLUDED_GROUPS:
            continue
        codes = import_data.by_group[groupe_name].get("codes_union", [])
        grouped_codes.update(codes)
        for key, rfa_val in analysis["rfa_by_key"].items():
            final_sortant_by_key[key] = final_sortant_by_key.get(key, 0) + rfa_val
    # Ajouter les clients NON groupés
    for code_union, analysis in client_details.items():
        if code_union not in grouped_codes:
            for key, rfa_val in analysis["rfa_by_key"].items():
                final_sortant_by_key[key] = final_sortant_by_key.get(key, 0) + rfa_val
    # Remplacer client_rfa_by_key par le calcul correct
    client_rfa_by_key = final_sortant_by_key

    # =====================================================================
    # 2) Analyser UNION (contrats entrants : ce que Union reçoit)
    # =====================================================================
    union_near = []
    union_achieved = []
    union_rfa_by_key = {}  # key -> RFA reçue par Union du fournisseur
    union_analysis = {"global_rows": [], "tri_rows": [], "rfa_by_key": {}}

    try:
        from app.services.compute import get_union_detail_with_rfa
        union_detail = get_union_detail_with_rfa(import_data)
        union_dict = union_detail.model_dump(by_alias=True, mode="json")
        union_analysis = _analyze_entity(union_dict, "client", "UNION", is_union=True)
        union_rfa_by_key = union_analysis.get("rfa_by_key", {})

        for row in union_analysis["global_rows"] + union_analysis["tri_rows"]:
            entry = {**row, "entity_id": "UNION", "entity_label": "Groupement Union", "entity_type": "union"}
            if row.get("near"):
                union_near.append(entry)
            if row.get("achieved"):
                union_achieved.append(entry)
    except Exception:
        pass

    # =====================================================================
    # 3) COMPARER ENTRANT vs SORTANT par key → marge ou perte
    # =====================================================================
    all_keys = set(list(union_rfa_by_key.keys()) + list(client_rfa_by_key.keys()))
    balance_by_key = []
    for key in sorted(all_keys):
        _, label = get_field_by_key(key)
        entrant = union_rfa_by_key.get(key, 0)  # Union reçoit
        sortant = client_rfa_by_key.get(key, 0)  # Union paie
        margin = entrant - sortant

        # Trouver le statut entrant (Union)
        union_row = next((r for r in union_analysis["global_rows"] + union_analysis["tri_rows"] if r["key"] == key), None)
        union_achieved_flag = union_row["achieved"] if union_row else False
        union_near_flag = union_row["near"] if union_row else False
        union_progress = union_row["progress"] if union_row else 0
        union_rate = union_row.get("rate", 0) if union_row else 0
        union_ca = union_row["ca"] if union_row else 0
        union_next_min = union_row.get("next_min") if union_row else None
        union_missing = union_row.get("missing_ca") if union_row else None
        union_projected_gain = union_row.get("projected_gain") if union_row else None

        # Compter combien d'adhérents touchent une RFA sur cette key (sortant > 0)
        nb_adherents_paid = 0
        for cu, analysis in client_details.items():
            if analysis["rfa_by_key"].get(key, 0) > 0:
                nb_adherents_paid += 1

        status = "equilibre"
        if entrant == 0 and sortant > 0:
            status = "perte"  # Union paie sans recevoir !
        elif entrant > 0 and sortant == 0:
            status = "marge_pure"  # Union reçoit mais ne redistribue rien
        elif margin < 0:
            status = "deficit"  # Union paie plus qu'elle ne reçoit
        elif margin > 0:
            status = "marge"  # Union garde une marge

        balance_by_key.append({
            "key": key,
            "label": label,
            "entrant": entrant,
            "sortant": sortant,
            "margin": margin,
            "status": status,
            "union_achieved": union_achieved_flag,
            "union_near": union_near_flag,
            "union_progress": union_progress,
            "union_rate": union_rate,
            "union_ca": union_ca,
            "union_next_min": union_next_min,
            "union_missing_ca": union_missing,
            "union_projected_gain": union_projected_gain,
            "nb_adherents_paid": nb_adherents_paid,
        })

    # Trier: pertes d'abord, puis déficits
    balance_sorted = sorted(balance_by_key, key=lambda x: x["margin"])

    total_entrant = sum(b["entrant"] for b in balance_by_key)
    total_sortant = sum(b["sortant"] for b in balance_by_key)
    total_margin = total_entrant - total_sortant
    losses = [b for b in balance_by_key if b["status"] in ("perte", "deficit")]
    gains = [b for b in balance_by_key if b["status"] in ("marge", "marge_pure")]

    # =====================================================================
    # 4) OPPORTUNITÉS CROISÉES (double levier)
    # =====================================================================
    union_opportunities = []
    for u_entry in union_near:
        k = u_entry["key"]
        union_gain = u_entry.get("projected_gain") or 0
        matching_near = [e for e in all_near if e["key"] == k]
        matching_near_sorted = sorted(matching_near, key=lambda x: x.get("projected_gain") or 0, reverse=True)[:10]

        # Top contributeurs CA
        all_with_ca = []
        for code_union, client_data in import_data.by_client.items():
            ca_key = 0.0
            if k.startswith("GLOBAL_"):
                ca_key = client_data.get("global", {}).get(k, 0) or 0
            elif k.startswith("TRI_"):
                ca_key = client_data.get("tri", {}).get(k, 0) or 0
            if ca_key > 0:
                nom = client_data.get("nom_client", code_union)
                all_with_ca.append({"entity_id": code_union, "entity_label": f"{code_union} - {nom}", "ca_on_key": ca_key})
        top_contributors = sorted(all_with_ca, key=lambda x: x["ca_on_key"], reverse=True)[:10]
        total_ca_key = sum(e["ca_on_key"] for e in all_with_ca)
        total_adh_gain = sum(e.get("projected_gain") or 0 for e in matching_near)

        # Marge nette Union = gain entrant Union - coût supplémentaire sortant adhérents
        # Si Union atteint son palier, elle gagne union_gain.
        # Si les adhérents atteignent leurs paliers, Union leur paie total_adh_gain de plus.
        # Marge nette = ce que Union gagne EN PLUS - ce que Union paie EN PLUS
        net_margin = union_gain - total_adh_gain

        for adh in matching_near_sorted:
            adh["adherent_gain"] = adh.get("projected_gain") or 0
            adh["cost_for_union"] = adh.get("projected_gain") or 0  # ce que Union paiera en plus

        union_opportunities.append({
            "union_objective": u_entry,
            "matching_adherents": matching_near_sorted,
            "top_contributors": top_contributors,
            "total_ca_on_key": total_ca_key,
            "count_near": len(matching_near),
            "count_contributors": len(all_with_ca),
            "count": len(matching_near),
            "total_gain_adherents": total_adh_gain,  # coût sortant supplémentaire
            "union_gain": union_gain,                  # gain entrant supplémentaire
            "net_margin": net_margin,                  # marge nette = entrant - sortant
            "total_gain": total_adh_gain,
        })
    union_opportunities.sort(key=lambda x: x["net_margin"], reverse=True)

    # TOP GAINS adhérents
    top_gains = sorted(all_near, key=lambda x: x.get("projected_gain") or 0, reverse=True)[:20]

    # NEAR PAR OBJECTIF
    near_by_key = {}
    for entry in all_near:
        k = entry["key"]
        if k not in near_by_key:
            _, lbl = get_field_by_key(k)
            near_by_key[k] = {"key": k, "label": lbl, "count": 0, "total_gain": 0, "entries": []}
        near_by_key[k]["count"] += 1
        near_by_key[k]["total_gain"] += entry.get("projected_gain") or 0
        near_by_key[k]["entries"].append(entry)
    near_by_key_sorted = sorted(near_by_key.values(), key=lambda x: x["total_gain"], reverse=True)

    # =====================================================================
    # 5) ALERTES PRIORITAIRES
    # =====================================================================
    alerts = []

    # Alerte perte: Union paie sans recevoir
    for b in losses[:3]:
        if b["status"] == "perte":
            alerts.append({
                "type": "loss",
                "priority": "critical",
                "title": f"⚠️ PERTE : {b['label']}",
                "message": (
                    f"Union paie {_fmt(b['sortant'])} aux adhérents ({b['nb_adherents_paid']} adhérents) "
                    f"mais ne reçoit RIEN du fournisseur (seuil entrant non atteint).\n"
                    f"Union à {b['union_progress']:.0f}% du palier fournisseur"
                    + (f" (manque {_fmt(b['union_missing_ca'])})" if b["union_missing_ca"] else "")
                    + f".\n**Perte nette: {_fmt(abs(b['margin']))}**"
                ),
                "key": b["key"],
                "margin": b["margin"],
            })
        elif b["status"] == "deficit":
            alerts.append({
                "type": "deficit",
                "priority": "high",
                "title": f"📉 Déficit : {b['label']}",
                "message": (
                    f"Union reçoit {_fmt(b['entrant'])} du fournisseur mais paie {_fmt(b['sortant'])} aux adhérents.\n"
                    f"**Déficit: {_fmt(abs(b['margin']))}**"
                ),
                "key": b["key"],
                "margin": b["margin"],
            })

    # Alertes double levier
    for opp in union_opportunities[:3]:
        u = opp["union_objective"]
        net = opp["net_margin"]
        net_label = f"+{_fmt(net)}" if net >= 0 else f"{_fmt(net)}"
        alerts.append({
            "type": "union_lever",
            "priority": "high" if net > 0 else "medium",
            "title": f"🔥 Levier : {u['label']}",
            "message": (
                f"Union à {u['progress']:.0f}% du palier fournisseur (manque {_fmt(u.get('missing_ca') or 0)}).\n"
                f"📥 Gain entrant Union: +{_fmt(opp['union_gain'])}\n"
                f"📤 Coût sortant supplémentaire ({opp['count_near']} adh. proches): -{_fmt(opp['total_gain_adherents'])}\n"
                f"**Marge nette Union: {net_label}**"
            ),
            "key": u["key"],
            "net_margin": net,
        })

    # Top gains adhérents
    for entry in top_gains[:3]:
        if not any(a.get("entity_id") == entry.get("entity_id") and a.get("key") == entry["key"] for a in alerts):
            alerts.append({
                "type": "top_gain",
                "priority": "medium",
                "title": f"💡 {entry['entity_label']} — {entry['label']}",
                "message": f"Proche à {entry['progress']:.0f}% (manque {_fmt(entry.get('missing_ca') or 0)}). Gain: +{_fmt(entry.get('projected_gain') or 0)}.",
                "key": entry["key"],
                "entity_id": entry.get("entity_id"),
            })

    # =====================================================================
    # 6) EFFET CASCADE : tri-partite → global (même fournisseur)
    # Un € d'achat sur une tri-partite nourrit aussi la globale.
    # =====================================================================
    # Pour chaque adhérent proche d'une tri-partite, regarder s'il est aussi
    # proche de la globale parente, et inversement.
    cascade_opportunities = []
    # Indexer toutes les lignes par (entity_id, key)
    all_rows_index = {}
    for entry in all_near + all_achieved:
        idx = (entry.get("entity_id"), entry["key"])
        all_rows_index[idx] = entry
    # Aussi indexer les lignes Union
    union_rows_index = {}
    for row in union_analysis.get("global_rows", []) + union_analysis.get("tri_rows", []):
        union_rows_index[row["key"]] = row

    # Pour chaque tri-partite proche (adhérent), voir la globale parente
    for entry in all_near:
        tri_key = entry["key"]
        if not tri_key.startswith("TRI_"):
            continue
        global_key = TRI_TO_GLOBAL.get(tri_key)
        if not global_key:
            continue
        eid = entry.get("entity_id")
        # Trouver la globale de ce même adhérent
        global_entry = all_rows_index.get((eid, global_key))
        # Trouver les statuts Union
        union_tri = union_rows_index.get(tri_key)
        union_glob = union_rows_index.get(global_key)

        cascade_opportunities.append({
            "entity_id": eid,
            "entity_label": entry.get("entity_label", eid),
            "tri_key": tri_key,
            "tri_label": entry.get("label", tri_key),
            "tri_ca": entry.get("ca", 0),
            "tri_progress": entry.get("progress", 0),
            "tri_missing": entry.get("missing_ca"),
            "tri_gain_sortant": entry.get("projected_gain") or 0,
            "global_key": global_key,
            "global_label": get_field_by_key(global_key)[1],
            "global_near": global_entry.get("near", False) if global_entry else False,
            "global_progress": global_entry.get("progress", 0) if global_entry else None,
            "global_missing": global_entry.get("missing_ca") if global_entry else None,
            "global_gain_sortant": (global_entry.get("projected_gain") or 0) if global_entry else 0,
            "union_tri_near": union_tri.get("near", False) if union_tri else False,
            "union_tri_progress": union_tri.get("progress", 0) if union_tri else None,
            "union_tri_gain": (union_tri.get("projected_gain") or 0) if union_tri else 0,
            "union_global_near": union_glob.get("near", False) if union_glob else False,
            "union_global_progress": union_glob.get("progress", 0) if union_glob else None,
            "union_global_gain": (union_glob.get("projected_gain") or 0) if union_glob else 0,
        })
    # Trier : ceux qui impactent le plus de paliers en premier
    for c in cascade_opportunities:
        c["nb_impacts"] = sum([
            1,  # tri-partite sortant (toujours)
            1 if c["global_near"] else 0,  # global sortant
            1 if c["union_tri_near"] else 0,  # tri-partite entrant
            1 if c["union_global_near"] else 0,  # global entrant
        ])
    cascade_opportunities.sort(key=lambda x: (-x["nb_impacts"], -(x.get("tri_gain_sortant") or 0)))

    # =====================================================================
    # 7) PLANS D'ACHAT OPTIMISÉS par adhérent ET par groupe
    # =====================================================================
    smart_plans = []

    def _build_plans_for_entity(entity_id, entity_label, entity_type, rows_index):
        """Construit les plans d'achat pour une entité (client ou groupe)."""
        plans = []
        for global_key in get_global_fields():
            global_row = rows_index.get((entity_id, global_key))
            if not global_row:
                continue
            global_missing = global_row.get("missing_ca")
            if not global_missing or global_missing <= 0:
                continue

            tri_keys = GLOBAL_TO_TRIS.get(global_key, [])
            tri_near_list = []
            for tri_key in tri_keys:
                tri_row = rows_index.get((entity_id, tri_key))
                if not tri_row:
                    continue
                tri_missing = tri_row.get("missing_ca")
                if tri_missing is not None and tri_missing > 0 and tri_row.get("near"):
                    tri_near_list.append({
                        "key": tri_key,
                        "label": tri_row.get("label", tri_key),
                        "ca": tri_row.get("ca", 0),
                        "missing": tri_missing,
                        "progress": tri_row.get("progress", 0),
                        "rate": tri_row.get("rate", 0),
                        "projected_gain": tri_row.get("projected_gain") or 0,
                    })
            if not tri_near_list:
                continue

            tri_near_list.sort(key=lambda x: x["missing"])
            plan_items = []
            total_ca_needed = 0
            tiers_unlocked = 0
            remaining_for_global = global_missing

            for tri in tri_near_list:
                ca_push = tri["missing"]
                plan_items.append({**tri, "ca_to_push": ca_push, "unlocks_tri": True})
                total_ca_needed += ca_push
                tiers_unlocked += 1
                remaining_for_global -= ca_push

            global_unlocked = remaining_for_global <= 0
            if global_unlocked:
                tiers_unlocked += 1

            gain_tri_total = sum(t["projected_gain"] for t in plan_items)
            gain_global = (global_row.get("projected_gain") or 0)

            bonus_effort = 0
            bonus_reasonable = False
            tiers_with_bonus = tiers_unlocked
            if not global_unlocked and remaining_for_global > 0:
                bonus_effort = remaining_for_global
                bonus_reasonable = (bonus_effort <= total_ca_needed) or (bonus_effort <= 5000)
                if bonus_reasonable:
                    tiers_with_bonus = tiers_unlocked + 1

            global_near = global_row.get("near", False)
            # Inclure le plan dès qu'il y a au moins 1 tri proche ET (global débloqué OU global proche OU bonus raisonnable)
            # → cas "ACR Embrayage proche + ACR global proche" doit apparaître même si effort restant global > 5000
            if tiers_unlocked >= 1 and (global_unlocked or global_near or bonus_reasonable):
                plans.append({
                    "entity_id": entity_id,
                    "entity_label": entity_label,
                    "entity_type": entity_type,
                    "global_key": global_key,
                    "global_label": global_row.get("label", global_key),
                    "global_ca": global_row.get("ca", 0),
                    "global_missing": global_missing,
                    "global_progress": global_row.get("progress", 0),
                    "global_gain": gain_global,
                    "global_unlocked": global_unlocked,
                    "remaining_for_global": max(remaining_for_global, 0),
                    "bonus_effort": bonus_effort if bonus_reasonable else 0,
                    "bonus_reasonable": bonus_reasonable,
                    "tiers_with_bonus": tiers_with_bonus if bonus_reasonable else tiers_unlocked,
                    "total_with_bonus": total_ca_needed + (bonus_effort if bonus_reasonable else 0),
                    "plan_items": plan_items,
                    "total_ca_needed": total_ca_needed,
                    "tiers_unlocked": tiers_unlocked,
                    "gain_option_a": gain_tri_total + (gain_global if global_unlocked else 0),
                    "gain_option_b": gain_tri_total + gain_global,
                })
        return plans

    # Indexer les rows par (entity_id, key) pour clients individuels
    all_entity_rows = {}
    for code_union, analysis in client_details.items():
        nom = import_data.by_client[code_union].get("nom_client", code_union)
        elabel = f"{code_union} - {nom}" if nom else code_union
        for row in analysis["global_rows"] + analysis["tri_rows"]:
            all_entity_rows[(code_union, row["key"])] = {**row, "entity_id": code_union, "entity_label": elabel}

    # Plans pour clients individuels
    for code_union in list(import_data.by_client.keys()):
        nom = import_data.by_client[code_union].get("nom_client", code_union)
        elabel = f"{code_union} - {nom}" if nom else code_union
        smart_plans.extend(_build_plans_for_entity(code_union, elabel, "client", all_entity_rows))

    # Indexer les rows par (groupe, key) pour les groupes
    all_group_rows = {}
    for groupe_name, analysis in group_details.items():
        group_data = import_data.by_group[groupe_name]
        nb = group_data.get("nb_comptes", 0)
        codes = group_data.get("codes_union", [])
        elabel = f"👥 {groupe_name} ({nb} clients: {', '.join(codes[:3])}{'...' if len(codes) > 3 else ''})"
        for row in analysis["global_rows"] + analysis["tri_rows"]:
            all_group_rows[(groupe_name, row["key"])] = {**row, "entity_id": groupe_name, "entity_label": elabel}

    # Plans pour groupes
    for groupe_name in list(group_details.keys()):
        group_data = import_data.by_group[groupe_name]
        nb = group_data.get("nb_comptes", 0)
        codes = group_data.get("codes_union", [])
        elabel = f"👥 {groupe_name} ({nb} clients: {', '.join(codes[:3])}{'...' if len(codes) > 3 else ''})"
        smart_plans.extend(_build_plans_for_entity(groupe_name, elabel, "group", all_group_rows))

    smart_plans.sort(key=lambda x: (-x["tiers_with_bonus"], -x["tiers_unlocked"], x["total_with_bonus"]))

    # Restaure resolve_contract original
    _resolver_mod.resolve_contract = _orig_resolve
    _calc_mod.resolve_contract = _orig_resolve

    return {
        "summary": {
            "total_clients": len(import_data.by_client),
            "total_near": len(all_near),
            "total_achieved": len(all_achieved),
            "total_gain_potential": sum(e.get("projected_gain") or 0 for e in all_near),
            "union_near_count": len(union_near),
            "total_entrant": total_entrant,
            "total_sortant": total_sortant,
            "total_margin": total_margin,
            "nb_losses": len(losses),
            "nb_gains": len(gains),
        },
        "balance": balance_sorted,
        "alerts": alerts[:15],
        "top_gains": top_gains,
        "near_by_objective": near_by_key_sorted,
        "union_opportunities": union_opportunities,
        "union_near": union_near,
        "union_achieved": union_achieved,
        "cascade": cascade_opportunities,
        "smart_plans": smart_plans,
    }


# =====================================================================
# REQUÊTES CHATBOT
# =====================================================================

def _apply_query_to_analysis(analysis: Dict, query_type: str, params: Dict, import_data=None) -> Dict:
    """Applique une requête Génie sur une analyse déjà calculée (depuis cache)."""
    return _dispatch_query(analysis, query_type, params or {}, import_data)


def _dispatch_query(analysis: Dict, query_type: str, params: Dict, import_data=None) -> Dict:
    """Dispatch interne partagé entre genie_query et _apply_query_to_analysis."""

    if query_type == "dashboard":
        s = analysis["summary"]
        msg = (
            f"J'ai analysé **{s['total_clients']} adhérents** et croisé les **contrats entrants** (Union ← fournisseurs) "
            f"avec les **contrats sortants** (Union → adhérents).\n\n"
            f"💰 **Balance Entrant / Sortant** :\n"
            f"- Union reçoit des fournisseurs: **{_fmt(s['total_entrant'])}**\n"
            f"- Union paie aux adhérents: **{_fmt(s['total_sortant'])}**\n"
            f"- {'✅ Marge' if s['total_margin'] >= 0 else '⚠️ Déficit'}: **{_fmt(s['total_margin'])}**\n"
        )
        if s["nb_losses"] > 0:
            msg += f"- ⚠️ **{s['nb_losses']} ligne(s) en perte** (Union paie sans recevoir ou plus qu'elle ne reçoit)\n"
        msg += (
            f"\n📊 **Objectifs adhérents** :\n"
            f"- {s['total_near']} objectif(s) proches (≥80%) | {s['total_achieved']} atteints\n"
            f"- Gain potentiel adhérents: {_fmt(s['total_gain_potential'])}\n\n"
            f"🏢 **Objectifs Union** :\n"
            f"- {s['union_near_count']} palier(s) fournisseur(s) proches\n"
        )
        if analysis["union_opportunities"]:
            total_net = sum(o["net_margin"] for o in analysis["union_opportunities"])
            net_label = f"+{_fmt(total_net)}" if total_net >= 0 else _fmt(total_net)
            msg += (
                f"\n🔥 **Opportunités leviers** : {len(analysis['union_opportunities'])} ligne(s)\n"
                f"- Gain entrant potentiel: +{_fmt(sum(o['union_gain'] for o in analysis['union_opportunities']))}\n"
                f"- Coût sortant supplémentaire: -{_fmt(sum(o['total_gain_adherents'] for o in analysis['union_opportunities']))}\n"
                f"- **Marge nette potentielle: {net_label}**"
            )
        return {"type": "dashboard", "message": msg, "data": s, "alerts": analysis["alerts"]}

    elif query_type == "balance":
        balance = analysis["balance"]
        lines = []
        for b in balance:
            if b["entrant"] == 0 and b["sortant"] == 0:
                continue
            icon = "⚠️" if b["status"] in ("perte", "deficit") else "✅" if b["status"] in ("marge", "marge_pure") else "➖"
            lines.append(
                f"{icon} **{b['label']}**\n"
                f"   Entrant (fournisseur→Union): {_fmt(b['entrant'])} | "
                f"Sortant (Union→adhérents): {_fmt(b['sortant'])} | "
                f"{'Marge' if b['margin'] >= 0 else 'Perte'}: **{_fmt(b['margin'])}**"
                + (f" | Union à {b['union_progress']:.0f}%" if b['union_progress'] else "")
                + (f" ({b['nb_adherents_paid']} adh.)" if b["nb_adherents_paid"] else "")
            )
        msg = "**💰 Balance Entrant ↔ Sortant par ligne**\n\n"
        msg += "Entrant = ce qu'Union reçoit du fournisseur\nSortant = ce qu'Union paie aux adhérents\n\n"
        msg += "\n\n".join(lines) if lines else "Aucune donnée."
        return {"type": "balance", "message": msg, "data": balance}

    elif query_type == "top_gains":
        limit = params.get("limit", 10)
        entries = analysis["top_gains"][:limit]
        lines = []
        for i, e in enumerate(entries, 1):
            pct = e.get("progress", 0)
            rate_str = _fmt_pct(e.get("rate", 0))
            # Trouver le coût pour Union
            b = next((b for b in analysis["balance"] if b["key"] == e["key"]), None)
            cost_note = ""
            if b and b["status"] in ("perte", "deficit"):
                cost_note = f" ⚠️ Union en perte sur cette ligne"
            lines.append(
                f"{i}. **{e['entity_label']}** — {e['label']}\n"
                f"   CA: {_fmt(e['ca'])} | Progression: {pct:.0f}% | Taux actuel: {rate_str}\n"
                f"   Prochain palier: {_fmt(e.get('next_min') or 0)} | Manque: {_fmt(e.get('missing_ca') or 0)}\n"
                f"   **Gain si atteint: +{_fmt(e.get('projected_gain') or 0)}** (coût supplémentaire pour Union){cost_note}"
            )
        return {"type": "top_gains", "message": f"**Top {len(entries)} gains potentiels adhérents** :\n\n" + "\n\n".join(lines), "data": entries}

    elif query_type == "near_by_objective":
        key_filter = params.get("key")
        objectives = analysis["near_by_objective"]
        if key_filter:
            objectives = [o for o in objectives if o["key"] == key_filter]
        lines = []
        for obj in objectives[:10]:
            top5 = sorted(obj["entries"], key=lambda x: x.get("projected_gain") or 0, reverse=True)[:5]
            # Statut entrant Union
            b = next((b for b in analysis["balance"] if b["key"] == obj["key"]), None)
            union_status = ""
            if b:
                if b["status"] == "perte":
                    union_status = "\n   ⚠️ **Union ne reçoit rien du fournisseur** (seuil non atteint)"
                elif b["status"] == "deficit":
                    union_status = f"\n   📉 Union en déficit de {_fmt(abs(b['margin']))} (reçoit {_fmt(b['entrant'])}, paie {_fmt(b['sortant'])})"
                elif b["union_near"]:
                    union_status = f"\n   🏢 Union aussi proche du palier fournisseur ({b['union_progress']:.0f}%, manque {_fmt(b.get('union_missing_ca') or 0)})"
            lines.append(f"**{obj['label']}** — {obj['count']} adhérent(s) proches, coût sortant: {_fmt(obj['total_gain'])}{union_status}")
            # Détails par client
            for e in top5:
                pct = e.get("progress", 0)
                rate_str = _fmt_pct(e.get("rate", 0))
                lines.append(
                    f"   • **{e['entity_label']}** : CA {_fmt(e['ca'])} → {pct:.0f}% | "
                    f"Taux actuel {rate_str} | Manque {_fmt(e.get('missing_ca') or 0)} | "
                    f"Gain si atteint: +{_fmt(e.get('projected_gain') or 0)}"
                )
        return {
            "type": "near_by_objective",
            "message": "**Objectifs proches par catégorie** (avec statut Union):\n\n" + "\n\n".join(lines) if lines else "Aucun objectif proche.",
            "data": objectives[:10],
        }

    elif query_type == "union_opportunities":
        opps = analysis["union_opportunities"]
        lines = []
        for opp in opps[:5]:
            u = opp["union_objective"]
            net = opp["net_margin"]
            net_label = f"+{_fmt(net)}" if net >= 0 else _fmt(net)
            lines.append(
                f"**{u['label']}**\n"
                f"   📥 Entrant: Union à {u['progress']:.0f}% du palier (manque {_fmt(u.get('missing_ca') or 0)}). Si atteint: +{_fmt(opp['union_gain'])}\n"
                f"   📤 Sortant: {opp['count_near']} adh. proches de leur palier. Coût supplémentaire: -{_fmt(opp['total_gain_adherents'])}\n"
                f"   💰 **Marge nette Union: {net_label}** (entrant {_fmt(opp['union_gain'])} - sortant {_fmt(opp['total_gain_adherents'])})"
            )
            # Détails des adhérents proches
            for adh in opp["matching_adherents"][:5]:
                pct = adh.get("progress", 0)
                rate_str = _fmt_pct(adh.get("rate", 0))
                lines.append(
                    f"      • **{adh['entity_label']}** : CA {_fmt(adh['ca'])} ({pct:.0f}%) | "
                    f"Taux {rate_str} | Manque {_fmt(adh.get('missing_ca') or 0)} | "
                    f"Si atteint → Union paie +{_fmt(adh.get('adherent_gain') or 0)}"
                )
            # Top contributeurs
            top_contrib = opp.get("top_contributors", [])[:3]
            if top_contrib:
                contrib_list = ", ".join(f"{c['entity_label']} ({_fmt(c['ca_on_key'])})" for c in top_contrib)
                lines.append(f"      📊 Top contributeurs au volume Union: {contrib_list}")
        msg = "**🔗 Leviers : Entrant (fournisseurs) ↔ Sortant (adhérents)**\n\n"
        msg += "📥 Entrant = ce que Union gagne en PLUS si palier fournisseur atteint\n"
        msg += "📤 Sortant = ce que Union paie en PLUS si les adhérents atteignent leurs paliers\n"
        msg += "💰 Marge nette = Entrant - Sortant\n\n"
        msg += "\n\n".join(lines) if lines else "Aucune opportunité croisée."
        return {"type": "union_opportunities", "message": msg, "data": opps[:5]}

    elif query_type == "double_lever":
        key_filter = params.get("key")
        opps = analysis["union_opportunities"]
        if key_filter:
            opps = [o for o in opps if o["union_objective"]["key"] == key_filter]
        if not opps:
            return {"type": "double_lever", "message": "Aucun double levier trouvé.", "data": []}
        lines = []
        for opp in opps[:3]:
            u = opp["union_objective"]
            net = opp["net_margin"]
            net_label = f"+{_fmt(net)}" if net >= 0 else _fmt(net)
            b = next((b for b in analysis["balance"] if b["key"] == u["key"]), None)
            lines.append(f"### {u['label']}\n")
            if b:
                margin_label = f"+{_fmt(b['margin'])}" if b['margin'] >= 0 else _fmt(b['margin'])
                lines.append(f"**Balance actuelle** : Entrant {_fmt(b['entrant'])} | Sortant {_fmt(b['sortant'])} | Marge {margin_label}")
            lines.append(f"\n**📥 Entrant (palier fournisseur)** :")
            lines.append(f"   Union à {u['progress']:.0f}% du prochain palier, manque {_fmt(u.get('missing_ca') or 0)}")
            lines.append(f"   Si atteint → Union gagne +{_fmt(opp['union_gain'])} EN PLUS du fournisseur")
            lines.append(f"   {opp['count_contributors']} adhérents contribuent au volume (total: {_fmt(opp['total_ca_on_key'])})")
            lines.append(f"\n**📤 Sortant (paliers adhérents)** — {opp['count_near']} adhérent(s) proches :")
            for adh in opp["matching_adherents"][:8]:
                pct = adh.get("progress", 0)
                rate_str = _fmt_pct(adh.get("rate", 0))
                lines.append(
                    f"   • **{adh['entity_label']}**\n"
                    f"     CA: {_fmt(adh['ca'])} | Progression: {pct:.0f}% | Taux actuel: {rate_str}\n"
                    f"     Manque: {_fmt(adh.get('missing_ca') or 0)} | Si atteint → Union paie +{_fmt(adh.get('adherent_gain') or 0)}"
                )
            lines.append(f"\n**💰 Synthèse pour Union** :")
            lines.append(f"   📥 Gain entrant: +{_fmt(opp['union_gain'])}")
            lines.append(f"   📤 Coût sortant: -{_fmt(opp['total_gain_adherents'])}")
            lines.append(f"   **Marge nette: {net_label}**")
            # Top contributeurs
            top_contrib = opp.get("top_contributors", [])[:5]
            if top_contrib:
                lines.append(f"\n**📊 Top contributeurs au volume Union** :")
                for c in top_contrib:
                    lines.append(f"   • {c['entity_label']} : {_fmt(c['ca_on_key'])}")
        return {"type": "double_lever", "message": "**Détail Levier Entrant ↔ Sortant**\n\n" + "\n".join(lines), "data": opps[:3]}

    elif query_type == "search_adherent":
        search = (params.get("search") or "").upper()
        if not search:
            return {"type": "error", "message": "Précisez un nom ou code."}
        found = []
        for entry in analysis["top_gains"]:
            if search in entry.get("entity_id", "").upper() or search in entry.get("entity_label", "").upper():
                found.append(entry)
        if not found:
            for obj in analysis["near_by_objective"]:
                for e in obj["entries"]:
                    if search in e.get("entity_id", "").upper() or search in e.get("entity_label", "").upper():
                        found.append(e)
        if not found:
            return {"type": "search_result", "message": f"Aucun objectif proche pour **{search}**.", "data": []}
        lines = []
        for e in found[:10]:
            status = "✅ Atteint" if e.get("achieved") else ("🔥 Proche" if e.get("near") else "En cours")
            lines.append(f"- **{e['label']}** — CA: {_fmt(e['ca'])} | {status} ({e['progress']:.0f}%) | Gain: +{_fmt(e.get('projected_gain') or 0)}")
        return {"type": "search_result", "message": f"Objectifs proches pour **{search}** :\n\n" + "\n".join(lines), "data": found[:10]}

    elif query_type == "entity_profile":
        search = (params.get("search") or "").strip()
        if not search:
            return {"type": "error", "message": "Précisez un nom ou code Union pour l'adhérent."}
        search_upper = search.upper()
        entity_id = None
        entity_label = None
        mode = None
        # 1) Exact match code_union
        if search_upper in import_data.by_client:
            entity_id = search_upper
            data = import_data.by_client[entity_id]
            nom = data.get("nom_client", entity_id)
            entity_label = f"{entity_id} - {nom}" if nom else entity_id
            mode = "client"
        # 2) Exact match groupe (hors exclus)
        if entity_id is None:
            for groupe_name in import_data.by_group:
                if groupe_name.strip().upper() in EXCLUDED_GROUPS:
                    continue
                if groupe_name.strip().upper() == search_upper:
                    entity_id = groupe_name
                    group_data = import_data.by_group[entity_id]
                    nb = group_data.get("nb_comptes", 0)
                    entity_label = f"{entity_id} ({nb} clients)"
                    mode = "group"
                    break
        # 3) Partial: code_union ou nom_client
        if entity_id is None:
            for code_union, data in import_data.by_client.items():
                nom = (data.get("nom_client") or "").upper()
                if search_upper in code_union.upper() or search_upper in nom:
                    entity_id = code_union
                    nom_d = data.get("nom_client", code_union)
                    entity_label = f"{code_union} - {nom_d}" if nom_d else code_union
                    mode = "client"
                    break
        # 4) Partial: groupe
        if entity_id is None:
            for groupe_name in import_data.by_group:
                if groupe_name.strip().upper() in EXCLUDED_GROUPS:
                    continue
                if search_upper in groupe_name.upper():
                    entity_id = groupe_name
                    group_data = import_data.by_group[entity_id]
                    nb = group_data.get("nb_comptes", 0)
                    entity_label = f"{entity_id} ({nb} clients)"
                    mode = "group"
                    break
        if entity_id is None or mode is None:
            return {"type": "entity_profile", "message": f"Aucun adhérent ou groupe trouvé pour « **{search}** ». Vérifiez le nom ou le code Union.", "data": None}
        try:
            detail = get_entity_detail_with_rfa(import_data, mode, entity_id)
        except Exception:
            return {"type": "entity_profile", "message": f"Impossible de charger la fiche pour **{entity_label}**.", "data": None}
        entity_dict = detail.model_dump(by_alias=True, mode="json")
        entity_analysis = _analyze_entity(entity_dict, mode, entity_id)
        contract_applied = detail.contract_applied or {}
        contract_name = contract_applied.get("name", "—")
        contract_id = contract_applied.get("id")
        total_rfa = sum(entity_analysis["rfa_by_key"].values())
        global_rows = entity_analysis["global_rows"]
        tri_rows = entity_analysis["tri_rows"]
        plans = [p for p in analysis.get("smart_plans", []) if p.get("entity_id") == entity_id]
        cascades = [c for c in analysis.get("cascade", []) if c.get("entity_id") == entity_id]
        near_count = sum(1 for r in global_rows + tri_rows if r.get("near"))
        achieved_count = sum(1 for r in global_rows + tri_rows if r.get("achieved"))
        gain_potential = sum(r.get("projected_gain") or 0 for r in global_rows + tri_rows if r.get("near"))

        # Infos groupe : liste des codes Union du groupe
        group_codes_union = []
        if mode == "group" and entity_id in import_data.by_group:
            group_codes_union = import_data.by_group[entity_id].get("codes_union", []) or []
            nb_group = import_data.by_group[entity_id].get("nb_comptes", len(group_codes_union))

        # Règles pour simuler ±50K€
        rules_map = _load_rules_map(contract_id, mode, entity_id) if contract_id else {}
        development_opportunities = []
        scenario_plus_50k = []
        scenario_moins_50k = []
        if rules_map:
            for r in global_rows:
                key, ca, current_rfa = r.get("key"), float(r.get("ca") or 0), float(r.get("current_rfa") or 0)
                rule = rules_map.get(key, {})
                rfa_plus = _rfa_for_ca_global(ca + 50000, rule)
                rfa_moins = _rfa_for_ca_global(max(0.0, ca - 50000), rule)
                gain_50k = max(0.0, rfa_plus - current_rfa)
                loss_50k = max(0.0, current_rfa - rfa_moins)
                development_opportunities.append({
                    "key": key, "label": r.get("label", key), "row_type": "global",
                    "current_ca": ca, "current_rfa": current_rfa,
                    "if_add_50k_gain": gain_50k, "if_sub_50k_loss": loss_50k,
                })
                if gain_50k > 0:
                    scenario_plus_50k.append({"label": r.get("label", key), "gain": gain_50k})
                if loss_50k > 0:
                    scenario_moins_50k.append({"label": r.get("label", key), "loss": loss_50k})
            for r in tri_rows:
                key, ca, current_rfa = r.get("key"), float(r.get("ca") or 0), float(r.get("current_rfa") or 0)
                rule = rules_map.get(key, {})
                rfa_plus = _rfa_for_ca_tri(ca + 50000, rule)
                rfa_moins = _rfa_for_ca_tri(max(0.0, ca - 50000), rule)
                gain_50k = max(0.0, rfa_plus - current_rfa)
                loss_50k = max(0.0, current_rfa - rfa_moins)
                development_opportunities.append({
                    "key": key, "label": r.get("label", key), "row_type": "tri",
                    "current_ca": ca, "current_rfa": current_rfa,
                    "if_add_50k_gain": gain_50k, "if_sub_50k_loss": loss_50k,
                })
                if gain_50k > 0:
                    scenario_plus_50k.append({"label": r.get("label", key), "gain": gain_50k})
                if loss_50k > 0:
                    scenario_moins_50k.append({"label": r.get("label", key), "loss": loss_50k})
            scenario_plus_50k.sort(key=lambda x: -x["gain"])
            scenario_moins_50k.sort(key=lambda x: -x["loss"])
            development_opportunities.sort(key=lambda x: -(x.get("if_add_50k_gain") or 0))

        lines = []
        lines.append(f"**👤 Fiche : {entity_label}**\n")
        lines.append(f"📋 **Identité** : {'Groupe' if mode == 'group' else 'Code Union'} `{entity_id}` | Contrat : **{contract_name}**")
        if mode == "group" and group_codes_union:
            codes_preview = ", ".join(group_codes_union[:10]) + ("..." if len(group_codes_union) > 10 else "")
            lines.append(f"👥 **Groupe** : {len(group_codes_union)} client(s) — {codes_preview}")
        lines.append(f"💰 **RFA totale actuelle** : {_fmt(total_rfa)}")
        lines.append(f"📊 **Objectifs** : {achieved_count} atteint(s) | {near_count} proche(s) (≥80%) | Gain potentiel : {_fmt(gain_potential)}\n")

        if scenario_plus_50k or scenario_moins_50k:
            lines.append("**📈 Probabilités d'achat ±50 K€**")
            if scenario_plus_50k:
                top = scenario_plus_50k[0]
                total_gain_top = sum(s["gain"] for s in scenario_plus_50k[:5])
                lines.append(f"   ➕ **Si +50 K€** (ciblé sur une ligne) : meilleure opportunité **{top['label']}** → +{_fmt(top['gain'])} RFA (top 5 lignes : +{_fmt(total_gain_top)} max.)")
            if scenario_moins_50k:
                top_risk = scenario_moins_50k[0]
                total_risk_top = sum(s["loss"] for s in scenario_moins_50k[:5])
                lines.append(f"   ➖ **Si -50 K€** : risque principal **{top_risk['label']}** → -{_fmt(top_risk['loss'])} RFA (top 5 : -{_fmt(total_risk_top)} max.)")
            lines.append("")

        lines.append("**📈 Possibilités de développement**")
        for opp in development_opportunities[:8]:
            if (opp.get("if_add_50k_gain") or 0) > 0:
                lines.append(f"   🎯 **{opp['label']}** — CA actuel {_fmt(opp['current_ca'])} : +50 K€ → **+{_fmt(opp['if_add_50k_gain'])}** RFA")
        if not development_opportunities or not any(o.get("if_add_50k_gain") for o in development_opportunities):
            lines.append("   Aucune opportunité +50 K€ identifiée sur les lignes actuelles.")
        lines.append("")

        lines.append("**📈 Global (plateformes)**")
        for r in global_rows[:12]:
            status = "✅" if r.get("achieved") else ("🔥" if r.get("near") else "⬜")
            lines.append(f"   {status} **{r['label']}** — CA: {_fmt(r['ca'])} ({r.get('progress', 0):.0f}%) | RFA: {_fmt(r.get('current_rfa') or 0)}" + (f" | Manque: {_fmt(r.get('missing_ca'))} → +{_fmt(r.get('projected_gain'))}" if r.get("near") else ""))
        lines.append("\n**📦 Tri-partites**")
        for r in tri_rows[:12]:
            status = "✅" if r.get("achieved") else ("🔥" if r.get("near") else "⬜")
            lines.append(f"   {status} **{r['label']}** — CA: {_fmt(r['ca'])} ({r.get('progress', 0):.0f}%) | RFA: {_fmt(r.get('current_rfa') or 0)}" + (f" | Manque: {_fmt(r.get('missing_ca'))} → +{_fmt(r.get('projected_gain'))}" if r.get("near") else ""))
        if plans:
            lines.append(f"\n🎯 **Plans d'achat optimisés** : {len(plans)} plan(s)")
            for p in plans[:3]:
                lines.append(f"   → {p.get('global_label', '')} : {p.get('tiers_unlocked')} palier(s) avec {_fmt(p.get('total_ca_needed') or 0)} → +{_fmt(p.get('gain_option_a') or 0)} RFA")
        if cascades:
            lines.append(f"\n🌊 **Effet cascade** : {len(cascades)} ligne(s) où 1 € peut impacter jusqu'à 4 paliers")

        profile_data = {
            "entity_id": entity_id,
            "entity_label": entity_label,
            "entity_type": mode,
            "contract_name": contract_name,
            "total_rfa": total_rfa,
            "achieved_count": achieved_count,
            "near_count": near_count,
            "gain_potential": gain_potential,
            "global_rows": global_rows,
            "tri_rows": tri_rows,
            "smart_plans": plans,
            "cascade": cascades,
            "group_codes_union": group_codes_union,
            "development_opportunities": development_opportunities,
            "scenario_plus_50k": scenario_plus_50k,
            "scenario_moins_50k": scenario_moins_50k,
        }
        return {"type": "entity_profile", "message": "\n".join(lines), "data": profile_data}

    elif query_type == "smart_plan":
        plans = analysis.get("smart_plans", [])
        search = (params.get("search") or "").upper()
        if search:
            plans = [p for p in plans if search in p["entity_id"].upper() or search in p["entity_label"].upper()]
        if not plans:
            return {"type": "smart_plan", "message": "Aucun plan d'achat optimisé trouvé" + (f" pour **{search}**" if search else "") + ".", "data": []}

        lines = []
        lines.append("**🎯 Plans d'achat optimisés**\n")
        lines.append("Quelles tri-partites pousser pour débloquer plusieurs paliers avec les **mêmes euros** ?\n")

        for plan in plans[:10]:
            tiers = plan["tiers_unlocked"]
            twb = plan.get("tiers_with_bonus", tiers)
            bonus = plan.get("bonus_effort", 0)
            gain_a = plan.get("gain_option_a", 0)
            gain_b = plan.get("gain_option_b", 0)
            bonus_ok = plan.get("bonus_reasonable", False)

            # Titre
            if plan["global_unlocked"]:
                lines.append(f"\n🏆 **{plan['entity_label']}** — **{tiers} palier(s) débloqués** avec {_fmt(plan['total_ca_needed'])} de CA → **gagne +{_fmt(gain_a)}** de RFA\n")
            elif bonus_ok and bonus > 0:
                lines.append(f"\n🎯 **{plan['entity_label']}** — **{tiers} palier(s)** avec {_fmt(plan['total_ca_needed'])} → gagne +{_fmt(gain_a)} … ou **{twb} paliers** avec {_fmt(plan['total_with_bonus'])} → **gagne +{_fmt(gain_b)}** !\n")
            else:
                lines.append(f"\n🎯 **{plan['entity_label']}** — **{tiers} palier(s) débloqués** avec {_fmt(plan['total_ca_needed'])} de CA → **gagne +{_fmt(gain_a)}** de RFA\n")

            lines.append(f"   📦 **{plan['global_label']}** : CA actuel {_fmt(plan['global_ca'])} → palier à {_fmt(plan['global_ca'] + plan['global_missing'])} (manque {_fmt(plan['global_missing'])})")

            if plan["global_unlocked"]:
                lines.append(f"   ✅ **Global débloqué** grâce aux tri-partites → +{_fmt(plan['global_gain'])} de RFA globale")
            elif bonus_ok and bonus > 0:
                lines.append(f"   💡 **Avec seulement {_fmt(bonus)} de plus**, le global est débloqué → +{_fmt(plan['global_gain'])} de RFA globale en plus")
            else:
                remaining = plan.get("remaining_for_global", 0)
                lines.append(f"   ⏳ **Global {plan['global_label']}** proche : après le plan tri, il restera **{_fmt(remaining)}** à faire sur les autres lignes {plan['global_label']} pour atteindre le palier global → **+{_fmt(plan['global_gain'])}** RFA. Faisable !")

            lines.append(f"\n   **Tri-partites à pousser** (les mêmes € comptent pour le global) :")
            for item in plan["plan_items"]:
                lines.append(
                    f"   → **{item['label']}** : CA {_fmt(item['ca'])} ({item['progress']:.0f}%) → pousser **{_fmt(item['ca_to_push'])}**\n"
                    f"      Débloque le palier tri → **+{_fmt(item['projected_gain'])} de RFA**\n"
                    f"      Ces {_fmt(item['ca_to_push'])} comptent AUSSI pour le global !"
                )

            if plan["global_unlocked"]:
                lines.append(f"\n   💰 **{_fmt(plan['total_ca_needed'])} d'achat → {tiers} palier(s) → le client gagne +{_fmt(gain_a)} de RFA**")
            elif bonus_ok and bonus > 0:
                lines.append(f"\n   💰 **Option A** : {_fmt(plan['total_ca_needed'])} d'achat → {tiers} palier(s) → **+{_fmt(gain_a)} de RFA**")
                lines.append(f"   🔥 **Option B** : {_fmt(plan['total_with_bonus'])} d'achat → **{twb} palier(s)** → **+{_fmt(gain_b)} de RFA**")
                extra_gain = gain_b - gain_a
                lines.append(f"   👉 {_fmt(bonus)} de plus → **+{_fmt(extra_gain)} de RFA supplémentaire** !")
            else:
                remaining = plan.get("remaining_for_global", 0)
                lines.append(f"\n   💰 **{_fmt(plan['total_ca_needed'])}** d'achat sur les tri-partites ci-dessus → **{tiers} palier(s) tri débloqué(s)** → +{_fmt(gain_a)} de RFA. Ces achats comptent aussi pour le global : **{_fmt(remaining)}** de plus sur {plan['global_label']} → palier global → +{_fmt(plan['global_gain'])} en plus.")

        return {"type": "smart_plan", "message": "\n".join(lines), "data": plans[:10]}

    elif query_type == "cascade":
        cascades = analysis.get("cascade", [])
        if not cascades:
            return {"type": "cascade", "message": "Aucun effet cascade détecté.", "data": []}
        
        # Grouper par adhérent pour montrer l'impact complet
        by_entity = {}
        for c in cascades:
            eid = c["entity_id"]
            if eid not in by_entity:
                by_entity[eid] = {"entity_label": c["entity_label"], "items": [], "max_impacts": 0}
            by_entity[eid]["items"].append(c)
            by_entity[eid]["max_impacts"] = max(by_entity[eid]["max_impacts"], c["nb_impacts"])
        # Trier : ceux qui impactent le plus de paliers
        sorted_entities = sorted(by_entity.values(), key=lambda x: -x["max_impacts"])

        lines = []
        lines.append("**🌊 Effet Cascade : 1 € de CA peut impacter jusqu'à 4 paliers**\n")
        lines.append("Tri-partite sortant → Global sortant → Tri-partite entrant → Global entrant\n")
        
        shown = 0
        for entity_group in sorted_entities[:8]:
            label = entity_group["entity_label"]
            lines.append(f"\n**{label}** :")
            for c in sorted(entity_group["items"], key=lambda x: -x["nb_impacts"])[:3]:
                tp = c.get('tri_progress') or 0
                gp = c.get('global_progress') or 0
                utp = c.get('union_tri_progress') or 0
                ugp = c.get('union_global_progress') or 0
                impacts = []
                impacts.append(f"✅ Tri sortant: {c['tri_label']} ({tp:.0f}%, manque {_fmt(c.get('tri_missing') or 0)})")
                if c["global_near"]:
                    impacts.append(f"✅ Global sortant: {c['global_label']} ({gp:.0f}%, manque {_fmt(c.get('global_missing') or 0)})")
                else:
                    impacts.append(f"{'✅' if gp >= 80 else '⬜'} Global sortant: {c['global_label']} ({gp:.0f}%)")
                if c["union_tri_near"]:
                    impacts.append(f"✅ Tri entrant: {c['tri_label']} Union ({utp:.0f}%)")
                else:
                    impacts.append(f"{'✅' if utp >= 80 else '⬜'} Tri entrant Union ({utp:.0f}%)")
                if c["union_global_near"]:
                    impacts.append(f"✅ Global entrant: {c['global_label']} Union ({ugp:.0f}%)")
                else:
                    impacts.append(f"{'✅' if ugp >= 80 else '⬜'} Global entrant Union ({ugp:.0f}%)")
                
                lines.append(f"   **{c['tri_label']}** — CA: {_fmt(c['tri_ca'])} | **{c['nb_impacts']} palier(s) impactés**")
                for imp in impacts:
                    lines.append(f"      {imp}")
            shown += 1

        return {"type": "cascade", "message": "\n".join(lines), "data": cascades[:30]}

    else:
        return {"type": "error", "message": f"Requête inconnue: {query_type}"}


def genie_query(import_data: ImportData, query_type: str, params: Dict = None) -> Dict:
    params = params or {}
    analysis = genie_full_analysis(import_data)
    return _dispatch_query(analysis, query_type, params, import_data)


def genie_fast_analysis(import_data: ImportData) -> Dict:
    """
    Analyse rapide basée sur les données agrégées uniquement.
    Pas de résolution de contrat individuelle → pas de requêtes DB → < 1 seconde.
    Utilisé sur Vercel pour Union Intelligence.
    """
    by_client = import_data.by_client or {}
    by_group  = import_data.by_group  or {}

    from app.core.fields import get_global_fields, get_tri_fields
    global_fields = get_global_fields()
    tri_fields    = get_tri_fields()

    # Totaux CA par fournisseur
    ca_by_field: Dict[str, float] = {}
    for f in global_fields + tri_fields:
        ca_by_field[f] = sum(c.get("global", {}).get(f, 0) + c.get("tri", {}).get(f, 0) for c in by_client.values())

    ca_total = sum(c.get("grand_total", 0) for c in by_client.values())

    # Top clients par CA
    top_clients = sorted(
        [{"id": k, "label": f"{k} - {v.get('nom_client', '')}", "ca": v.get("grand_total", 0), "groupe": v.get("groupe_client", "")}
         for k, v in by_client.items()],
        key=lambda x: -x["ca"]
    )

    # Balance simplifiée par plateforme (CA uniquement, sans contrats)
    balance = []
    for f in global_fields:
        label = f.replace("GLOBAL_", "")
        ca = ca_by_field.get(f, 0)
        balance.append({"key": f, "label": label, "ca": ca, "inbound": 0, "outbound": ca, "balance": 0})

    # Groupes
    groupes = sorted(
        [{"label": g, "nb": v.get("nb_comptes", 0), "ca": v.get("grand_total", 0)} for g, v in by_group.items()],
        key=lambda x: -x["ca"]
    )

    summary = {
        "total_clients": len(by_client),
        "total_groupes": len(by_group),
        "ca_total": ca_total,
        "ca_by_supplier": {f.replace("GLOBAL_", ""): ca_by_field.get(f, 0) for f in global_fields},
        "total_entrant": 0,
        "total_sortant": ca_total,
        "total_margin": 0,
        "nb_losses": 0,
        "total_near": 0,
        "total_achieved": 0,
        "total_gain_potential": 0,
        "union_near_count": 0,
    }

    return {
        "summary": summary,
        "alerts": [],
        "balance": balance,
        "top_clients": top_clients[:20],
        "groupes": groupes,
        "near_by_objective": {},
        "union_opportunities": [],
        "smart_plans": [],
        "cascade": [],
        "_fast_mode": True,
    }


def genie_query_fast(import_data: ImportData, query_type: str, params: Dict = None) -> Dict:
    """Version rapide de genie_query utilisant genie_fast_analysis (sans DB)."""
    params   = params or {}
    analysis = genie_fast_analysis(import_data)

    if query_type == "dashboard":
        s   = analysis["summary"]
        top = analysis["top_clients"][:5]
        top_lines = "\n".join(f"  {i+1}. **{t['label']}** — {_fmt(t['ca'])}" for i, t in enumerate(top))
        sup_lines = "\n".join(f"  - {k}: {_fmt(v)}" for k, v in s["ca_by_supplier"].items() if v > 0)
        return {
            "resultType": "dashboard",
            "type": "dashboard",
            "message": (
                f"Analyse de **{s['total_clients']} adhérents** ({s['total_groupes']} groupes).\n\n"
                f"💰 **CA total : {_fmt(s['ca_total'])}**\n\n"
                f"📊 CA par plateforme :\n{sup_lines}\n\n"
                f"🏆 Top adhérents :\n{top_lines}"
            ),
            "data": s,
            "alerts": [],
        }

    elif query_type == "top_gains":
        top = analysis["top_clients"][:int(params.get("limit", 10))]
        return {
            "resultType": "top_gains",
            "type": "top_gains",
            "message": f"Top {len(top)} adhérents par CA :",
            "data": [{"id": t["id"], "label": t["label"], "rfa_total": t["ca"], "value": t["ca"]} for t in top],
        }

    elif query_type == "balance":
        bal = analysis["balance"]
        return {
            "resultType": "balance",
            "type": "balance",
            "message": "Balance CA par plateforme :",
            "data": bal,
        }

    else:
        return {
            "resultType": query_type,
            "type": query_type,
            "message": f"Analyse CA ({query_type}) — {analysis['summary']['total_clients']} adhérents, CA {_fmt(analysis['summary']['ca_total'])}",
            "data": analysis.get(query_type, analysis["summary"]),
            "alerts": [],
        }
