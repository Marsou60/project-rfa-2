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
from typing import Dict, List, Optional, Set, Tuple

from app.database import engine, lease_session
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

        with lease_session(engine) as session:
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


def _choose_platform_source(platform: str, *, meta: Set[str], multi: Set[str], has_cum: bool, has_mon: bool) -> Optional[str]:
    """Même ordre de décision que load_evolution_sales_rows."""
    if not has_cum and not has_mon:
        return None
    if has_cum and (platform in meta or platform in multi):
        return "cumulative"
    if has_cum and not has_mon:
        return "cumulative"
    if has_mon:
        return "monthly"
    return "cumulative"


def _presence_by_platform(table: str, bind) -> Tuple[Set[str], Dict[str, Set[int]]]:
    """Plateformes présentes et mois distincts, sans charger le détail."""
    from sqlalchemy import text
    from app.database import lease_connection
    from app.services.pure_data_cumulative_supabase import _norm_month

    present: Set[str] = set()
    months: Dict[str, Set[int]] = defaultdict(set)
    sql = text(f'SELECT "fournisseur", "mois" FROM "{table}" GROUP BY 1, 2')
    try:
        with lease_connection(bind) as conn:
            fetched = conn.execute(sql).fetchall()
    except Exception:
        return present, months
    for frs, mois in fetched:
        platform = normalize_platform(frs)
        if not platform:
            continue
        present.add(platform)
        month = _norm_month(mois)
        if month:
            months[platform].add(month)
    return present, months


def discover_platform_sources() -> Tuple[Dict[str, str], str]:
    """
    Source retenue par plateforme (décision globale, pas par client).
    Retourne ({ACR: cumulative|monthly}, label cumulative|monthly|hybrid|"").
    """
    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon

    cum_present, cum_months = _presence_by_platform(cum.PURE_DATA_CUMULATIVE_TABLE, cum.engine)
    mon_present, _mon_months = _presence_by_platform(mon.PURE_DATA_MONTHLY_TABLE, mon.engine)
    meta = {p for p in _platforms_from_meta() if p in CANONICAL_PLATFORMS}
    multi = {p for p, months in cum_months.items() if len(months) >= 2 and p in CANONICAL_PLATFORMS}
    chosen: Dict[str, str] = {}
    for platform in CANONICAL_PLATFORMS:
        src = _choose_platform_source(
            platform,
            meta=meta,
            multi=multi,
            has_cum=platform in cum_present,
            has_mon=platform in mon_present,
        )
        if src:
            chosen[platform] = src
    used = set(chosen.values())
    if used == {"cumulative", "monthly"}:
        label = "hybrid"
    elif used == {"cumulative"}:
        label = "cumulative"
    elif used == {"monthly"}:
        label = "monthly"
    else:
        label = ""
    return chosen, label


def load_evolution_rows_for_entity(
    *,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    code_unions: Optional[List[str]] = None,
) -> Tuple[List[Dict], str]:
    """
    Lignes d'évolution d'une entité, après le choix de source global par plateforme.
    """
    from app.services.pure_data_cumulative_supabase import read_cumulative_rows_scoped
    from app.services.pure_data_monthly_supabase import read_monthly_rows_scoped

    chosen, label = discover_platform_sources()
    if not chosen:
        return [], ""
    need_cum = any(src == "cumulative" for src in chosen.values())
    need_mon = any(src == "monthly" for src in chosen.values())
    scope = dict(code_union=code_union, groupe_client=groupe_client, code_unions=code_unions)
    cum_rows: List[Dict] = []
    mon_rows: List[Dict] = []
    if need_cum:
        cum_rows, _, _ = read_cumulative_rows_scoped(**scope)
    if need_mon:
        mon_rows, _, _ = read_monthly_rows_scoped(**scope)
    out: List[Dict] = []
    for platform in CANONICAL_PLATFORMS:
        src = chosen.get(platform)
        if not src:
            continue
        bucket = cum_rows if src == "cumulative" else mon_rows
        out.extend(
            row for row in bucket
            if normalize_platform(row.get("fournisseur")) == platform
        )
    return out, label


def load_evolution_grouped_rows() -> Tuple[List[Dict], str]:
    """
    Une ligne par combinaison de dimensions, ca déjà sommé en base.
    Sert aux KPI. Le dashboard détaillé reste sur le détail ligne à ligne.
    """
    from sqlalchemy import text
    from app.database import lease_connection
    from app.services.pure_data_cumulative_supabase import _norm_month, _norm_year

    import app.services.pure_data_cumulative_supabase as cum
    import app.services.pure_data_monthly_supabase as mon

    chosen, label = discover_platform_sources()
    if not chosen:
        return [], ""
    sql_tpl = """
        SELECT "annee" AS annee, "mois" AS mois, "fournisseur" AS fournisseur,
               "code_union" AS code_union, "marque" AS marque, "famille" AS famille,
               "sous_famille" AS sous_famille, "groupe_client" AS groupe_client,
               "commercial" AS commercial, "region_commerciale" AS region_commerciale,
               MIN("raison_sociale") AS raison_sociale,
               SUM(COALESCE("ca", 0)) AS ca
        FROM "{table}"
        GROUP BY "annee", "mois", "fournisseur", "code_union", "marque", "famille",
                 "sous_famille", "groupe_client", "commercial", "region_commerciale"
    """
    rows: List[Dict] = []
    tables = []
    if any(src == "cumulative" for src in chosen.values()):
        tables.append((cum.PURE_DATA_CUMULATIVE_TABLE, "cumulative", cum.engine))
    if any(src == "monthly" for src in chosen.values()):
        tables.append((mon.PURE_DATA_MONTHLY_TABLE, "monthly", mon.engine))
    for table, source_name, bind in tables:
        try:
            with lease_connection(bind) as conn:
                fetched = conn.execute(text(sql_tpl.format(table=table))).mappings().all()
        except Exception:
            continue
        for raw in fetched:
            platform = normalize_platform(raw["fournisseur"])
            if chosen.get(platform) != source_name:
                continue
            rows.append({
                "annee": raw["annee"],
                "mois": raw["mois"],
                "year": _norm_year(raw["annee"]),
                "month": _norm_month(raw["mois"]),
                "fournisseur": raw["fournisseur"],
                "code_union": raw["code_union"],
                "marque": raw["marque"],
                "famille": raw["famille"],
                "sous_famille": raw["sous_famille"],
                "groupe_client": raw["groupe_client"],
                "commercial": raw["commercial"],
                "region_commerciale": raw["region_commerciale"],
                "raison_sociale": raw["raison_sociale"],
                "ca": float(raw["ca"] or 0.0),
            })
    return rows, label
