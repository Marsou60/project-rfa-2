import { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Tag,
  Layers,
  Target,
  ChevronRight,
  RefreshCw,
  Briefcase,
  Database,
} from 'lucide-react'
import { getNetworkDashboard } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from '../constants/suppliers'
import { useAuth } from '../context/AuthContext'

const MONTH_FR = ['', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

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
  const max = Math.max(
    1,
    ...months.map((m) => Math.max(m.current || 0, m.previous || 0)),
  )
  return (
    <div className="ud-bars">
      {months.map((m) => (
        <div key={m.month} className="ud-bar-col" title={`${MONTH_FR[m.month]}: ${fmtCompact(m.current)} vs ${fmtCompact(m.previous)}`}>
          <div className="ud-bar-pair">
            <div className="ud-bar prev" style={{ height: `${((m.previous || 0) / max) * 100}%` }} />
            <div className="ud-bar cur" style={{ height: `${((m.current || 0) / max) * 100}%` }} />
          </div>
          <div className="ud-bar-lab">{MONTH_FR[m.month]?.[0] || m.month}</div>
        </div>
      ))}
      <div className="ud-bar-legend">
        <span><i className="cur" /> {yearCurrent}</span>
        <span><i className="prev" /> {yearPrevious}</span>
      </div>
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

export default function UnionDashboardPage({ currentImportId, isCommercial = false, onNavigate }) {
  const { user } = useAuth()
  const { supplierFilter, setSupplierFilter } = useSupplierFilter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isAdmin = user?.role === 'ADMIN'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getNetworkDashboard({
        yearCurrent: 2026,
        yearPrevious: 2025,
        fournisseur: supplierFilter || undefined,
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
  }, [supplierFilter])

  const kpis = data?.kpis || {}
  const months = data?.months || []
  const platforms = data?.platforms || []
  const reportingMonth = data?.reporting_month
  const platformMonths = data?.platform_months || {}

  const periodLabel = useMemo(() => {
    if (!reportingMonth) return '2026'
    return `Janv – ${MONTH_FR[reportingMonth]} 2026`
  }, [reportingMonth])

  const objPct = Math.min(100, Math.max(0, Number(kpis.objectif_pct) || 0))
  const projPct = Math.min(120, Math.max(0, Number(kpis.projection_pct) || 0))

  return (
    <div className="ud-root -mx-4 sm:-mx-6 lg:-mx-8 -mt-8 mb-[-2rem]">
      <style>{`
        .ud-root {
          --ud-navy: #0d2f5e;
          --ud-navy2: #12376b;
          --ud-blue: #1b6ec2;
          --ud-red: #d81f2a;
          --ud-red-d: #b01722;
          --ud-gold: #e0a400;
          --ud-green: #1a9e5f;
          --ud-green-l: #e5f6ee;
          --ud-rose: #fbe7e8;
          --ud-bg: #eef1f7;
          --ud-card: #fff;
          --ud-ink: #182338;
          --ud-muted: #6b7890;
          --ud-line: #e2e7f0;
          --ud-shadow: 0 4px 18px rgba(16,38,76,.10);
          background: var(--ud-bg);
          color: var(--ud-ink);
          min-height: calc(100vh - 72px);
          padding: 22px 26px 48px;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        .ud-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px;
          border-bottom:3px solid var(--ud-navy); padding-bottom:12px; margin-bottom:18px; flex-wrap:wrap; }
        .ud-ey { color:var(--ud-red); font-weight:700; font-size:12px; letter-spacing:2px; text-transform:uppercase; }
        .ud-head h1 { font-size:24px; color:var(--ud-navy); font-weight:800; margin:2px 0 0; letter-spacing:-.01em; }
        .ud-head p { color:var(--ud-muted); font-size:12.5px; margin-top:2px; }
        .ud-head .pg { color:#adb8cc; font-size:12px; font-weight:600; }
        .ud-platseg { display:flex; gap:6px; flex-wrap:wrap; background:#eef2f8; padding:5px; border-radius:11px; margin-bottom:16px; }
        .ud-pseg { display:flex; align-items:center; gap:6px; background:transparent; border-radius:8px; padding:6px 13px;
          font-size:13px; font-weight:600; color:var(--ud-muted); border:1.5px solid transparent; cursor:pointer; }
        .ud-pseg:hover { background:#fff; color:var(--ud-navy); }
        .ud-pseg.on { background:#fff; color:var(--ud-navy); border-color:var(--ud-blue); box-shadow:0 2px 8px rgba(16,38,76,.12); }
        .ud-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .ud-chip { background:#fff; border:1px solid var(--ud-line); border-radius:20px; padding:4px 12px;
          font-size:12px; font-weight:600; color:var(--ud-navy); box-shadow:var(--ud-shadow); }
        .ud-chip span { color:var(--ud-muted); font-weight:500; margin-right:4px; }
        .ud-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-bottom:18px; }
        .ud-kpi { background:var(--ud-card); border-radius:14px; padding:16px; box-shadow:var(--ud-shadow);
          border:1px solid var(--ud-line); position:relative; overflow:hidden; }
        .ud-kpi::before { content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--ud-blue); }
        .ud-kpi.red::before { background:var(--ud-red); }
        .ud-kpi.green::before { background:var(--ud-green); }
        .ud-kpi.gold::before { background:var(--ud-gold); }
        .ud-kpi.navy::before { background:var(--ud-navy); }
        .ud-kpi.blue::before { background:var(--ud-blue); }
        .ud-kpi .lab { font-size:11px; color:var(--ud-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:600; }
        .ud-kpi .val { font-size:22px; font-weight:800; margin-top:5px; line-height:1.05; color:var(--ud-ink); }
        .ud-kpi .sub { font-size:12px; color:var(--ud-muted); margin-top:4px; }
        .ud-trend { display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:700;
          border-radius:20px; padding:2px 8px; }
        .ud-trend.up { background:var(--ud-green-l); color:var(--ud-green); }
        .ud-trend.down { background:var(--ud-rose); color:var(--ud-red); }
        .ud-trend.flat { background:#eef1f7; color:var(--ud-muted); }
        .ud-grid2 { display:grid; grid-template-columns:1.2fr 1fr; gap:14px; margin-bottom:14px; }
        @media (max-width: 900px) { .ud-grid2 { grid-template-columns:1fr; } }
        .ud-panel { background:var(--ud-card); border-radius:14px; border:1px solid var(--ud-line);
          box-shadow:var(--ud-shadow); padding:16px; }
        .ud-panel h3 { font-size:14px; font-weight:800; color:var(--ud-navy); margin:0 0 12px; }
        .ud-gauge-wrap { margin-top:8px; }
        .ud-gauge { height:10px; border-radius:6px; background:#eef2f9; overflow:hidden; position:relative; }
        .ud-gauge i { display:block; height:100%; background:linear-gradient(90deg,var(--ud-blue),var(--ud-navy)); border-radius:6px; }
        .ud-gauge.proj i { background:linear-gradient(90deg,var(--ud-gold),var(--ud-red)); }
        .ud-gauge-meta { display:flex; justify-content:space-between; font-size:11px; color:var(--ud-muted); margin-top:4px; }
        .ud-bars { display:flex; align-items:flex-end; gap:6px; height:160px; padding-top:8px; position:relative; }
        .ud-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; }
        .ud-bar-pair { display:flex; align-items:flex-end; gap:2px; height:calc(100% - 18px); width:100%; justify-content:center; }
        .ud-bar { width:40%; max-width:14px; border-radius:4px 4px 0 0; min-height:2px; }
        .ud-bar.cur { background:var(--ud-blue); }
        .ud-bar.prev { background:#c5d3e8; }
        .ud-bar-lab { font-size:10px; color:var(--ud-muted); font-weight:600; margin-top:4px; }
        .ud-bar-legend { position:absolute; top:0; right:0; display:flex; gap:10px; font-size:11px; color:var(--ud-muted); }
        .ud-bar-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:4px; vertical-align:middle; }
        .ud-bar-legend i.cur { background:var(--ud-blue); }
        .ud-bar-legend i.prev { background:#c5d3e8; }
        .ud-pcards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:14px; }
        .ud-pcard { background:var(--ud-card); border-radius:14px; border:1px solid var(--ud-line);
          box-shadow:var(--ud-shadow); padding:16px; border-top:4px solid var(--ud-blue); cursor:pointer; transition:.15s; }
        .ud-pcard:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(16,38,76,.14); }
        .ud-pcard .pn { font-weight:800; color:var(--ud-navy); font-size:15px; }
        .ud-pcard .pca { font-size:22px; font-weight:800; margin-top:6px; }
        .ud-pcard .pmetrics { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; margin-top:10px; font-size:12px; color:var(--ud-muted); }
        .ud-pcard .pmetrics b { color:var(--ud-ink); font-weight:700; }
        .ud-pcard .pbar { height:6px; border-radius:4px; background:#eef2f9; margin-top:10px; overflow:hidden; }
        .ud-pcard .pbar i { display:block; height:100%; background:var(--ud-blue); }
        .ud-rank { display:flex; flex-direction:column; gap:10px; }
        .ud-rank-row .name { font-size:12.5px; font-weight:700; color:var(--ud-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%; }
        .ud-rank-top { display:flex; justify-content:space-between; gap:8px; }
        .ud-rank-top .val { font-size:12.5px; font-weight:800; color:var(--ud-navy); }
        .ud-rank-bar { height:5px; background:#eef2f9; border-radius:4px; margin:4px 0; overflow:hidden; }
        .ud-rank-bar i { display:block; height:100%; background:var(--ud-blue); border-radius:4px; }
        .ud-rank-sub { display:flex; gap:8px; align-items:center; font-size:11px; }
        .ud-rank-sub .muted { color:var(--ud-muted); }
        .ud-empty { color:var(--ud-muted); font-size:13px; }
        .ud-table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .ud-table th { text-align:left; color:var(--ud-muted); font-size:10px; text-transform:uppercase; letter-spacing:.4px;
          padding:6px 8px; border-bottom:1px solid var(--ud-line); }
        .ud-table td { padding:8px; border-bottom:1px solid #f0f3f8; }
        .ud-table tr:hover td { background:#f7f9fc; }
        .ud-shortcuts { display:flex; gap:8px; flex-wrap:wrap; margin-top:18px; }
        .ud-sc { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid var(--ud-line);
          border-radius:10px; padding:8px 12px; font-size:12.5px; font-weight:600; color:var(--ud-navy);
          box-shadow:var(--ud-shadow); cursor:pointer; }
        .ud-sc:hover { border-color:var(--ud-blue); }
        .ud-error { background:var(--ud-rose); color:var(--ud-red); border-radius:10px; padding:12px 14px; font-size:13px; margin-bottom:12px; }
        .ud-loading { color:var(--ud-muted); font-size:14px; padding:40px; text-align:center; }
        .ud-refresh { background:var(--ud-navy); color:#fff; border-radius:8px; padding:7px 12px; font-size:12px; font-weight:600;
          display:inline-flex; align-items:center; gap:6px; cursor:pointer; border:none; }
        .ud-refresh:hover { background:var(--ud-navy2); }
      `}</style>

      <div className="ud-head">
        <div>
          <div className="ud-ey">01 — Vue d&apos;ensemble</div>
          <h1>Synthèse réseau Union</h1>
          <p>
            Période : {periodLabel}
            {data?.year_previous ? ` vs ${data.year_previous}` : ''}
            {supplierFilter ? ` · filtre ${SUPPLIER_LABELS[supplierFilter] || supplierFilter}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pg">CONSOLIDÉ · {data?.year_current || 2026}</span>
          <button type="button" className="ud-refresh" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="ud-platseg">
        <button
          type="button"
          className={`ud-pseg ${!supplierFilter ? 'on' : ''}`}
          onClick={() => setSupplierFilter(null)}
        >
          Toutes
        </button>
        {SUPPLIER_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`ud-pseg ${supplierFilter === k ? 'on' : ''}`}
            onClick={() => setSupplierFilter(k)}
          >
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

      {error && <div className="ud-error">{error}</div>}

      {loading && !data && <div className="ud-loading">Chargement du dashboard…</div>}

      {!loading && data && !data.available && (
        <div className="ud-panel">
          <p className="ud-empty">{data.message || 'Aucune donnée. Importez les ventes plateformes.'}</p>
          {isAdmin && (
            <button type="button" className="ud-sc mt-3" onClick={() => onNavigate?.('pure-data-platform-import')}>
              <Database className="w-4 h-4" /> Import ventes plateformes
            </button>
          )}
        </div>
      )}

      {data?.available && (
        <>
          <div className="ud-kpis">
            <div className="ud-kpi navy">
              <div className="lab">CA YTD {data.year_current}</div>
              <div className="val">{fmtCompact(kpis.ca_ytd)}</div>
              <div className="sub"><TrendBadge pct={kpis.delta_pct} /> vs N-1 même période</div>
            </div>
            <div className={`ud-kpi ${kpis.delta >= 0 ? 'green' : 'red'}`}>
              <div className="lab">Écart vs {data.year_previous}</div>
              <div className="val">{fmtCompact(kpis.delta)}</div>
              <div className="sub">{fmtCompact(kpis.ca_n1_same_period)} sur même période</div>
            </div>
            <div className="ud-kpi gold">
              <div className="lab">Objectif 2026</div>
              <div className="val">{fmtCompact(kpis.objectif)}</div>
              <div className="ud-gauge-wrap">
                <div className="ud-gauge"><i style={{ width: `${objPct}%` }} /></div>
                <div className="ud-gauge-meta">
                  <span>{fmtPct(kpis.objectif_pct)} atteint</span>
                  <span>{fmtCompact(kpis.ca_ytd)}</span>
                </div>
              </div>
            </div>
            <div className="ud-kpi blue">
              <div className="lab">Projection fin d&apos;année</div>
              <div className="val">{kpis.projection != null ? fmtCompact(kpis.projection) : '—'}</div>
              <div className="ud-gauge-wrap">
                <div className="ud-gauge proj"><i style={{ width: `${Math.min(100, projPct)}%` }} /></div>
                <div className="ud-gauge-meta">
                  <span>{kpis.projection_method || '—'}</span>
                  <span>{fmtPct(kpis.projection_pct)} obj.</span>
                </div>
              </div>
            </div>
            <div className="ud-kpi">
              <div className="lab">Adhérents</div>
              <div className="val flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--ud-blue)]" />
                {kpis.nb_clients || 0}
              </div>
              <div className="sub flex gap-3 mt-1">
                <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />{kpis.nb_marques} marques</span>
                <span className="inline-flex items-center gap-1"><Layers className="w-3 h-3" />{kpis.nb_familles} familles</span>
              </div>
            </div>
          </div>

          <div className="ud-grid2">
            <div className="ud-panel">
              <h3>Évolution mensuelle <span style={{ color: 'var(--ud-muted)', fontWeight: 600 }}>{data.year_current} vs {data.year_previous}</span></h3>
              <MonthBars months={months.filter((m) => (m.current || 0) > 0 || (m.previous || 0) > 0)} yearCurrent={data.year_current} yearPrevious={data.year_previous} />
            </div>
            <div className="ud-panel">
              <h3 className="flex items-center gap-2"><Target className="w-4 h-4 text-[var(--ud-red)]" /> Objectif 21 M€</h3>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ud-navy)', marginBottom: 8 }}>
                {fmtEur(kpis.ca_ytd)}
              </div>
              <div className="ud-gauge" style={{ height: 14 }}><i style={{ width: `${objPct}%` }} /></div>
              <div className="ud-gauge-meta" style={{ marginTop: 8 }}>
                <span>Réalisé YTD</span>
                <span>{fmtPct(kpis.objectif_pct)}</span>
              </div>
              <div className="ud-gauge proj" style={{ height: 10, marginTop: 12 }}><i style={{ width: `${Math.min(100, projPct)}%` }} /></div>
              <div className="ud-gauge-meta">
                <span>Projection {kpis.projection != null ? fmtCompact(kpis.projection) : '—'}</span>
                <span>{fmtPct(kpis.projection_pct)}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ud-muted)', marginTop: 12 }}>
                Objectif : {fmtEur(kpis.objectif)}. Méthode : {kpis.projection_method || 'n/d'}.
              </p>
            </div>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ud-navy)', margin: '6px 0 10px' }}>
            Plateformes 360°
          </h3>
          <div className="ud-pcards">
            {platforms.map((p) => (
              <button
                key={p.platform}
                type="button"
                className="ud-pcard text-left"
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
                </div>
                <div className="pbar">
                  <i style={{ width: `${Math.min(100, p.share_pct || 0)}%` }} />
                </div>
                {p.reporting_month && (
                  <div style={{ fontSize: 11, color: 'var(--ud-muted)', marginTop: 8 }}>
                    À jour jusqu&apos;à {MONTH_FR[p.reporting_month]}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="ud-grid2">
            <RankList title="Top marques" items={data.top_marques} />
            <RankList title="Top familles" items={data.top_familles} />
          </div>

          <div className="ud-grid2">
            <div className="ud-panel">
              <h3>Meilleures progressions clients</h3>
              <table className="ud-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>CA 2026</th>
                    <th>Écart</th>
                    <th>Évol.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_clients_up || []).map((c) => (
                    <tr key={c.code_union}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{c.raison_sociale}</div>
                        <div style={{ fontSize: 11, color: 'var(--ud-muted)' }}>{c.code_union}</div>
                      </td>
                      <td><b>{fmtCompact(c.current)}</b></td>
                      <td style={{ color: 'var(--ud-green)', fontWeight: 700 }}>{fmtCompact(c.delta)}</td>
                      <td><TrendBadge pct={c.delta_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ud-panel">
              <h3>Plus fortes baisses clients</h3>
              <table className="ud-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>CA 2026</th>
                    <th>Écart</th>
                    <th>Évol.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_clients_down || []).map((c) => (
                    <tr key={c.code_union}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{c.raison_sociale}</div>
                        <div style={{ fontSize: 11, color: 'var(--ud-muted)' }}>{c.code_union}</div>
                      </td>
                      <td><b>{fmtCompact(c.current)}</b></td>
                      <td style={{ color: 'var(--ud-red)', fontWeight: 700 }}>{fmtCompact(c.delta)}</td>
                      <td><TrendBadge pct={c.delta_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="ud-shortcuts">
        <button type="button" className="ud-sc" onClick={() => onNavigate?.(currentImportId ? 'client-space' : (isCommercial ? 'hub' : 'upload'))}>
          <Briefcase className="w-4 h-4" /> Espace client <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
        <button type="button" className="ud-sc" onClick={() => onNavigate?.('pure-data-monthly')}>
          <TrendingUp className="w-4 h-4" /> Suivi 2025 / 2026 <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
        {isAdmin && (
          <button type="button" className="ud-sc" onClick={() => onNavigate?.('pure-data-platform-import')}>
            <Database className="w-4 h-4" /> Import ventes <ChevronRight className="w-3.5 h-3.5 opacity-50" />
          </button>
        )}
      </div>
    </div>
  )
}
