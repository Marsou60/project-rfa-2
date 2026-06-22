"""
Service Pure Data cumule (YTD) pour dashboard espace client.
Flux totalement separe du mode pure_data_monthly.
"""
from __future__ import annotations

from typing import Dict, List, Optional

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


def _build_hierarchy(
    current_rows: List[Dict],
    previous_rows: List[Dict],
    levels: List[str],
    total_root: float,
) -> List[Dict]:
    """
    Construit une hierarchie generique selon l'ordre `levels`.
    Chaque noeud expose un champ `label` standard + la cle de niveau,
    avec ca_current / ca_previous / delta / delta_pct / part_current.
    """
    def _group(rows: List[Dict], key: str) -> Dict[str, List[Dict]]:
        out: Dict[str, List[Dict]] = {}
        for r in rows:
            label = (r.get(key) or "Non renseigné").strip() or "Non renseigné"
            out.setdefault(label, []).append(r)
        return out

    def _walk(curr: List[Dict], prev: List[Dict], idx: int) -> List[Dict]:
        key = levels[idx]
        curr_map = _group(curr, key)
        prev_map = _group(prev, key)
        labels = set(curr_map.keys()) | set(prev_map.keys())
        merged: List[Dict] = []
        for label in labels:
            curr_rows = curr_map.get(label, [])
            prev_rows = prev_map.get(label, [])
            curr_ca = _sum_ca(curr_rows)
            prev_ca = _sum_ca(prev_rows)
            delta = curr_ca - prev_ca
            item = {
                "level": key,
                "label": label,
                key: label,
                "ca_current": curr_ca,
                "ca_previous": prev_ca,
                "delta": delta,
                "delta_pct": _pct(delta, prev_ca),
                "part_current": (curr_ca / total_root) if total_root > 0 else 0.0,
            }
            if idx + 1 < len(levels):
                item["children"] = _walk(curr_rows, prev_rows, idx + 1)
            merged.append(item)
        merged.sort(key=lambda x: x["ca_current"], reverse=True)
        return merged

    return _walk(current_rows, previous_rows, 0)


def build_cumulative_dashboard(
    rows: List[Dict],
    year_current: int,
    year_previous: int,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
    fournisseur: Optional[str] = None,
    top_n: int = 15,
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

    # Axes hierarchiques (drill-down) :
    platforms = _build_hierarchy(
        current_rows, previous_rows,
        ["fournisseur", "marque", "famille", "sous_famille"],
        current_total,
    )
    by_marque = _build_hierarchy(
        current_rows, previous_rows,
        ["marque", "famille", "sous_famille"],
        current_total,
    )[:top_n]
    by_famille = _build_hierarchy(
        current_rows, previous_rows,
        ["famille", "marque", "sous_famille"],
        current_total,
    )[:top_n]

    # Listes "plates" utiles pour les graphiques de tete
    def _flat(nodes: List[Dict]) -> List[Dict]:
        return [
            {
                "label": n["label"],
                "ca_current": n["ca_current"],
                "ca_previous": n["ca_previous"],
                "delta": n["delta"],
                "delta_pct": n["delta_pct"],
                "part_current": n["part_current"],
            }
            for n in nodes
        ]

    platform_summary = _flat(platforms)
    top_marques = _flat(by_marque)[:12]
    top_familles = _flat(by_famille)[:12]

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
        # Hierarchies completes (drill-down)
        "platforms": platforms,
        "by_marque": by_marque,
        "by_famille": by_famille,
        # Resumes pour graphiques
        "platform_summary": platform_summary,
        "top_marques": top_marques,
        "top_familles": top_familles,
        "scope": {
            "rows_current": len(current_rows),
            "rows_previous": len(previous_rows),
        },
    }
