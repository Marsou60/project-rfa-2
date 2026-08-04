"""
Source unique pour les vues d'evolution mensuelle.

Priorite :
1. Plateformes importees via le nouvel import detaille (meta platforms)
   OU plateformes avec >= 2 mois distincts dans pure_data_cumulative
2. Compléter avec pure_data_monthly pour les autres plateformes
3. Sinon monthly seul, sinon cumulative seul

Ainsi : apres import EXADIS jan→juil, Hub / Chiffres mensuels utilisent EXADIS
cumulatif + ACR/DCA/ALLIANCE encore sur le mensuel, sans double comptage.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

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


def load_evolution_sales_rows() -> Tuple[List[Dict], str]:
    """
    Retourne (rows, source) pour Hub / evolution / chiffres mensuels client.
    source: cumulative | monthly | hybrid | ""
    """
    cum_rows: List[Dict] = []
    if count_cumulative_rows() > 0:
        cum_rows, _, _ = read_cumulative_rows()

    mon_rows: List[Dict] = []
    if count_monthly_rows() > 0:
        mon_rows, _, _ = read_monthly_rows()

    preferred = _platforms_from_meta() | _platforms_with_month_grain(cum_rows)
    # Ne garder que les plateformes canoniques
    preferred = {p for p in preferred if p in CANONICAL_PLATFORMS}

    if preferred and cum_rows:
        out = [
            r for r in cum_rows
            if normalize_platform(r.get("fournisseur")) in preferred
        ]
        if mon_rows:
            for r in mon_rows:
                p = normalize_platform(r.get("fournisseur"))
                if not p or p not in preferred:
                    out.append(r)
            return out, "hybrid"
        return out, "cumulative"

    if mon_rows:
        return mon_rows, "monthly"
    if cum_rows:
        return cum_rows, "cumulative"
    return [], ""
