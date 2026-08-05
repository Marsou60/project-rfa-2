import { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Tag,
  Target,
  ChevronRight,
  RefreshCw,
  Briefcase,
  Database,
  LayoutDashboard,
  AlertTriangle,
  BarChart3,
  Building2,
  GitBranch,
  UserCircle,
  Map,
  Package,
  Wrench,
  Link2,
} from 'lucide-react'
import { getNetworkDashboard } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from '../constants/suppliers'
import { useAuth } from '../context/AuthContext'

const MONTH_FR = ['', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

const NAV = [
  { id: 'synth', label: 'Synthèse', icon: LayoutDashboard, ey: '01 — Vue d\'ensemble' },
  { id: 'alertes', label: 'Alertes', icon: AlertTriangle, ey: '02 — Pilotage' },
  { id: 'evo', label: 'Évolution mensuelle', icon: BarChart3, ey: '03 — Tendance' },
  { id: 'plateformes', label: 'Plateformes 360°', icon: Building2, ey: '04 — Réseau' },
  { id: 'cross', label: 'Cross-plateformes', icon: GitBranch, ey: '05 — Synergies' },
  { id: 'clients', label: 'Clients', icon: Users, ey: '06 — Adhérents' },
  { id: 'groupes', label: 'Groupes clients', icon: Link2, ey: '07 — Groupes' },
  { id: 'commerciaux', label: 'Commerciaux', icon: UserCircle, ey: '08 — Force de vente' },
  { id: 'regions', label: 'Régions', icon: Map, ey: '09 — Territoires' },
  { id: 'marques', label: 'Marques', icon: Tag, ey: '10 — Marques' },
  { id: 'familles', label: 'Familles produits', icon: Package, ey: '11 — Familles' },
  { id: 'sousfam', label: 'Sous-familles', icon: Wrench, ey: '12 — Sous-familles' },
]

const fmtEur = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)

const fmtCompact = (v) => {
  const n = Number(v || 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`
  return `${sign}${Math.round(abs).toLocaleString('fr-FR')} €`
}

const fmtPct = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)} %`
}

function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="ud-trend flat">—</span>
  if (pct > 0.5) {
    return (
      <span className="ud-trend up">
        <TrendingUp className="w-3 h-3" /> {fmtPct(pct)}
      </span>
    )
  }
  if (pct < -0.5) {
    return (
      <span className="ud-trend down">
        <TrendingDown className="w-3 h-3" /> {fmtPct(pct)}
      </span>
    )
  }
  return (
    <span className="ud-trend flat">
      <Minus className="w-3 h-3" /> {fmtPct(pct)}
    </span>
  )
}

function MonthBars({ months, yearCurrent, yearPrevious }) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.current || 0, m.previous || 0)))
  return (
    <div className="ud-bars">
      {months.map((m) => (
        <div key={m.month} className="ud-bar-col" title={`${MONTH_FR[m.month]}: ${fmtCompact(m.current)} vs ${fmtCompact(m.previous)}`}>
          <div className="ud-bar-pair">
            <div className="ud-bar prev" style={{ height: `${((m.previous || 0) / max) * 100}%` }} />
            <div className="ud-bar cur" style={{ height: `${((m.current || 0) / max) * 100}%` }} />
          </div>
          <div className="ud-bar-lab">{MONTH_FR[m.month]?.slice(0, 3) || m.month}</div>
        </div>
      ))}
      <div className="ud-bar-legend">
        <span><i className="cur" /> {yearCurrent}</span>
        <span><i className="prev" /> {yearPrevious}</span>
      </div>
    </div>
  )
}

function SlideHead({ ey, title, sub, right }) {
  return (
    <div className="ud-head">
      <div>
        <div className="ud-ey">{ey}</div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

function Insight({ tone, label, value, detail }) {
  return (
    <div className={`ud-insight ${tone || ''}`}>
      <div className="il">{label}</div>
      <div className="iv">{value}</div>
      {detail && <div className="id">{detail}</div>}
    </div>
  )
}

function RankList({ title, items, valueKey = 'current' }) {
  const max = Math.max(1, ...(items || []).map((i) => i[valueKey] || 0))
  return (
    <div className="ud-panel">
      <h3>{title}</h3>
      <div className="ud-rank">
        {(items || []).map((it) => (
          <div key={it.key || it.code_union} className="ud-rank-row">
            <div className="ud-rank-top">
              <span className="name">{it.key || it.raison_sociale || it.code_union}</span>
              <span className="val">{fmtCompact(it[valueKey])}</span>
            </div>
            <div className="ud-rank-bar">
              <i style={{ width: `${((it[valueKey] || 0) / max) * 100}%` }} />
            </div>
            <div className="ud-rank-sub">
              <TrendBadge pct={it.delta_pct} />
              <span className="muted">{fmtCompact(it.delta)} vs N-1</span>
            </div>
          </div>
        ))}
        {!items?.length && <p className="ud-empty">Aucune donnée</p>}
      </div>
    </div>
  )
}

function DimTable({ rows, yearCurrent, yearPrevious, label = 'Libellé' }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows || []
    return (rows || []).filter((r) =>
      String(r.key || r.raison_sociale || r.code_union || '').toLowerCase().includes(term),
    )
  }, [rows, q])

  return (
    <div className="ud-panel">
      <div className="ud-table-tools">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher…"
          className="ud-search"
        />
        <span className="muted">{filtered.length} lignes</span>
      </div>
      <div className="ud-table-wrap">
        <table className="ud-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{label}</th>
              <th>CA {yearCurrent}</th>
              <th>CA {yearPrevious}</th>
              <th>Écart</th>
              <th>Évol.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.key || r.code_union || i}>
                <td><span className="ud-rk">{i + 1}</span></td>
                <td>
                  <div className="name">{r.key || r.raison_sociale}</div>
                  {r.code_union && <div className="subcode">{r.code_union}</div>}
                </td>
                <td><b>{fmtCompact(r.current)}</b></td>
                <td>{fmtCompact(r.previous)}</td>
                <td className={r.delta >= 0 ? 'pos' : 'neg'}>{fmtCompact(r.delta)}</td>
                <td><TrendBadge pct={r.delta_pct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="ud-empty" style={{ padding: 12 }}>Aucune ligne</p>}
      </div>
    </div>
  )
}

function AlertTable({ rows, columns }) {
  return (
    <div className="ud-table-wrap">
      <table className="ud-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.t}>{c.t}</th>)}</tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={r.key + String(i)}>
              {columns.map((c) => (
                <td key={c.t}>{c.render ? c.render(r) : r[c.k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows?.length && <p className="ud-empty" style={{ padding: 10 }}>Aucune alerte</p>}
    </div>
  )
}

const UD_CSS = `
  .ud-root {
    --ud-navy: #0d2f5e; --ud-navy2: #12376b; --ud-blue: #1b6ec2; --ud-red: #d81f2a;
    --ud-gold: #e0a400; --ud-green: #1a9e5f; --ud-green-l: #e5f6ee; --ud-rose: #fbe7e8;
    --ud-bg: #eef1f7; --ud-card: #fff; --ud-ink: #182338; --ud-muted: #6b7890;
    --ud-line: #e2e7f0; --ud-shadow: 0 4px 18px rgba(16,38,76,.10);
    background: var(--ud-bg); color: var(--ud-ink);
    min-height: calc(100vh - 72px); margin: -2rem -1rem 0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    display: flex; align-items: stretch;
  }
  @media (min-width: 640px) { .ud-root { margin-left: -1.5rem; margin-right: -1.5rem; } }
  @media (min-width: 1024px) { .ud-root { margin-left: -2rem; margin-right: -2rem; } }
  .ud-sidebar {
    width: 228px; flex-shrink: 0; background: linear-gradient(180deg,#0c2c58,#0a244a);
    color: #dbe6f6; display: flex; flex-direction: column; position: sticky; top: 0;
    align-self: flex-start; height: calc(100vh - 72px); z-index: 20;
    box-shadow: 2px 0 20px rgba(0,0,0,.12);
  }
  .ud-sb-brand { padding: 18px 16px 12px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .ud-sb-brand .ttl { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #8fb4e0; text-transform: uppercase; }
  .ud-sb-brand h2 { font-size: 15px; font-weight: 800; color: #fff; margin: 4px 0 0; line-height: 1.25; }
  .ud-sb-brand .per { font-size: 11px; color: #9bb4d4; margin-top: 4px; }
  .ud-nav { flex: 1; overflow-y: auto; padding: 8px 0; }
  .ud-nav button {
    display: flex; align-items: center; gap: 10px; width: 100%; background: none;
    color: #c3d3e8; padding: 10px 16px; font-size: 13px; text-align: left;
    border-left: 3px solid transparent; transition: .15s; cursor: pointer;
  }
  .ud-nav button:hover { background: rgba(255,255,255,.06); color: #fff; }
  .ud-nav button.on { background: rgba(27,110,194,.28); color: #fff; border-left-color: var(--ud-red); font-weight: 600; }
  .ud-nav button .abadge {
    margin-left: auto; background: var(--ud-red); color: #fff; font-size: 10px;
    font-weight: 800; border-radius: 10px; padding: 1px 7px;
  }
  .ud-sb-foot { padding: 12px 14px; border-top: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; gap: 6px; }
  .ud-sb-foot button {
    display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.06);
    color: #dbe6f6; border-radius: 8px; padding: 7px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer; border: none;
  }
  .ud-sb-foot button:hover { background: rgba(255,255,255,.12); }
  .ud-main { flex: 1; min-width: 0; padding: 20px 22px 40px; }
  .ud-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px;
    border-bottom:3px solid var(--ud-navy); padding-bottom:12px; margin-bottom:16px; flex-wrap:wrap; }
  .ud-ey { color:var(--ud-red); font-weight:700; font-size:12px; letter-spacing:2px; text-transform:uppercase; }
  .ud-head h1 { font-size:22px; color:var(--ud-navy); font-weight:800; margin:2px 0 0; }
  .ud-head p { color:var(--ud-muted); font-size:12.5px; margin-top:2px; }
  .ud-platseg { display:flex; gap:6px; flex-wrap:wrap; background:#eef2f8; padding:5px; border-radius:11px; margin-bottom:14px; }
  .ud-pseg { display:flex; align-items:center; gap:6px; background:transparent; border-radius:8px; padding:6px 13px;
    font-size:13px; font-weight:600; color:var(--ud-muted); border:1.5px solid transparent; cursor:pointer; }
  .ud-pseg:hover { background:#fff; color:var(--ud-navy); }
  .ud-pseg.on { background:#fff; color:var(--ud-navy); border-color:var(--ud-blue); box-shadow:0 2px 8px rgba(16,38,76,.12); }
  .ud-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  .ud-chip { background:#fff; border:1px solid var(--ud-line); border-radius:20px; padding:4px 12px;
    font-size:12px; font-weight:600; color:var(--ud-navy); box-shadow:var(--ud-shadow); }
  .ud-chip span { color:var(--ud-muted); font-weight:500; margin-right:4px; }
  .ud-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:12px; margin-bottom:16px; }
  .ud-kpi { background:var(--ud-card); border-radius:14px; padding:14px; box-shadow:var(--ud-shadow);
    border:1px solid var(--ud-line); position:relative; overflow:hidden; }
  .ud-kpi::before { content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--ud-blue); }
  .ud-kpi.red::before { background:var(--ud-red); } .ud-kpi.green::before { background:var(--ud-green); }
  .ud-kpi.gold::before { background:var(--ud-gold); } .ud-kpi.navy::before { background:var(--ud-navy); }
  .ud-kpi .lab { font-size:11px; color:var(--ud-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:600; }
  .ud-kpi .val { font-size:20px; font-weight:800; margin-top:5px; line-height:1.05; color:var(--ud-ink); }
  .ud-kpi .sub { font-size:12px; color:var(--ud-muted); margin-top:4px; }
  .ud-trend { display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:700; border-radius:20px; padding:2px 8px; }
  .ud-trend.up { background:var(--ud-green-l); color:var(--ud-green); }
  .ud-trend.down { background:var(--ud-rose); color:var(--ud-red); }
  .ud-trend.flat { background:#eef1f7; color:var(--ud-muted); }
  .ud-grid2 { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; margin-bottom:14px; }
  @media (max-width: 980px) {
    .ud-root { flex-direction: column; }
    .ud-sidebar { width: 100%; height: auto; position: relative; top: auto; }
    .ud-nav { display: flex; overflow-x: auto; padding: 6px 8px; gap: 4px; }
    .ud-nav button { border-left: none; border-bottom: 3px solid transparent; white-space: nowrap; padding: 8px 12px; border-radius: 8px; }
    .ud-nav button.on { border-left: none; border-bottom-color: var(--ud-red); }
    .ud-sb-foot { flex-direction: row; flex-wrap: wrap; }
    .ud-grid2 { grid-template-columns: 1fr; }
  }
  .ud-panel { background:var(--ud-card); border-radius:14px; border:1px solid var(--ud-line); box-shadow:var(--ud-shadow); padding:16px; margin-bottom:14px; }
  .ud-panel h3 { font-size:14px; font-weight:800; color:var(--ud-navy); margin:0 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ud-panel .psub { font-size:12px; color:var(--ud-muted); margin: -4px 0 10px; }
  .ud-acount { font-size:11px; font-weight:800; padding:2px 9px; border-radius:20px; background:#eef2f9; color:var(--ud-navy); }
  .ud-acount.r { background:var(--ud-rose); color:var(--ud-red); }
  .ud-acount.g { background:var(--ud-green-l); color:var(--ud-green); }
  .ud-acount.o { background:#fff4e0; color:#c47a00; }
  .ud-gauge { height:10px; border-radius:6px; background:#eef2f9; overflow:hidden; }
  .ud-gauge i { display:block; height:100%; background:linear-gradient(90deg,var(--ud-blue),var(--ud-navy)); border-radius:6px; }
  .ud-gauge.proj i { background:linear-gradient(90deg,var(--ud-gold),var(--ud-red)); }
  .ud-gauge-meta { display:flex; justify-content:space-between; font-size:11px; color:var(--ud-muted); margin-top:4px; }
  .ud-bars { display:flex; align-items:flex-end; gap:6px; height:180px; padding-top:8px; position:relative; }
  .ud-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; }
  .ud-bar-pair { display:flex; align-items:flex-end; gap:2px; height:calc(100% - 18px); width:100%; justify-content:center; }
  .ud-bar { width:40%; max-width:14px; border-radius:4px 4px 0 0; min-height:2px; }
  .ud-bar.cur { background:var(--ud-blue); } .ud-bar.prev { background:#c5d3e8; }
  .ud-bar-lab { font-size:10px; color:var(--ud-muted); font-weight:600; margin-top:4px; }
  .ud-bar-legend { position:absolute; top:0; right:0; display:flex; gap:10px; font-size:11px; color:var(--ud-muted); }
  .ud-bar-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:4px; vertical-align:middle; }
  .ud-bar-legend i.cur { background:var(--ud-blue); } .ud-bar-legend i.prev { background:#c5d3e8; }
  .ud-pcards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:14px; }
  .ud-pcard { background:var(--ud-card); border-radius:14px; border:1px solid var(--ud-line);
    box-shadow:var(--ud-shadow); padding:16px; border-top:4px solid var(--ud-blue); cursor:pointer; transition:.15s; text-align:left; width:100%; }
  .ud-pcard:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(16,38,76,.14); }
  .ud-pcard .pn { font-weight:800; color:var(--ud-navy); font-size:15px; }
  .ud-pcard .pca { font-size:22px; font-weight:800; margin-top:6px; }
  .ud-pcard .pmetrics { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; margin-top:10px; font-size:12px; color:var(--ud-muted); }
  .ud-pcard .pmetrics b { color:var(--ud-ink); font-weight:700; }
  .ud-pcard .pbar { height:6px; border-radius:4px; background:#eef2f9; margin-top:10px; overflow:hidden; }
  .ud-pcard .pbar i { display:block; height:100%; background:var(--ud-blue); }
  .ud-rank { display:flex; flex-direction:column; gap:10px; }
  .ud-rank-row .name { font-size:12.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%; }
  .ud-rank-top { display:flex; justify-content:space-between; gap:8px; }
  .ud-rank-top .val { font-size:12.5px; font-weight:800; color:var(--ud-navy); }
  .ud-rank-bar { height:5px; background:#eef2f9; border-radius:4px; margin:4px 0; overflow:hidden; }
  .ud-rank-bar i { display:block; height:100%; background:var(--ud-blue); border-radius:4px; }
  .ud-rank-sub { display:flex; gap:8px; align-items:center; font-size:11px; }
  .ud-rank-sub .muted, .muted { color:var(--ud-muted); }
  .ud-empty { color:var(--ud-muted); font-size:13px; }
  .ud-table-wrap { overflow-x:auto; }
  .ud-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .ud-table th { text-align:left; color:var(--ud-muted); font-size:10px; text-transform:uppercase; letter-spacing:.4px;
    padding:6px 8px; border-bottom:1px solid var(--ud-line); }
  .ud-table td { padding:8px; border-bottom:1px solid #f0f3f8; }
  .ud-table tr:hover td { background:#f7f9fc; }
  .ud-table .name { font-weight:700; } .ud-table .subcode { font-size:11px; color:var(--ud-muted); }
  .ud-table .pos { color:var(--ud-green); font-weight:700; } .ud-table .neg { color:var(--ud-red); font-weight:700; }
  .ud-rk { display:inline-block; width:21px; height:21px; line-height:21px; text-align:center; border-radius:6px; background:#eef2f9; color:var(--ud-navy); font-size:10.5px; font-weight:700; }
  .ud-table-tools { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
  .ud-search { border:1px solid var(--ud-line); border-radius:8px; padding:7px 11px; font-size:13px; min-width:180px; background:#f7f9fc; }
  .ud-insights { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:14px; }
  .ud-insight { border-radius:14px; padding:14px 16px; color:#fff; background:linear-gradient(135deg,#0d2f5e,#1b6ec2); box-shadow:var(--ud-shadow); }
  .ud-insight.r { background:linear-gradient(135deg,#8b1520,#d81f2a); }
  .ud-insight.g { background:linear-gradient(135deg,#0f6b3f,#1a9e5f); }
  .ud-insight.o { background:linear-gradient(135deg,#a66a00,#e0a400); }
  .ud-insight.dark { background:linear-gradient(135deg,#3a3f4b,#565d6d); }
  .ud-insight .il { font-size:11px; opacity:.85; font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
  .ud-insight .iv { font-size:22px; font-weight:800; margin-top:4px; }
  .ud-insight .id { font-size:12px; opacity:.9; margin-top:4px; }
  .ud-alert-ctrl { display:flex; flex-wrap:wrap; gap:12px; align-items:center; background:#fff; border:1px solid var(--ud-line);
    border-radius:12px; padding:10px 14px; margin-bottom:14px; box-shadow:var(--ud-shadow); font-size:12.5px; }
  .ud-alert-ctrl select { border:1px solid var(--ud-line); border-radius:8px; padding:5px 8px; font-weight:600; color:var(--ud-navy); }
  .ud-dist { display:flex; gap:8px; align-items:flex-end; height:120px; margin-top:8px; }
  .ud-dist-col { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; }
  .ud-dist-col .b { width:70%; border-radius:6px 6px 0 0; background:var(--ud-blue); min-height:4px; }
  .ud-dist-col .l { font-size:11px; color:var(--ud-muted); margin-top:4px; font-weight:600; }
  .ud-error { background:var(--ud-rose); color:var(--ud-red); border-radius:10px; padding:12px 14px; font-size:13px; margin-bottom:12px; }
  .ud-loading { color:var(--ud-muted); font-size:14px; padding:40px; text-align:center; }
  .ud-refresh { background:var(--ud-navy); color:#fff; border-radius:8px; padding:7px 12px; font-size:12px; font-weight:600;
    display:inline-flex; align-items:center; gap:6px; cursor:pointer; border:none; }
  .ud-refresh:hover { background:var(--ud-navy2); }
`

export default function UnionDashboardPage({ currentImportId, isCommercial = false, onNavigate }) {
  const { user } = useAuth()
  const { supplierFilter, setSupplierFilter } = useSupplierFilter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [active, setActive] = useState('synth')
  const [alertPct, setAlertPct] = useState(15)
  const [alertCaMin, setAlertCaMin] = useState(5000)
  const isAdmin = user?.role === 'ADMIN'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getNetworkDashboard({
        yearCurrent: 2026,
        yearPrevious: 2025,
        fournisseur: supplierFilter || undefined,
        alertPct,
        alertCaMin,
      })
      setData(res)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Erreur chargement dashboard')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [supplierFilter, alertPct, alertCaMin])

  const kpis = data?.kpis || {}
  const months = data?.months || []
  const platforms = data?.platforms || []
  const alertes = data?.alertes || {}
  const cross = data?.cross || {}
  const reportingMonth = data?.reporting_month
  const platformMonths = data?.platform_months || {}
  const navMeta = NAV.find((n) => n.id === active) || NAV[0]

  const periodLabel = useMemo(() => {
    if (!reportingMonth) return '2026'
    return `Janv – ${MONTH_FR[reportingMonth]} 2026`
  }, [reportingMonth])

  const objPct = Math.min(100, Math.max(0, Number(kpis.objectif_pct) || 0))
  const projPct = Math.min(120, Math.max(0, Number(kpis.projection_pct) || 0))
  const monthBars = months.filter((m) => (m.current || 0) > 0 || (m.previous || 0) > 0)
  const maxDist = Math.max(1, ...(cross.distribution || []).map((d) => d.count || 0))

  const go = (id) => {
    setActive(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filterBar = (
    <>
      <div className="ud-platseg">
        <button type="button" className={`ud-pseg ${!supplierFilter ? 'on' : ''}`} onClick={() => setSupplierFilter(null)}>Toutes</button>
        {SUPPLIER_KEYS.map((k) => (
          <button key={k} type="button" className={`ud-pseg ${supplierFilter === k ? 'on' : ''}`} onClick={() => setSupplierFilter(k)}>
            {SUPPLIER_LABELS[k] || k}
          </button>
        ))}
      </div>
      {Object.keys(platformMonths).length > 0 && (
        <div className="ud-chips">
          {SUPPLIER_KEYS.filter((k) => platformMonths[k]).map((k) => (
            <div key={k} className="ud-chip">
              <span>{SUPPLIER_LABELS[k] || k}</span>
              → {MONTH_FR[platformMonths[k]] || platformMonths[k]}
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="ud-root -mt-8 mb-[-2rem]">
      <style>{UD_CSS}</style>

      <aside className="ud-sidebar">
        <div className="ud-sb-brand">
          <div className="ttl">Union · Pilotage</div>
          <h2>Analyse consolidée</h2>
          <div className="per">{periodLabel}</div>
        </div>
        <nav className="ud-nav">
          {NAV.map((item) => {
            const Icon = item.icon
            const badge = item.id === 'alertes' ? alertes.n_crit : null
            return (
              <button key={item.id} type="button" className={active === item.id ? 'on' : ''} onClick={() => go(item.id)}>
                <Icon className="w-4 h-4 opacity-90" />
                {item.label}
                {badge > 0 && <span className="abadge">{badge}</span>}
              </button>
            )
          })}
        </nav>
        <div className="ud-sb-foot">
          <button type="button" onClick={() => onNavigate?.(currentImportId ? 'client-space' : (isCommercial ? 'hub' : 'upload'))}>
            <Briefcase className="w-3.5 h-3.5" /> Espace client
          </button>
          <button type="button" onClick={() => onNavigate?.('pure-data-monthly')}>
            <TrendingUp className="w-3.5 h-3.5" /> Suivi 2025/2026
          </button>
          {isAdmin && (
            <button type="button" onClick={() => onNavigate?.('pure-data-platform-import')}>
              <Database className="w-3.5 h-3.5" /> Import ventes
            </button>
          )}
        </div>
      </aside>

      <div className="ud-main">
        <div className="flex justify-end mb-3">
          <button type="button" className="ud-refresh" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {filterBar}
        {error && <div className="ud-error">{error}</div>}
        {loading && !data && <div className="ud-loading">Chargement du dashboard…</div>}

        {!loading && data && !data.available && (
          <div className="ud-panel">
            <p className="ud-empty">{data.message || 'Aucune donnée. Importez les ventes plateformes.'}</p>
            {isAdmin && (
              <button type="button" className="ud-refresh mt-3" onClick={() => onNavigate?.('pure-data-platform-import')}>
                <Database className="w-4 h-4" /> Import ventes plateformes
              </button>
            )}
          </div>
        )}

        {data?.available && active === 'synth' && (
          <>
            <SlideHead
              ey={navMeta.ey}
              title="Synthèse réseau Union"
              sub={`Période : ${periodLabel}${data.year_previous ? ` vs ${data.year_previous}` : ''}${supplierFilter ? ` · ${SUPPLIER_LABELS[supplierFilter]}` : ''}`}
            />
            <div className="ud-kpis">
              <div className="ud-kpi navy">
                <div className="lab">CA YTD {data.year_current}</div>
                <div className="val">{fmtCompact(kpis.ca_ytd)}</div>
                <div className="sub"><TrendBadge pct={kpis.delta_pct} /> vs N-1</div>
              </div>
              <div className={`ud-kpi ${kpis.delta >= 0 ? 'green' : 'red'}`}>
                <div className="lab">Écart vs {data.year_previous}</div>
                <div className="val">{fmtCompact(kpis.delta)}</div>
                <div className="sub">{fmtCompact(kpis.ca_n1_same_period)} même période</div>
              </div>
              <div className="ud-kpi gold">
                <div className="lab">Objectif 2026</div>
                <div className="val">{fmtCompact(kpis.objectif)}</div>
                <div className="ud-gauge" style={{ marginTop: 8 }}><i style={{ width: `${objPct}%` }} /></div>
                <div className="ud-gauge-meta"><span>{fmtPct(kpis.objectif_pct)}</span></div>
              </div>
              <div className="ud-kpi">
                <div className="lab">Projection</div>
                <div className="val">{kpis.projection != null ? fmtCompact(kpis.projection) : '—'}</div>
                <div className="ud-gauge proj" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, projPct)}%` }} /></div>
                <div className="ud-gauge-meta"><span>{kpis.projection_method || '—'}</span><span>{fmtPct(kpis.projection_pct)}</span></div>
              </div>
              <div className="ud-kpi">
                <div className="lab">Adhérents</div>
                <div className="val">{kpis.nb_clients || 0}</div>
                <div className="sub">{kpis.nb_marques} marques · {kpis.nb_familles} familles</div>
              </div>
              <div className="ud-kpi navy">
                <div className="lab">Meilleur mois</div>
                <div className="val">{MONTH_FR[kpis.best_month] || '—'}</div>
                <div className="sub">{fmtCompact(kpis.best_month_ca)}</div>
              </div>
              <div className="ud-kpi">
                <div className="lab">Panier moyen</div>
                <div className="val">{kpis.panier_moyen != null ? fmtCompact(kpis.panier_moyen) : '—'}</div>
                <div className="sub">CA / adhérent actif</div>
              </div>
            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Évolution mensuelle</h3>
                <MonthBars months={monthBars} yearCurrent={data.year_current} yearPrevious={data.year_previous} />
              </div>
              <div className="ud-panel">
                <h3 className="flex items-center gap-2"><Target className="w-4 h-4 text-[var(--ud-red)]" /> Objectif 21 M€</h3>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ud-navy)', marginBottom: 8 }}>{fmtEur(kpis.ca_ytd)}</div>
                <div className="ud-gauge" style={{ height: 14 }}><i style={{ width: `${objPct}%` }} /></div>
                <div className="ud-gauge-meta" style={{ marginTop: 8 }}><span>Réalisé YTD</span><span>{fmtPct(kpis.objectif_pct)}</span></div>
                <p style={{ fontSize: 12, color: 'var(--ud-muted)', marginTop: 12 }}>
                  Objectif {fmtEur(kpis.objectif)} · Projection {kpis.projection != null ? fmtCompact(kpis.projection) : '—'}
                </p>
                <button type="button" className="ud-refresh mt-3" onClick={() => go('alertes')}>
                  Voir les alertes {alertes.n_crit > 0 ? `(${alertes.n_crit})` : ''} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="ud-pcards">
              {platforms.slice(0, 4).map((p) => (
                <button key={p.platform} type="button" className="ud-pcard" onClick={() => { setSupplierFilter(p.platform); go('plateformes') }}>
                  <div className="flex justify-between"><div className="pn">{SUPPLIER_LABELS[p.platform] || p.platform}</div><TrendBadge pct={p.delta_pct} /></div>
                  <div className="pca">{fmtCompact(p.current)}</div>
                  <div className="pmetrics">
                    <span>Part <b>{p.share_pct != null ? `${p.share_pct} %` : '—'}</b></span>
                    <span>Clients <b>{p.nb_clients}</b></span>
                  </div>
                </button>
              ))}
            </div>
            <div className="ud-grid2">
              <RankList title="Top marques" items={data.top_marques} />
              <RankList title="Top familles" items={data.top_familles} />
            </div>
          </>
        )}

        {data?.available && active === 'alertes' && (
          <>
            <SlideHead ey={navMeta.ey} title="Alertes & signaux" sub={`Détection automatique ${periodLabel} vs ${data.year_previous}`} />
            <div className="ud-alert-ctrl">
              <strong style={{ color: 'var(--ud-navy)' }}>Seuils</strong>
              <label>Baisse/hausse ≥{' '}
                <select value={alertPct} onChange={(e) => setAlertPct(Number(e.target.value))}>
                  {[10, 15, 20, 25, 30, 40].map((v) => <option key={v} value={v}>{v} %</option>)}
                </select>
              </label>
              <label>CA min N-1{' '}
                <select value={alertCaMin} onChange={(e) => setAlertCaMin(Number(e.target.value))}>
                  {[1000, 2500, 5000, 10000, 20000, 50000].map((v) => <option key={v} value={v}>{fmtCompact(v)}</option>)}
                </select>
              </label>
            </div>
            <div className="ud-insights">
              <Insight tone="r" label="CA à risque" value={fmtCompact(alertes.ca_risque)} detail={`${alertes.clients_risque?.length || 0} clients ≤ -${alertPct}%`} />
              <Insight tone="o" label="Décrochages silencieux" value={fmtCompact(alertes.ca_recent)} detail={`${alertes.clients_recent?.length || 0} clients · 2 derniers mois`} />
              <Insight tone="dark" label="CA perdu (silencieux)" value={fmtCompact(alertes.ca_perdu)} detail={`${alertes.clients_perdus?.length || 0} sans commande ${data.year_current}`} />
              <Insight tone="g" label="CA opportunités" value={`+${fmtCompact(alertes.ca_opportunites)}`} detail={`${alertes.clients_boom?.length || 0} hausses · ${alertes.clients_new?.length || 0} nouveaux`} />
            </div>
            <div className="ud-panel" style={{ borderTop: '4px solid #e0a400' }}>
              <h3>Décrochages récents (silencieux) <span className="ud-acount o">{alertes.clients_recent?.length || 0}</span></h3>
              <p className="psub">
                Cumul encore correct (ou baisse récente nettement plus forte), sur les 2 derniers mois
                {alertes.recent_months?.length
                  ? ` (${alertes.recent_months.map((m) => MONTH_FR[m]).join(' + ')})`
                  : ''}{' '}
                ≥ {alertPct}% vs {data.year_previous}
                {alertes.mens_platforms?.length
                  ? ` · plateformes mensualisées : ${alertes.mens_platforms.join(', ')}`
                  : ''}
              </p>
              <AlertTable
                rows={alertes.clients_recent}
                columns={[
                  { t: 'Client', render: (r) => (
                    <>
                      <div className="name">{r.key}{r.silent === false ? ' · accélération' : ''}</div>
                      <div className="subcode">{r.code_union}</div>
                    </>
                  ) },
                  { t: '2 derniers mois', render: (r) => fmtCompact(r.recent_current) },
                  { t: `vs ${data.year_previous}`, render: (r) => fmtCompact(r.recent_previous) },
                  { t: 'Écart récent', render: (r) => <span className="neg">{fmtCompact(r.recent_delta)}</span> },
                  { t: 'Récent', render: (r) => <TrendBadge pct={r.recent_pct} /> },
                  { t: 'Cumul', render: (r) => <TrendBadge pct={r.delta_pct} /> },
                ]}
              />            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Clients à risque <span className="ud-acount r">{alertes.clients_risque?.length || 0}</span></h3>
                <p className="psub">Baisse ≥ {alertPct}%, CA N-1 ≥ {fmtCompact(alertCaMin)}</p>
                <AlertTable
                  rows={alertes.clients_risque}
                  columns={[
                    { t: 'Client', render: (r) => <><div className="name">{r.key}</div><div className="subcode">{r.code_union}</div></> },
                    { t: 'CA', render: (r) => fmtCompact(r.current) },
                    { t: 'Écart', render: (r) => <span className="neg">{fmtCompact(r.delta)}</span> },
                    { t: 'Évol.', render: (r) => <TrendBadge pct={r.delta_pct} /> },
                  ]}
                />
              </div>
              <div className="ud-panel">
                <h3>Clients perdus / silencieux <span className="ud-acount r">{alertes.clients_perdus?.length || 0}</span></h3>
                <p className="psub">Actifs N-1, aucune commande {data.year_current}</p>
                <AlertTable
                  rows={alertes.clients_perdus}
                  columns={[
                    { t: 'Client', render: (r) => <div className="name">{r.key}</div> },
                    { t: `CA ${data.year_previous}`, render: (r) => <span className="neg">{fmtCompact(r.previous)}</span> },
                  ]}
                />
              </div>
            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Opportunités clients <span className="ud-acount g">{(alertes.clients_boom?.length || 0) + (alertes.clients_new?.length || 0)}</span></h3>
                <AlertTable
                  rows={[...(alertes.clients_boom || []), ...(alertes.clients_new || [])].slice(0, 25)}
                  columns={[
                    { t: 'Client', render: (r) => <div className="name">{r.tag === 'new' ? `NEW · ${r.key}` : r.key}</div> },
                    { t: 'CA', render: (r) => fmtCompact(r.current) },
                    { t: 'Gain', render: (r) => <span className="pos">+{fmtCompact(r.tag === 'new' ? r.current : r.delta)}</span> },
                    { t: 'Évol.', render: (r) => (r.tag === 'new' ? <span className="ud-trend flat">nouveau</span> : <TrendBadge pct={r.delta_pct} />) },
                  ]}
                />
              </div>
              <div className="ud-panel">
                <h3>Marques en décrochage <span className="ud-acount r">{(alertes.marques_risque?.length || 0) + (alertes.marques_perdues?.length || 0)}</span></h3>
                <AlertTable
                  rows={[...(alertes.marques_perdues || []).map((m) => ({ ...m, gone: 1 })), ...(alertes.marques_risque || [])].slice(0, 25)}
                  columns={[
                    { t: 'Marque', render: (r) => <div className="name">{r.key}{r.gone ? ' · STOPPÉE' : ''}</div> },
                    { t: 'CA', render: (r) => fmtCompact(r.current) },
                    { t: 'Écart', render: (r) => <span className="neg">{fmtCompact(r.gone ? -r.previous : r.delta)}</span> },
                    { t: 'Évol.', render: (r) => (r.gone ? <span className="ud-trend down">arrêt</span> : <TrendBadge pct={r.delta_pct} />) },
                  ]}
                />
              </div>
            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Marques qui perdent des acheteurs <span className="ud-acount o">{alertes.marques_acheteurs?.length || 0}</span></h3>
                <AlertTable
                  rows={alertes.marques_acheteurs}
                  columns={[
                    { t: 'Marque', render: (r) => <div className="name">{r.key}</div> },
                    { t: 'Acheteurs N', render: (r) => r.buyers_current },
                    { t: 'Acheteurs N-1', render: (r) => r.buyers_previous },
                    { t: 'Δ clients', render: (r) => <span className="neg">{r.buyers_delta}</span> },
                  ]}
                />
              </div>
              <div className="ud-panel">
                <h3>Marques en boom <span className="ud-acount g">{alertes.marques_boom?.length || 0}</span></h3>
                <AlertTable
                  rows={alertes.marques_boom}
                  columns={[
                    { t: 'Marque', render: (r) => <div className="name">{r.key}</div> },
                    { t: 'CA', render: (r) => fmtCompact(r.current) },
                    { t: 'Gain', render: (r) => <span className="pos">+{fmtCompact(r.delta)}</span> },
                    { t: 'Évol.', render: (r) => <TrendBadge pct={r.delta_pct} /> },
                  ]}
                />
              </div>
            </div>
          </>
        )}

        {data?.available && active === 'evo' && (
          <>
            <SlideHead ey={navMeta.ey} title="Évolution mensuelle" sub={`${data.year_current} vs ${data.year_previous}`} />
            <div className="ud-panel">
              <MonthBars months={monthBars} yearCurrent={data.year_current} yearPrevious={data.year_previous} />
            </div>
            <div className="ud-panel">
              <table className="ud-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>{data.year_current}</th>
                    <th>{data.year_previous}</th>
                    <th>Écart</th>
                    <th>Évol.</th>
                  </tr>
                </thead>
                <tbody>
                  {monthBars.map((m) => (
                    <tr key={m.month}>
                      <td className="name">{MONTH_FR[m.month]}</td>
                      <td><b>{fmtCompact(m.current)}</b></td>
                      <td>{fmtCompact(m.previous)}</td>
                      <td className={m.delta >= 0 ? 'pos' : 'neg'}>{fmtCompact(m.delta)}</td>
                      <td><TrendBadge pct={m.delta_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {data?.available && active === 'plateformes' && (
          <>
            <SlideHead ey={navMeta.ey} title="Plateformes 360°" sub={`${platforms.length} plateformes · ${fmtCompact(kpis.ca_ytd)} consolidé`} />
            <div className="ud-insights">
              <Insight label="Plateforme n°1" value={SUPPLIER_LABELS[kpis.platform_leader] || kpis.platform_leader || '—'} detail={platforms[0] ? `${fmtCompact(platforms[0].current)} · ${platforms[0].share_pct || 0}%` : ''} />
              <Insight tone="g" label="La + dynamique" value={SUPPLIER_LABELS[kpis.platform_star] || kpis.platform_star || '—'} detail={fmtPct(kpis.platform_star_pct)} />
              <Insight label="Panier moyen réseau" value={kpis.panier_moyen != null ? fmtCompact(kpis.panier_moyen) : '—'} />
            </div>
            <div className="ud-pcards">
              {platforms.map((p) => (
                <button
                  key={p.platform}
                  type="button"
                  className="ud-pcard"
                  onClick={() => setSupplierFilter(supplierFilter === p.platform ? null : p.platform)}
                >
                  <div className="flex justify-between items-start">
                    <div className="pn">{SUPPLIER_LABELS[p.platform] || p.platform}</div>
                    <TrendBadge pct={p.delta_pct} />
                  </div>
                  <div className="pca">{fmtCompact(p.current)}</div>
                  <div className="pmetrics">
                    <span>Part <b>{p.share_pct != null ? `${p.share_pct} %` : '—'}</b></span>
                    <span>Écart <b>{fmtCompact(p.delta)}</b></span>
                    <span>Clients <b>{p.nb_clients}</b></span>
                    <span>Marques <b>{p.nb_marques}</b></span>
                    <span>Panier <b>{p.panier_moyen != null ? fmtCompact(p.panier_moyen) : '—'}</b></span>
                  </div>
                  <div className="pbar"><i style={{ width: `${Math.min(100, p.share_pct || 0)}%` }} /></div>
                  {p.reporting_month && (
                    <div style={{ fontSize: 11, color: 'var(--ud-muted)', marginTop: 8 }}>
                      À jour jusqu&apos;à {MONTH_FR[p.reporting_month]}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {data?.available && active === 'cross' && (
          <>
            <SlideHead ey={navMeta.ey} title="Cross-plateformes" sub="Présence des adhérents sur le réseau" />
            <div className="ud-insights">
              <Insight tone="r" label="Mono-plateforme" value={cross.mono || 0} detail={`${fmtCompact(cross.mono_ca)} · cibles cross-selling`} />
              <Insight tone="g" label={`Fidèles aux ${cross.n_platforms || 0} plateformes`} value={cross.loyal || 0} detail={fmtCompact(cross.loyal_ca)} />
              <Insight label="Moy. plateformes / adhérent" value={cross.avg_platforms ?? '—'} detail={`${cross.relations || 0} relations`} />
            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Répartition par nbre de plateformes</h3>
                <div className="ud-dist">
                  {(cross.distribution || []).map((d) => (
                    <div key={d.n} className="ud-dist-col">
                      <div className="b" style={{ height: `${(d.count / maxDist) * 100}%`, background: d.n === 1 ? 'var(--ud-red)' : d.n === cross.n_platforms ? 'var(--ud-green)' : 'var(--ud-blue)' }} />
                      <div className="l">{d.n} · {d.count}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ud-panel">
                <h3>CA selon présence</h3>
                <div className="ud-dist">
                  {(cross.distribution || []).map((d) => {
                    const maxCa = Math.max(1, ...(cross.distribution || []).map((x) => x.ca || 0))
                    return (
                      <div key={d.n} className="ud-dist-col">
                        <div className="b" style={{ height: `${(d.ca / maxCa) * 100}%` }} />
                        <div className="l">{fmtCompact(d.ca)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="ud-grid2">
              <div className="ud-panel">
                <h3>Plus gros captifs (1 plateforme)</h3>
                <table className="ud-table">
                  <thead><tr><th>Adhérent</th><th>Plateforme</th><th>CA</th></tr></thead>
                  <tbody>
                    {(cross.mono_targets || []).map((c) => (
                      <tr key={c.code_union}>
                        <td><div className="name">{c.raison_sociale}</div></td>
                        <td>{SUPPLIER_LABELS[c.platform] || c.platform}</td>
                        <td><b>{fmtCompact(c.current)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ud-panel">
                <h3>Fidèles {cross.n_platforms}/{cross.n_platforms} plateformes</h3>
                <table className="ud-table">
                  <thead><tr><th>Adhérent</th><th>Nb</th><th>CA</th></tr></thead>
                  <tbody>
                    {(cross.loyal_clients || []).map((c) => (
                      <tr key={c.code_union}>
                        <td><div className="name">{c.raison_sociale}</div></td>
                        <td>{c.n_platforms}/{cross.n_platforms}</td>
                        <td><b>{fmtCompact(c.current)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {data?.available && active === 'clients' && (
          <>
            <SlideHead ey={navMeta.ey} title="Clients" sub={`${kpis.nb_clients || 0} adhérents · classement CA`} />
            <div className="ud-insights">
              <Insight label="Concentration Top 10" value={kpis.top10_share_pct != null ? `${kpis.top10_share_pct} %` : '—'} />
              <Insight tone="g" label={`Nouveaux ${data.year_current}`} value={kpis.nb_clients_new || 0} />
              <Insight tone="r" label="Clients perdus" value={kpis.nb_clients_lost || 0} />
            </div>
            <div className="ud-grid2">
              <RankList title="Plus fortes progressions" items={data.top_clients_up?.map((c) => ({ ...c, key: c.raison_sociale }))} />
              <RankList title="Plus fortes baisses" items={data.top_clients_down?.map((c) => ({ ...c, key: c.raison_sociale }))} />
            </div>
            <DimTable rows={data.clients} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Client" />
          </>
        )}

        {data?.available && active === 'groupes' && (
          <>
            <SlideHead ey={navMeta.ey} title="Groupes clients" sub="Classement par groupe" />
            <DimTable rows={data.groupes} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Groupe" />
          </>
        )}

        {data?.available && active === 'commerciaux' && (
          <>
            <SlideHead ey={navMeta.ey} title="Commerciaux" sub="Portefeuilles CA" />
            <DimTable rows={data.commerciaux} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Commercial" />
          </>
        )}

        {data?.available && active === 'regions' && (
          <>
            <SlideHead ey={navMeta.ey} title="Régions" sub="Territoires commerciaux" />
            <DimTable rows={data.regions} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Région" />
          </>
        )}

        {data?.available && active === 'marques' && (
          <>
            <SlideHead ey={navMeta.ey} title="Marques" sub={`${kpis.nb_marques || 0} marques référencées`} />
            <div className="ud-grid2">
              <RankList title="Top marques" items={(data.marques || []).slice(0, 8)} />
              <div className="ud-panel">
                <h3>Movers</h3>
                <p className="psub">Tri par écart € (extrait)</p>
                <table className="ud-table">
                  <tbody>
                    {[...(data.marques || [])].sort((a, b) => b.delta - a.delta).slice(0, 5).map((m) => (
                      <tr key={`up-${m.key}`}><td className="name">{m.key}</td><td className="pos">{fmtCompact(m.delta)}</td><td><TrendBadge pct={m.delta_pct} /></td></tr>
                    ))}
                    {[...(data.marques || [])].sort((a, b) => a.delta - b.delta).slice(0, 5).map((m) => (
                      <tr key={`dn-${m.key}`}><td className="name">{m.key}</td><td className="neg">{fmtCompact(m.delta)}</td><td><TrendBadge pct={m.delta_pct} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <DimTable rows={data.marques} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Marque" />
          </>
        )}

        {data?.available && active === 'familles' && (
          <>
            <SlideHead ey={navMeta.ey} title="Familles produits" sub={`${kpis.nb_familles || 0} familles`} />
            <DimTable rows={data.familles} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Famille" />
          </>
        )}

        {data?.available && active === 'sousfam' && (
          <>
            <SlideHead ey={navMeta.ey} title="Sous-familles" sub="Grain produit détaillé" />
            <DimTable rows={data.sous_familles} yearCurrent={data.year_current} yearPrevious={data.year_previous} label="Sous-famille" />
          </>
        )}
      </div>
    </div>
  )
}
