"""
Source unique pour les vues d'evolution mensuelle / dashboard.

Par plateforme :
1. Import detaille (meta) → pure_data_cumulative
2. Cumulatif avec >= 2 mois distincts → cumulative
3. Cumulatif seul (pas de mensuel pour cette plateforme) → cumulative
4. Sinon → pure_data_monthly
5. Dernier recours → cumulative même mono-mois
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Dict, List, Set, Tuple

from app.services.pure_data_cumulative_supabase import (
    CANONICAL_PLATFORMS,
    count_cumulative_rows,
    normalize_platform,
    read_cumulative_rows,
)
from app.services.pure_data_monthly_supabase import count_monthly_rows, read_monthly_rows

PLATFORMS_META_KEY = "pure_data_cumulative_platforms"


def _platforms_from_meta() -> Set[str]:
    try:
        from sqlmodel import Session, select
        from app.database import engine
        from app.models import AppSettings

        with Session(engine) as session:
            st = session.exec(
                select(AppSettings).where(AppSettings.key == PLATFORMS_META_KEY)
            ).first()
            if not st or not st.value:
                return set()
            data = json.loads(st.value)
            if not isinstance(data, dict):
                return set()
            out = set()
            for key, info in data.items():
                p = normalize_platform(key)
                if p and isinstance(info, dict) and info.get("updated_at"):
                    out.add(p)
            return out
    except Exception as exc:
        print(f"[SALES_SOURCE] meta platforms indisponible: {exc}")
        return set()


def _platforms_with_month_grain(rows: List[Dict]) -> Set[str]:
    by_plat: Dict[str, set] = defaultdict(set)
    for r in rows:
        p = normalize_platform(r.get("fournisseur"))
        m = r.get("month")
        if p and m is not None:
            try:
                by_plat[p].add(int(m))
            except (TypeError, ValueError):
                pass
    return {p for p, months in by_plat.items() if len(months) >= 2}


def _group_by_platform(rows: List[Dict]) -> Dict[str, List[Dict]]:
    out: Dict[str, List[Dict]] = defaultdict(list)
    for r in rows:
        p = normalize_platform(r.get("fournisseur"))
        if p in CANONICAL_PLATFORMS:
            out[p].append(r)
    return out


def load_evolution_sales_rows() -> Tuple[List[Dict], str]:
    """
    Retourne (rows, source) pour Hub / evolution / dashboard.
    source: cumulative | monthly | hybrid | ""
    """
    cum_rows: List[Dict] = []
    if count_cumulative_rows() > 0:
        cum_rows, _, _ = read_cumulative_rows()

    mon_rows: List[Dict] = []
    if count_monthly_rows() > 0:
        mon_rows, _, _ = read_monthly_rows()

    if not cum_rows and not mon_rows:
        return [], ""
    if not cum_rows:
        return mon_rows, "monthly"
    if not mon_rows:
        return cum_rows, "cumulative"

    meta = {p for p in _platforms_from_meta() if p in CANONICAL_PLATFORMS}
    multi = {p for p in _platforms_with_month_grain(cum_rows) if p in CANONICAL_PLATFORMS}
    cum_by = _group_by_platform(cum_rows)
    mon_by = _group_by_platform(mon_rows)

    out: List[Dict] = []
    used_cum = False
    used_mon = False

    for p in CANONICAL_PLATFORMS:
        cum_p = cum_by.get(p) or []
        mon_p = mon_by.get(p) or []
        if not cum_p and not mon_p:
            continue

        # Prefer detailed cumulative when imported or multi-month.
        if cum_p and (p in meta or p in multi):
            out.extend(cum_p)
            used_cum = True
            continue
        # Cumulative is the only source for this platform.
        if cum_p and not mon_p:
            out.extend(cum_p)
            used_cum = True
            continue
        # Monthly available and cum is weak (single-month / not meta) → monthly.
        if mon_p:
            out.extend(mon_p)
            used_mon = True
            continue
        out.extend(cum_p)
        used_cum = True

    if used_cum and used_mon:
        return out, "hybrid"
    if used_cum:
        return out, "cumulative"
    if used_mon:
        return out, "monthly"
    return [], ""
