"""
Service Pure Data cumule (YTD) pour dashboard espace client.
Flux totalement separe du mode pure_data_monthly.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.services.pure_data_import import filter_rows_by_fournisseur


def _norm_text(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _code_union_candidates(raw: Optional[str]) -> set[str]:
    s = _norm_text(raw)
    if not s:
        return set()
    candidates = {s}
    for sep in [" - ", " — ", ";", ","]:
        if sep in s:
            head = _norm_text(s.split(sep, 1)[0])
            if head:
                candidates.add(head)
    return candidates


def _pct(delta: float, base: float) -> Optional[float]:
    return (delta / base) * 100 if base else None


def _sum_ca(rows: List[Dict]) -> float:
    return sum(float(r.get("ca") or 0.0) for r in rows)


def _build_nested(current_rows: List[Dict], previous_rows: List[Dict]) -> List[Dict]:
    """
    Retourne une structure hierarchique:
    plateforme -> marque -> famille -> sous_famille
    avec current, previous, delta, delta_pct et part_current.
    """
    levels = ["fournisseur", "marque", "famille", "sous_famille"]

    def _group(rows: List[Dict], key: str) -> Dict[str, List[Dict]]:
        out: Dict[str, List[Dict]] = {}
        for r in rows:
            label = (r.get(key) or "Non renseigne").strip() or "Non renseigne"
            out.setdefault(label, []).append(r)
        return out

    def _walk(curr: List[Dict], prev: List[Dict], idx: int, total_root: float) -> List[Dict]:
        key = levels[idx]
        curr_map = _group(curr, key)
        prev_map = _group(prev, key)
        labels = sorted(set(curr_map.keys()) | set(prev_map.keys()), key=lambda x: x.upper())
        merged: List[Dict] = []
        for label in labels:
            curr_rows = curr_map.get(label, [])
            prev_rows = prev_map.get(label, [])
            curr_ca = _sum_ca(curr_rows)
            prev_ca = _sum_ca(prev_rows)
            delta = curr_ca - prev_ca
            item = {
                key: label,
                "ca_current": curr_ca,
                "ca_previous": prev_ca,
                "delta": delta,
                "delta_pct": _pct(delta, prev_ca),
                "part_current": (curr_ca / total_root) if total_root > 0 else 0.0,
            }
            if idx + 1 < len(levels):
                children = _walk(curr_rows, prev_rows, idx + 1, total_root)
                item["children"] = children
            merged.append(item)
        merged.sort(key=lambda x: x["ca_current"], reverse=True)
        return merged

    total_root = _sum_ca(current_rows)
    return _walk(current_rows, previous_rows, 0, total_root)


def build_cumulative_dashboard(
    rows: List[Dict],
    year_current: int,
    year_previous: int,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    fournisseur: Optional[str] = None,
) -> Dict:
    if code_union:
        targets = _code_union_candidates(code_union)
        rows = [r for r in rows if _norm_text(r.get("code_union")) in targets]
        entity_label = next(
            (
                f"{(r.get('code_union') or '').strip()} - {(r.get('raison_sociale') or '').strip()}".strip(" -")
                for r in rows
                if (r.get("raison_sociale") or "").strip()
            ),
            code_union,
        )
        entity_kind = "client"
    elif groupe_client:
        target = _norm_text(groupe_client)
        rows = [r for r in rows if _norm_text(r.get("groupe_client")) == target]
        entity_label = groupe_client
        entity_kind = "group"
    else:
        raise ValueError("code_union ou groupe_client requis")

    rows = filter_rows_by_fournisseur(rows, fournisseur)
    if not rows:
        return {
            "available": False,
            "entity_kind": entity_kind,
            "entity_label": entity_label,
        }

    current_rows = [r for r in rows if r.get("year") == year_current]
    previous_rows = [r for r in rows if r.get("year") == year_previous]

    current_total = _sum_ca(current_rows)
    previous_total = _sum_ca(previous_rows)
    delta = current_total - previous_total

    nested = _build_nested(current_rows, previous_rows)

    def _aggregate_by_key(key: str) -> List[Dict]:
        curr_map: Dict[str, float] = {}
        prev_map: Dict[str, float] = {}
        for r in current_rows:
            label = (r.get(key) or "Non renseigne").strip() or "Non renseigne"
            curr_map[label] = curr_map.get(label, 0.0) + float(r.get("ca") or 0.0)
        for r in previous_rows:
            label = (r.get(key) or "Non renseigne").strip() or "Non renseigne"
            prev_map[label] = prev_map.get(label, 0.0) + float(r.get("ca") or 0.0)
        labels = sorted(set(curr_map.keys()) | set(prev_map.keys()), key=lambda x: x.upper())
        out = []
        for label in labels:
            curr = curr_map.get(label, 0.0)
            prev = prev_map.get(label, 0.0)
            d = curr - prev
            out.append({
                "label": label,
                "ca_current": curr,
                "ca_previous": prev,
                "delta": d,
                "delta_pct": _pct(d, prev),
                "part_current": (curr / current_total) if current_total > 0 else 0.0,
            })
        out.sort(key=lambda x: x["ca_current"], reverse=True)
        return out

    top_marques = _aggregate_by_key("marque")[:12]
    top_familles = _aggregate_by_key("famille")[:12]
    top_sous_familles = _aggregate_by_key("sous_famille")[:12]

    return {
        "available": True,
        "entity_kind": entity_kind,
        "entity_label": entity_label,
        "year_current": year_current,
        "year_previous": year_previous,
        "totals": {
            "current": current_total,
            "previous": previous_total,
            "delta": delta,
            "delta_pct": _pct(delta, previous_total),
        },
        "platforms": nested,
        "top_marques": top_marques,
        "top_familles": top_familles,
        "top_sous_familles": top_sous_familles,
        "scope": {
            "rows_current": len(current_rows),
            "rows_previous": len(previous_rows),
        },
    }
