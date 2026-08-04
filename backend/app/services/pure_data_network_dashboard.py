"""
Dashboard réseau V1 — agrégations CA depuis Pure Data (cumulatif / hybride).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from app.services.pure_data_cumulative_supabase import (
    CANONICAL_PLATFORMS,
    normalize_platform,
)
from app.services.pure_data_sales_source import load_evolution_sales_rows


def _pct(delta: float, base: float) -> Optional[float]:
    if not base:
        return None
    return round((delta / base) * 100, 1)


def _norm(s: Optional[str]) -> str:
    return (s or "").strip()


def _filter_rows(
    rows: List[Dict],
    *,
    fournisseur: Optional[str] = None,
    commercial: Optional[str] = None,
    region: Optional[str] = None,
) -> List[Dict]:
    out = rows
    plat = normalize_platform(fournisseur) if fournisseur else None
    if plat:
        out = [r for r in out if normalize_platform(r.get("fournisseur")) == plat]
    if commercial:
        target = commercial.strip().upper()
        out = [r for r in out if _norm(r.get("commercial")).upper() == target]
    if region:
        target = region.strip().upper()
        out = [r for r in out if _norm(r.get("region_commerciale")).upper() == target]
    return out


def _ca(rows: List[Dict], year: int, month: Optional[int] = None) -> float:
    total = 0.0
    for r in rows:
        if r.get("year") != year:
            continue
        if month is not None and r.get("month") != month:
            continue
        try:
            total += float(r.get("ca") or 0.0)
        except (TypeError, ValueError):
            pass
    return round(total, 2)


def build_network_dashboard(
    *,
    year_current: int = 2026,
    year_previous: int = 2025,
    fournisseur: Optional[str] = None,
    commercial: Optional[str] = None,
    region: Optional[str] = None,
    objectif: Optional[float] = None,
    ca_n1_realise: Optional[float] = None,
    platform_months: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    rows, data_source = load_evolution_sales_rows()
    rows = _filter_rows(
        rows,
        fournisseur=fournisseur,
        commercial=commercial,
        region=region,
    )

    if not rows:
        return {
            "available": False,
            "message": "Aucune donnée Pure Data pour le dashboard.",
            "data_source": data_source or "",
            "year_current": year_current,
            "year_previous": year_previous,
        }

    months = sorted({int(r["month"]) for r in rows if r.get("month") is not None})
    months_current = sorted({
        int(r["month"]) for r in rows
        if r.get("year") == year_current and r.get("month") is not None
    })
    reporting_month = max(months_current) if months_current else (max(months) if months else None)

    # Même période : mois présents en N
    period_months = set(months_current) if months_current else set(months)

    ca_ytd = 0.0
    ca_n1_same = 0.0
    for r in rows:
        y = r.get("year")
        m = r.get("month")
        if m is None or m not in period_months:
            # lignes sans mois : compter seulement pour l'année courante / N-1 full
            try:
                ca = float(r.get("ca") or 0.0)
            except (TypeError, ValueError):
                ca = 0.0
            if y == year_current:
                ca_ytd += ca
            elif y == year_previous:
                ca_n1_same += ca
            continue
        try:
            ca = float(r.get("ca") or 0.0)
        except (TypeError, ValueError):
            ca = 0.0
        if y == year_current:
            ca_ytd += ca
        elif y == year_previous:
            ca_n1_same += ca

    ca_ytd = round(ca_ytd, 2)
    ca_n1_same = round(ca_n1_same, 2)
    delta = round(ca_ytd - ca_n1_same, 2)
    delta_pct = _pct(delta, ca_n1_same)

    # Projection : saisonnalité N-1 si CA réalisé N-1 annuel dispo, sinon linéaire
    projection = None
    projection_method = None
    if ca_n1_same > 0 and ca_n1_realise and ca_n1_realise > 0:
        projection = round(float(ca_n1_realise) * (ca_ytd / ca_n1_same), 2)
        projection_method = "saisonnalité N-1"
    elif reporting_month and 1 <= reporting_month <= 12 and ca_ytd:
        if reporting_month < 12:
            projection = round(ca_ytd * (12.0 / reporting_month), 2)
            projection_method = "rythme linéaire"
        else:
            projection = ca_ytd
            projection_method = "année complète"

    objectif_val = float(objectif) if objectif else None
    objectif_pct = round((ca_ytd / objectif_val) * 100, 1) if objectif_val else None
    projection_pct = (
        round((projection / objectif_val) * 100, 1)
        if projection is not None and objectif_val
        else None
    )

    clients = set()
    marques = set()
    familles = set()
    for r in rows:
        if r.get("year") not in (year_current, year_previous):
            continue
        code = _norm(r.get("code_union")).upper()
        if code:
            clients.add(code)
        mq = _norm(r.get("marque")).upper()
        if mq and mq not in ("—", "-", "N/A"):
            marques.add(mq)
        fa = _norm(r.get("famille")).upper()
        if fa:
            familles.add(fa)

    monthly = []
    for m in (months or list(range(1, 13))):
        cur = _ca(rows, year_current, m)
        prev = _ca(rows, year_previous, m)
        d = round(cur - prev, 2)
        monthly.append({
            "month": m,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
        })

    # Plateformes
    plat_cur: Dict[str, float] = defaultdict(float)
    plat_prev: Dict[str, float] = defaultdict(float)
    plat_clients: Dict[str, set] = defaultdict(set)
    plat_marques: Dict[str, set] = defaultdict(set)
    for r in rows:
        p = normalize_platform(r.get("fournisseur"))
        if not p:
            continue
        y = r.get("year")
        m = r.get("month")
        try:
            ca = float(r.get("ca") or 0.0)
        except (TypeError, ValueError):
            ca = 0.0
        code = _norm(r.get("code_union")).upper()
        mq = _norm(r.get("marque")).upper()
        if y == year_current and (m is None or m in period_months):
            plat_cur[p] += ca
            if code:
                plat_clients[p].add(code)
            if mq:
                plat_marques[p].add(mq)
        elif y == year_previous and (m is None or m in period_months):
            plat_prev[p] += ca

    platforms = []
    for p in CANONICAL_PLATFORMS:
        cur = round(plat_cur.get(p, 0.0), 2)
        prev = round(plat_prev.get(p, 0.0), 2)
        d = round(cur - prev, 2)
        platforms.append({
            "platform": p,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
            "share_pct": round((cur / ca_ytd) * 100, 1) if ca_ytd else None,
            "nb_clients": len(plat_clients.get(p, set())),
            "nb_marques": len(plat_marques.get(p, set())),
            "reporting_month": (platform_months or {}).get(p),
        })
    platforms = [p for p in platforms if p["current"] or p["previous"]]

    # Top marques / familles (année courante, période)
    mq_cur: Dict[str, float] = defaultdict(float)
    mq_prev: Dict[str, float] = defaultdict(float)
    fa_cur: Dict[str, float] = defaultdict(float)
    fa_prev: Dict[str, float] = defaultdict(float)
    cli_cur: Dict[str, float] = defaultdict(float)
    cli_prev: Dict[str, float] = defaultdict(float)
    cli_name: Dict[str, str] = {}

    for r in rows:
        y = r.get("year")
        m = r.get("month")
        if m is not None and m not in period_months:
            continue
        try:
            ca = float(r.get("ca") or 0.0)
        except (TypeError, ValueError):
            ca = 0.0
        mq = _norm(r.get("marque")) or "—"
        fa = _norm(r.get("famille")) or "—"
        code = _norm(r.get("code_union")).upper() or "—"
        if y == year_current:
            mq_cur[mq] += ca
            fa_cur[fa] += ca
            if code != "—":
                cli_cur[code] += ca
                if not cli_name.get(code):
                    cli_name[code] = _norm(r.get("raison_sociale")) or code
        elif y == year_previous:
            mq_prev[mq] += ca
            fa_prev[fa] += ca
            if code != "—":
                cli_prev[code] += ca
                if not cli_name.get(code):
                    cli_name[code] = _norm(r.get("raison_sociale")) or code

    def _top_items(cur_map, prev_map, limit=8):
        keys = set(cur_map) | set(prev_map)
        items = []
        for k in keys:
            if k in ("—", "", "-"):
                continue
            cur = round(cur_map.get(k, 0.0), 2)
            prev = round(prev_map.get(k, 0.0), 2)
            d = round(cur - prev, 2)
            items.append({
                "key": k,
                "current": cur,
                "previous": prev,
                "delta": d,
                "delta_pct": _pct(d, prev),
            })
        items.sort(key=lambda x: x["current"], reverse=True)
        return items[:limit]

    top_clients = []
    for code in set(cli_cur) | set(cli_prev):
        cur = round(cli_cur.get(code, 0.0), 2)
        prev = round(cli_prev.get(code, 0.0), 2)
        d = round(cur - prev, 2)
        top_clients.append({
            "code_union": code,
            "raison_sociale": cli_name.get(code) or code,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
        })
    top_up = sorted(top_clients, key=lambda x: x["delta"], reverse=True)[:8]
    top_down = sorted(top_clients, key=lambda x: x["delta"])[:8]

    return {
        "available": True,
        "data_source": data_source,
        "year_current": year_current,
        "year_previous": year_previous,
        "reporting_month": reporting_month,
        "platform_months": platform_months or {},
        "filters": {
            "fournisseur": fournisseur,
            "commercial": commercial,
            "region": region,
        },
        "kpis": {
            "ca_ytd": ca_ytd,
            "ca_n1_same_period": ca_n1_same,
            "delta": delta,
            "delta_pct": delta_pct,
            "nb_clients": len(clients),
            "nb_marques": len(marques),
            "nb_familles": len(familles),
            "objectif": objectif_val,
            "objectif_pct": objectif_pct,
            "projection": projection,
            "projection_pct": projection_pct,
            "projection_method": projection_method,
            "ca_n1_realise": ca_n1_realise,
        },
        "months": monthly,
        "platforms": platforms,
        "top_marques": _top_items(mq_cur, mq_prev),
        "top_familles": _top_items(fa_cur, fa_prev),
        "top_clients_up": top_up,
        "top_clients_down": top_down,
    }
