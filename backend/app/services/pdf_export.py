"""
Service d'export PDF pour les rapports RFA clients.
Export "Espace Client" : rendu identique à la page Espace Client.
"""
import json
from typing import Dict, Optional, List, Tuple, Any
from io import BytesIO
from jinja2 import Template
try:
    from xhtml2pdf import pisa
    XHTML2PDF_AVAILABLE = True
except ImportError:
    pisa = None
    XHTML2PDF_AVAILABLE = False
from app.services.compute import get_entity_detail_with_rfa
from app.services.contract_resolver import get_contract_by_id
from app.services.rfa_calculator import load_contract_rules, load_entity_overrides
from app.storage import get_import
from app.core.fields import get_global_fields, get_tri_fields, get_field_by_key
from datetime import datetime


def _parse_tiers(tiers_json: Optional[str]) -> List[Dict[str, float]]:
    """Parse les paliers depuis le JSON de la règle."""
    if not tiers_json:
        return []
    try:
        parsed = json.loads(tiers_json)
        if not isinstance(parsed, list):
            return []
        return sorted(
            [{"min": float(t.get("min", 0)), "rate": float(t.get("rate", 0))} for t in parsed],
            key=lambda x: x["min"]
        )
    except (json.JSONDecodeError, TypeError):
        return []


def _get_tier_progress(ca: float, tiers: List[Dict[str, float]]) -> Dict[str, Any]:
    """Calcule la progression sur les paliers (équivalent frontend getTierProgress)."""
    if not tiers:
        return {"min_reached": None, "next_min": None, "rate": 0.0, "progress": 0.0}
    min_reached = None
    rate = 0.0
    for t in tiers:
        if t["min"] <= ca:
            min_reached = t["min"]
            rate = t["rate"]
        else:
            break
    next_min = next((t["min"] for t in tiers if t["min"] > ca), None)
    progress = (min((ca / next_min * 100), 100.0) if next_min else 100.0)
    return {"min_reached": min_reached, "next_min": next_min, "rate": rate, "progress": progress}


def _get_rate_for_threshold(tiers: List[Dict[str, float]], threshold: Optional[float]) -> float:
    """Retourne le taux au palier donné (équivalent frontend getRateForThreshold)."""
    if not tiers or threshold is None:
        return 0.0
    rate = 0.0
    for t in tiers:
        if t["min"] <= threshold:
            rate = t["rate"]
        else:
            break
    return rate


def _load_rules_map(contract_id: int, mode: str, entity_id: str) -> Dict[str, Dict]:
    """Charge les règles du contrat + overrides entité, retourne un map key -> {tiers_rfa, tiers_bonus, tiers, ...}."""
    contract = get_contract_by_id(contract_id)
    if not contract:
        return {}
    rules = load_contract_rules(contract)
    target_type = "CODE_UNION" if mode == "client" else "GROUPE_CLIENT"
    overrides = load_entity_overrides(target_type, entity_id)

    rules_map = {}
    for key, rule in rules.items():
        tiers_rfa = _parse_tiers(rule.tiers_rfa)
        tiers_bonus = _parse_tiers(rule.tiers_bonus)
        tiers = _parse_tiers(rule.tiers)
        key_ov = overrides.get(key, {})
        if key_ov.get("rfa"):
            tiers_rfa = [{"min": float(t.get("min", 0)), "rate": float(t.get("rate", 0))} for t in key_ov["rfa"]]
            tiers_rfa.sort(key=lambda x: x["min"])
        if key_ov.get("bonus"):
            tiers_bonus = [{"min": float(t.get("min", 0)), "rate": float(t.get("rate", 0))} for t in key_ov["bonus"]]
            tiers_bonus.sort(key=lambda x: x["min"])
        if key_ov.get("tri"):
            tiers = [{"min": float(t.get("min", 0)), "rate": float(t.get("rate", 0))} for t in key_ov["tri"]]
            tiers.sort(key=lambda x: x["min"])
        rules_map[key] = {
            "tiers_rfa": tiers_rfa,
            "tiers_bonus": tiers_bonus,
            "tiers": tiers,
            "has_override_rfa": bool(key_ov.get("rfa")),
            "has_override_bonus": bool(key_ov.get("bonus")),
            "has_override_tri": bool(key_ov.get("tri")),
        }
    return rules_map


def _build_global_rows(entity_data: Dict, rules_map: Dict) -> List[Dict]:
    """Construit les lignes Objectifs Plateformes comme le frontend (globalRows)."""
    global_rfa = entity_data.get("rfa", {}).get("global", {})
    ca_global = entity_data.get("ca", {}).get("global", {})
    rows = []
    for key in get_global_fields():
        if key not in global_rfa:
            continue
        item = global_rfa[key]
        if isinstance(item, dict):
            label = item.get("label", key)
            ca = float(item.get("ca", 0) or 0)
            total_dict = item.get("total", {})
            current_value = float(total_dict.get("value", 0) or 0)
            current_rate = float(total_dict.get("rate", 0) or 0)
        else:
            continue
        rule = rules_map.get(key, {})
        tiers_rfa = rule.get("tiers_rfa") or []
        tiers_bonus = rule.get("tiers_bonus") or []
        no_rules = (not tiers_rfa and not tiers_bonus)
        if no_rules:
            continue

        rfa_prog = _get_tier_progress(ca, tiers_rfa)
        bonus_prog = _get_tier_progress(ca, tiers_bonus)
        next_min_candidates = [rfa_prog["next_min"], bonus_prog["next_min"]]
        next_min_candidates = [x for x in next_min_candidates if x is not None]
        combined_next_min = min(next_min_candidates) if next_min_candidates else None
        combined_progress = min((ca / combined_next_min * 100), 100.0) if combined_next_min else 100.0
        combined_rate = (rfa_prog["rate"] or 0) + (bonus_prog["rate"] or 0)
        next_rfa_rate = _get_rate_for_threshold(tiers_rfa, combined_next_min) if combined_next_min else 0
        next_bonus_rate = _get_rate_for_threshold(tiers_bonus, combined_next_min) if combined_next_min else 0
        next_combined_rate = (next_rfa_rate + next_bonus_rate) if combined_next_min else None
        missing_ca = max((combined_next_min or 0) - ca, 0) if combined_next_min else None
        projected_rfa = (next_combined_rate * combined_next_min) if (combined_next_min and next_combined_rate is not None) else None
        projected_gain = max((projected_rfa or 0) - current_value, 0) if projected_rfa is not None else None
        achieved = combined_next_min is None and (rfa_prog["min_reached"] is not None or bonus_prog["min_reached"] is not None)
        near = combined_next_min is not None and combined_progress >= 80

        rows.append({
            "key": key,
            "label": label,
            "ca": ca,
            "current_rfa_amount": current_value,
            "combined_rate": combined_rate,
            "next_combined_rate": next_combined_rate,
            "combined_next_min": combined_next_min,
            "combined_progress": combined_progress,
            "missing_ca": missing_ca,
            "projected_gain": projected_gain,
            "achieved": achieved,
            "near": near,
            "has_override": rule.get("has_override_rfa") or rule.get("has_override_bonus"),
        })
    return rows


def _build_tri_rows(entity_data: Dict, rules_map: Dict) -> List[Dict]:
    """Construit les lignes Objectifs Tri-partites comme le frontend (triRows)."""
    tri_rfa = entity_data.get("rfa", {}).get("tri", {})
    rows = []
    for key in get_tri_fields():
        if key not in tri_rfa:
            continue
        item = tri_rfa[key]
        if isinstance(item, dict):
            label = item.get("label", key)
            ca = float(item.get("ca", 0) or 0)
            current_value = float(item.get("value", 0) or 0)
            current_rate = float(item.get("rate", 0) or 0)
        else:
            continue
        rule = rules_map.get(key, {})
        tiers = rule.get("tiers") or []
        no_rules = not tiers
        if no_rules:
            continue

        tri_prog = _get_tier_progress(ca, tiers)
        next_min = tri_prog["next_min"]
        next_rate = _get_rate_for_threshold(tiers, next_min) if next_min else None
        missing_ca = max((next_min or 0) - ca, 0) if next_min else None
        projected_rfa = (next_rate * next_min) if (next_min and next_rate is not None) else None
        projected_gain = max((projected_rfa or 0) - current_value, 0) if projected_rfa is not None else None
        achieved = next_min is None and tri_prog["min_reached"] is not None
        near = next_min is not None and tri_prog["progress"] >= 80
        next_tri_rate = _get_rate_for_threshold(tiers, next_min) if next_min else None

        rows.append({
            "key": key,
            "label": label,
            "ca": ca,
            "current_rfa_amount": current_value,
            "rate": current_rate,
            "tri_progress": tri_prog,
            "next_min": next_min,
            "next_tri_rate": next_tri_rate,
            "missing_ca": missing_ca,
            "projected_gain": projected_gain,
            "achieved": achieved,
            "near": near,
            "has_override": rule.get("has_override_tri"),
        })
    return rows


def format_amount(value: float) -> str:
    """Formate un montant en euros."""
    if value is None:
        return "0.00 €"
    return f"{float(value):,.2f} €".replace(",", " ")


def format_percent(value: float) -> str:
    """Formate un pourcentage."""
    if value is None or value == 0:
        return "0.00%"
    return f"{float(value) * 100:.2f}%"


def generate_espace_client_pdf_html(entity_data: Dict, mode: str) -> str:
    """
    Génère le HTML PDF identique à la page Espace Client : en-tête, KPI, badges, tableaux Plateformes et Tri-partites.
    """
    contract_applied = entity_data.get("contract_applied") or {}
    contract_id = contract_applied.get("id")
    entity_id = entity_data.get("code_union") or entity_data.get("groupe_client") or ""
    if not contract_id:
        return generate_pdf_html(entity_data, mode)

    rules_map = _load_rules_map(contract_id, mode, entity_id)
    global_rows = _build_global_rows(entity_data, rules_map)
    tri_rows = _build_tri_rows(entity_data, rules_map)

    ca_total = entity_data.get("ca", {}).get("totals", {}).get("global_total", 0) or 0
    rfa_total = entity_data.get("rfa", {}).get("totals", {}).get("grand_total", 0) or 0
    rfa_rate_global = (rfa_total / ca_total * 100) if ca_total > 0 else 0
    potential_gain_near = sum(r.get("projected_gain") or 0 for r in global_rows if r.get("near")) + sum(r.get("projected_gain") or 0 for r in tri_rows if r.get("near"))
    achieved_count = sum(1 for r in global_rows if r.get("achieved")) + sum(1 for r in tri_rows if r.get("achieved"))
    near_count = sum(1 for r in global_rows if r.get("near")) + sum(1 for r in tri_rows if r.get("near"))
    total_objectives = len(global_rows) + len(tri_rows)

    if mode == "client":
        entity_label = entity_data.get("nom_client") or entity_data.get("code_union") or entity_id
    else:
        entity_label = entity_data.get("groupe_client") or entity_id

    date_generated = datetime.now().strftime("%d/%m/%Y")

    template_str = _get_espace_client_template()
    template = Template(template_str)
    html_content = template.render(
        entity_label=entity_label,
        entity_id=entity_id,
        contract_name=contract_applied.get("name", "Défaut"),
        mode_label="Client" if mode == "client" else "Groupe",
        date_generated=date_generated,
        ca_total=ca_total,
        rfa_total=rfa_total,
        rfa_rate_global=rfa_rate_global,
        potential_gain_near=potential_gain_near,
        near_count=near_count,
        achieved_count=achieved_count,
        total_objectives=total_objectives,
        global_rows=global_rows,
        tri_rows=tri_rows,
        format_amount=format_amount,
        format_percent=format_percent,
    )
    return html_content


def _get_espace_client_template() -> str:
    """Template HTML calqué sur la page Espace Client."""
    return """
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Espace Client - {{ entity_label }}</title>
    <style>
        @page { size: A4; margin: 1.5cm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; line-height: 1.35; }
        .header-pdf { background: linear-gradient(90deg, #4f46e5 0%, #9333ea 50%, #ec4899 100%); color: white; padding: 16px 20px; margin: -10px -10px 20px -10px; border-radius: 0 0 12px 12px; }
        .header-pdf h1 { font-size: 18pt; font-weight: 800; margin-bottom: 4px; }
        .header-pdf p { font-size: 9pt; opacity: 0.95; }
        .kpi-grid { width: 100%; margin-bottom: 14px; border-collapse: separate; border-spacing: 8px; }
        .kpi-grid td { width: 25%; padding: 12px; border-radius: 10px; color: white; vertical-align: top; }
        .kpi-slate { background: #334155; }
        .kpi-blue { background: #4f46e5; }
        .kpi-green { background: #0d9488; }
        .kpi-amber { background: #ea580c; }
        .kpi-gray { background: #6b7280; }
        .kpi-grid .label { font-size: 9pt; opacity: 0.9; margin-bottom: 4px; }
        .kpi-grid .value { font-size: 14pt; font-weight: 800; }
        .kpi-grid .sub { font-size: 8pt; opacity: 0.9; margin-top: 2px; }
        .badges { margin-bottom: 14px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-size: 9pt; font-weight: 600; margin-right: 8px; margin-bottom: 6px; }
        .badge-ok { background: #d1fae5; color: #047857; }
        .badge-near { background: #fef3c7; color: #b45309; }
        .badge-info { background: #e2e8f0; color: #475569; }
        .section-title { font-size: 11pt; font-weight: bold; padding: 10px 14px; color: white; margin-bottom: 0; }
        .section-title.plateformes { background: linear-gradient(90deg, #3b82f6, #4f46e5); }
        .section-title.tri { background: linear-gradient(90deg, #a855f7, #db2777); }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 9pt; }
        thead { background: #f9fafb; }
        th { padding: 8px 10px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
        th.right { text-align: right; }
        td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
        td.right { text-align: right; }
        tr.row-achieved { background: #d1fae5 !important; }
        tr.row-near { background: #fef3c7 !important; }
        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 8pt; font-weight: 600; margin-left: 6px; }
        .status-achieved { background: #d1fae5; color: #047857; }
        .status-near { background: #fef3c7; color: #b45309; }
        .status-ongoing { background: #e2e8f0; color: #475569; }
        .progress-bar-wrap { height: 12px; background: #e2e8f0; border-radius: 9999px; overflow: hidden; display: inline-block; width: 120px; vertical-align: middle; margin-right: 8px; }
        .progress-bar { height: 100%; border-radius: 9999px; }
        .progress-bar.achieved { background: #10b981; }
        .progress-bar.near { background: #f59e0b; }
        .progress-bar.ongoing { background: #6366f1; }
        .gain-badge { padding: 2px 8px; border-radius: 9999px; font-size: 8pt; font-weight: bold; background: #d1fae5; color: #047857; }
        .footer-pdf { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 8pt; color: #6b7280; }
    </style>
</head>
<body>
    <div class="header-pdf">
        <h1>Espace Client</h1>
        <p>Suivez vos performances et maximisez vos RFA</p>
    </div>

    <table class="kpi-grid" cellpadding="0" cellspacing="8" style="width:100%; margin-bottom:14px;">
    <tr>
        <td class="kpi-slate" style="color:white; padding:12px; border-radius:10px;">
            <div class="label">{{ mode_label }}</div>
            <div class="value">{{ entity_id }}</div>
            <div class="sub">{{ contract_name }}</div>
        </td>
        <td class="kpi-blue" style="color:white; padding:12px; border-radius:10px;">
            <div class="label">CA Global</div>
            <div class="value">{{ format_amount(ca_total) }}</div>
        </td>
        <td class="kpi-green" style="color:white; padding:12px; border-radius:10px;">
            <div class="label">RFA Totale</div>
            <div class="value">{{ format_amount(rfa_total) }}</div>
            <div class="sub">{{ format_percent(rfa_rate_global / 100) }}</div>
        </td>
        <td class="{{ 'kpi-amber' if near_count > 0 else 'kpi-gray' }}" style="color:white; padding:12px; border-radius:10px;">
            <div class="label">Gain a portee</div>
            <div class="value">{{ '+' + format_amount(potential_gain_near) if near_count > 0 else '-' }}</div>
            <div class="sub">{{ near_count }} objectif(s) proche(s)</div>
        </td>
    </tr>
</table>

    <div class="badges">
        {% if achieved_count > 0 %}<span class="badge badge-ok">{{ achieved_count }} atteint(s)</span>{% endif %}
        {% if near_count > 0 %}<span class="badge badge-near">{{ near_count }} proche(s) (+{{ format_amount(potential_gain_near) }})</span>{% endif %}
        <span class="badge badge-info">{{ total_objectives }} objectif(s)</span>
    </div>

    {% if global_rows %}
    <p class="section-title plateformes">Objectifs Plateformes</p>
    <table>
        <thead><tr>
            <th>Plateforme</th><th class="right">CA</th><th class="right">Taux</th><th class="right">RFA</th><th class="right">Prochain</th><th class="right">Gain</th><th>Progression</th>
        </tr></thead>
        <tbody>
        {% for row in global_rows %}
        <tr class="{% if row.achieved %}row-achieved{% elif row.near %}row-near{% endif %}">
            <td>
                <strong>{{ row.label }}</strong>
                <span class="status-badge {% if row.achieved %}status-achieved{% elif row.near %}status-near{% else %}status-ongoing{% endif %}">
                    {{ 'Atteint' if row.achieved else ('Proche' if row.near else 'En cours') }}
                </span>
                {% if row.has_override %}<span style="background:#ede9fe;color:#6d28d9;padding:1px 4px;border-radius:4px;font-size:8pt;">&#9998;</span>{% endif %}
            </td>
            <td class="right"><strong>{{ format_amount(row.ca) }}</strong></td>
            <td class="right">
                {% if row.next_combined_rate and not row.achieved %}
                    {{ format_percent(row.combined_rate) }} &rarr; <strong>{{ format_percent(row.next_combined_rate) }}</strong>
                {% else %}
                    <strong>{{ format_percent(row.combined_rate) }}</strong>
                {% endif %}
            </td>
            <td class="right"><strong>{{ format_amount(row.current_rfa_amount) }}</strong></td>
            <td class="right">
                {% if row.achieved %}&#10003; Max{% else %}
                    {{ format_amount(row.combined_next_min) }}
                    {% if row.missing_ca and row.missing_ca > 0 %}<br><span style="font-size:8pt;color:#666;">-{{ format_amount(row.missing_ca) }}</span>{% endif %}
                {% endif %}
            </td>
            <td class="right">
                {% if row.projected_gain and row.projected_gain > 0 and not row.achieved %}<span class="gain-badge">+{{ format_amount(row.projected_gain) }}</span>{% elif row.achieved %}—{% else %}—{% endif %}
            </td>
            <td>
                <div class="progress-bar-wrap">
                    <div class="progress-bar {% if row.achieved %}achieved{% elif row.near %}near{% else %}ongoing{% endif %}" style="width:{{ row.combined_progress|round(0) }}%;"></div>
                </div>
                <strong>{{ row.combined_progress|round(0) }}%</strong>
            </td>
        </tr>
        {% endfor %}
        </tbody>
    </table>
    {% endif %}

    {% if tri_rows %}
    <p class="section-title tri">Objectifs Tri-partites</p>
    <table>
        <thead><tr>
            <th>Tri-partite</th><th class="right">CA</th><th class="right">Taux</th><th class="right">RFA</th><th class="right">Prochain</th><th class="right">Gain</th><th>Progression</th>
        </tr></thead>
        <tbody>
        {% for row in tri_rows %}
        <tr class="{% if row.achieved %}row-achieved{% elif row.near %}row-near{% endif %}">
            <td>
                <strong>{{ row.label }}</strong>
                <span class="status-badge {% if row.achieved %}status-achieved{% elif row.near %}status-near{% else %}status-ongoing{% endif %}">
                    {{ 'Atteint' if row.achieved else ('Proche' if row.near else 'En cours') }}
                </span>
                {% if row.has_override %}<span style="background:#ede9fe;color:#6d28d9;padding:1px 4px;border-radius:4px;font-size:8pt;">&#9998;</span>{% endif %}
            </td>
            <td class="right"><strong>{{ format_amount(row.ca) }}</strong></td>
            <td class="right">
                {% if row.next_min and not row.achieved and row.next_tri_rate is not none %}
                    {{ format_percent(row.rate) }} &rarr; <strong>{{ format_percent(row.next_tri_rate) }}</strong>
                {% else %}
                    <strong>{{ format_percent(row.rate) }}</strong>
                {% endif %}
            </td>
            <td class="right"><strong>{{ format_amount(row.current_rfa_amount) }}</strong></td>
            <td class="right">
                {% if row.achieved %}&#10003; Max{% else %}
                    {{ format_amount(row.next_min) }}
                    {% if row.missing_ca and row.missing_ca > 0 %}<br><span style="font-size:8pt;color:#666;">-{{ format_amount(row.missing_ca) }}</span>{% endif %}
                {% endif %}
            </td>
            <td class="right">
                {% if row.projected_gain and row.projected_gain > 0 and not row.achieved %}<span class="gain-badge">+{{ format_amount(row.projected_gain) }}</span>{% elif row.achieved %}—{% else %}—{% endif %}
            </td>
            <td>
                <div class="progress-bar-wrap">
                    <div class="progress-bar {% if row.achieved %}achieved{% elif row.near %}near{% else %}ongoing{% endif %}" style="width:{{ row.tri_progress.progress|round(0) }}%;"></div>
                </div>
                <strong>{{ row.tri_progress.progress|round(0) }}%</strong>
            </td>
        </tr>
        {% endfor %}
        </tbody>
    </table>
    {% endif %}

    <div class="footer-pdf">
        <p>Document genere le {{ date_generated }} - Espace Client RFA - {{ entity_label }}</p>
    </div>
</body>
</html>
"""


def generate_pdf_html(entity_data: Dict, mode: str) -> str:
    """
    Génère le HTML pour le PDF à partir des données de l'entité.
    Format simple et lisible (fallback si pas de contrat).
    """
    template_str = """
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Rapport RFA - {{ entity_label }}</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            line-height: 1.4;
            font-size: 11pt;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
        }
        .header h1 {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .header-info {
            font-size: 10pt;
            margin: 5px 0;
        }
        .summary {
            margin: 25px 0;
            padding: 15px;
            background: #f5f5f5;
            border: 1px solid #ddd;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 11pt;
        }
        .summary-label {
            font-weight: bold;
        }
        .summary-value {
            font-weight: bold;
            font-size: 12pt;
        }
        .section-title {
            font-size: 12pt;
            font-weight: bold;
            margin: 25px 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #000;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 10pt;
        }
        thead {
            background: #e0e0e0;
        }
        th {
            padding: 8px 6px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #000;
            font-size: 9pt;
        }
        th.text-right {
            text-align: right;
        }
        td {
            padding: 6px;
            border: 1px solid #000;
            font-size: 10pt;
        }
        td.text-right {
            text-align: right;
        }
        tbody tr:nth-child(even) {
            background: #f9f9f9;
        }
        tbody tr.accomplished {
            background: #f0fdf4;
        }
        .status-icon {
            display: inline-block;
            width: 16px;
            height: 16px;
            text-align: center;
            line-height: 16px;
            font-size: 10px;
            margin-right: 6px;
            color: #16a34a;
        }
        .status-not-accomplished {
            color: #9ca3af;
        }
        .value-positive {
            font-weight: 600;
        }
        .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 9pt;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Groupement Union - Rapport de RFA</h1>
        <div class="header-info">Date : {{ date_generated }}</div>
        <div class="header-info">Adhérent : {{ adherent_name }}</div>
        <div class="header-info">Année : {{ year }}</div>
    </div>

    <div class="summary">
        <div class="summary-row">
            <span class="summary-label">Chiffre d'Affaires Total HT :</span>
            <span class="summary-value">{{ ca_total_formatted }}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">RFA Totale HT :</span>
            <span class="summary-value">{{ rfa_total_formatted }}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Taux RFA Global :</span>
            <span class="summary-value">{{ rfa_rate_global_formatted }}</span>
        </div>
    </div>

    <div class="section-title">Détail des RFA :</div>
    <table>
        <thead>
            <tr>
                <th>Plateforme/Fournisseur</th>
                <th class="text-right">CA Total HT</th>
                <th class="text-right">Taux RFA (%)</th>
                <th class="text-right">Montant RFA HT (€)</th>
            </tr>
        </thead>
        <tbody>
            {% for item in all_items %}
            <tr class="{% if item.value > 0 %}accomplished{% endif %}">
                <td>
                    <span class="status-icon {% if item.value > 0 %}{% else %}status-not-accomplished{% endif %}">
                        {% if item.value > 0 %}✓{% else %}{% endif %}
                    </span>
                    {{ item.label }}
                </td>
                <td class="text-right">{{ item.ca_formatted }}</td>
                <td class="text-right {% if item.value > 0 %}value-positive{% endif %}">{{ item.rate_formatted }}</td>
                <td class="text-right {% if item.value > 0 %}value-positive{% endif %}">{{ item.value_formatted }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <div class="footer">
        <p>Document généré automatiquement par le système RFA</p>
    </div>
</body>
</html>
    """
    
    template = Template(template_str)
    
    # Préparer les données formatées
    rfa_data = entity_data.get('rfa', {})
    ca_data = entity_data.get('ca', {})
    
    # Accéder aux données RFA (peut être 'global_items' ou 'global' selon la sérialisation)
    global_rfa = rfa_data.get('global_items', rfa_data.get('global', {}))
    tri_rfa = rfa_data.get('tri_items', rfa_data.get('tri', {}))
    
    # Calculer le CA total UNIQUEMENT avec les globales (pas les tri-partites)
    ca_global_total = 0.0
    for key in get_global_fields():
        ca_global_total += ca_data.get('global', {}).get(key, 0) or 0
    
    # Calculer la RFA totale
    rfa_total = rfa_data.get('totals', {}).get('grand_total', 0) or 0
    
    # Calculer le taux RFA global
    rfa_rate_global = (rfa_total / ca_global_total * 100) if ca_global_total > 0 else 0
    
    # Construire la liste de toutes les plateformes (même celles à 0)
    all_items = []
    
    # Ajouter les plateformes globales
    for key in get_global_fields():
        _, default_label = get_field_by_key(key)
        ca = ca_data.get('global', {}).get(key, 0) or 0
        rfa_item = global_rfa.get(key, {})
        
        # Pour les globales, on prend le total (RFA + Bonus)
        # rfa_item est un dict après model_dump()
        if rfa_item and isinstance(rfa_item, dict):
            total_dict = rfa_item.get('total', {})
            if total_dict and isinstance(total_dict, dict):
                rfa_value = float(total_dict.get('value', 0) or 0)
                rfa_rate = float(total_dict.get('rate', 0) or 0)
            else:
                rfa_value = 0.0
                rfa_rate = 0.0
        else:
            rfa_value = 0.0
            rfa_rate = 0.0
        
        # Formater le label (enlever " (global)" si présent)
        label = default_label.replace(" (global)", "").replace(" - Global", "")
        
        all_items.append({
            'label': label,
            'ca': ca,
            'rate': rfa_rate,
            'value': rfa_value,
            'ca_formatted': format_amount(ca),
            'rate_formatted': format_percent(rfa_rate),
            'value_formatted': format_amount(rfa_value)
        })
    
    # Ajouter les tri-partites
    for key in get_tri_fields():
        _, default_label = get_field_by_key(key)
        ca = ca_data.get('tri', {}).get(key, 0) or 0
        tri_item = tri_rfa.get(key, {})
        
        # tri_item est un dict après model_dump()
        if tri_item and isinstance(tri_item, dict):
            rfa_value = float(tri_item.get('value', 0) or 0)
            rfa_rate = float(tri_item.get('rate', 0) or 0)
        else:
            rfa_value = 0.0
            rfa_rate = 0.0
        
        all_items.append({
            'label': default_label,
            'ca': ca,
            'rate': rfa_rate,
            'value': rfa_value,
            'ca_formatted': format_amount(ca),
            'rate_formatted': format_percent(rfa_rate),
            'value_formatted': format_amount(rfa_value)
        })
    
    # Trier par label pour un affichage cohérent
    all_items.sort(key=lambda x: x['label'])
    
    # Préparer les infos adhérent
    if mode == 'client':
        adherent_name = entity_data.get('nom_client') or entity_data.get('code_union', '')
    else:
        adherent_name = entity_data.get('groupe_client', '')
    
    from datetime import datetime
    date_generated = datetime.now().strftime("%d/%m/%Y")
    year = datetime.now().strftime("%Y")
    
    html_content = template.render(
        entity_label=adherent_name,
        adherent_name=adherent_name,
        date_generated=date_generated,
        year=year,
        ca_total_formatted=format_amount(ca_global_total),
        rfa_total_formatted=format_amount(rfa_total),
        rfa_rate_global_formatted=format_percent(rfa_rate_global / 100),  # format_percent attend un ratio
        all_items=all_items
    )
    
    return html_content


def generate_pdf_report(
    import_id: str,
    mode: str,
    entity_id: str,
    contract_id: Optional[int] = None
) -> BytesIO:
    """
    Génère un rapport PDF pour une entité (client ou groupe) avec les calculs RFA.
    """
    from app.storage import get_import
    
    import_data = get_import(import_id)
    if not import_data:
        raise ValueError(f"Import non trouvé: {import_id}")

    entity_detail = get_entity_detail_with_rfa(
        import_data, mode, entity_id, contract_id=contract_id
    )

    # Convertir en dict pour le template
    # Utiliser by_alias=True pour utiliser 'global' et 'tri' au lieu de 'global_items' et 'tri_items'
    entity_dict = entity_detail.model_dump(by_alias=True, mode='json')

    # Générer le HTML (identique à la page Espace Client)
    html_content = generate_espace_client_pdf_html(entity_dict, mode)

    if not XHTML2PDF_AVAILABLE:
        raise RuntimeError("Export PDF non disponible dans cet environnement (xhtml2pdf non installé).")

    # Générer le PDF avec xhtml2pdf
    pdf_buffer = BytesIO()
    result = pisa.CreatePDF(html_content, dest=pdf_buffer, encoding='utf-8')
    
    if result.err:
        raise ValueError(f"Erreur lors de la generation du PDF: {result.err}")
    
    pdf_buffer.seek(0)
    return pdf_buffer
