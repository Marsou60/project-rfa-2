"""
Service d'analyse "pure data" (comparatif N vs N-1).
"""
from typing import Dict, List, Optional, Tuple
import re
import unicodedata
import pandas as pd

from app.core.normalize import normalize_header, sanitize_amount


PURE_FIELD_DEFINITIONS = [
    ("mois", [
        "mois", "month", "periode mois", "période mois"
    ]),
    ("annee", [
        "annee", "année", "year"
    ]),
    ("code_union", [
        "code union", "code_union", "code", "code client"
    ]),
    ("raison_sociale", [
        "raison sociale", "raison_sociale", "nom client", "client"
    ]),
    ("groupe_client", [
        "groupe client", "groupe", "groupe_client"
    ]),
    ("region_commerciale", [
        "region commerciale", "région commerciale", "region", "région"
    ]),
    ("fournisseur", [
        "fournisseur", "frs", "supplier"
    ]),
    ("marque", [
        "marque", "brand"
    ]),
    ("groupe_frs", [
        "groupe frs", "groupe_frs", "groupe fournisseur"
    ]),
    ("famille", [
        "famille", "family"
    ]),
    ("sous_famille", [
        "sous famille", "sous-famille", "sous_famille", "subfamily"
    ]),
    ("ca", [
        "ca", "ca €", "ca (e)", "ca (€)", "chiffre d'affaires", "chiffre d affaire"
    ]),
    ("commercial", [
        "commercial", "vendeur", "sales"
    ]),
]


def _build_field_mapping() -> Dict[str, str]:
    mapping = {}
    for key, aliases in PURE_FIELD_DEFINITIONS:
        for alias in aliases:
            mapping[alias] = key
    return mapping


def _extract_year(value) -> Optional[int]:
    if value is None:
        return None
    text = str(value)
    match = re.search(r"(20\d{2})", text)
    return int(match.group(1)) if match else None


def _extract_month(value) -> Optional[int]:
    if value is None:
        return None
    text = str(value).lower()
    number_match = re.search(r"(\d{1,2})", text)
    if number_match:
        month = int(number_match.group(1))
        if 1 <= month <= 12:
            return month
    months = {
        "janvier": 1,
        "fevrier": 2,
        "février": 2,
        "mars": 3,
        "avril": 4,
        "mai": 5,
        "juin": 6,
        "juillet": 7,
        "aout": 8,
        "août": 8,
        "septembre": 9,
        "octobre": 10,
        "novembre": 11,
        "decembre": 12,
        "décembre": 12,
    }
    for key, val in months.items():
        if key in text:
            return val
    return None


def _normalize_commercial(value: str) -> Tuple[str, str]:
    """
    Normalise un nom de commercial pour éviter les doublons (casse, accents, espaces).
    Retourne: (clé_canonique, libellé_affiché)
    """
    raw = (value or "").strip()
    if not raw:
        return "NON RENSEIGNE", "Non renseigné"
    simplified = unicodedata.normalize("NFD", raw)
    simplified = "".join(c for c in simplified if unicodedata.category(c) != "Mn")
    simplified = re.sub(r"\s+", " ", simplified).strip()
    simplified = simplified.upper()
    return simplified, raw.title()


def load_pure_data(file_path: str) -> Tuple[List[Dict], List[str], Dict[str, str]]:
    df = pd.read_excel(file_path, engine="openpyxl")
    raw_columns = list(df.columns)
    normalized_headers = {col: normalize_header(col) for col in raw_columns}

    raw_field_mapping = _build_field_mapping()
    column_mapping: Dict[str, str] = {}
    for excel_col, normalized in normalized_headers.items():
        if normalized in raw_field_mapping:
            column_mapping[raw_field_mapping[normalized]] = excel_col
        else:
            for alias, key in raw_field_mapping.items():
                if alias in normalized or normalized in alias:
                    if key not in column_mapping:
                        column_mapping[key] = excel_col
                    break

    data: List[Dict] = []
    for _, row in df.iterrows():
        row_dict: Dict[str, Optional[str]] = {}
        for key, _ in PURE_FIELD_DEFINITIONS:
            if key in column_mapping:
                excel_col = column_mapping[key]
                try:
                    value = row[excel_col]
                except (KeyError, IndexError):
                    value = None
            else:
                value = None

            if key == "ca":
                row_dict[key] = sanitize_amount(value)
            else:
                row_dict[key] = str(value).strip() if value is not None and str(value) != "nan" else ""

        row_dict["year"] = _extract_year(row_dict.get("annee"))
        row_dict["month"] = _extract_month(row_dict.get("mois"))
        data.append(row_dict)

    return data, raw_columns, column_mapping


def filter_rows(rows: List[Dict], year: Optional[int], month: Optional[int]) -> List[Dict]:
    filtered = rows
    if year:
        filtered = [r for r in filtered if r.get("year") == year]
    if month:
        filtered = [r for r in filtered if r.get("month") == month]
    return filtered


def _fournisseur_matches(row_fournisseur: str, filter_fournisseur: str) -> bool:
    """Compare fournisseur du fichier au filtre (insensible à la casse)."""
    if not filter_fournisseur or not filter_fournisseur.strip():
        return True
    a = (row_fournisseur or "").strip().upper()
    b = (filter_fournisseur or "").strip().upper()
    return a == b or b in a


def filter_rows_by_fournisseur(rows: List[Dict], fournisseur: Optional[str]) -> List[Dict]:
    """Ne garde que les lignes dont le fournisseur correspond au filtre."""
    if not fournisseur or not str(fournisseur).strip():
        return rows
    return [r for r in rows if _fournisseur_matches(r.get("fournisseur") or "", fournisseur)]


def aggregate_rows(rows: List[Dict]) -> Dict:
    commercial_map: Dict[str, Dict] = {}
    client_map: Dict[str, Dict] = {}
    platform_map: Dict[str, float] = {}
    total_ca = 0.0

    for row in rows:
        ca = float(row.get("ca") or 0)
        if ca == 0:
            continue
        total_ca += ca

        commercial_key, commercial_label = _normalize_commercial(row.get("commercial"))
        code_union = (row.get("code_union") or "").strip() or "Inconnu"
        raison = (row.get("raison_sociale") or "").strip()

        fournisseur = (row.get("fournisseur") or "Non renseigné").strip()
        platform_map[fournisseur] = platform_map.get(fournisseur, 0.0) + ca

        if commercial_key not in commercial_map:
            commercial_map[commercial_key] = {
                "label": commercial_label,
                "ca": 0.0,
                "clients": set()
            }
        commercial_map[commercial_key]["ca"] += ca
        commercial_map[commercial_key]["clients"].add(code_union)

        if code_union not in client_map:
            client_map[code_union] = {
                "code_union": code_union,
                "raison_sociale": raison,
                "commercial": commercial_label,
                "ca": 0.0,
            }
        client_map[code_union]["ca"] += ca

    commercial_list = [
        {
            "commercial": value["label"],
            "ca": value["ca"],
            "clients": len(value["clients"]),
        }
        for key, value in commercial_map.items()
    ]
    commercial_list.sort(key=lambda x: x["ca"], reverse=True)

    client_list = list(client_map.values())
    client_list.sort(key=lambda x: x["ca"], reverse=True)

    platform_list = [
        {"platform": key, "ca": value}
        for key, value in platform_map.items()
    ]
    platform_list.sort(key=lambda x: x["ca"], reverse=True)

    return {
        "total_ca": total_ca,
        "platforms": platform_list,
        "commercials": commercial_list,
        "clients": client_list,
    }


def build_comparison(current: Dict, previous: Dict) -> Dict:
    def pct(delta, base):
        return (delta / base) * 100 if base else None

    return {
        "total": {
            "current": current["total_ca"],
            "previous": previous["total_ca"],
            "delta": current["total_ca"] - previous["total_ca"],
            "delta_pct": pct(current["total_ca"] - previous["total_ca"], previous["total_ca"]),
        },
        "platforms": _merge_by_key(current["platforms"], previous["platforms"], "platform"),
        "commercials": _merge_by_key(current["commercials"], previous["commercials"], "commercial"),
        "clients": _merge_by_key(current["clients"], previous["clients"], "code_union"),
    }


def build_client_detail(
    rows: List[Dict],
    code_union: str,
    year_current: Optional[int],
    year_previous: Optional[int],
    month: Optional[int],
    fournisseur: Optional[str] = None,
) -> Dict:
    def _filter(year):
        rws = [
            r for r in filter_rows(rows, year, month)
            if str(r.get("code_union") or "").strip() == str(code_union).strip()
        ]
        return filter_rows_by_fournisseur(rws, fournisseur)

    current_rows = _filter(year_current)
    previous_rows = _filter(year_previous)

    def _sum_ca(rws: List[Dict]) -> float:
        return sum(float(r.get("ca") or 0) for r in rws)

    total_current = _sum_ca(current_rows)
    total_previous = _sum_ca(previous_rows)

    def _merge(current_list: List[Dict], previous_list: List[Dict], key: str) -> List[Dict]:
        prev_map = {i[key]: i for i in previous_list}
        merged = []
        for item in current_list:
            prev = prev_map.get(item[key], {})
            delta = item["ca"] - prev.get("ca", 0.0)
            delta_pct = (delta / prev["ca"]) * 100 if prev.get("ca") else None
            merged.append({
                **item,
                "ca_previous": prev.get("ca", 0.0),
                "delta": delta,
                "delta_pct": delta_pct
            })
        for item in previous_list:
            if item[key] in {m[key] for m in merged}:
                continue
            merged.append({
                **item,
                "ca_previous": item["ca"],
                "ca": 0.0,
                "delta": -item["ca"],
                "delta_pct": -100.0
            })
        merged.sort(key=lambda x: x["ca"], reverse=True)
        return merged

    def _aggregate(rws: List[Dict], key: str) -> List[Dict]:
        agg: Dict[str, float] = {}
        for r in rws:
            k = (r.get(key) or "Non renseigné").strip()
            agg[k] = agg.get(k, 0.0) + float(r.get("ca") or 0)
        return [{"%s" % key: k, "ca": v} for k, v in agg.items()]

    def _aggregate_nested(rws: List[Dict], level_keys: List[str]) -> List[Dict]:
        key = level_keys[0]
        groups: Dict[str, List[Dict]] = {}
        for r in rws:
            label = (r.get(key) or "Non renseigné").strip()
            groups.setdefault(label, []).append(r)
        items = []
        for label, group_rows in groups.items():
            item = {key: label, "ca": _sum_ca(group_rows)}
            if len(level_keys) > 1:
                item["children"] = _aggregate_nested(group_rows, level_keys[1:])
            items.append(item)
        items.sort(key=lambda x: x["ca"], reverse=True)
        return items

    level_keys = ["fournisseur", "marque", "famille", "sous_famille"]
    current_nested = _aggregate_nested(current_rows, level_keys)
    previous_nested = _aggregate_nested(previous_rows, level_keys)

    def _merge_nested(curr: List[Dict], prev: List[Dict], level_index: int) -> List[Dict]:
        key = level_keys[level_index]
        prev_map = {i.get(key): i for i in prev}
        merged = []
        for item in curr:
            prev_item = prev_map.get(item.get(key), {})
            delta = item["ca"] - prev_item.get("ca", 0.0)
            delta_pct = (delta / prev_item["ca"]) * 100 if prev_item.get("ca") else None
            merged_item = {
                key: item.get(key),
                "ca": item["ca"],
                "ca_previous": prev_item.get("ca", 0.0),
                "delta": delta,
                "delta_pct": delta_pct,
            }
            if level_index + 1 < len(level_keys) and (item.get("children") or prev_item.get("children")):
                merged_item["children"] = _merge_nested(
                    item.get("children", []),
                    prev_item.get("children", []),
                    level_index + 1
                )
            merged.append(merged_item)
        for item in prev:
            if item.get(key) in {m.get(key) for m in merged}:
                continue
            merged_item = {
                key: item.get(key),
                "ca": 0.0,
                "ca_previous": item.get("ca", 0.0),
                "delta": -item.get("ca", 0.0),
                "delta_pct": -100.0,
            }
            if level_index + 1 < len(level_keys) and item.get("children"):
                merged_item["children"] = _merge_nested([], item.get("children", []), level_index + 1)
            merged.append(merged_item)
        merged.sort(key=lambda x: x["ca"], reverse=True)
        return merged

    merged_nested = _merge_nested(current_nested, previous_nested, 0)

    return {
        "client": {
            "code_union": code_union,
            "raison_sociale": (current_rows[0].get("raison_sociale") if current_rows else previous_rows[0].get("raison_sociale") if previous_rows else ""),
            "commercial": (current_rows[0].get("commercial") if current_rows else previous_rows[0].get("commercial") if previous_rows else ""),
        },
        "totals": {
            "current": total_current,
            "previous": total_previous,
            "delta": total_current - total_previous,
            "delta_pct": (total_current - total_previous) / total_previous * 100 if total_previous else None,
        },
        "breakdown": merged_nested,
    }


def build_platform_detail(
    rows: List[Dict],
    fournisseur: str,
    year_current: Optional[int],
    year_previous: Optional[int],
    month: Optional[int]
) -> Dict:
    fn = _normalize_str(str(fournisseur))

    def _filter(year):
        return [
            r for r in filter_rows(rows, year, month)
            if _normalize_str(r.get("fournisseur")) == fn
        ]

    current_rows = _filter(year_current)
    previous_rows = _filter(year_previous)

    def _sum_ca(rws: List[Dict]) -> float:
        return sum(float(r.get("ca") or 0) for r in rws)

    total_current = _sum_ca(current_rows)
    total_previous = _sum_ca(previous_rows)

    def _aggregate_clients(rws: List[Dict]) -> List[Dict]:
        agg: Dict[str, Dict] = {}
        for r in rws:
            code = (r.get("code_union") or "Inconnu").strip()
            if code not in agg:
                agg[code] = {
                    "code_union": code,
                    "raison_sociale": (r.get("raison_sociale") or "").strip(),
                    "commercial": (r.get("commercial") or "").strip(),
                    "ca": 0.0
                }
            agg[code]["ca"] += float(r.get("ca") or 0)
        return list(agg.values())

    def _aggregate_marques(rws: List[Dict]) -> List[Dict]:
        agg: Dict[str, float] = {}
        for r in rws:
            marque = (r.get("marque") or "Non renseigné").strip()
            agg[marque] = agg.get(marque, 0.0) + float(r.get("ca") or 0)
        return [{"marque": k, "ca": v} for k, v in agg.items()]

    current_clients = _aggregate_clients(current_rows)
    previous_clients = _aggregate_clients(previous_rows)
    current_marques = _aggregate_marques(current_rows)
    previous_marques = _aggregate_marques(previous_rows)

    def _merge_clients(curr: List[Dict], prev: List[Dict]) -> List[Dict]:
        prev_map = {i["code_union"]: i for i in prev}
        merged = []
        for item in curr:
            prev_item = prev_map.get(item["code_union"], {})
            delta = item["ca"] - prev_item.get("ca", 0.0)
            delta_pct = (delta / prev_item["ca"]) * 100 if prev_item.get("ca") else None
            merged.append({
                **item,
                "ca_previous": prev_item.get("ca", 0.0),
                "delta": delta,
                "delta_pct": delta_pct
            })
        for item in prev:
            if item["code_union"] in {m["code_union"] for m in merged}:
                continue
            merged.append({
                **item,
                "ca_previous": item["ca"],
                "ca": 0.0,
                "delta": -item["ca"],
                "delta_pct": -100.0
            })
        merged.sort(key=lambda x: x["ca"], reverse=True)
        return merged

    return {
        "platform": fournisseur,
        "totals": {
            "current": total_current,
            "previous": total_previous,
            "delta": total_current - total_previous,
            "delta_pct": (total_current - total_previous) / total_previous * 100 if total_previous else None,
        },
        "marques": _merge_by_key(current_marques, previous_marques, "marque"),
        "clients": _merge_clients(current_clients, previous_clients),
    }


def _normalize_str(s: Optional[str]) -> str:
    """Normalise pour comparaison (strip, casse)."""
    return (s or "").strip().upper()


def _marque_matches(row_marque: Optional[str], requested_marque: str) -> bool:
    """Compare marque du fichier à la marque demandée (exacte ou contient)."""
    rn = _normalize_str(row_marque)
    qn = _normalize_str(requested_marque)
    if not qn:
        return True
    if rn == qn:
        return True
    # Tolérant : "Dayco" peut matcher "Dayco France" ou inversement
    return qn in rn or rn in qn


def build_marque_detail(
    rows: List[Dict],
    fournisseur: str,
    marque: str,
    year_current: Optional[int],
    year_previous: Optional[int],
    month: Optional[int],
) -> Dict:
    """
    Pour une plateforme et une marque données, retourne les magasins (clients) qui contribuent
    à cette marque, avec CA N, N-1, delta.
    """
    fn = _normalize_str(str(fournisseur))
    mq = _normalize_str(str(marque))

    def _filter(year):
        filtered_by_year = filter_rows(rows, year, month)
        return [
            r for r in filtered_by_year
            if _normalize_str(r.get("fournisseur")) == fn
            and _marque_matches(r.get("marque"), marque)
        ]

    current_rows = _filter(year_current)
    previous_rows = _filter(year_previous)

    def _sum_ca(rws: List[Dict]) -> float:
        return sum(float(r.get("ca") or 0) for r in rws)

    total_current = _sum_ca(current_rows)
    total_previous = _sum_ca(previous_rows)

    def _aggregate_clients(rws: List[Dict]) -> List[Dict]:
        agg: Dict[str, Dict] = {}
        for r in rws:
            code = (r.get("code_union") or "Inconnu").strip()
            if code not in agg:
                agg[code] = {
                    "code_union": code,
                    "raison_sociale": (r.get("raison_sociale") or "").strip(),
                    "commercial": (r.get("commercial") or "").strip(),
                    "ca": 0.0,
                }
            agg[code]["ca"] += float(r.get("ca") or 0)
        return list(agg.values())

    current_clients = _aggregate_clients(current_rows)
    previous_clients = _aggregate_clients(previous_rows)

    def _merge_clients(curr: List[Dict], prev: List[Dict]) -> List[Dict]:
        prev_map = {i["code_union"]: i for i in prev}
        merged = []
        for item in curr:
            prev_item = prev_map.get(item["code_union"], {})
            delta = item["ca"] - prev_item.get("ca", 0.0)
            delta_pct = (delta / prev_item["ca"]) * 100 if prev_item.get("ca") else None
            merged.append({
                **item,
                "ca_previous": prev_item.get("ca", 0.0),
                "delta": delta,
                "delta_pct": delta_pct,
            })
        for item in prev:
            if item["code_union"] in {m["code_union"] for m in merged}:
                continue
            merged.append({
                **item,
                "ca_previous": item["ca"],
                "ca": 0.0,
                "delta": -item["ca"],
                "delta_pct": -100.0,
            })
        merged.sort(key=lambda x: x["ca"], reverse=True)
        return merged

    return {
        "marque": marque,
        "platform": fournisseur,
        "totals": {
            "current": total_current,
            "previous": total_previous,
            "delta": total_current - total_previous,
            "delta_pct": (total_current - total_previous) / total_previous * 100 if total_previous else None,
        },
        "magasins": _merge_clients(current_clients, previous_clients),
    }


def build_commercial_detail(
    rows: List[Dict],
    commercial: str,
    year_current: Optional[int],
    year_previous: Optional[int],
    month: Optional[int],
    fournisseur: Optional[str] = None,
) -> Dict:
    commercial_key, commercial_label = _normalize_commercial(commercial)

    def _filter(year):
        filtered = filter_rows(rows, year, month)
        result = []
        for r in filtered:
            key, _ = _normalize_commercial(r.get("commercial"))
            if key == commercial_key:
                result.append(r)
        return filter_rows_by_fournisseur(result, fournisseur)

    current_rows = _filter(year_current)
    previous_rows = _filter(year_previous)

    def _sum_ca(rws: List[Dict]) -> float:
        return sum(float(r.get("ca") or 0) for r in rws)

    total_current = _sum_ca(current_rows)
    total_previous = _sum_ca(previous_rows)

    def _aggregate_platforms(rws: List[Dict]) -> List[Dict]:
        agg: Dict[str, float] = {}
        for r in rws:
            platform = (r.get("fournisseur") or "Non renseigné").strip()
            agg[platform] = agg.get(platform, 0.0) + float(r.get("ca") or 0)
        return [{"platform": k, "ca": v} for k, v in agg.items()]

    def _aggregate_clients(rws: List[Dict]) -> List[Dict]:
        agg: Dict[str, Dict] = {}
        for r in rws:
            code = (r.get("code_union") or "Inconnu").strip()
            if code not in agg:
                agg[code] = {
                    "code_union": code,
                    "raison_sociale": (r.get("raison_sociale") or "").strip(),
                    "ca": 0.0
                }
            agg[code]["ca"] += float(r.get("ca") or 0)
        return list(agg.values())

    current_platforms = _aggregate_platforms(current_rows)
    previous_platforms = _aggregate_platforms(previous_rows)
    current_clients = _aggregate_clients(current_rows)
    previous_clients = _aggregate_clients(previous_rows)

    def _merge_by_key_local(curr: List[Dict], prev: List[Dict], key: str) -> List[Dict]:
        prev_map = {i[key]: i for i in prev}
        merged = []
        for item in curr:
            prev_item = prev_map.get(item[key], {})
            delta = item["ca"] - prev_item.get("ca", 0.0)
            delta_pct = (delta / prev_item["ca"]) * 100 if prev_item.get("ca") else None
            merged.append({
                **item,
                "ca_previous": prev_item.get("ca", 0.0),
                "delta": delta,
                "delta_pct": delta_pct
            })
        for item in prev:
            if item[key] in {m[key] for m in merged}:
                continue
            merged.append({
                **item,
                "ca_previous": item["ca"],
                "ca": 0.0,
                "delta": -item["ca"],
                "delta_pct": -100.0
            })
        merged.sort(key=lambda x: x["ca"], reverse=True)
        return merged

    return {
        "commercial": commercial_label,
        "totals": {
            "current": total_current,
            "previous": total_previous,
            "delta": total_current - total_previous,
            "delta_pct": (total_current - total_previous) / total_previous * 100 if total_previous else None,
        },
        "platforms": _merge_by_key_local(current_platforms, previous_platforms, "platform"),
        "clients": _merge_by_key_local(current_clients, previous_clients, "code_union"),
    }


def _merge_by_key(current_list: List[Dict], previous_list: List[Dict], key_field: str) -> List[Dict]:
    previous_map = {item[key_field]: item for item in previous_list}
    merged: List[Dict] = []

    for item in current_list:
        prev = previous_map.get(item[key_field], {})
        delta = item["ca"] - prev.get("ca", 0.0)
        delta_pct = (delta / prev["ca"]) * 100 if prev.get("ca") else None
        merged.append({
            **item,
            "ca_previous": prev.get("ca", 0.0),
            "delta": delta,
            "delta_pct": delta_pct,
        })

    for item in previous_list:
        if item[key_field] in {m[key_field] for m in merged}:
            continue
        merged.append({
            **item,
            "ca_previous": item["ca"],
            "ca": 0.0,
            "delta": -item["ca"],
            "delta_pct": -100.0,
        })

    merged.sort(key=lambda x: x["ca"], reverse=True)
    return merged
