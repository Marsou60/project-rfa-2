"""
Annuaire unifié : clients/groupes RFA 2025 + Pure Data (mensuel + cumulé).

Les entités présentes uniquement dans Pure Data sont injectées comme stubs
(CA/RFA 2025 à 0) pour les listes et la recherche, sans polluer le récap 2025
(filtrées via le flag from_pure_data).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.fields import EXCLUDED_GROUPS, get_global_fields, get_tri_fields
from app.storage import ImportData


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _ingest_rows(
    rows: List[Dict],
    clients: Dict[str, Dict[str, Any]],
    groups: Dict[str, Dict[str, Any]],
) -> None:
    for r in rows or []:
        code = _norm(r.get("code_union"))
        if not code:
            continue
        nom = (r.get("raison_sociale") or r.get("nom_client") or "").strip()
        groupe = _norm(r.get("groupe_client"))
        if groupe in EXCLUDED_GROUPS:
            # Membres des groupes fictifs : traités comme indépendants (groupe vide pour consolidation)
            groupe_for_client = groupe  # on conserve le libellé pour l'affichage
            consolidate = False
        else:
            groupe_for_client = groupe
            consolidate = bool(groupe) and groupe != "SANS GROUPE"

        existing = clients.get(code)
        if not existing:
            clients[code] = {
                "code_union": code,
                "nom_client": nom or None,
                "groupe_client": groupe_for_client,
            }
        else:
            if nom and not existing.get("nom_client"):
                existing["nom_client"] = nom
            if groupe_for_client and not existing.get("groupe_client"):
                existing["groupe_client"] = groupe_for_client

        if consolidate:
            g = groups.setdefault(
                groupe,
                {"groupe_client": groupe, "codes": set()},
            )
            g["codes"].add(code)


def collect_pure_data_entities() -> Dict[str, Any]:
    """
    Collecte clients/groupes depuis Pure Data mensuel + cumulé.
    Retourne {"clients": {code: {...}}, "groups": {groupe: {...}}}.
    """
    clients: Dict[str, Dict[str, Any]] = {}
    groups: Dict[str, Dict[str, Any]] = {}

    try:
        from app.services.pure_data_monthly_supabase import read_monthly_rows, count_monthly_rows
        if count_monthly_rows() > 0:
            rows, _, _ = read_monthly_rows()
            _ingest_rows(rows, clients, groups)
    except Exception as e:
        print(f"[ENTITY_DIR] Lecture mensuel ignorée: {e}")

    try:
        from app.services.pure_data_cumulative_supabase import read_cumulative_rows, count_cumulative_rows
        if count_cumulative_rows() > 0:
            rows, _, _ = read_cumulative_rows()
            _ingest_rows(rows, clients, groups)
    except Exception as e:
        print(f"[ENTITY_DIR] Lecture cumulé ignorée: {e}")

    # Normaliser les sets de codes en listes triées
    groups_out: Dict[str, Dict[str, Any]] = {}
    for gname, gdata in groups.items():
        codes = sorted(gdata.get("codes") or [])
        groups_out[gname] = {
            "groupe_client": gname,
            "codes_union": codes,
            "nb_comptes": len(codes),
        }

    return {"clients": clients, "groups": groups_out}


def _empty_ca_maps() -> Tuple[Dict[str, float], Dict[str, float]]:
    return (
        {key: 0.0 for key in get_global_fields()},
        {key: 0.0 for key in get_tri_fields()},
    )


def merge_entities_into_import(import_data: ImportData) -> ImportData:
    """
    Injecte dans import_data.by_client / by_group les entités Pure Data absentes
    (stubs CA=0, from_pure_data=True). Idempotent.
    """
    if import_data is None:
        return import_data

    if not import_data.by_client and not import_data.by_group and import_data.data:
        from app.services.compute import compute_aggregations
        try:
            compute_aggregations(import_data)
        except Exception:
            pass

    pd = collect_pure_data_entities()
    global_empty, tri_empty = _empty_ca_maps()

    for code, meta in (pd.get("clients") or {}).items():
        if code in import_data.by_client:
            continue
        import_data.by_client[code] = {
            "code_union": code,
            "nom_client": meta.get("nom_client"),
            "groupe_client": meta.get("groupe_client") or "",
            "global": dict(global_empty),
            "tri": dict(tri_empty),
            "global_total": 0.0,
            "tri_total": 0.0,
            "grand_total": 0.0,
            "from_pure_data": True,
        }

    for gname, meta in (pd.get("groups") or {}).items():
        if gname in import_data.by_group:
            continue
        if gname in EXCLUDED_GROUPS or gname == "SANS GROUPE":
            continue
        codes = list(meta.get("codes_union") or [])
        import_data.by_group[gname] = {
            "groupe_client": gname,
            "nb_comptes": meta.get("nb_comptes") or len(codes),
            "codes_union": codes,
            "global": dict(global_empty),
            "tri": dict(tri_empty),
            "global_total": 0.0,
            "tri_total": 0.0,
            "grand_total": 0.0,
            "from_pure_data": True,
        }

    return import_data


def is_pure_data_only(entity_data: Optional[Dict]) -> bool:
    return bool(entity_data and entity_data.get("from_pure_data"))


def filter_rows_for_entity(
    rows: List[Dict],
    *,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    year: Optional[int] = None,
) -> List[Dict]:
    """Filtre des lignes Pure Data pour une entité (code ou groupe), année optionnelle."""
    from app.services.pure_data_cumulative_service import _norm_text, _code_union_candidates

    out = rows or []
    if year is not None:
        out = [r for r in out if r.get("year") == year]
    if code_union:
        targets = _code_union_candidates(code_union)
        return [r for r in out if _norm_text(r.get("code_union")) in targets]
    if groupe_client:
        target = _norm_text(groupe_client)
        return [r for r in out if _norm_text(r.get("groupe_client")) == target]
    return out


def load_pure_data_rows_for_entity(
    *,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    year: Optional[int] = None,
) -> Tuple[List[Dict], str]:
    """
    Charge les lignes pour une entité : cumulé d'abord, sinon mensuel.
    Retourne (rows, source) avec source in {"cumulative", "monthly", ""}.
    """
    try:
        from app.services.pure_data_cumulative_supabase import read_cumulative_rows, count_cumulative_rows
        if count_cumulative_rows() > 0:
            all_rows, _, _ = read_cumulative_rows()
            filtered = filter_rows_for_entity(
                all_rows, code_union=code_union, groupe_client=groupe_client, year=year
            )
            if filtered:
                return filtered, "cumulative"
    except Exception as e:
        print(f"[ENTITY_DIR] Cumulé indisponible: {e}")

    try:
        from app.services.pure_data_monthly_supabase import read_monthly_rows, count_monthly_rows
        if count_monthly_rows() > 0:
            all_rows, _, _ = read_monthly_rows()
            filtered = filter_rows_for_entity(
                all_rows, code_union=code_union, groupe_client=groupe_client, year=year
            )
            if filtered:
                return filtered, "monthly"
    except Exception as e:
        print(f"[ENTITY_DIR] Mensuel indisponible: {e}")

    return [], ""


def merge_network_payloads(base: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    """Fusionne un payload network-rfa (extra) dans base — anti double-compte par code."""
    if not extra or not extra.get("available"):
        return base
    if not base or not base.get("available"):
        return extra

    existing_indep = {(e.get("code") or "").strip().upper() for e in (base.get("independents") or [])}
    existing_groups = {(e.get("code") or "").strip().upper() for e in (base.get("groups") or [])}

    added_indep = [
        e for e in (extra.get("independents") or [])
        if (e.get("code") or "").strip().upper() not in existing_indep
    ]
    added_groups = [
        e for e in (extra.get("groups") or [])
        if (e.get("code") or "").strip().upper() not in existing_groups
    ]
    if not added_indep and not added_groups:
        return base

    out = dict(base)
    out["independents"] = list(base.get("independents") or []) + added_indep
    out["groups"] = list(base.get("groups") or []) + added_groups
    out["independents"].sort(key=lambda r: r.get("rfa_ytd") or 0, reverse=True)
    out["groups"].sort(key=lambda r: r.get("rfa_ytd") or 0, reverse=True)

    all_entities = out["independents"] + out["groups"]
    out["ytd"] = {
        "grand_total": round(sum(float(e.get("rfa_ytd") or 0) for e in all_entities), 2),
        "total_global": round(sum(float(e.get("rfa_ytd_global") or 0) for e in all_entities), 2),
        "total_tri": round(sum(float(e.get("rfa_ytd_tri") or 0) for e in all_entities), 2),
        "by_platform": (base.get("ytd") or {}).get("by_platform") or {},
    }
    if base.get("projected") is not None or extra.get("projected") is not None:
        out["projected"] = {
            "grand_total": round(sum(float(e.get("rfa_proj") or e.get("rfa_ytd") or 0) for e in all_entities), 2),
            "total_global": round(sum(float(e.get("rfa_proj_global") or e.get("rfa_ytd_global") or 0) for e in all_entities), 2),
            "total_tri": round(sum(float(e.get("rfa_proj_tri") or e.get("rfa_ytd_tri") or 0) for e in all_entities), 2),
            "by_platform": (base.get("projected") or {}).get("by_platform") or {},
        }

    out["counts"] = {
        "independents": len(out["independents"]),
        "groups": len(out["groups"]),
        "entities": len(out["independents"]) + len(out["groups"]),
    }
    sources = set(filter(None, [base.get("data_source"), extra.get("data_source")]))
    out["data_source"] = "+".join(sorted(sources)) if sources else "merged"
    return out
