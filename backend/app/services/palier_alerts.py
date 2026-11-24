"""
Alertes paliers pour l'app mobile.

Le manque et le palier atteint sont calculés sur le CA à date (cumul de
l'année déjà importé), comme la jauge de la fiche RFA et le Génie
(`missing_ca` = prochain seuil − CA). La projection de fin d'année n'entre
pas dans le calcul : elle sert ailleurs à estimer la RFA de décembre.

Le mois « atteint » est le plus grand mois présent dans les lignes de
l'année (jamais une constante).
"""
from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional

from app.core.fields import get_field_by_key, get_tri_fields
from app.core.global_tiers import GLOBAL_PLATFORMS
from app.services.pdf_export import _get_tier_progress
from app.services.pure_data_rfa_parser import compute_recap_ca_from_rows
from app.services.rfa_calculator import (
    compute_total_global_ca,
    parse_level_baremes,
    select_contract_level,
)

RulesFor = Callable[[Any], Dict[str, Any]]
ResolveContract = Callable[[str, Optional[str]], Any]


def _as_tiers(raw: Any) -> List[Dict[str, float]]:
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append({"min": float(item.get("min") or 0), "rate": float(item.get("rate") or 0)})
        except (TypeError, ValueError):
            continue
    out.sort(key=lambda tier: tier["min"])
    return out


def _combined(ca: float, ladders: List[List[Dict[str, float]]]) -> Optional[Dict[str, Any]]:
    """Même rapprochement que le Génie : prochain seuil = le plus proche des barèmes RFA et bonus."""
    active = [tiers for tiers in ladders if tiers]
    if not active:
        return None
    progs = [_get_tier_progress(ca, tiers) for tiers in active]
    nexts = [prog["next_min"] for prog in progs if prog["next_min"] is not None]
    reached = {tier["min"] for tiers in active for tier in tiers if tier["min"] <= ca}
    return {
        "next_min": min(nexts) if nexts else None,
        "reached": reached,
    }


def _platform_ladders(contract: Any, recap: Dict[str, Any], rules: Dict[str, Any], key: str):
    levels = parse_level_baremes(contract)
    if levels:
        selected = select_contract_level(compute_total_global_ca(recap), levels)
        source = selected
        if source is None:
            source = min(levels, key=lambda level: float(level.get("minGlobal") or 0))
        return _as_tiers(source.get("tiersRfa")), _as_tiers(source.get("tiersBonus"))
    rule = rules.get(key)
    if not rule:
        return [], []
    return _as_tiers(getattr(rule, "tiers_rfa", None)), _as_tiers(getattr(rule, "tiers_bonus", None))


def _tri_enabled(contract: Any, recap: Dict[str, Any]) -> bool:
    levels = parse_level_baremes(contract)
    if not levels:
        return True
    selected = select_contract_level(compute_total_global_ca(recap), levels)
    return bool(selected and selected.get("tripartitesEnabled"))


def _tri_ladder(rules: Dict[str, Any], key: str) -> List[Dict[str, float]]:
    rule = rules.get(key)
    if not rule:
        return []
    return _as_tiers(getattr(rule, "tiers", None))


def _label(key: str, rules: Dict[str, Any]) -> str:
    rule = rules.get(key)
    custom = getattr(rule, "label", None) if rule else None
    if custom:
        return str(custom)
    if key.startswith("GLOBAL_"):
        return key.replace("GLOBAL_", "")
    return get_field_by_key(key)[1]


def build_palier_alerts(
    rows: List[Dict[str, Any]],
    *,
    year: int,
    resolve: ResolveContract,
    rules_for: RulesFor,
    commercial: Optional[str] = None,
    data_source: str = "",
) -> Dict[str, Any]:
    """
    `proches` : CA à date > 0 et encore un seuil au-dessus (le mobile filtre le plafond en €).
    `atteints` : un seuil franchi grâce au dernier mois importé.
    """
    wanted = (commercial or "").strip().upper()
    year_rows = []
    for row in rows:
        try:
            row_year = int(row.get("year"))
        except (TypeError, ValueError):
            continue
        if row_year != int(year):
            continue
        if wanted and (row.get("commercial") or "").strip().upper() != wanted:
            continue
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        year_rows.append(row)

    months = []
    for row in year_rows:
        try:
            month = int(row.get("month"))
        except (TypeError, ValueError):
            continue
        if 1 <= month <= 12:
            months.append(month)
    latest = max(months) if months else None

    by_code: Dict[str, Dict[str, Any]] = {}
    for row in year_rows:
        code = (row.get("code_union") or "").strip().upper()
        bucket = by_code.setdefault(code, {"name": "", "groupe": "", "ytd": [], "before": [], "month": []})
        name = (row.get("raison_sociale") or "").strip()
        if name and not bucket["name"]:
            bucket["name"] = name
        groupe = (row.get("groupe_client") or "").strip()
        if groupe and not bucket["groupe"]:
            bucket["groupe"] = groupe
        bucket["ytd"].append(row)
        try:
            month = int(row.get("month"))
        except (TypeError, ValueError):
            month = None
        if latest is None or month is None or month < latest:
            bucket["before"].append(row)
        elif month == latest:
            bucket["month"].append(row)

    proches: List[Dict[str, Any]] = []
    atteints: List[Dict[str, Any]] = []

    for code, bucket in by_code.items():
        contract = resolve(code, bucket["groupe"] or None)
        if contract is None:
            continue
        try:
            rules = rules_for(contract) or {}
        except Exception:
            rules = {}
        recap = compute_recap_ca_from_rows(bucket["ytd"])
        before = compute_recap_ca_from_rows(bucket["before"])
        month_recap = compute_recap_ca_from_rows(bucket["month"]) if latest else None
        name = bucket["name"] or code

        levels = parse_level_baremes(contract)
        if levels:
            total_now = compute_total_global_ca(recap)
            total_before = compute_total_global_ca(before)
            level_now = select_contract_level(total_now, levels)
            level_before = select_contract_level(total_before, levels)
            next_level = None
            for level in sorted(levels, key=lambda item: float(item.get("minGlobal") or 0)):
                if float(level.get("minGlobal") or 0) > total_now:
                    next_level = level
                    break
            if next_level is not None and total_now > 0:
                gap = round(float(next_level.get("minGlobal") or 0) - total_now, 2)
                if gap > 0:
                    proches.append({
                        "code_union": code,
                        "raison_sociale": name,
                        "kind": "niveau",
                        "objective": f"Niveau {next_level.get('id') or ''}".strip(),
                        "current": round(total_now, 2),
                        "next_palier": float(next_level.get("minGlobal") or 0),
                        "missing": gap,
                    })
            now_id = (level_now or {}).get("id") if level_now else None
            before_id = (level_before or {}).get("id") if level_before else None
            month_global = compute_total_global_ca(month_recap) if month_recap else 0
            if latest and now_id and now_id != before_id and month_global > 0:
                atteints.append({
                    "code_union": code,
                    "raison_sociale": name,
                    "kind": "niveau",
                    "objective": f"Niveau {now_id}",
                    "palier": float((level_now or {}).get("minGlobal") or 0),
                    "current": round(total_now, 2),
                })

        objectives: List[Dict[str, Any]] = []
        for key in GLOBAL_PLATFORMS:
            rfa_tiers, bonus_tiers = _platform_ladders(contract, recap, rules, key)
            if not rfa_tiers and not bonus_tiers:
                continue
            objectives.append({
                "key": key,
                "kind": "plateforme",
                "label": _label(key, rules),
                "ladders": [rfa_tiers, bonus_tiers],
                "ca": float((recap.get("global") or {}).get(key) or 0),
                "ca_before": float((before.get("global") or {}).get(key) or 0),
                "ca_month": float((month_recap.get("global") or {}).get(key) or 0) if month_recap else 0,
            })
        if _tri_enabled(contract, recap):
            for key in get_tri_fields():
                tiers = _tri_ladder(rules, key)
                if not tiers:
                    continue
                objectives.append({
                    "key": key,
                    "kind": "tripartite",
                    "label": _label(key, rules),
                    "ladders": [tiers],
                    "ca": float((recap.get("tri") or {}).get(key) or 0),
                    "ca_before": float((before.get("tri") or {}).get(key) or 0),
                    "ca_month": float((month_recap.get("tri") or {}).get(key) or 0) if month_recap else 0,
                })

        for item in objectives:
            if item["ca"] <= 0:
                continue
            state = _combined(item["ca"], item["ladders"])
            if not state:
                continue
            if state["next_min"] is not None:
                gap = round(float(state["next_min"]) - item["ca"], 2)
                if gap > 0:
                    proches.append({
                        "code_union": code,
                        "raison_sociale": name,
                        "kind": item["kind"],
                        "objective": item["label"],
                        "current": round(item["ca"], 2),
                        "next_palier": float(state["next_min"]),
                        "missing": gap,
                    })
            if latest and item["ca_month"] > 0:
                before_state = _combined(item["ca_before"], item["ladders"]) or {"reached": set()}
                fresh = state["reached"] - before_state["reached"]
                for palier in sorted(fresh):
                    atteints.append({
                        "code_union": code,
                        "raison_sociale": name,
                        "kind": item["kind"],
                        "objective": item["label"],
                        "palier": float(palier),
                        "current": round(item["ca"], 2),
                    })

    proches.sort(key=lambda row: (row["missing"], -row["current"]))
    atteints.sort(key=lambda row: (-row["current"], row["code_union"]))
    return {
        "available": True,
        "basis": "ca_a_date",
        "year": int(year),
        "month": latest,
        "data_source": data_source,
        "proches": proches,
        "atteints": atteints,
    }
