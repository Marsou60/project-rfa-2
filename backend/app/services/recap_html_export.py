"""
Export HTML autonome — dashboard coût RFA sortante réseau.
"""
from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Any, Dict, List, Optional

from app.schemas import RecapGlobalRfa

PLATFORM_LABELS = {
    "GLOBAL_ACR": "ACR",
    "GLOBAL_ALLIANCE": "ALLIANCE",
    "GLOBAL_DCA": "DCA",
    "GLOBAL_EXADIS": "EXADIS",
}


def _fmt_amount(value: Any) -> str:
    try:
        return f"{float(value or 0):,.2f} €".replace(",", " ").replace(".", ",")
    except (TypeError, ValueError):
        return "0,00 €"


def _rows_html(rows: List[Dict[str, Any]], *, code_label: str = "Code Union") -> str:
    parts: List[str] = []
    total_ca = 0.0
    total_rfa = 0.0
    for item in rows:
        ca = float(item.get("montant_total_realise", 0) or 0)
        rfa = float(item.get("rfa_client", 0) or 0)
        total_ca += ca
        total_rfa += rfa
        code = escape(str(item.get("code_union", "") or ""))
        nom = escape(str(item.get("nom_client", "") or ""))
        contrat = escape(str(item.get("type_contrat", "") or ""))
        parts.append(
            f"""
        <tr>
          <td>{code}</td>
          <td>{nom}</td>
          <td class="num">{_fmt_amount(ca)}</td>
          <td class="num">{_fmt_amount(rfa)}</td>
          <td>{contrat}</td>
        </tr>"""
        )
    parts.append(
        f"""
        <tr class="total-row">
          <td colspan="2">TOTAL</td>
          <td class="num">{_fmt_amount(total_ca)}</td>
          <td class="num">{_fmt_amount(total_rfa)}</td>
          <td></td>
        </tr>"""
    )
    return "\n".join(parts)


def build_recap_sortante_html(
    *,
    import_id: str,
    recap: RecapGlobalRfa,
    independents: Optional[List[Dict[str, Any]]] = None,
    groups: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Construit un HTML autonome (CSS embarqué) pour le coût RFA sortante."""
    independents = independents or []
    groups = groups or []
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")

    platform_rows = []
    for key, amount in (recap.global_rfa_by_platform or {}).items():
        label = PLATFORM_LABELS.get(key, key)
        platform_rows.append(
            f"""
        <tr>
          <td>{escape(label)}</td>
          <td class="num">{_fmt_amount(amount)}</td>
        </tr>"""
        )

    indep_rows = _rows_html(independents)
    group_rows = _rows_html(groups)

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Coût RFA sortante — Groupement Union</title>
  <style>
    :root {{
      --navy: #1F4E79;
      --navy-soft: #D6E4F0;
      --green: #1B5E20;
      --green-bg: #E8F5E9;
      --muted: #666;
      --border: #c5d4e3;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #222;
      margin: 0;
      padding: 28px 32px 48px;
      background: #f7f9fc;
    }}
    .sheet {{
      max-width: 1100px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid var(--border);
      padding: 28px 32px 36px;
    }}
    h1 {{
      color: var(--navy);
      font-size: 22px;
      margin: 0 0 4px;
      letter-spacing: 0.02em;
    }}
    .subtitle {{
      color: var(--muted);
      font-size: 12px;
      margin: 0 0 4px;
    }}
    .meta {{
      color: #888;
      font-size: 11px;
      margin-bottom: 20px;
    }}
    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 18px 0 28px;
    }}
    .kpi {{
      background: #f0f4f8;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 12px;
      text-align: center;
    }}
    .kpi.primary {{
      background: var(--green-bg);
      border-color: #a5d6a7;
    }}
    .kpi-value {{
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }}
    .kpi.primary .kpi-value {{ color: var(--green); }}
    .kpi-label {{
      font-size: 10px;
      color: var(--muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    h2 {{
      color: var(--navy);
      font-size: 14px;
      margin: 28px 0 8px;
      border-bottom: 2px solid var(--navy);
      padding-bottom: 4px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }}
    th {{
      background: var(--navy);
      color: #fff;
      padding: 8px 10px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }}
    td {{
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
    }}
    tr:nth-child(even) td {{ background: #f8fafc; }}
    .num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
    .total-row td {{
      background: var(--navy-soft) !important;
      font-weight: 700;
      border-top: 2px solid var(--navy);
    }}
    .platform-table {{ max-width: 420px; }}
    .footnote {{
      margin-top: 28px;
      font-size: 10px;
      color: #888;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }}
    @media print {{
      body {{ background: #fff; padding: 0; }}
      .sheet {{ border: none; max-width: none; padding: 12px; }}
      .kpi-grid {{ break-inside: avoid; }}
      h2 {{ break-after: avoid; }}
      table {{ page-break-inside: auto; }}
      tr {{ page-break-inside: avoid; }}
      @page {{ size: A4 landscape; margin: 12mm; }}
    }}
    @media (max-width: 800px) {{
      .kpi-grid {{ grid-template-columns: 1fr 1fr; }}
      body {{ padding: 12px; }}
    }}
  </style>
</head>
<body>
  <div class="sheet">
    <h1>Groupement Union — Coût RFA sortante</h1>
    <p class="subtitle">RFA versée aux adhérents et groupes (indépendants + groupes consolidés, sans double comptage)</p>
    <p class="meta">Import {escape(import_id[:8])} · Généré le {escape(generated_at)}</p>

    <div class="kpi-grid">
      <div class="kpi primary">
        <div class="kpi-value">{_fmt_amount(recap.grand_total)}</div>
        <div class="kpi-label">RFA sortante totale</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">{_fmt_amount(recap.total_global)}</div>
        <div class="kpi-label">Plateformes (RFA+Bonus)</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">{_fmt_amount(recap.total_tri)}</div>
        <div class="kpi-label">Tripartites</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">{len(independents) + len(groups)}</div>
        <div class="kpi-label">{len(independents)} ind. · {len(groups)} grp.</div>
      </div>
    </div>

    <h2>Totaux par plateforme</h2>
    <table class="platform-table">
      <thead>
        <tr><th>Plateforme</th><th class="num">RFA sortante</th></tr>
      </thead>
      <tbody>
        {''.join(platform_rows)}
        <tr class="total-row">
          <td>Total plateformes</td>
          <td class="num">{_fmt_amount(recap.total_global)}</td>
        </tr>
      </tbody>
    </table>

    <h2>Magasins indépendants ({len(independents)})</h2>
    <table>
      <thead>
        <tr>
          <th>Code Union</th>
          <th>Nom</th>
          <th class="num">CA réalisé</th>
          <th class="num">RFA</th>
          <th>Contrat</th>
        </tr>
      </thead>
      <tbody>
        {indep_rows}
      </tbody>
    </table>

    <h2>Groupes consolidés ({len(groups)})</h2>
    <table>
      <thead>
        <tr>
          <th>Groupe</th>
          <th>Nom</th>
          <th class="num">CA réalisé</th>
          <th class="num">RFA</th>
          <th>Contrat</th>
        </tr>
      </thead>
      <tbody>
        {group_rows}
      </tbody>
    </table>

    <p class="footnote">
      Les montants correspondent au grand total du Récap général (get_global_recap_rfa).
      Les clients membres d’un groupe ne sont pas recomptés individuellement.
      Document autonome — ouvrable hors application.
    </p>
  </div>
</body>
</html>
"""
