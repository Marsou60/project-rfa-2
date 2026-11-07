"""
Lecture ciblée de pure_data_cumulative / pure_data_monthly.

Le filtre SQL est un sur-ensemble exact des graphies stockées qui passent
les mêmes prédicats Python que les fiches (casse, espaces, accents, séparateurs).
Le filtre Python est réappliqué ensuite : les sommes restent dans l'ordre
physique des lignes, comme après un SELECT intégral puis un filtre.
"""
from __future__ import annotations

from typing import List, Optional, Sequence

from sqlalchemy import bindparam, text


def physical_order_expr(engine) -> str:
    name = engine.dialect.name
    if name == "postgresql":
        return "ctid"
    return "rowid"


def _year_predicate(years: Sequence[int], params: dict) -> str:
    parts = []
    for idx, year in enumerate(years):
        y = int(year)
        params[f"y{idx}"] = y
        params[f"yl{idx}"] = f"%{y}%"
        parts.append(
            f'("annee" = :y{idx} OR CAST("annee" AS TEXT) LIKE :yl{idx})'
        )
    return "(" + " OR ".join(parts) + ")"


def code_match_values(engine, table: str, codes: Sequence[str]) -> tuple:
    """Graphies stockées dont le code normalisé est dans les candidats."""
    from app.services.pure_data_cumulative_service import (
        _code_union_candidates,
        _norm_text,
    )

    candidates = set()
    for code in codes:
        candidates.update(_code_union_candidates(code))
    if not candidates:
        return [], False
    matched = []
    include_null = False
    for raw in distinct_values(engine, table, "code_union"):
        if _norm_text(raw) not in candidates:
            continue
        if raw is None:
            include_null = True
        else:
            matched.append(raw)
    return matched, include_null


def group_match_values(engine, table: str, groupe_client: str) -> tuple:
    from app.services.pure_data_cumulative_service import _norm_text

    target = _norm_text(groupe_client)
    matched = []
    include_null = False
    for raw in distinct_values(engine, table, "groupe_client"):
        if _norm_text(raw) != target:
            continue
        if raw is None:
            include_null = True
        else:
            matched.append(raw)
    return matched, include_null


def exact_rows(
    rows: List[dict],
    *,
    code_union: Optional[str] = None,
    code_unions: Optional[Sequence[str]] = None,
    groupe_client: Optional[str] = None,
    years: Optional[Sequence[int]] = None,
) -> List[dict]:
    """Réapplique le filtre Python des fiches, en conservant l'ordre."""
    from app.services.entity_directory import filter_rows_for_entity
    from app.services.rfa_fusion import filter_rows_for_codes

    if code_unions:
        rows = filter_rows_for_codes(rows, list(code_unions))
    elif code_union:
        rows = filter_rows_for_entity(rows, code_union=code_union)
    elif groupe_client:
        rows = filter_rows_for_entity(rows, groupe_client=groupe_client)
    if years:
        wanted = {int(year) for year in years}
        rows = [row for row in rows if row.get("year") in wanted]
    return rows


def distinct_values(engine, table: str, column: str) -> List:
    sql = text(f'SELECT DISTINCT "{column}" FROM "{table}"')
    with engine.connect() as conn:
        return [row[0] for row in conn.execute(sql).fetchall()]


def fetch_scoped_raw(
    engine,
    table: str,
    columns: Sequence[str],
    *,
    raw_values: Optional[Sequence] = None,
    include_null: bool = False,
    match_column: Optional[str] = None,
    years: Optional[Sequence[int]] = None,
) -> List[tuple]:
    """
    Retourne les tuples (colonnes demandées), dans l'ordre physique.

    raw_values=None et match_column=None : pas de filtre entité.
    raw_values=[] et include_null=False : aucune ligne.
    """
    if match_column is not None and not raw_values and not include_null:
        return []

    params: dict = {}
    where = []
    expanding = []

    if match_column is not None:
        clauses = []
        if raw_values:
            params["raw_values"] = list(raw_values)
            clauses.append(f'"{match_column}" IN :raw_values')
            expanding.append(bindparam("raw_values", expanding=True))
        if include_null:
            clauses.append(f'"{match_column}" IS NULL')
        where.append("(" + " OR ".join(clauses) + ")")

    if years:
        where.append(_year_predicate(years, params))

    col_sql = ", ".join(f'"{c}"' for c in columns)
    order_expr = physical_order_expr(engine)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    stmt = text(
        f'SELECT {col_sql} FROM "{table}" {where_sql} ORDER BY {order_expr}'
    )
    if expanding:
        stmt = stmt.bindparams(*expanding)

    with engine.connect() as conn:
        return list(conn.execute(stmt, params).fetchall())
