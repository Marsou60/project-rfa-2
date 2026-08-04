"""
Agrégation réseau RFA sortante 2026 (Pure Data cumulé).

Partition sans double comptage (comme get_global_recap_rfa) :
- indépendants / groupes exclus ou dissous → RFA par code_union
- groupes réels → RFA consolidée sur le groupe
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.fields import EXCLUDED_GROUPS, get_global_fields
from app.services.contract_resolver import resolve_contract
from app.services.pure_data_cumulative_service import _norm_text
from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows
from app.services.rfa_calculator import calculate_rfa


PLATFORM_LABELS = {
    "GLOBAL_ACR": "ACR",
    "GLOBAL_ALLIANCE": "ALLIANCE",
    "GLOBAL_DCA": "DCA",
    "GLOBAL_EXADIS": "EXADIS",
}

LEVEL_LABELS = {
    "CLASSIQUE": "Classique",
    "SILVER": "Silver",
    "GOLD": "Gold",
}


def _level_label(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = str(raw).strip().upper()
    return LEVEL_LABELS.get(key, str(raw).strip().title())


def _contract_meta(contract: Any, rfa_result: Dict[str, Any]) -> Dict[str, Any]:
    """Métadonnées contrat + niveau (Adhérents 2026 ou contrat spécial)."""
    from app.services.rfa_calculator import parse_level_baremes

    level_info = rfa_result.get("contract_level") or {}
    level_id = level_info.get("id")
    level_based = bool(parse_level_baremes(contract)) if contract else False
    return {
        "contract_id": getattr(contract, "id", None) if contract else None,
        "contract_name": contract.name if contract else "Aucun contrat",
        "level_based": level_based,
        "level_id": level_id,
        "level_label": _level_label(level_id) if level_based else None,
        "tripartites_enabled": bool(level_info.get("tripartites_enabled")),
        "level_min_global": level_info.get("min_global"),
        "level_max_global": level_info.get("max_global"),
        "level_total_ca": level_info.get("total_ca"),
    }


def _landing_summary(
    *,
    contract_name: str,
    level_based: bool,
    level_ytd: Optional[str],
    level_proj: Optional[str],
    ca_proj: Optional[float],
    rfa_proj: Optional[float],
    rfa_2025: Optional[float],
) -> str:
    """Phrase lisible d'atterrissage pour le dashboard."""
    parts: List[str] = []
    if ca_proj is not None:
        parts.append(f"CA fin {int(ca_proj):,} €".replace(",", " "))
    if level_based:
        if level_proj:
            if level_ytd and level_ytd != level_proj:
                parts.append(f"atterrit en {level_proj} (aujourd’hui {level_ytd})")
            else:
                parts.append(f"contrat {contract_name} — niveau {level_proj}")
        else:
            parts.append(f"contrat {contract_name} — sous seuil (pas de niveau)")
    else:
        parts.append(f"contrat {contract_name}")
    if rfa_proj is not None:
        parts.append(f"RFA 2026 proj. {int(rfa_proj):,} €".replace(",", " "))
    if rfa_2025 is not None:
        parts.append(f"RFA 2025 {int(rfa_2025):,} €".replace(",", " "))
    return " · ".join(parts)


def _empty_platform_totals() -> Dict[str, float]:
    return {k: 0.0 for k in get_global_fields()}


def _scale_recap(recap_ca: Dict[str, Dict[str, float]], factor: float) -> Dict[str, Dict[str, float]]:
    return {
        "global": {k: round(float(v) * factor, 2) for k, v in (recap_ca.get("global") or {}).items()},
        "tri": {k: round(float(v) * factor, 2) for k, v in (recap_ca.get("tri") or {}).items()},
    }


def _platform_from_ca_key(key: str) -> Optional[str]:
    """Mappe une cle GLOBAL_* / TRI_* vers ACR|DCA|EXADIS|ALLIANCE."""
    from app.core.fields import TRI_TO_GLOBAL

    k = (key or "").strip().upper()
    if not k:
        return None
    global_key = k if k.startswith("GLOBAL_") else TRI_TO_GLOBAL.get(k)
    if not global_key:
        return None
    for platform in ("ACR", "DCA", "EXADIS", "ALLIANCE"):
        if global_key == f"GLOBAL_{platform}":
            return platform
    return None


def _factor_for_month(month: Optional[int]) -> Optional[float]:
    if month is None:
        return None
    m = int(month)
    if m == 12:
        return 1.0
    if 1 <= m < 12:
        return 12.0 / float(m)
    return None


def scale_recap_by_platform_months(
    recap_ca: Dict[str, Dict[str, float]],
    *,
    platform_months: Optional[Dict[str, int]] = None,
    fallback_month: Optional[int] = None,
) -> Tuple[Optional[Dict[str, Dict[str, float]]], Optional[float], Optional[int]]:
    """
    Projection fin d'annee avec decalage possible entre plateformes.
    Chaque cle CA est annualisee avec le mois de SA plateforme.
    Retourne (projected_recap, display_factor, display_month).
    """
    platform_months = {
        str(k).strip().upper(): int(v)
        for k, v in (platform_months or {}).items()
        if v is not None
    }
    fallback_factor = _factor_for_month(fallback_month)

    used_months: List[int] = []
    projected = {"global": {}, "tri": {}}
    has_any_factor = False

    for section in ("global", "tri"):
        for key, value in (recap_ca.get(section) or {}).items():
            platform = _platform_from_ca_key(key)
            month = platform_months.get(platform) if platform else None
            factor = _factor_for_month(month)
            if factor is None:
                factor = fallback_factor
            if factor is None:
                projected[section][key] = round(float(value or 0), 2)
                continue
            has_any_factor = True
            if month is not None:
                used_months.append(int(month))
            elif fallback_month is not None:
                used_months.append(int(fallback_month))
            projected[section][key] = round(float(value or 0) * factor, 2)

    if not has_any_factor:
        return None, None, fallback_month

    display_month = min(used_months) if used_months else fallback_month
    display_factor = _factor_for_month(display_month)
    return projected, display_factor, display_month


def _platform_totals_from_rfa(rfa_result: Dict[str, Any]) -> Dict[str, float]:
    out = _empty_platform_totals()
    for key, item in (rfa_result.get("global") or {}).items():
        if key not in out:
            continue
        total = float((item.get("total") or {}).get("value", 0) or 0)
        out[key] = round(total, 2)
    return out


def _entity_row_from_rfa(
    *,
    entity_type: str,
    code: str,
    nom: str,
    contract: Any,
    ca_ytd: float,
    rfa_ytd: Dict[str, Any],
    rfa_proj: Optional[Dict[str, Any]],
    ca_proj: Optional[float],
    nb_comptes: int = 1,
    cotisation_setting: Optional[Any] = None,
    groupe_client: Optional[str] = None,
) -> Dict[str, Any]:
    from app.services.cotisation_2026 import resolve_cotisation_2026_for_entity

    totals_ytd = rfa_ytd.get("totals") or {}
    totals_proj = (rfa_proj or {}).get("totals") or {}
    meta_ytd = _contract_meta(contract, rfa_ytd)
    meta_proj = _contract_meta(contract, rfa_proj) if rfa_proj else meta_ytd

    level_ytd = meta_ytd.get("level_label")
    level_proj = meta_proj.get("level_label")
    level_based = bool(meta_ytd.get("level_based"))
    contract_name = meta_ytd.get("contract_name") or "Aucun contrat"

    platforms_ytd = []
    for key, item in (rfa_ytd.get("global") or {}).items():
        ca = float(item.get("ca", 0) or 0)
        total = float((item.get("total") or {}).get("value", 0) or 0)
        if ca == 0 and total == 0:
            continue
        platforms_ytd.append({
            "key": key,
            "label": item.get("label") or PLATFORM_LABELS.get(key, key),
            "ca": round(ca, 2),
            "rfa": round(total, 2),
        })
    platforms_proj = []
    if rfa_proj:
        for key, item in (rfa_proj.get("global") or {}).items():
            ca = float(item.get("ca", 0) or 0)
            total = float((item.get("total") or {}).get("value", 0) or 0)
            if ca == 0 and total == 0:
                continue
            platforms_proj.append({
                "key": key,
                "label": item.get("label") or PLATFORM_LABELS.get(key, key),
                "ca": round(ca, 2),
                "rfa": round(total, 2),
            })

    rfa_proj_val = round(float(totals_proj.get("grand_total", 0) or 0), 2) if rfa_proj else None
    rfa_ytd_val = round(float(totals_ytd.get("grand_total", 0) or 0), 2)

    # Cotisation : barème sur niveau d'atterrissage (proj) si dispo, sinon YTD
    # Les indépendants seuls / groupes consolidés — jamais les magasins d'un vrai groupe
    # (ceux-ci n'apparaissent pas dans independents_rows grâce à la partition).
    level_for_cotis = meta_proj.get("level_id") or meta_ytd.get("level_id")
    cotisation = resolve_cotisation_2026_for_entity(
        entity_key=code,
        level_based=level_based,
        level_id=level_for_cotis,
        contract_name=contract_name,
        setting=cotisation_setting,
        entity_type=entity_type,
        groupe_client=groupe_client if entity_type == "independent" else None,
    )
    deducted = float(cotisation.get("deducted") or 0)

    row = {
        "entity_type": entity_type,
        "code": code,
        "nom": nom,
        "type_contrat": contract_name,
        "contract_id": meta_ytd.get("contract_id"),
        "level_based": level_based,
        "level_ytd": level_ytd,
        "level_proj": level_proj,
        "level_changed": bool(level_based and level_ytd and level_proj and level_ytd != level_proj),
        "tripartites_ytd": bool(meta_ytd.get("tripartites_enabled")),
        "tripartites_proj": bool(meta_proj.get("tripartites_enabled")),
        "nb_comptes": nb_comptes,
        "ca_ytd": round(ca_ytd, 2),
        "ca_proj": round(ca_proj, 2) if ca_proj is not None else None,
        "rfa_ytd": rfa_ytd_val,
        "rfa_ytd_global": round(float(totals_ytd.get("global_total", 0) or 0), 2),
        "rfa_ytd_tri": round(float(totals_ytd.get("tri_total", 0) or 0), 2),
        "rfa_proj": rfa_proj_val,
        "rfa_proj_global": round(float(totals_proj.get("global_total", 0) or 0), 2) if rfa_proj else None,
        "rfa_proj_tri": round(float(totals_proj.get("tri_total", 0) or 0), 2) if rfa_proj else None,
        "rfa_ytd_net": round(max(rfa_ytd_val - deducted, 0), 2),
        "rfa_proj_net": round(max((rfa_proj_val or 0) - deducted, 0), 2) if rfa_proj_val is not None else None,
        "cotisation": cotisation,
        # Comparaison 2025 (remplie ensuite si import Excel dispo)
        "ca_2025": None,
        "rfa_2025": None,
        "contrat_2025": None,
        "platforms_ytd": platforms_ytd,
        "platforms_proj": platforms_proj,
    }
    row["landing_summary"] = _landing_summary(
        contract_name=contract_name,
        level_based=level_based,
        level_ytd=level_ytd,
        level_proj=level_proj,
        ca_proj=row["ca_proj"],
        rfa_proj=row["rfa_proj"],
        rfa_2025=None,
    )
    return row


def _partition_entities(
    rows_year: List[Dict],
    dissolved_groups: Set[str],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Retourne (independents_meta, groups_meta) avec listes de rows filtrées."""
    by_code: Dict[str, Dict[str, Any]] = {}
    for r in rows_year:
        code = _norm_text(r.get("code_union"))
        if not code:
            continue
        meta = by_code.setdefault(code, {
            "code_union": code,
            "nom": "",
            "groupe": "",
            "rows": [],
        })
        meta["rows"].append(r)
        nom = (r.get("raison_sociale") or "").strip()
        if nom and not meta["nom"]:
            meta["nom"] = nom
        groupe = _norm_text(r.get("groupe_client"))
        if groupe:
            meta["groupe"] = groupe

    independents: List[Dict[str, Any]] = []
    groups_map: Dict[str, Dict[str, Any]] = {}

    for code, meta in by_code.items():
        groupe = meta["groupe"]
        if not groupe or groupe in dissolved_groups:
            independents.append(meta)
            continue
        g = groups_map.setdefault(groupe, {
            "groupe": groupe,
            "nom": groupe,
            "codes": [],
            "rows": [],
        })
        g["codes"].append(code)
        g["rows"].extend(meta["rows"])

    independents.sort(key=lambda x: x["code_union"])
    groups = sorted(groups_map.values(), key=lambda x: x["groupe"])
    return independents, groups


def compute_network_rfa_2026(
    rows_year: List[Dict],
    *,
    year: int = 2026,
    reporting_month: Optional[int] = None,
    platform_months: Optional[Dict[str, int]] = None,
    dissolved_groups: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """
    Calcule le coût RFA sortante réseau 2026 à date + projection.
    platform_months permet un décalage de mois entre plateformes.
    """
    dissolved = {_norm_text(g) for g in (dissolved_groups or set()) if g}
    dissolved |= EXCLUDED_GROUPS

    # Facteur d'affichage (min mois) — la projection reelle est par plateforme
    projection_factor: Optional[float] = None
    if reporting_month and 1 <= int(reporting_month) < 12:
        projection_factor = 12.0 / float(reporting_month)
    elif reporting_month == 12:
        projection_factor = 1.0

    def _project_recap(recap_ca: Dict[str, Dict[str, float]]):
        projected_recap, display_factor, display_month = scale_recap_by_platform_months(
            recap_ca,
            platform_months=platform_months,
            fallback_month=reporting_month,
        )
        return projected_recap, display_factor, display_month

    independents_meta, groups_meta = _partition_entities(rows_year, dissolved)

    # Cotisations 2026 (Facturer / Offrir) — ne pas mélanger avec legacy 2025
    cotisation_by_key: Dict[str, Any] = {}
    try:
        from sqlmodel import Session, select
        from app.database import engine
        from app.models import CotisationSetting

        with Session(engine) as session:
            rows_cot = session.exec(
                select(CotisationSetting).where(CotisationSetting.year == int(year))
            ).all()
            for c in rows_cot:
                cotisation_by_key[_norm_text(c.entity_key)] = c
    except Exception as exc:
        print(f"[NETWORK RFA] cotisations 2026 non chargées: {exc}")

    independents_rows: List[Dict[str, Any]] = []
    groups_rows: List[Dict[str, Any]] = []

    ytd = {
        "grand_total": 0.0,
        "total_global": 0.0,
        "total_tri": 0.0,
        "by_platform": _empty_platform_totals(),
    }
    projected = {
        "grand_total": 0.0,
        "total_global": 0.0,
        "total_tri": 0.0,
        "by_platform": _empty_platform_totals(),
    }

    def _accumulate(bucket: Dict[str, Any], rfa_result: Dict[str, Any]):
        totals = rfa_result.get("totals") or {}
        bucket["grand_total"] = round(bucket["grand_total"] + float(totals.get("grand_total", 0) or 0), 2)
        bucket["total_global"] = round(bucket["total_global"] + float(totals.get("global_total", 0) or 0), 2)
        bucket["total_tri"] = round(bucket["total_tri"] + float(totals.get("tri_total", 0) or 0), 2)
        for k, v in _platform_totals_from_rfa(rfa_result).items():
            bucket["by_platform"][k] = round(bucket["by_platform"].get(k, 0.0) + v, 2)

    for meta in independents_meta:
        code = meta["code_union"]
        rows = meta["rows"]
        if not rows:
            continue
        recap_ca = compute_recap_ca_from_rows(rows)
        contract = resolve_contract(code_union=code, year=year)
        rfa_ytd = calculate_rfa(recap_ca, contract=contract, code_union=code, year=year)

        rfa_proj = None
        ca_proj = None
        projected_recap, ent_factor, _ent_month = _project_recap(recap_ca)
        if projected_recap is not None and ent_factor and ent_factor != 1.0:
            rfa_proj = calculate_rfa(projected_recap, contract=contract, code_union=code, year=year)
            ca_proj = round(sum(projected_recap["global"].values()), 2)
            if projection_factor is None:
                projection_factor = ent_factor
        elif ent_factor == 1.0:
            rfa_proj = rfa_ytd
            ca_proj = round(sum(recap_ca["global"].values()), 2)
            projection_factor = 1.0

        ca_ytd = round(sum(recap_ca["global"].values()), 2)
        independents_rows.append(_entity_row_from_rfa(
            entity_type="independent",
            code=code,
            nom=meta["nom"] or code,
            contract=contract,
            ca_ytd=ca_ytd,
            rfa_ytd=rfa_ytd,
            rfa_proj=rfa_proj,
            ca_proj=ca_proj,
            nb_comptes=1,
            cotisation_setting=cotisation_by_key.get(_norm_text(code)),
            groupe_client=meta.get("groupe") or None,
        ))
        _accumulate(ytd, rfa_ytd)
        if rfa_proj:
            _accumulate(projected, rfa_proj)

    for meta in groups_meta:
        groupe = meta["groupe"]
        rows = meta["rows"]
        if not rows:
            continue
        recap_ca = compute_recap_ca_from_rows(rows)
        contract = resolve_contract(groupe_client=groupe, year=year)
        rfa_ytd = calculate_rfa(recap_ca, contract=contract, groupe_client=groupe, year=year)

        rfa_proj = None
        ca_proj = None
        projected_recap, ent_factor, _ent_month = _project_recap(recap_ca)
        if projected_recap is not None and ent_factor and ent_factor != 1.0:
            rfa_proj = calculate_rfa(projected_recap, contract=contract, groupe_client=groupe, year=year)
            ca_proj = round(sum(projected_recap["global"].values()), 2)
            if projection_factor is None:
                projection_factor = ent_factor
        elif ent_factor == 1.0:
            rfa_proj = rfa_ytd
            ca_proj = round(sum(recap_ca["global"].values()), 2)
            projection_factor = 1.0

        ca_ytd = round(sum(recap_ca["global"].values()), 2)
        groups_rows.append(_entity_row_from_rfa(
            entity_type="group",
            code=groupe,
            nom=meta["nom"] or groupe,
            contract=contract,
            ca_ytd=ca_ytd,
            rfa_ytd=rfa_ytd,
            rfa_proj=rfa_proj,
            ca_proj=ca_proj,
            nb_comptes=len(set(meta["codes"])),
            cotisation_setting=cotisation_by_key.get(_norm_text(groupe)),
        ))
        _accumulate(ytd, rfa_ytd)
        if rfa_proj:
            _accumulate(projected, rfa_proj)

    independents_rows.sort(key=lambda r: r["rfa_ytd"], reverse=True)
    groups_rows.sort(key=lambda r: r["rfa_ytd"], reverse=True)

    # Synthèse cotisations 2026
    cotisation_summary = {
        "total_amount": 0.0,
        "total_facture": 0.0,
        "total_offerte": 0.0,
        "nb_facture": 0,
        "nb_offerte": 0,
        "nb_zero": 0,
        "nb_entities": 0,
    }
    for e in independents_rows + groups_rows:
        c = e.get("cotisation") or {}
        amt = float(c.get("amount") or 0)
        cotisation_summary["nb_entities"] += 1
        cotisation_summary["total_amount"] = round(cotisation_summary["total_amount"] + amt, 2)
        if amt <= 0:
            cotisation_summary["nb_zero"] += 1
        elif c.get("is_offerte"):
            cotisation_summary["total_offerte"] = round(cotisation_summary["total_offerte"] + amt, 2)
            cotisation_summary["nb_offerte"] += 1
        else:
            cotisation_summary["total_facture"] = round(cotisation_summary["total_facture"] + amt, 2)
            cotisation_summary["nb_facture"] += 1

    ytd_net = round(
        float(ytd["grand_total"]) - cotisation_summary["total_facture"], 2
    )
    proj_net = None
    if projection_factor:
        proj_net = round(
            float(projected["grand_total"]) - cotisation_summary["total_facture"], 2
        )
    ytd["grand_total_net"] = max(ytd_net, 0)
    if projection_factor:
        projected["grand_total_net"] = max(proj_net or 0, 0)

    return {
        "available": True,
        "year": year,
        "reporting_month": reporting_month,
        "projection_factor": round(projection_factor, 4) if projection_factor else None,
        "ytd": ytd,
        "projected": projected if projection_factor else None,
        "independents": independents_rows,
        "groups": groups_rows,
        "cotisations": cotisation_summary,
        "counts": {
            "independents": len(independents_rows),
            "groups": len(groups_rows),
            "entities": len(independents_rows) + len(groups_rows),
        },
    }


def attach_compare_2025(
    network: Dict[str, Any],
    *,
    grand_total_2025: Optional[float],
    import_id: Optional[str] = None,
    rows_2025: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Ajoute la comparaison vs RFA sortante Excel 2025 :
    - grand_total réseau
    - par entité : ca_2025, rfa_2025, contrat_2025 + landing_summary enrichi
    """
    out = dict(network)
    indep_map: Dict[str, Dict[str, Any]] = {}
    group_map: Dict[str, Dict[str, Any]] = {}
    if rows_2025:
        for row in rows_2025.get("independents") or []:
            code = _norm_text(row.get("code_union"))
            if code:
                indep_map[code] = row
        for row in rows_2025.get("groups") or []:
            code = _norm_text(row.get("code_union") or row.get("groupe_client"))
            if code:
                group_map[code] = row

    def _enrich(entities: List[Dict[str, Any]], lookup: Dict[str, Dict[str, Any]]):
        for e in entities:
            src = lookup.get(_norm_text(e.get("code")))
            if not src:
                e["landing_summary"] = _landing_summary(
                    contract_name=e.get("type_contrat") or "Aucun contrat",
                    level_based=bool(e.get("level_based")),
                    level_ytd=e.get("level_ytd"),
                    level_proj=e.get("level_proj"),
                    ca_proj=e.get("ca_proj"),
                    rfa_proj=e.get("rfa_proj"),
                    rfa_2025=None,
                )
                continue
            e["ca_2025"] = round(float(src.get("montant_total_realise", 0) or 0), 2)
            e["rfa_2025"] = round(float(src.get("rfa_client", 0) or 0), 2)
            e["contrat_2025"] = src.get("type_contrat") or None
            e["landing_summary"] = _landing_summary(
                contract_name=e.get("type_contrat") or "Aucun contrat",
                level_based=bool(e.get("level_based")),
                level_ytd=e.get("level_ytd"),
                level_proj=e.get("level_proj"),
                ca_proj=e.get("ca_proj"),
                rfa_proj=e.get("rfa_proj"),
                rfa_2025=e["rfa_2025"],
            )
            if e.get("rfa_proj") is not None and e["rfa_2025"] is not None:
                e["delta_rfa_vs_2025"] = round(float(e["rfa_proj"]) - float(e["rfa_2025"]), 2)
            else:
                e["delta_rfa_vs_2025"] = None

    _enrich(out.get("independents") or [], indep_map)
    _enrich(out.get("groups") or [], group_map)

    # Compteurs niveaux d'atterrissage (Adhérents 2026)
    level_counts: Dict[str, int] = {}
    upgrades = 0
    for e in (out.get("independents") or []) + (out.get("groups") or []):
        if e.get("level_based") and e.get("level_proj"):
            level_counts[e["level_proj"]] = level_counts.get(e["level_proj"], 0) + 1
        if e.get("level_changed"):
            upgrades += 1
    out["landing_levels"] = level_counts
    out["level_upgrades"] = upgrades

    if grand_total_2025 is None:
        out["compare_2025"] = None
        return out

    ytd_total = float((network.get("ytd") or {}).get("grand_total") or 0)
    proj = network.get("projected") or {}
    proj_total = proj.get("grand_total")
    g2025 = float(grand_total_2025)

    def _delta(current: Optional[float]) -> Optional[Dict[str, Any]]:
        if current is None:
            return None
        d = round(float(current) - g2025, 2)
        pct = round((d / g2025) * 100, 1) if g2025 else None
        trend = "flat"
        if d > 50:
            trend = "up"
        elif d < -50:
            trend = "down"
        return {"delta": d, "delta_pct": pct, "trend": trend}

    out["compare_2025"] = {
        "import_id": import_id,
        "grand_total": round(g2025, 2),
        "vs_ytd": _delta(ytd_total),
        "vs_projected": _delta(float(proj_total) if proj_total is not None else None),
    }
    return out
