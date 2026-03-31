"""
Service d'export PDF pour les rapports RFA clients.
Export "Espace Client" : rendu identique à la page Espace Client.
"""
import base64
import json
import logging
import mimetypes
import os
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
from app.storage import get_import, ImportData
from app.core.fields import get_global_fields, get_tri_fields, get_field_by_key
from datetime import datetime

_LOG = logging.getLogger(__name__)
_MAX_PARTNER_LOGOS = 12


def _local_path_from_api_uploads(url: str) -> Optional[str]:
    """Convertit /api/uploads/... vers un chemin disque (backend local)."""
    if not url or not url.startswith("/api/uploads/"):
        return None
    try:
        from app.database import UPLOADS_DIR, LOGOS_DIR, AVATARS_DIR, SUPPLIER_LOGOS_DIR
    except Exception:
        return None
    rest = url[len("/api/uploads/") :].lstrip("/")
    if "/" not in rest:
        return None
    folder, filename = rest.split("/", 1)
    dir_map = {
        "logos": LOGOS_DIR,
        "ads": UPLOADS_DIR,
        "avatars": AVATARS_DIR,
        "supplier-logos": SUPPLIER_LOGOS_DIR,
    }
    base = dir_map.get(folder)
    if not base:
        return None
    path = os.path.normpath(os.path.join(base, filename))
    if not path.startswith(os.path.normpath(base)):
        return None
    return path if os.path.isfile(path) else None


def _fetch_image_as_data_uri(ref: str) -> Optional[str]:
    """
    Charge une image (URL absolue ou fichier local via /api/uploads/...) et retourne un data URI
    pour xhtml2pdf (évite les requêtes HTTP pendant CreatePDF).
    """
    ref = (ref or "").strip()
    if not ref:
        return None
    try:
        import requests
    except ImportError:
        requests = None  # type: ignore

    raw: Optional[bytes] = None
    mime = "image/png"

    try:
        if ref.startswith("/api/uploads/"):
            path = _local_path_from_api_uploads(ref)
            if not path:
                return None
            with open(path, "rb") as f:
                raw = f.read()
            guessed, _ = mimetypes.guess_type(path)
            if guessed:
                mime = guessed
        elif ref.startswith("http://") or ref.startswith("https://"):
            if not requests:
                return None
            r = requests.get(ref, timeout=20)
            r.raise_for_status()
            raw = r.content
            ct = (r.headers.get("Content-Type") or "").split(";")[0].strip()
            if ct and ct != "application/octet-stream":
                mime = ct
            else:
                guessed, _ = mimetypes.guess_type(ref.split("?", 1)[0])
                if guessed:
                    mime = guessed
        else:
            return None
    except Exception as e:
        _LOG.debug("PDF: impossible de charger l'image %s: %s", ref, e)
        return None

    if not raw:
        return None
    if mime == "image/svg+xml":
        return None
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def collect_pdf_header_assets() -> Dict[str, Any]:
    """
    Logos pour l'en-tête PDF : société (AppSettings company_logo), annonces type logo (publicité),
    logos fournisseurs actifs. Retourne des data URI prêts pour <img src="...">.
    """
    out: Dict[str, Any] = {
        "union_logo_data_uri": None,
        "partner_logo_data_uris": [],
        "supplier_logo_uri_by_key": {},
    }
    try:
        from sqlmodel import Session, select
        from app.database import engine
        from app.models import AppSettings, Ad, SupplierLogo
    except Exception as e:
        _LOG.debug("PDF header assets: import/session indisponible: %s", e)
        return out

    union_uri: Optional[str] = None
    partner_uris: List[str] = []
    supplier_uri_by_key: Dict[str, str] = {}
    seen_raw: set = set()
    now = datetime.now()

    try:
        with Session(engine) as session:
            st = session.exec(select(AppSettings).where(AppSettings.key == "company_logo")).first()
            company_raw = (st.value or "").strip() if st else ""
            if company_raw:
                seen_raw.add(company_raw)
                union_uri = _fetch_image_as_data_uri(company_raw)

            ads = session.exec(
                select(Ad)
                .where(
                    Ad.is_active == True,  # noqa: E712
                    (Ad.start_at == None) | (Ad.start_at <= now),  # noqa: E711
                    (Ad.end_at == None) | (Ad.end_at >= now),  # noqa: E711
                )
                .order_by(Ad.sort_order, Ad.created_at.desc())
            ).all()

            for ad in ads:
                if len(partner_uris) >= _MAX_PARTNER_LOGOS:
                    break
                if not ad.image_url:
                    continue
                if getattr(ad, "kind", None) and ad.kind != "logo":
                    continue
                u = ad.image_url.strip()
                if not u or u in seen_raw:
                    continue
                seen_raw.add(u)
                data = _fetch_image_as_data_uri(u)
                if data:
                    partner_uris.append(data)

            sups = session.exec(
                select(SupplierLogo)
                .where(SupplierLogo.is_active == True)  # noqa: E712
                .order_by(SupplierLogo.supplier_key)
            ).all()
            for sl in sups:
                if not sl.image_url:
                    continue
                u = sl.image_url.strip()
                if not u:
                    continue
                data = _fetch_image_as_data_uri(u)
                if data:
                    supplier_uri_by_key[sl.supplier_key.upper().strip()] = data
                if len(partner_uris) >= _MAX_PARTNER_LOGOS:
                    continue
                if not u or u in seen_raw:
                    continue
                seen_raw.add(u)
                if data:
                    partner_uris.append(data)
    except Exception as e:
        _LOG.warning("PDF header assets: lecture BDD échouée: %s", e)
        out["supplier_logo_uri_by_key"] = supplier_uri_by_key
        return out

    out["union_logo_data_uri"] = union_uri
    out["partner_logo_data_uris"] = partner_uris
    out["supplier_logo_uri_by_key"] = supplier_uri_by_key
    return out


def _supplier_logo_lookup_keys(field_key: str) -> List[str]:
    """Clés SupplierLogo à essayer pour une clé métier (GLOBAL_*, TRI_*)."""
    gmap = {
        "GLOBAL_ACR": ["ACR"],
        "GLOBAL_DCA": ["DCA"],
        "GLOBAL_EXADIS": ["EXADIS"],
        "GLOBAL_ALLIANCE": ["ALLIANCE"],
    }
    if field_key in gmap:
        return gmap[field_key]
    if field_key == "TRI_SCHAEFFLER":
        return ["SCHAEFFLER", "ALLIANCE"]
    if field_key == "TRI_PURFLUX_COOPERS":
        return ["PURFLUX", "ALLIANCE", "ACR"]
    if field_key.startswith("TRI_"):
        parts = field_key.split("_")
        if len(parts) >= 2 and parts[1] in ("ACR", "DCA", "EXADIS", "ALLIANCE"):
            return [parts[1]]
    return []


def _enrich_rows_with_supplier_logos(rows: List[Dict], logo_map: Dict[str, str]) -> None:
    """Ajoute supplier_logo_data_uri sur chaque ligne (data URI ou None)."""
    for r in rows:
        uri: Optional[str] = None
        for k in _supplier_logo_lookup_keys(r.get("key") or ""):
            uri = logo_map.get(k.upper())
            if uri:
                break
        r["supplier_logo_data_uri"] = uri


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


def get_client_ca_category_label(ca_global: Optional[float]) -> str:
    """
    Catégorie adhérent selon le CA global d'achat (tranches commerciales).
    CLASSIQUE (1) : 0 € – 100 000 € | SILVER (2) : 100 001 € à 300 999,99 € | GOLD (3) : à partir de 301 000 €
    """
    ca = float(ca_global or 0)
    if ca <= 100_000:
        return "Client CLASSIQUE (1)"
    if ca < 301_000:
        return "Client SILVER (2)"
    return "Client GOLD (3)"


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

    header_assets = collect_pdf_header_assets()
    logo_map = header_assets.get("supplier_logo_uri_by_key") or {}
    _enrich_rows_with_supplier_logos(global_rows, logo_map)
    _enrich_rows_with_supplier_logos(tri_rows, logo_map)

    ca_total = entity_data.get("ca", {}).get("totals", {}).get("global_total", 0) or 0
    rfa_total = entity_data.get("rfa", {}).get("totals", {}).get("grand_total", 0) or 0
    rfa_total_ht = float(rfa_total or 0)
    rfa_total_ttc = rfa_total_ht * 1.2
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
        client_ca_category_label=get_client_ca_category_label(ca_total),
        rfa_total=rfa_total,
        rfa_invoice_ht_formatted=format_amount(rfa_total_ht),
        rfa_invoice_ttc_formatted=format_amount(rfa_total_ttc),
        rfa_rate_global=rfa_rate_global,
        potential_gain_near=potential_gain_near,
        near_count=near_count,
        achieved_count=achieved_count,
        total_objectives=total_objectives,
        global_rows=global_rows,
        tri_rows=tri_rows,
        format_amount=format_amount,
        format_percent=format_percent,
        union_logo_data_uri=header_assets.get("union_logo_data_uri"),
        partner_logo_data_uris=header_assets.get("partner_logo_data_uris") or [],
    )
    return html_content


def _get_espace_client_template() -> str:
    """Template HTML rapport RFA — design sobre et professionnel, compatible xhtml2pdf."""
    return """
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Rapport RFA — {{ entity_label }}</title>
    <style>
        @page { size: A4; margin: 12mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: white; line-height: 1.65; }

        /* ── HEADER ── */
        .hdr-table  { width: 100%; border-collapse: collapse; padding-bottom: 14px; border-bottom: 2px solid #000000; margin-bottom: 16px; }
        .hdr-label  { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 6px; }
        .hdr-right  { text-align: right; vertical-align: bottom; font-size: 9px; color: #333; }
        .hdr-gu     { font-size: 10px; font-weight: bold; color: #1a1a1a; }
        .logo-band  { width: 100%; border-collapse: collapse; margin-bottom: 14px; }

        /* ── KPI ── */
        .kpi-table { width: 100%; border-collapse: separate; border-spacing: 12px; margin-bottom: 18px; }
        .kpi-lbl   { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 5px; }
        .kpi-sub   { font-size: 9px; color: #777; margin-top: 4px; }

        /* ── SECTION ── */
        .sec-wrap  { padding-bottom: 8px; border-bottom: 1px solid #000000; margin-top: 22px; margin-bottom: 14px; }
        .sec-tri-page { page-break-before: always; }
        .sec-tri-page .sec-wrap { margin-top: 0; }
        .sec-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #333; }
        .pill      { font-size: 9px; padding: 3px 8px; margin-left: 6px; }
        .pill-g    { background: #d4edda; color: #155724; }
        .pill-y    { background: #fff3cd; color: #856404; }

        /* ── CARDS ── */
        .card      { border: 1px solid #000000; border-left: 3px solid #000000; page-break-inside: avoid; }
        .card-pri  { border-left: 3px solid #1a4a8a; }
        .card-top  { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .c-tag     { font-size: 9px; color: #1a4a8a; margin-left: 5px; }
        .c-rfa-run { font-size: 11px; color: #333; text-align: right; }
        .c-meta    { font-size: 10px; color: #444; margin-bottom: 10px; line-height: 1.55; }

        /* ── PIED DE CARTE ── */
        .c-foot    { width: 100%; border-collapse: collapse; margin-top: 6px; padding-top: 8px; }
        .c-miss    { font-size: 10px; color: #a05c00; line-height: 1.5; }
        .c-gain    { font-size: 10px; color: #1a4a8a; text-align: right; font-weight: 600; line-height: 1.5; }

        /* ── MESSAGE DE CLÔTURE ── */
        .pdf-message { margin-top: 20px; padding: 14px 16px; border: 1px solid #000000; background: #f9f9f7; font-size: 9px; line-height: 1.65; color: #222; text-align: justify; }
        .pdf-message p { margin: 0 0 11px 0; }
        .pdf-message p:last-child { margin-bottom: 0; }
        .pdf-message strong { color: #1a1a1a; }

        /* Annonce solennelle (PDF : pas de Google Fonts — italique serif, centré) */
        .pdf-message-hero {
            margin-top: 16px;
            padding: 20px 22px;
            border: 2px solid #1a4a8a;
            background: #f4f7fb;
            font-size: 15px;
            line-height: 1.6;
            font-style: italic;
            font-weight: normal;
            font-family: Georgia, "Palatino Linotype", Palatino, "Book Antiqua", "Times New Roman", Times, serif;
            color: #152a45;
            text-align: center;
        }
        .pdf-message-hero p { margin: 0 0 14px 0; }
        .pdf-message-hero p:last-child { margin-bottom: 0; }

        /* ── FOOTER PAGE ── */
        .pg-foot   { border-top: 1px solid #000000; padding-top: 10px; text-align: center; font-size: 9px; color: #555; }
    </style>
</head>
<body>

{% if union_logo_data_uri or partner_logo_data_uris %}
<table class="logo-band" cellpadding="0" cellspacing="0">
{% if union_logo_data_uri %}
<tr>
    <td style="text-align:center; padding-bottom:8px; vertical-align:middle;">
        <img src="{{ union_logo_data_uri }}" alt="" style="max-height:30px; max-width:160px;" />
    </td>
</tr>
{% endif %}
{% if partner_logo_data_uris %}
<tr>
    <td style="text-align:center; vertical-align:middle;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto; border-collapse:separate; border-spacing:6px;">
        <tr>
            {% for plogo in partner_logo_data_uris %}
            <td style="text-align:center; vertical-align:middle; border:1px solid #000000; padding:6px 8px; background:#fafafa;">
                <img src="{{ plogo }}" alt="" style="max-height:108px; max-width:280px;" />
            </td>
            {% endfor %}
        </tr>
        </table>
    </td>
</tr>
{% endif %}
</table>
<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:10px;font-size:1px;">&nbsp;</td></tr></table>
{% endif %}

<!-- ══ HEADER ══ -->
<table class="hdr-table" cellpadding="0" cellspacing="0">
<tr>
    <td style="vertical-align:bottom">
        <div class="hdr-label">Espace Client &mdash; Recapitulatif RFA</div>
        <div style="font-size:20px; font-weight:bold; color:#1a1a1a;">{{ entity_label }}</div>
    </td>
    <td class="hdr-right">
        <div class="hdr-gu">Groupement Union</div>
        <div>{{ date_generated }}</div>
        <div>Contrat : {{ contract_name }}</div>
    </td>
</tr>
</table>

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:10px;font-size:1px;">&nbsp;</td></tr></table>

<!-- ══ KPI ══ -->
<table class="kpi-table" cellpadding="0" cellspacing="10">
<tr>
    <td style="width:33%; background:#f5f5f3; padding:16px 18px; vertical-align:top; border:1px solid #000000;">
        <div class="kpi-lbl">Chiffre d'Affaires</div>
        <div style="font-size:23px; font-weight:bold; color:#1a1a1a;">{{ format_amount(ca_total) }}</div>
        <div style="font-size:10px; font-weight:600; color:#1a4a8a; margin-top:8px; line-height:1.35;">{{ client_ca_category_label }}</div>
        <div class="kpi-sub">CA global cumule</div>
    </td>
    <td style="width:33%; background:#f5f5f3; padding:16px 18px; vertical-align:top; border:1px solid #000000;">
        <div class="kpi-lbl">RFA Acquise</div>
        <div style="font-size:23px; font-weight:bold; color:#1a7a45;">{{ format_amount(rfa_total) }}</div>
        <div class="kpi-sub">{{ format_percent(rfa_rate_global / 100) }} du CA</div>
    </td>
    <td style="width:33%; background:#f5f5f3; padding:16px 18px; vertical-align:top; border:1px solid #000000;">
        <div class="kpi-lbl">Gain Potentiel</div>
        <div style="font-size:23px; font-weight:bold; color:#1a4a8a;">{{ ('+' + format_amount(potential_gain_near)) if near_count > 0 else '—' }}</div>
        <div class="kpi-sub">{{ near_count }} objectif(s) proche(s)</div>
    </td>
</tr>
</table>

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:10px;font-size:1px;">&nbsp;</td></tr></table>

<!-- ══ SECTION PLATEFORMES ══ -->
{% if global_rows %}
<div class="sec-wrap">
    <span class="sec-title">Objectifs Plateformes</span>
    {% set g_ok = global_rows | selectattr('achieved') | list | length %}
    {% if g_ok > 0 %}<span class="pill pill-g">{{ g_ok }} atteint(s)</span>{% endif %}
    {% set g_run = global_rows | length - g_ok %}
    {% if g_run > 0 %}<span class="pill pill-y">{{ g_run }} en cours</span>{% endif %}
</div>

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:10px;font-size:1px;">&nbsp;</td></tr></table>

{% for row in global_rows %}
{% set is_pri = row.near and not row.achieved %}
{% set gpct = row.combined_progress|round(0)|int %}
<div class="card{% if is_pri %} card-pri{% endif %}" style="margin-bottom:12px; padding:10px 12px;">

    <table class="card-top" cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
        <td style="width:96px; vertical-align:middle; padding-right:10px; text-align:center;">
            {% if row.supplier_logo_data_uri %}
            <img src="{{ row.supplier_logo_data_uri }}" alt="" style="max-height:76px; max-width:92px;" />
            {% else %}
            <span style="font-size:1px;">&nbsp;</span>
            {% endif %}
        </td>
        <td style="vertical-align:middle;">
            <div style="font-size:12px; font-weight:600; color:#1a1a1a;">
                {{ row.label }}
                {% if row.has_override %}<span style="font-size:8px;color:#7c3aed;margin-left:4px;">&#9998; perso</span>{% endif %}
                {% if is_pri %}<span class="c-tag">&#8599; Proche du seuil</span>{% endif %}
            </div>
            <div style="font-size:9px; color:#555; margin-top:4px;">CA plateforme : {{ format_amount(row.ca) }}</div>
            <div style="font-size:8px; color:#666; margin-top:5px;">Taux RFA appliqué : {{ format_percent(row.combined_rate) }}</div>
            <div style="font-size:8px; color:#666; margin-top:3px;">Progression vers le prochain palier : {{ gpct }}%</div>
            {% if not row.achieved and row.combined_next_min is not none %}
            <div style="font-size:8px; color:#333; margin-top:4px;">Prochain palier : {{ format_amount(row.combined_next_min) }}{% if row.next_combined_rate is not none %} — taux {{ format_percent(row.next_combined_rate) }}{% endif %}</div>
            {% elif row.achieved %}
            <div style="font-size:8px; color:#1a7a45; margin-top:4px;">Palier atteint</div>
            {% endif %}
        </td>
        <td style="width:26%; vertical-align:middle; text-align:right; padding-left:14px; padding-right:10px;">
            <div style="font-size:8px; color:#555; text-transform:uppercase; letter-spacing:0.3px; padding-right:2px;">Montant RFA réalisé</div>
            {% if row.achieved %}
            <div style="font-size:13px; font-weight:700; color:#1a7a45; margin-top:3px; padding-right:2px;">{{ format_amount(row.current_rfa_amount) }} &#10003;</div>
            {% else %}
            <div style="font-size:13px; font-weight:700; color:#1a1a1a; margin-top:3px; padding-right:2px;">{{ format_amount(row.current_rfa_amount) }}</div>
            {% endif %}
        </td>
    </tr>
    </table>

</div>
{% endfor %}
{% endif %}

<!-- ══ SECTION TRI-PARTITES (haut page 2 si des plateformes précèdent) ══ -->
{% if tri_rows %}
<div {% if global_rows %}class="sec-tri-page"{% endif %}>
<div class="sec-wrap">
    <span class="sec-title">Objectifs Tri-partites</span>
    {% set t_ok = tri_rows | selectattr('achieved') | list | length %}
    {% if t_ok > 0 %}<span class="pill pill-g">{{ t_ok }} atteint(s)</span>{% endif %}
    {% set t_run = tri_rows | length - t_ok %}
    {% if t_run > 0 %}<span class="pill pill-y">{{ t_run }} en cours</span>{% endif %}
</div>

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:10px;font-size:1px;">&nbsp;</td></tr></table>

{% for row in tri_rows %}
{% set pct = row.tri_progress.progress|round(0)|int %}
{% set is_pri = row.near and not row.achieved %}
<div class="card{% if is_pri %} card-pri{% endif %}" style="margin-bottom:12px; padding:10px 12px;">

    <table class="card-top" cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
        <td style="width:96px; vertical-align:middle; padding-right:10px; text-align:center;">
            {% if row.supplier_logo_data_uri %}
            <img src="{{ row.supplier_logo_data_uri }}" alt="" style="max-height:76px; max-width:92px;" />
            {% else %}
            <span style="font-size:1px;">&nbsp;</span>
            {% endif %}
        </td>
        <td style="vertical-align:middle;">
            <div style="font-size:12px; font-weight:600; color:#1a1a1a;">
                {{ row.label }}
                {% if row.has_override %}<span style="font-size:8px;color:#7c3aed;margin-left:4px;">&#9998; perso</span>{% endif %}
                {% if is_pri %}<span class="c-tag">&#8599; Proche du seuil</span>{% endif %}
            </div>
            <div style="font-size:9px; color:#555; margin-top:4px;">CA tri-partite : {{ format_amount(row.ca) }}</div>
            <div style="font-size:8px; color:#666; margin-top:5px;">Taux RFA appliqué : {{ format_percent(row.rate) }}</div>
            <div style="font-size:8px; color:#666; margin-top:3px;">Progression vers le prochain palier : {{ pct }}%</div>
            {% if not row.achieved and row.next_min is not none %}
            <div style="font-size:8px; color:#333; margin-top:4px;">Prochain palier : {{ format_amount(row.next_min) }}{% if row.next_tri_rate is not none %} — taux {{ format_percent(row.next_tri_rate) }}{% endif %}</div>
            {% elif row.achieved %}
            <div style="font-size:8px; color:#1a7a45; margin-top:4px;">Palier atteint</div>
            {% endif %}
        </td>
        <td style="width:26%; vertical-align:middle; text-align:right; padding-left:14px; padding-right:10px;">
            <div style="font-size:8px; color:#555; text-transform:uppercase; letter-spacing:0.3px; padding-right:2px;">Montant RFA réalisé</div>
            {% if row.achieved %}
            <div style="font-size:13px; font-weight:700; color:#1a7a45; margin-top:3px; padding-right:2px;">{{ format_amount(row.current_rfa_amount) }} &#10003;</div>
            {% else %}
            <div style="font-size:13px; font-weight:700; color:#1a1a1a; margin-top:3px; padding-right:2px;">{{ format_amount(row.current_rfa_amount) }}</div>
            {% endif %}
        </td>
    </tr>
    </table>

</div>
{% endfor %}
</div>
{% endif %}

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:22px;font-size:1px;">&nbsp;</td></tr></table>

<!-- ══ MESSAGE ADHÉRENT ══ -->
<div class="pdf-message">
    <p>
        Nous vous remercions de nous adresser la facture au nom de <strong>Groupement Union</strong>,
        d'un montant de <strong>{{ rfa_invoice_ttc_formatted }} TTC</strong>
        (montant RFA calculé hors taxes&nbsp;: {{ rfa_invoice_ht_formatted }} ; TVA 20&nbsp;% appliquée pour le total TTC).
    </p>
    <p>
        Si ce n'est pas encore fait, merci également de nous transmettre votre <strong>RIB</strong>,
        un extrait <strong>Kbis</strong> à jour ainsi que votre dernier <strong>bilan</strong>.
    </p>
</div>

<div class="pdf-message-hero">
    <p>
        Le <strong>Groupement Union</strong> a l'honneur de vous présenter son nouveau contrat, pensé en adéquation avec les évolutions du marché
        et l'ambition collective de notre réseau d'adhérents. Il institue une rémunération évolutive qui reconnaît le Groupement Union dans son intégralité&nbsp;:
        votre engagement et vos achats au sein du réseau s'inscrivent dans une même dynamique de progrès.
    </p>
    <p>
        Tout est lié&nbsp;: lorsque vous développez vos achats auprès des partenaires du réseau, c'est l'ensemble de votre rémunération qui peut s'améliorer,
        car la réussite du collectif renforce celle de chacun. Nous sommes fiers de bâtir cette aventure avec vous et vous remercions chaleureusement de votre confiance.
    </p>
</div>

<table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="height:14px;font-size:1px;">&nbsp;</td></tr></table>

<!-- ══ FOOTER ══ -->
<div class="pg-foot">
    Document genere le {{ date_generated }} &mdash; Espace Client RFA &mdash; Groupement Union
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
    contract_id: Optional[int] = None,
    import_data: Optional[ImportData] = None,
) -> BytesIO:
    """
    Génère un rapport PDF pour une entité (client ou groupe) avec les calculs RFA.
    Si import_data est fourni (ex. déjà résolu via _resolve_import_data), il est utilisé
    tel quel — évite tout décalage avec get_import seul (feuille live, cold start).
    """
    if import_data is None:
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
    pdf_buffer.seek(0)
    raw = pdf_buffer.getvalue()
    # xhtml2pdf incrémente souvent err pour des avertissements CSS alors que le PDF est valide
    if not raw.startswith(b"%PDF") or len(raw) < 64:
        raise ValueError(
            f"PDF invalide ou vide (xhtml2pdf err={result.err!r}, {len(raw)} octets)"
        )
    if result.err:
        import logging
        logging.getLogger(__name__).warning(
            "xhtml2pdf: %s avertissement(s) — PDF genere (%s octets)", result.err, len(raw)
        )
    return pdf_buffer
