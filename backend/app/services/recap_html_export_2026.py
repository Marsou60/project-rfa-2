"""
Dashboard HTML interactif — coût RFA sortante 2026 (à date + projection + vs 2025).
Fichier autonome (CSS + JS embarqués), ouvrable hors application.
"""
from __future__ import annotations

import json
from datetime import datetime
from html import escape
from typing import Any, Dict, Optional


MONTH_LABELS = {
    1: "janvier", 2: "février", 3: "mars", 4: "avril",
    5: "mai", 6: "juin", 7: "juillet", 8: "août",
    9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre",
}


def build_recap_sortante_2026_html(payload: Dict[str, Any]) -> str:
    """Construit le dashboard HTML à partir du payload network-rfa 2026."""
    data_json = json.dumps(payload, ensure_ascii=False)
    # Escape for embedding in <script> (avoid </script> breakout)
    data_json = data_json.replace("<", "\\u003c").replace(">", "\\u003e")

    year = int(payload.get("year") or 2026)
    month = payload.get("reporting_month")
    month_label = MONTH_LABELS.get(int(month), str(month)) if month else "—"
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    factor = payload.get("projection_factor")
    factor_txt = f"×{factor:.2f}" if factor else "—"

    ytd = payload.get("ytd") or {}
    proj = payload.get("projected") or {}
    cmp25 = payload.get("compare_2025")
    counts = payload.get("counts") or {}

    def fmt(v: Any) -> str:
        try:
            return f"{float(v or 0):,.0f} €".replace(",", " ")
        except (TypeError, ValueError):
            return "—"

    ytd_total = fmt(ytd.get("grand_total"))
    proj_total = fmt(proj.get("grand_total")) if proj else "—"
    total_2025 = fmt(cmp25.get("grand_total")) if cmp25 else "—"

    vs_proj = (cmp25 or {}).get("vs_projected") or {}
    delta_pct = vs_proj.get("delta_pct")
    delta_badge = ""
    if delta_pct is not None:
        sign = "+" if delta_pct > 0 else ""
        cls = "up" if delta_pct > 0 else ("down" if delta_pct < 0 else "flat")
        delta_badge = f'<span class="badge {cls}">{sign}{delta_pct} % vs 2025</span>'

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RFA sortante {year} — Groupement Union</title>
<style>
:root {{
  --ink: #0f2744;
  --ink-soft: #3d5674;
  --muted: #6b7c90;
  --line: #d7e0ea;
  --bg: #eef3f8;
  --card: #ffffff;
  --accent: #0e7490;
  --accent-soft: #cff4fc;
  --ytd: #0f766e;
  --ytd-soft: #ccfbf1;
  --proj: #1d4ed8;
  --proj-soft: #dbeafe;
  --n1: #9a3412;
  --n1-soft: #ffedd5;
  --up: #15803d;
  --down: #b91c1c;
  --radius: 14px;
  --shadow: 0 10px 30px rgba(15, 39, 68, 0.08);
  --font: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{
  font-family: var(--font);
  color: var(--ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, #d8f3f8 0%, transparent 55%),
    radial-gradient(900px 400px at 100% 0%, #dbeafe 0%, transparent 50%),
    var(--bg);
  min-height: 100vh;
}}
.wrap {{ max-width: 1280px; margin: 0 auto; padding: 28px 22px 60px; }}
.hero {{
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 18px;
  align-items: flex-end; margin-bottom: 22px;
}}
.brand {{
  font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); font-weight: 700; margin-bottom: 6px;
}}
h1 {{ margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }}
.sub {{ margin: 8px 0 0; color: var(--ink-soft); font-size: 14px; max-width: 560px; }}
.meta {{ color: var(--muted); font-size: 12px; margin-top: 8px; }}
.actions {{ display: flex; gap: 8px; flex-wrap: wrap; }}
.btn {{
  border: 1px solid var(--line); background: var(--card); color: var(--ink);
  border-radius: 999px; padding: 9px 14px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: 0.15s ease;
}}
.btn:hover {{ border-color: var(--accent); color: var(--accent); }}
.btn.primary {{ background: var(--ink); color: #fff; border-color: var(--ink); }}
.btn.primary:hover {{ background: var(--accent); border-color: var(--accent); }}
.kpi-grid {{
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px;
}}
.kpi {{
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px 16px 14px; box-shadow: var(--shadow); cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
  position: relative; overflow: hidden;
}}
.kpi:hover {{ transform: translateY(-2px); }}
.kpi.active {{ border-color: var(--accent); outline: 2px solid rgba(14,116,144,0.18); }}
.kpi .label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }}
.kpi .value {{ font-size: 26px; font-weight: 800; margin-top: 8px; letter-spacing: -0.03em; }}
.kpi .hint {{ font-size: 12px; color: var(--ink-soft); margin-top: 6px; }}
.kpi.ytd .value {{ color: var(--ytd); }}
.kpi.proj .value {{ color: var(--proj); }}
.kpi.n1 .value {{ color: var(--n1); }}
.badge {{
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 8px;
}}
.badge.up {{ background: #dcfce7; color: var(--up); }}
.badge.down {{ background: #fee2e2; color: var(--down); }}
.badge.flat {{ background: #e2e8f0; color: var(--ink-soft); }}
.panel {{
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 18px; margin-bottom: 16px;
}}
.panel h2 {{ margin: 0 0 12px; font-size: 15px; letter-spacing: -0.01em; }}
.chart {{
  display: grid; grid-template-columns: 110px 1fr 90px; gap: 8px 12px; align-items: center;
}}
.chart .bar-track {{
  height: 14px; background: #edf2f7; border-radius: 999px; overflow: hidden;
}}
.chart .bar {{ height: 100%; border-radius: 999px; width: 0; transition: width 0.6s ease; }}
.chart .bar.ytd {{ background: var(--ytd); }}
.chart .bar.proj {{ background: var(--proj); }}
.chart .bar.n1 {{ background: var(--n1); }}
.chart .name {{ font-size: 12px; font-weight: 700; color: var(--ink-soft); }}
.chart .amt {{ font-size: 12px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }}
.toolbar {{
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px;
}}
.chips {{ display: flex; gap: 6px; flex-wrap: wrap; }}
.chip {{
  border: 1px solid var(--line); background: #f8fafc; color: var(--ink-soft);
  border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
}}
.chip.active {{ background: var(--ink); color: #fff; border-color: var(--ink); }}
.search {{
  flex: 1; min-width: 180px; border: 1px solid var(--line); border-radius: 999px;
  padding: 9px 14px; font-size: 13px; outline: none;
}}
.search:focus {{ border-color: var(--accent); }}
.layout {{
  display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start;
}}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th {{
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line);
  cursor: pointer; user-select: none; white-space: nowrap;
}}
th .sort {{ opacity: 0.35; margin-left: 4px; }}
th.active .sort {{ opacity: 1; color: var(--accent); }}
td {{ padding: 10px; border-bottom: 1px solid #eef2f6; vertical-align: middle; }}
tr.entity {{ cursor: pointer; transition: background 0.12s ease; }}
tr.entity:hover {{ background: #f5fafc; }}
tr.entity.selected {{ background: var(--accent-soft); }}
.num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
.tag {{
  display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; padding: 2px 7px; border-radius: 999px;
}}
.tag.ind {{ background: #ecfeff; color: #0e7490; }}
.tag.grp {{ background: #eff6ff; color: #1d4ed8; }}
.lvl {{
  display: inline-block; font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.04em; padding: 3px 8px; border-radius: 999px; margin-left: 4px;
}}
.lvl.classique {{ background: #f1f5f9; color: #475569; }}
.lvl.silver {{ background: #e2e8f0; color: #334155; }}
.lvl.gold {{ background: #fef3c7; color: #92400e; }}
.lvl.special {{ background: #fae8ff; color: #86198f; }}
.lvl.none {{ background: #fee2e2; color: #991b1b; }}
.landing-box {{
  background: linear-gradient(135deg, #ecfeff, #eff6ff);
  border: 1px solid #bae6fd; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;
  font-size: 13px; line-height: 1.45;
}}
.landing-box strong {{ color: var(--ink); }}
.level {{
  font-size: 11px; font-weight: 700; color: var(--accent); margin-top: 2px;
}}
.muted {{ color: var(--muted); font-size: 11px; }}
.delta-pos {{ color: var(--up); font-weight: 700; }}
.delta-neg {{ color: var(--down); font-weight: 700; }}
.levels-bar {{
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
}}
.levels-bar .pill {{
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 12px; font-size: 12px; font-weight: 700;
}}
.detail-empty {{
  color: var(--muted); font-size: 13px; padding: 28px 8px; text-align: center;
}}
.detail-head {{ margin-bottom: 14px; }}
.detail-head h3 {{ margin: 0 0 4px; font-size: 18px; }}
.detail-head .code {{ color: var(--muted); font-size: 12px; }}
.stat-row {{
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;
}}
.stat {{
  background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
}}
.stat .k {{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; }}
.stat .v {{ font-size: 16px; font-weight: 800; margin-top: 4px; }}
.plat {{
  display: flex; justify-content: space-between; gap: 8px; padding: 8px 0;
  border-bottom: 1px solid #eef2f6; font-size: 13px;
}}
.plat:last-child {{ border-bottom: none; }}
.mode-note {{
  font-size: 12px; color: var(--ink-soft); margin-bottom: 10px;
}}
.footnote {{
  margin-top: 18px; font-size: 11px; color: var(--muted); line-height: 1.5;
}}
@media (max-width: 980px) {{
  .kpi-grid {{ grid-template-columns: 1fr 1fr; }}
  .layout {{ grid-template-columns: 1fr; }}
}}
@media print {{
  body {{ background: #fff; }}
  .actions, .toolbar, .btn {{ display: none !important; }}
  .kpi, .panel {{ box-shadow: none; }}
  .layout {{ grid-template-columns: 1fr; }}
  @page {{ size: A4 landscape; margin: 10mm; }}
}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div>
      <div class="brand">Groupement Union</div>
      <h1>Coût RFA sortante {year}</h1>
      <p class="sub">
        Vision réseau Pure Data — à date (fin {escape(str(month_label))}) et projection fin d’année,
        avec contrat / niveau d’atterrissage par adhérent et comparaison RFA 2025.
      </p>
      <p class="meta">Généré le {escape(generated_at)} · facteur projection {escape(factor_txt)} · {counts.get("entities", 0)} entités</p>
      <div class="levels-bar" id="levels-bar"></div>
    </div>
    <div class="actions">
      <button class="btn" type="button" onclick="window.print()">Imprimer</button>
      <button class="btn primary" type="button" id="btn-mode-ytd">Vue à date</button>
      <button class="btn" type="button" id="btn-mode-proj">Vue projection</button>
    </div>
  </header>

  <section class="kpi-grid">
    <article class="kpi ytd active" data-focus="ytd" id="kpi-ytd">
      <div class="label">RFA à date</div>
      <div class="value" id="kpi-ytd-val">{escape(ytd_total)}</div>
      <div class="hint">Cumul Pure Data · mois {escape(str(month or "—"))}</div>
    </article>
    <article class="kpi proj" data-focus="proj" id="kpi-proj">
      <div class="label">Projection fin {year}</div>
      <div class="value" id="kpi-proj-val">{escape(proj_total)}</div>
      <div class="hint">CA annualisé × recalcul paliers</div>
    </article>
    <article class="kpi n1" data-focus="n1" id="kpi-n1">
      <div class="label">RFA sortante 2025</div>
      <div class="value">{escape(total_2025)}</div>
      <div class="hint">Excel Vue RFA · sans double comptage</div>
    </article>
    <article class="kpi" data-focus="delta" id="kpi-delta">
      <div class="label">Écart projection vs 2025</div>
      <div class="value" style="font-size:22px">{delta_badge or "—"}</div>
      <div class="hint">Atterrissage attendu vs année N-1</div>
    </article>
  </section>

  <section class="panel">
    <h2>Comparaison des atterrissages</h2>
    <div class="chart" id="compare-chart"></div>
  </section>

  <div class="layout">
    <section class="panel">
      <h2>Entités réseau — atterrissage contrat</h2>
      <p class="mode-note" id="mode-note">Cliquez une ligne : CA fin d’année, contrat/niveau, RFA 2025 vs RFA 2026.</p>
      <div class="toolbar">
        <div class="chips" id="filter-chips">
          <button type="button" class="chip active" data-filter="all">Tous</button>
          <button type="button" class="chip" data-filter="independent">Indépendants ({counts.get("independents", 0)})</button>
          <button type="button" class="chip" data-filter="group">Groupes ({counts.get("groups", 0)})</button>
          <button type="button" class="chip" data-filter="upgrade">Montées de niveau</button>
          <button type="button" class="chip" data-filter="silver">→ Silver</button>
          <button type="button" class="chip" data-filter="gold">→ Gold</button>
        </div>
        <input class="search" id="search" type="search" placeholder="Rechercher code, nom, contrat…" />
      </div>
      <div style="overflow:auto; max-height: 620px;">
        <table>
          <thead>
            <tr>
              <th data-sort="nom">Entité <span class="sort">↕</span></th>
              <th data-sort="landing">Atterrissage <span class="sort">↕</span></th>
              <th class="num" data-sort="ca">CA fin {year} <span class="sort">↕</span></th>
              <th class="num" data-sort="rfa2025">RFA 2025 <span class="sort">↕</span></th>
              <th class="num active" data-sort="rfa">RFA 2026 <span class="sort">↓</span></th>
              <th class="num" data-sort="delta">Δ vs 2025 <span class="sort">↕</span></th>
            </tr>
          </thead>
          <tbody id="entity-tbody"></tbody>
        </table>
      </div>
    </section>

    <aside class="panel" id="detail-panel">
      <div class="detail-empty" id="detail-empty">
        Cliquez une entité pour voir l’atterrissage : CA projeté, niveau de contrat (Classique / Silver / Gold), RFA touchée en 2025 vs RFA 2026.
      </div>
      <div id="detail-body" hidden></div>
    </aside>
  </div>

  <p class="footnote">
    Totaux sans double comptage : indépendants + groupes consolidés.
    Pour Adhérents 2026, le niveau d’atterrissage (Classique / Silver / Gold) est recalculé sur le CA projeté fin d’année — pas une simple extrapolation de la RFA.
    RFA 2025 = montant Vue RFA Excel pour la même entité. Contrats spéciaux : pas de jargon Silver/Gold, seul le nom du contrat s’affiche.
  </p>
</div>

<script id="payload" type="application/json">{data_json}</script>
<script>
(function () {{
  const DATA = JSON.parse(document.getElementById('payload').textContent);
  const entities = []
    .concat((DATA.independents || []).map(e => ({{...e, _type: 'independent'}})))
    .concat((DATA.groups || []).map(e => ({{...e, _type: 'group'}})));

  let mode = 'proj'; // défaut : vision atterrissage
  let filter = 'all';
  let sortKey = 'rfa';
  let sortDir = 'desc';
  let selectedId = null;
  let query = '';

  const euro = (v) => {{
    if (v == null || Number.isNaN(Number(v))) return '—';
    return new Intl.NumberFormat('fr-FR', {{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}).format(Number(v));
  }};

  function currentRfa(e) {{
    return mode === 'proj' ? (e.rfa_proj ?? e.rfa_ytd) : e.rfa_ytd;
  }}
  function currentCa(e) {{
    return mode === 'proj' ? (e.ca_proj ?? e.ca_ytd) : e.ca_ytd;
  }}
  function currentLevel(e) {{
    return mode === 'proj' ? (e.level_proj || e.level_ytd) : e.level_ytd;
  }}
  function currentPlatforms(e) {{
    return mode === 'proj' ? (e.platforms_proj || e.platforms_ytd || []) : (e.platforms_ytd || []);
  }}
  function landingLabel(e) {{
    if (e.level_based) {{
      const lvl = e.level_proj || e.level_ytd;
      if (!lvl) return (e.type_contrat || 'Adhérents 2026') + ' · sous seuil';
      if (e.level_changed) return (e.type_contrat || 'Adhérents 2026') + ' · ' + e.level_ytd + ' → ' + e.level_proj;
      return (e.type_contrat || 'Adhérents 2026') + ' · ' + lvl;
    }}
    return e.type_contrat || 'Contrat spécial';
  }}
  function levelBadge(e) {{
    if (!e.level_based) return '<span class="lvl special">Spécial</span>';
    const lvl = (e.level_proj || e.level_ytd || '').toLowerCase();
    if (!lvl) return '<span class="lvl none">Sous seuil</span>';
    const cls = lvl.includes('gold') ? 'gold' : (lvl.includes('silver') ? 'silver' : 'classique');
    const txt = e.level_changed ? (e.level_ytd + '→' + e.level_proj) : (e.level_proj || e.level_ytd);
    return `<span class="lvl ${{cls}}">${{escapeHtml(txt)}}</span>`;
  }}
  function deltaHtml(e) {{
    const d = e.delta_rfa_vs_2025;
    if (d == null) return '<span class="muted">—</span>';
    const cls = d >= 0 ? 'delta-pos' : 'delta-neg';
    const sign = d > 0 ? '+' : '';
    return `<span class="${{cls}}">${{sign}}${{euro(d)}}</span>`;
  }}

  function renderLevelsBar() {{
    const el = document.getElementById('levels-bar');
    const levels = DATA.landing_levels || {{}};
    const upgrades = DATA.level_upgrades || 0;
    const parts = Object.keys(levels).sort().map(k =>
      `<span class="pill">${{escapeHtml(k)}} : <strong>${{levels[k]}}</strong></span>`
    );
    if (upgrades) parts.push(`<span class="pill">Montées de niveau : <strong>${{upgrades}}</strong></span>`);
    el.innerHTML = parts.join('');
  }}

  function renderChart() {{
    const ytd = Number((DATA.ytd || {{}}).grand_total || 0);
    const proj = Number(((DATA.projected || {{}}).grand_total) ?? ytd);
    const n1 = Number(((DATA.compare_2025 || {{}}).grand_total) ?? 0);
    const max = Math.max(ytd, proj, n1, 1);
    const rows = [
      {{ name: '2026 à date', val: ytd, cls: 'ytd' }},
      {{ name: '2026 projection', val: proj, cls: 'proj' }},
      {{ name: '2025 sortante', val: n1, cls: 'n1' }},
    ];
    const el = document.getElementById('compare-chart');
    el.innerHTML = rows.map(r => `
      <div class="name">${{r.name}}</div>
      <div class="bar-track"><div class="bar ${{r.cls}}" style="width:${{(r.val / max) * 100}}%"></div></div>
      <div class="amt">${{euro(r.val)}}</div>
    `).join('');
  }}

  function filtered() {{
    let list = entities.slice();
    if (filter === 'independent' || filter === 'group') list = list.filter(e => e._type === filter);
    if (filter === 'upgrade') list = list.filter(e => e.level_changed);
    if (filter === 'silver') list = list.filter(e => (e.level_proj || '').toLowerCase() === 'silver');
    if (filter === 'gold') list = list.filter(e => (e.level_proj || '').toLowerCase() === 'gold');
    if (query) {{
      const q = query.toLowerCase();
      list = list.filter(e =>
        String(e.code || '').toLowerCase().includes(q) ||
        String(e.nom || '').toLowerCase().includes(q) ||
        String(e.type_contrat || '').toLowerCase().includes(q) ||
        String(e.level_proj || '').toLowerCase().includes(q) ||
        String(e.landing_summary || '').toLowerCase().includes(q)
      );
    }}
    list.sort((a, b) => {{
      let av, bv;
      if (sortKey === 'nom') {{ av = a.nom || a.code; bv = b.nom || b.code; }}
      else if (sortKey === 'landing') {{ av = landingLabel(a); bv = landingLabel(b); }}
      else if (sortKey === 'ca') {{ av = (a.ca_proj ?? a.ca_ytd) || 0; bv = (b.ca_proj ?? b.ca_ytd) || 0; }}
      else if (sortKey === 'rfa2025') {{ av = a.rfa_2025 || 0; bv = b.rfa_2025 || 0; }}
      else if (sortKey === 'delta') {{ av = a.delta_rfa_vs_2025 || 0; bv = b.delta_rfa_vs_2025 || 0; }}
      else {{ av = currentRfa(a) || 0; bv = currentRfa(b) || 0; }}
      if (typeof av === 'string') {{
        const cmp = av.localeCompare(bv, 'fr', {{ sensitivity: 'base' }});
        return sortDir === 'asc' ? cmp : -cmp;
      }}
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    }});
    return list;
  }}

  function renderTable() {{
    const tbody = document.getElementById('entity-tbody');
    const list = filtered();
    tbody.innerHTML = list.map(e => {{
      const id = e._type + ':' + e.code;
      const tag = e._type === 'group'
        ? '<span class="tag grp">Groupe</span>'
        : '<span class="tag ind">Indép.</span>';
      const selected = id === selectedId ? 'selected' : '';
      return `<tr class="entity ${{selected}}" data-id="${{id}}">
        <td>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${{tag}}
            <strong>${{escapeHtml(e.nom || e.code)}}</strong>
            ${{levelBadge(e)}}
          </div>
          <div class="muted">${{escapeHtml(e.code)}}${{e.nb_comptes > 1 ? ' · ' + e.nb_comptes + ' comptes' : ''}}</div>
        </td>
        <td>
          <div>${{escapeHtml(landingLabel(e))}}</div>
          <div class="muted">${{escapeHtml((e.landing_summary || '').split(' · ').slice(0,2).join(' · '))}}</div>
        </td>
        <td class="num">${{euro(e.ca_proj ?? e.ca_ytd)}}</td>
        <td class="num">${{euro(e.rfa_2025)}}</td>
        <td class="num"><strong>${{euro(currentRfa(e))}}</strong></td>
        <td class="num">${{deltaHtml(e)}}</td>
      </tr>`;
    }}).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Aucune entité</td></tr>`;

    tbody.querySelectorAll('tr.entity').forEach(tr => {{
      tr.addEventListener('click', () => {{
        selectedId = tr.getAttribute('data-id');
        renderTable();
        renderDetail();
      }});
    }});
  }}

  function escapeHtml(s) {{
    return String(s ?? '').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
  }}

  function renderDetail() {{
    const empty = document.getElementById('detail-empty');
    const body = document.getElementById('detail-body');
    if (!selectedId) {{
      empty.hidden = false;
      body.hidden = true;
      return;
    }}
    const e = entities.find(x => (x._type + ':' + x.code) === selectedId);
    if (!e) {{
      empty.hidden = false;
      body.hidden = true;
      return;
    }}
    empty.hidden = true;
    body.hidden = false;
    const plats = currentPlatforms(e);
    const levelStory = e.level_based
      ? (e.level_proj
          ? (e.level_changed
              ? `Aujourd’hui <strong>${{escapeHtml(e.level_ytd)}}</strong> → fin d’année <strong>${{escapeHtml(e.level_proj)}}</strong>`
              : `Finira en <strong>${{escapeHtml(e.level_proj)}}</strong>`)
          : `Sous le seuil Classique — pas de rémunération niveau`)
      : `Contrat spécial <strong>${{escapeHtml(e.type_contrat || '')}}</strong> (pas de paliers Silver/Gold)`;

    body.innerHTML = `
      <div class="detail-head">
        <h3>${{escapeHtml(e.nom || e.code)}} ${{levelBadge(e)}}</h3>
        <div class="code">${{escapeHtml(e.code)}} · ${{escapeHtml(e.type_contrat || '')}}</div>
      </div>
      <div class="landing-box">
        <div><strong>Atterrissage</strong> — ${{escapeHtml(e.landing_summary || landingLabel(e))}}</div>
        <div style="margin-top:6px">${{levelStory}}</div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="k">CA fin 2026 (proj.)</div><div class="v">${{euro(e.ca_proj)}}</div></div>
        <div class="stat"><div class="k">CA à date</div><div class="v">${{euro(e.ca_ytd)}}</div></div>
        <div class="stat"><div class="k">RFA touchée 2025</div><div class="v" style="color:var(--n1)">${{euro(e.rfa_2025)}}</div></div>
        <div class="stat"><div class="k">RFA 2026 projection</div><div class="v" style="color:var(--proj)">${{euro(e.rfa_proj)}}</div></div>
        <div class="stat"><div class="k">RFA 2026 à date</div><div class="v" style="color:var(--ytd)">${{euro(e.rfa_ytd)}}</div></div>
        <div class="stat"><div class="k">Δ RFA proj. vs 2025</div><div class="v">${{deltaHtml(e)}}</div></div>
      </div>
      ${{e.contrat_2025 ? `<p class="mode-note">Contrat 2025 : <strong>${{escapeHtml(e.contrat_2025)}}</strong> · CA 2025 : <strong>${{euro(e.ca_2025)}}</strong></p>` : ''}}
      ${{e.tripartites_proj ? '<p class="mode-note">Tripartites <strong>débloquées</strong> en projection (Silver/Gold).</p>' : (e.level_based ? '<p class="mode-note">Tripartites non débloquées en projection (Classique ou sous seuil).</p>' : '')}}
      <h2 style="margin-top:8px">Plateformes (${{mode === 'proj' ? 'projection' : 'à date'}})</h2>
      ${{plats.length ? plats.map(p => `
        <div class="plat">
          <span>${{escapeHtml(p.label || p.key)}}</span>
          <span class="num"><strong>${{euro(p.rfa)}}</strong> <span style="color:var(--muted)">· CA ${{euro(p.ca)}}</span></span>
        </div>`).join('') : '<p class="detail-empty">Pas de détail plateforme</p>'}}
    `;
  }}

  function setMode(next) {{
    mode = next;
    document.getElementById('btn-mode-ytd').classList.toggle('primary', mode === 'ytd');
    document.getElementById('btn-mode-proj').classList.toggle('primary', mode === 'proj');
    document.getElementById('kpi-ytd').classList.toggle('active', mode === 'ytd');
    document.getElementById('kpi-proj').classList.toggle('active', mode === 'proj');
    document.getElementById('mode-note').textContent =
      mode === 'proj'
        ? 'Affichage projection fin d’année — contrat/niveau d’atterrissage et RFA 2026 vs 2025.'
        : 'Affichage à date — cliquez une ligne pour le détail d’atterrissage.';
    renderTable();
    renderDetail();
  }}

  document.getElementById('btn-mode-ytd').addEventListener('click', () => setMode('ytd'));
  document.getElementById('btn-mode-proj').addEventListener('click', () => setMode('proj'));
  document.querySelectorAll('.kpi[data-focus]').forEach(el => {{
    el.addEventListener('click', () => {{
      const f = el.getAttribute('data-focus');
      if (f === 'ytd') setMode('ytd');
      if (f === 'proj') setMode('proj');
    }});
  }});
  document.querySelectorAll('#filter-chips .chip').forEach(chip => {{
    chip.addEventListener('click', () => {{
      document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filter = chip.getAttribute('data-filter');
      renderTable();
    }});
  }});
  document.getElementById('search').addEventListener('input', (e) => {{
    query = e.target.value.trim();
    renderTable();
  }});
  document.querySelectorAll('th[data-sort]').forEach(th => {{
    th.addEventListener('click', () => {{
      const key = th.getAttribute('data-sort');
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {{ sortKey = key; sortDir = (key === 'nom' || key === 'landing') ? 'asc' : 'desc'; }}
      document.querySelectorAll('th[data-sort]').forEach(x => {{
        x.classList.toggle('active', x === th);
        const s = x.querySelector('.sort');
        if (s) s.textContent = x === th ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
      }});
      renderTable();
    }});
  }});

  renderLevelsBar();
  renderChart();
  setMode('proj');
}})();
</script>
</body>
</html>
"""

