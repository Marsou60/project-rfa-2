"""
Dashboard réseau — agrégations CA depuis Pure Data (cumulatif / hybride).
V2 : alertes, cross-plateformes, classements par dimension.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

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


def _in_period(m: Any, period_months: Set[int]) -> bool:
    if m is None:
        return True
    try:
        return int(m) in period_months
    except (TypeError, ValueError):
        return False


def _rank_items(
    cur_map: Dict[str, float],
    prev_map: Dict[str, float],
    *,
    limit: Optional[int] = None,
    extra: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    keys = set(cur_map) | set(prev_map)
    items = []
    for k in keys:
        if k in ("—", "", "-", "N/A"):
            continue
        cur = round(cur_map.get(k, 0.0), 2)
        prev = round(prev_map.get(k, 0.0), 2)
        d = round(cur - prev, 2)
        row = {
            "key": k,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
        }
        if extra and k in extra:
            row.update(extra[k])
        items.append(row)
    items.sort(key=lambda x: x["current"], reverse=True)
    if limit is not None:
        return items[:limit]
    return items


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
    alert_pct: float = 15.0,
    alert_ca_min: float = 5000.0,
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
    period_months = set(months_current) if months_current else set(months)

    ca_ytd = 0.0
    ca_n1_same = 0.0
    for r in rows:
        y = r.get("year")
        m = r.get("month")
        if not _in_period(m, period_months) and m is not None:
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

    monthly = []
    best_month = None
    best_month_ca = 0.0
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
        if cur > best_month_ca:
            best_month_ca = cur
            best_month = m

    # Aggregations
    plat_cur: Dict[str, float] = defaultdict(float)
    plat_prev: Dict[str, float] = defaultdict(float)
    plat_clients: Dict[str, Set[str]] = defaultdict(set)
    plat_marques: Dict[str, Set[str]] = defaultdict(set)

    mq_cur: Dict[str, float] = defaultdict(float)
    mq_prev: Dict[str, float] = defaultdict(float)
    fa_cur: Dict[str, float] = defaultdict(float)
    fa_prev: Dict[str, float] = defaultdict(float)
    sf_cur: Dict[str, float] = defaultdict(float)
    sf_prev: Dict[str, float] = defaultdict(float)
    cli_cur: Dict[str, float] = defaultdict(float)
    cli_prev: Dict[str, float] = defaultdict(float)
    cli_name: Dict[str, str] = {}
    cli_plats: Dict[str, Set[str]] = defaultdict(set)
    cli_plat_ca: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    grp_cur: Dict[str, float] = defaultdict(float)
    grp_prev: Dict[str, float] = defaultdict(float)
    comm_cur: Dict[str, float] = defaultdict(float)
    comm_prev: Dict[str, float] = defaultdict(float)
    reg_cur: Dict[str, float] = defaultdict(float)
    reg_prev: Dict[str, float] = defaultdict(float)

    mq_buyers_cur: Dict[str, Set[str]] = defaultdict(set)
    mq_buyers_prev: Dict[str, Set[str]] = defaultdict(set)
    codes_cur: Set[str] = set()
    codes_prev: Set[str] = set()
    marques_set: Set[str] = set()
    familles_set: Set[str] = set()

    for r in rows:
        y = r.get("year")
        m = r.get("month")
        if not _in_period(m, period_months) and m is not None:
            continue
        try:
            ca = float(r.get("ca") or 0.0)
        except (TypeError, ValueError):
            ca = 0.0
        if not ca and y not in (year_current, year_previous):
            continue

        p = normalize_platform(r.get("fournisseur"))
        code = _norm(r.get("code_union")).upper()
        mq = _norm(r.get("marque")) or "—"
        fa = _norm(r.get("famille")) or "—"
        sf = _norm(r.get("sous_famille")) or "—"
        grp = _norm(r.get("groupe_client")) or "—"
        comm = _norm(r.get("commercial")) or "—"
        reg = _norm(r.get("region_commerciale")) or "—"
        name = _norm(r.get("raison_sociale"))

        if y == year_current:
            if p:
                plat_cur[p] += ca
                if code:
                    plat_clients[p].add(code)
                    cli_plats[code].add(p)
                    cli_plat_ca[code][p] += ca
                if mq not in ("—",):
                    plat_marques[p].add(mq.upper())
            mq_cur[mq] += ca
            fa_cur[fa] += ca
            sf_cur[sf] += ca
            if code:
                cli_cur[code] += ca
                codes_cur.add(code)
                if name and not cli_name.get(code):
                    cli_name[code] = name
                if mq not in ("—",):
                    mq_buyers_cur[mq].add(code)
            grp_cur[grp] += ca
            comm_cur[comm] += ca
            reg_cur[reg] += ca
            if mq not in ("—", "-", "N/A"):
                marques_set.add(mq.upper())
            if fa not in ("—",):
                familles_set.add(fa.upper())
        elif y == year_previous:
            if p:
                plat_prev[p] += ca
            mq_prev[mq] += ca
            fa_prev[fa] += ca
            sf_prev[sf] += ca
            if code:
                cli_prev[code] += ca
                codes_prev.add(code)
                if name and not cli_name.get(code):
                    cli_name[code] = name
                if mq not in ("—",):
                    mq_buyers_prev[mq].add(code)
            grp_prev[grp] += ca
            comm_prev[comm] += ca
            reg_prev[reg] += ca
            if mq not in ("—", "-", "N/A"):
                marques_set.add(mq.upper())
            if fa not in ("—",):
                familles_set.add(fa.upper())

    platforms = []
    for p in CANONICAL_PLATFORMS:
        cur = round(plat_cur.get(p, 0.0), 2)
        prev = round(plat_prev.get(p, 0.0), 2)
        d = round(cur - prev, 2)
        n_cli = len(plat_clients.get(p, set()))
        platforms.append({
            "platform": p,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
            "share_pct": round((cur / ca_ytd) * 100, 1) if ca_ytd else None,
            "nb_clients": n_cli,
            "nb_marques": len(plat_marques.get(p, set())),
            "panier_moyen": round(cur / n_cli, 2) if n_cli else None,
            "reporting_month": (platform_months or {}).get(p),
        })
    platforms = [p for p in platforms if p["current"] or p["previous"]]
    platforms = sorted(platforms, key=lambda x: x["current"], reverse=True)
    platforms_sorted = platforms
    star = None
    for p in platforms_sorted:
        if p.get("delta_pct") is not None:
            if star is None or (p["delta_pct"] or -999) > (star.get("delta_pct") or -999):
                star = p

    top_marques = _rank_items(mq_cur, mq_prev, limit=8)
    top_familles = _rank_items(fa_cur, fa_prev, limit=8)
    marques = _rank_items(mq_cur, mq_prev, limit=40)
    familles = _rank_items(fa_cur, fa_prev, limit=40)
    sous_familles = _rank_items(sf_cur, sf_prev, limit=40)
    groupes = _rank_items(grp_cur, grp_prev, limit=40)
    commerciaux = _rank_items(comm_cur, comm_prev, limit=40)
    regions = _rank_items(reg_cur, reg_prev, limit=40)

    clients_all = []
    for code in set(cli_cur) | set(cli_prev):
        cur = round(cli_cur.get(code, 0.0), 2)
        prev = round(cli_prev.get(code, 0.0), 2)
        d = round(cur - prev, 2)
        plats = sorted(cli_plats.get(code, set()))
        per = {pp: round(cli_plat_ca[code].get(pp, 0.0), 2) for pp in CANONICAL_PLATFORMS}
        clients_all.append({
            "code_union": code,
            "key": cli_name.get(code) or code,
            "raison_sociale": cli_name.get(code) or code,
            "current": cur,
            "previous": prev,
            "delta": d,
            "delta_pct": _pct(d, prev),
            "n_platforms": len(plats),
            "platforms": plats,
            "per_platform": per,
        })
    clients_all.sort(key=lambda x: x["current"], reverse=True)
    top_up = sorted(clients_all, key=lambda x: x["delta"], reverse=True)[:8]
    top_down = sorted(clients_all, key=lambda x: x["delta"])[:8]
    clients = clients_all[:50]

    # --- Alertes ---
    thr = float(alert_pct or 15.0)
    ca_min = float(alert_ca_min or 5000.0)

    def _alert_row(key, cur, prev, **extra):
        d = round(cur - prev, 2)
        return {
            "key": key,
            "current": round(cur, 2),
            "previous": round(prev, 2),
            "delta": d,
            "delta_pct": _pct(d, prev),
            **extra,
        }

    cli_risque = []
    cli_perdus = []
    cli_boom = []
    cli_new = []
    for c in clients_all:
        cur, prev = c["current"], c["previous"]
        pct = c["delta_pct"]
        if prev >= ca_min and pct is not None and pct <= -thr:
            cli_risque.append(_alert_row(c["raison_sociale"], cur, prev, code_union=c["code_union"]))
        if prev > 0 and cur == 0:
            cli_perdus.append(_alert_row(c["raison_sociale"], cur, prev, code_union=c["code_union"]))
        if prev >= ca_min and pct is not None and pct >= thr:
            cli_boom.append(_alert_row(c["raison_sociale"], cur, prev, code_union=c["code_union"]))
        if prev == 0 and cur >= ca_min:
            cli_new.append(_alert_row(c["raison_sociale"], cur, prev, code_union=c["code_union"], tag="new"))

    cli_risque.sort(key=lambda x: x["delta"])
    cli_perdus.sort(key=lambda x: -x["previous"])
    cli_boom.sort(key=lambda x: -x["delta"])
    cli_new.sort(key=lambda x: -x["current"])

    mar_risque = []
    mar_perdues = []
    mar_boom = []
    mar_acheteurs = []
    for mq in set(mq_cur) | set(mq_prev):
        if mq in ("—", "", "-"):
            continue
        cur = mq_cur.get(mq, 0.0)
        prev = mq_prev.get(mq, 0.0)
        pct = _pct(cur - prev, prev)
        if prev >= ca_min and pct is not None and pct <= -thr:
            mar_risque.append(_alert_row(mq, cur, prev))
        if prev > 0 and cur == 0:
            mar_perdues.append(_alert_row(mq, cur, prev))
        if prev >= ca_min and pct is not None and pct >= thr:
            mar_boom.append(_alert_row(mq, cur, prev))
        bc = len(mq_buyers_cur.get(mq, set()))
        bp = len(mq_buyers_prev.get(mq, set()))
        if bp >= 3 and bp > 0 and ((bc - bp) / bp) * 100 <= -20:
            mar_acheteurs.append({
                "key": mq,
                "buyers_current": bc,
                "buyers_previous": bp,
                "buyers_delta": bc - bp,
                "current": round(cur, 2),
                "previous": round(prev, 2),
                "delta": round(cur - prev, 2),
                "delta_pct": pct,
            })

    mar_risque.sort(key=lambda x: x["delta"])
    mar_perdues.sort(key=lambda x: -x["previous"])
    mar_boom.sort(key=lambda x: -x["delta"])
    mar_acheteurs.sort(key=lambda x: x["buyers_delta"])

    ca_risque = round(sum(abs(x["delta"]) for x in cli_risque), 2)
    ca_perdu = round(sum(x["previous"] for x in cli_perdus), 2)
    ca_oppo = round(
        sum(x["delta"] for x in cli_boom) + sum(x["current"] for x in cli_new),
        2,
    )
    n_crit = len(cli_risque) + len(cli_perdus) + len(mar_risque) + len(mar_perdues)

    alertes = {
        "cfg": {"pct": thr, "ca_min": ca_min},
        "ca_risque": ca_risque,
        "ca_perdu": ca_perdu,
        "ca_opportunites": ca_oppo,
        "n_crit": n_crit,
        "clients_risque": cli_risque[:25],
        "clients_perdus": cli_perdus[:25],
        "clients_boom": cli_boom[:25],
        "clients_new": cli_new[:25],
        "marques_risque": mar_risque[:25],
        "marques_perdues": mar_perdues[:25],
        "marques_boom": mar_boom[:25],
        "marques_acheteurs": mar_acheteurs[:25],
    }

    # --- Cross plateformes ---
    n_plat = len([p for p in platforms if p["current"] > 0]) or len(CANONICAL_PLATFORMS)
    dist_count = defaultdict(int)
    dist_ca = defaultdict(float)
    mono_list = []
    loyal_list = []
    for c in clients_all:
        if c["current"] <= 0 and c["previous"] <= 0:
            continue
        n = c["n_platforms"]
        if c["current"] > 0:
            dist_count[n] += 1
            dist_ca[n] += c["current"]
            if n == 1:
                plat = c["platforms"][0] if c["platforms"] else "—"
                mono_list.append({
                    "code_union": c["code_union"],
                    "raison_sociale": c["raison_sociale"],
                    "platform": plat,
                    "current": c["current"],
                })
            if n_plat and n >= n_plat:
                loyal_list.append({
                    "code_union": c["code_union"],
                    "raison_sociale": c["raison_sociale"],
                    "n_platforms": n,
                    "current": c["current"],
                })
    mono_list.sort(key=lambda x: -x["current"])
    loyal_list.sort(key=lambda x: -x["current"])
    active_adh = sum(dist_count.values())
    relations = sum(n * dist_count[n] for n in dist_count)
    avg_p = (relations / active_adh) if active_adh else 0.0
    distribution = [
        {"n": i, "count": dist_count.get(i, 0), "ca": round(dist_ca.get(i, 0.0), 2)}
        for i in range(1, max(n_plat, 1) + 1)
    ]

    cross = {
        "n_platforms": n_plat,
        "mono": dist_count.get(1, 0),
        "mono_ca": round(dist_ca.get(1, 0.0), 2),
        "loyal": dist_count.get(n_plat, 0) if n_plat else 0,
        "loyal_ca": round(dist_ca.get(n_plat, 0.0), 2) if n_plat else 0.0,
        "avg_platforms": round(avg_p, 2),
        "relations": relations,
        "distribution": distribution,
        "mono_targets": mono_list[:15],
        "loyal_clients": loyal_list[:15],
    }

    n_clients_ytd = len(codes_cur) or len(codes_cur | codes_prev)
    panier = round(ca_ytd / n_clients_ytd, 2) if n_clients_ytd else None
    n_new = len(codes_cur - codes_prev)
    n_lost = len(codes_prev - codes_cur)
    top10_share = None
    if ca_ytd and clients_all:
        top10_ca = sum(c["current"] for c in clients_all[:10])
        top10_share = round((top10_ca / ca_ytd) * 100, 1)

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
            "nb_clients": n_clients_ytd,
            "nb_marques": len(marques_set),
            "nb_familles": len(familles_set),
            "objectif": objectif_val,
            "objectif_pct": objectif_pct,
            "projection": projection,
            "projection_pct": projection_pct,
            "projection_method": projection_method,
            "ca_n1_realise": ca_n1_realise,
            "best_month": best_month,
            "best_month_ca": round(best_month_ca, 2),
            "panier_moyen": panier,
            "nb_clients_new": n_new,
            "nb_clients_lost": n_lost,
            "top10_share_pct": top10_share,
            "platform_star": star["platform"] if star else None,
            "platform_star_pct": star.get("delta_pct") if star else None,
            "platform_leader": platforms_sorted[0]["platform"] if platforms_sorted else None,
        },
        "months": monthly,
        "platforms": platforms,
        "top_marques": top_marques,
        "top_familles": top_familles,
        "top_clients_up": top_up,
        "top_clients_down": top_down,
        "marques": marques,
        "familles": familles,
        "sous_familles": sous_familles,
        "clients": clients,
        "groupes": groupes,
        "commerciaux": commerciaux,
        "regions": regions,
        "alertes": alertes,
        "cross": cross,
    }
