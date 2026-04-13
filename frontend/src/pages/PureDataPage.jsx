import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Upload, Users, X, ChevronDown, RefreshCw, CheckCircle2, Database, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { comparePureData, deletePureDataMonthlyRows, getPureDataComparison, getPureDataClientDetail, getPureDataCommercialDetail, getPureDataMarqueDetail, getPureDataMonthlyEntityDetail, getPureDataMonthlyEvolution, getPureDataMonthlyMonthDetail, getPureDataMonthlyPeriods, getPureDataPlatformDetail, getPureDataSheetsStatus, importPureDataMonthlyExcel, loadPureDataFromSupabase, loadPureDataMonthly, syncPureDataFromSheets } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0)

const formatDelta = (value) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCurrency(value)}`
}

const formatPercent = (value) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

const getDeltaClass = (value) => {
  const num = Number(value)
  if (Number.isNaN(num)) return 'text-glass-muted'
  return num >= 0 ? '!text-emerald-300' : '!text-rose-300'
}

const getDeltaPctClass = (value) => {
  const num = Number(value)
  if (Number.isNaN(num)) return 'text-glass-muted'
  return num >= 0 ? '!text-emerald-200' : '!text-rose-200'
}

const monthLabel = (value) => {
  const months = ['', 'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 && n <= 12 ? months[n] : 'Mois ?'
}

const periodKey = (period) => `${period.annee || 'x'}-${period.mois || 'x'}-${period.fournisseur || 'x'}`

/* ── Sparkline SVG (barres CA N vs N-1 par mois) ── */
function SparkBars({ months, height = 40 }) {
  if (!months?.length) return null
  const maxVal = Math.max(...months.flatMap((m) => [m.current || 0, m.previous || 0]), 1)
  const barW = 8
  const gap = 2
  const groupW = barW * 2 + gap + 4
  const w = months.length * groupW
  return (
    <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {months.map((m, i) => {
        const x = i * groupW
        const hCurr = Math.max(2, (m.current / maxVal) * (height - 4))
        const hPrev = Math.max(2, (m.previous / maxVal) * (height - 4))
        const deltaPct = m.delta_pct
        const barColor = deltaPct == null ? '#6b7280' : deltaPct >= 0 ? '#34d399' : '#f87171'
        return (
          <g key={i}>
            <rect x={x} y={height - hPrev} width={barW} height={hPrev} fill="#4b5563" rx="1" />
            <rect x={x + barW + gap} y={height - hCurr} width={barW} height={hCurr} fill={barColor} rx="1" />
          </g>
        )
      })}
    </svg>
  )
}

/* ── Panel détail d'un mois par plateforme ── */
function MonthDetailPanel({ month, yearCurrent, yearPrevious, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const MONTH_FULL = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmtD = (v) => { if (v == null) return '—'; const s = v > 0 ? '+' : ''; return `${s}${fmt(v)}` }
  const fmtP = (v) => { if (v == null) return '—'; const s = v > 0 ? '+' : ''; return `${s}${Number(v).toFixed(1)}%` }
  const dc = (v) => v == null ? 'text-white/40' : v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : 'text-white/40'

  useEffect(() => {
    getPureDataMonthlyMonthDetail({ month, yearCurrent, yearPrevious })
      .then(setData)
      .catch((e) => setError(e.response?.data?.detail || e.message || 'Erreur'))
      .finally(() => setLoading(false))
  }, [month, yearCurrent, yearPrevious])

  return (
    <div className="mt-2 glass-card-dark rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold text-sm">
          {MONTH_FULL[month]} — détail par plateforme
        </h4>
        <button onClick={onClose} className="text-white/30 hover:text-white text-xs px-2 py-1 rounded border border-white/10">
          Fermer
        </button>
      </div>
      {loading && <p className="text-glass-secondary text-xs">Chargement...</p>}
      {error && <p className="text-rose-300 text-xs">{error}</p>}
      {data && !loading && (
        <table className="glass-table text-xs w-full">
          <thead>
            <tr>
              <th className="text-left px-3 py-2">Plateforme</th>
              <th className="text-right px-3 py-2">CA {yearCurrent}</th>
              <th className="text-right px-3 py-2">CA {yearPrevious}</th>
              <th className="text-right px-3 py-2">Delta</th>
              <th className="text-right px-3 py-2">Delta %</th>
            </tr>
          </thead>
          <tbody>
            {data.platforms.map((p) => (
              <tr key={p.platform}>
                <td className="px-3 py-2 font-semibold">{p.platform}</td>
                <td className="px-3 py-2 text-right font-mono">{p.current > 0 ? fmt(p.current) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-white/40">{p.previous > 0 ? fmt(p.previous) : '—'}</td>
                <td className={`px-3 py-2 text-right font-bold font-mono ${dc(p.delta)}`}>{fmtD(p.delta)}</td>
                <td className={`px-3 py-2 text-right ${dc(p.delta_pct)}`}>{fmtP(p.delta_pct)}</td>
              </tr>
            ))}
            <tr className="border-t border-white/20">
              <td className="px-3 py-2 font-bold text-white/70">TOTAL</td>
              <td className="px-3 py-2 text-right font-bold font-mono">{fmt(data.totals.current)}</td>
              <td className="px-3 py-2 text-right font-bold font-mono text-white/40">{fmt(data.totals.previous)}</td>
              <td className={`px-3 py-2 text-right font-bold font-mono ${dc(data.totals.delta)}`}>{fmtD(data.totals.delta)}</td>
              <td className={`px-3 py-2 text-right font-bold ${dc(data.totals.delta_pct)}`}>{fmtP(data.totals.delta_pct)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}


function MonthlyEntityDetailModal({ entity, yearCurrent, yearPrevious, onClose, inline = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSubClient, setSelectedSubClient] = useState(null)

  const MONTH_SHORT = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmtD = (v) => {
    if (v == null) return '—'
    const s = v > 0 ? '+' : ''
    return `${s}${fmt(v)}`
  }
  const fmtP = (v) => {
    if (v == null) return '—'
    const s = v > 0 ? '+' : ''
    return `${s}${Number(v).toFixed(1)}%`
  }
  const deltaColor = (v) => {
    if (v == null || v === 0) return 'text-white/40'
    return v > 0 ? 'text-emerald-300' : 'text-rose-300'
  }
  const deltaBg = (v) => {
    if (v == null || Math.abs(v) < 1) return ''
    return v > 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'
  }

  const dc = deltaColor

  const renderContent = (d) => (
    <>
      {/* ── Graphique global par mois ── */}
      {d.totals_by_month?.length > 0 && (
        <div>
          <h4 className="text-white/70 text-xs font-bold uppercase tracking-wider mb-3">Vue d'ensemble mensuelle</h4>
          <div className="glass-card-dark rounded-xl p-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-2 text-white/40 font-semibold">Mois</th>
                  {d.totals_by_month.map((m) => (
                    <th key={m.month} className="text-right pb-2 text-white/40 font-semibold px-2">{MONTH_SHORT[m.month]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-1.5 text-white/60">CA {yearCurrent}</td>
                  {d.totals_by_month.map((m) => (
                    <td key={m.month} className="text-right py-1.5 px-2 text-white font-mono">{m.current > 0 ? fmt(m.current) : '—'}</td>
                  ))}
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-1.5 text-white/40">CA {yearPrevious}</td>
                  {d.totals_by_month.map((m) => (
                    <td key={m.month} className="text-right py-1.5 px-2 text-white/40 font-mono">{m.previous > 0 ? fmt(m.previous) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-2 pb-1 font-bold text-white/70">Delta</td>
                  {d.totals_by_month.map((m) => (
                    <td key={m.month} className={`text-right pt-2 pb-1 px-2 font-bold font-mono ${deltaColor(m.delta)}`}>
                      {m.current === 0 && m.previous === 0 ? '—' : fmtD(m.delta)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pb-1 text-white/40">%</td>
                  {d.totals_by_month.map((m) => (
                    <td key={m.month} className={`text-right pb-1 px-2 text-xs ${deltaColor(m.delta_pct)}`}>
                      {m.current === 0 && m.previous === 0 ? '—' : fmtP(m.delta_pct)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {d.platforms?.length > 0 && (
        <div>
          <h4 className="text-white/70 text-xs font-bold uppercase tracking-wider mb-3">Détail par plateforme — c'est ici que ça parle</h4>
          <div className="space-y-3">
            {d.platforms.map((p) => (
              <div key={p.platform} className={`rounded-xl border p-4 ${deltaBg(p.delta)} ${p.delta > 0 ? 'border-emerald-500/20' : p.delta < 0 ? 'border-rose-500/20' : 'border-white/10'}`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white text-sm">{p.platform}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.delta > 0 ? 'bg-emerald-500/20 text-emerald-300' : p.delta < 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-white/40'}`}>
                      {fmtD(p.delta)} ({fmtP(p.delta_pct)})
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-white/50">
                    <span>{yearCurrent}: <span className="text-white font-mono">{fmt(p.total_current)}</span></span>
                    <span>{yearPrevious}: <span className="text-white/40 font-mono">{fmt(p.total_previous)}</span></span>
                    <SparkBars months={p.months} height={36} />
                  </div>
                </div>
                {p.months.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <td />
                          {p.months.map((m) => (
                            <th key={m.month} className="text-right pb-1 text-white/30 font-semibold px-2">{MONTH_SHORT[m.month]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="text-white/40 pr-3">N</td>
                          {p.months.map((m) => (
                            <td key={m.month} className="text-right px-2 text-white/80 font-mono">{m.current > 0 ? fmt(m.current) : '—'}</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="text-white/30 pr-3">N-1</td>
                          {p.months.map((m) => (
                            <td key={m.month} className="text-right px-2 text-white/30 font-mono">{m.previous > 0 ? fmt(m.previous) : '—'}</td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/10">
                          <td className="text-white/50 pt-1 pr-3 font-bold">Δ</td>
                          {p.months.map((m) => (
                            <td key={m.month} className={`text-right pt-1 px-2 font-bold font-mono ${deltaColor(m.delta)}`}>
                              {m.current === 0 && m.previous === 0 ? '—' : fmtD(m.delta)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Clients du commercial (drill-down) ── */}
      {d.clients?.length > 0 && (
        <div>
          <h4 className="text-white/70 text-xs font-bold uppercase tracking-wider mb-3">
            Clients ({d.clients.length}) — cliquez pour le détail plateforme × mois
          </h4>
          <div className="space-y-1">
            {d.clients.map((c) => {
              const isOpen = selectedSubClient === c.code_union
              return (
                <div key={c.code_union} className="rounded-lg border border-white/10 overflow-hidden">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => setSelectedSubClient(isOpen ? null : c.code_union)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronDown className={`w-3 h-3 text-white/40 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span className="text-teal-300 font-medium text-xs">{c.code_union}</span>
                      <span className="text-white/50 text-xs truncate">{c.raison_sociale || ''}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                      <span className="text-white/40">{fmtD(c.total_current) === '—' ? '' : `CA: ${fmt(c.total_current)}`}</span>
                      <span className={`font-bold ${deltaColor(c.delta)}`}>{fmtD(c.delta)}</span>
                      <span className={`${deltaColor(c.delta_pct)}`}>{fmtP(c.delta_pct)}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-white/10 bg-white/[0.02]">
                      <MonthlyEntityDetailModal
                        entity={{ code_union: c.code_union, label: `${c.code_union} — ${c.raison_sociale || ''}`.trim() }}
                        yearCurrent={yearCurrent}
                        yearPrevious={yearPrevious}
                        onClose={() => setSelectedSubClient(null)}
                        inline
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )

  useEffect(() => {
    if (entity.platform) {
      // Plateforme : on utilise l'endpoint evolution filtré par fournisseur
      getPureDataMonthlyEvolution({ yearCurrent, yearPrevious, fournisseur: entity.platform, topClients: 0 })
        .then((res) => {
          // On adapte la réponse au format attendu par renderContent
          setData({
            totals: {
              current: res.months.reduce((s, m) => s + m.current, 0),
              previous: res.months.reduce((s, m) => s + m.previous, 0),
              delta: res.months.reduce((s, m) => s + m.delta, 0),
              delta_pct: null,
            },
            totals_by_month: res.months,
            platforms: [],
            clients: res.clients || [],
          })
        })
        .catch((e) => setError(e.response?.data?.detail || e.message || 'Erreur'))
        .finally(() => setLoading(false))
      return
    }
    const params = { yearCurrent, yearPrevious }
    if (entity.code_union) params.codeUnion = entity.code_union
    else if (entity.commercial) params.commercial = entity.commercial
    getPureDataMonthlyEntityDetail(params)
      .then(setData)
      .catch((e) => setError(e.response?.data?.detail || e.message || 'Erreur'))
      .finally(() => setLoading(false))
  }, [entity, yearCurrent, yearPrevious])

  return inline ? (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header inline */}
      <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-semibold text-sm">{entity.label}</p>
          <p className="text-white/40 text-xs mt-0.5">{yearCurrent} vs {yearPrevious} — plateforme × mois</p>
          {data?.totals && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-white/50 text-xs">CA {yearCurrent}: <strong className="text-white">{fmt(data.totals.current)}</strong></span>
              <span className="text-white/50 text-xs">CA {yearPrevious}: <strong className="text-white/40">{fmt(data.totals.previous)}</strong></span>
              <span className={`text-sm font-bold ${dc(data.totals.delta)}`}>{fmtD(data.totals.delta)} ({fmtP(data.totals.delta_pct)})</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white text-xs px-2 py-1 rounded border border-white/10 flex-shrink-0">✕</button>
      </div>
      <div className="p-4 overflow-x-auto">
        {loading && <p className="text-glass-secondary text-xs">Chargement...</p>}
        {error && <p className="text-rose-300 text-xs">{error}</p>}
        {data && !loading && renderContent(data)}
      </div>
    </div>
  ) : (
    <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-modal w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-white">{entity.label}</h3>
            <p className="text-sm text-white/50 mt-0.5">{yearCurrent} vs {yearPrevious} — détail par plateforme et par mois</p>
            {data?.totals && (
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="text-white/70 text-xs">CA {yearCurrent}: <strong className="text-white">{fmt(data.totals.current)}</strong></span>
                <span className="text-white/70 text-xs">CA {yearPrevious}: <strong className="text-white">{fmt(data.totals.previous)}</strong></span>
                <span className={`text-sm font-bold ${deltaColor(data.totals.delta)}`}>
                  {fmtD(data.totals.delta)} ({fmtP(data.totals.delta_pct)})
                </span>
              </div>
            )}
          </div>
          <button className="glass-btn-icon flex-shrink-0" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto glass-scrollbar p-5 space-y-6">
          {loading && <div className="text-glass-secondary py-8 text-center">Chargement...</div>}
          {error && <div className="text-rose-300 text-sm">{error}</div>}
          {data && !loading && renderContent(data)}
        </div>
      </div>
    </div>
  )
}

function PureDataPage({ monthlyEntry = false }) {
  const { supplierFilter } = useSupplierFilter()
  const [file, setFile] = useState(null)
  const [yearCurrent, setYearCurrent] = useState(monthlyEntry ? 2026 : 2025)
  const [yearPrevious, setYearPrevious] = useState(monthlyEntry ? 2025 : 2024)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [commercialFilter, setCommercialFilter] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [lastRunMeta, setLastRunMeta] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [expandedFournisseurs, setExpandedFournisseurs] = useState({})
  const [expandedMarques, setExpandedMarques] = useState({})
  const [selectedPlatform, setSelectedPlatform] = useState(null)
  const [platformDetail, setPlatformDetail] = useState(null)
  const [platformLoading, setPlatformLoading] = useState(false)
  const [platformError, setPlatformError] = useState(null)
  const [selectedMarqueInPlatform, setSelectedMarqueInPlatform] = useState(null)
  const [marqueDetail, setMarqueDetail] = useState(null)
  const [marqueDetailLoading, setMarqueDetailLoading] = useState(false)
  const [marqueDetailError, setMarqueDetailError] = useState(null)
  const magasinsBlockRef = useRef(null)
  const [selectedCommercial, setSelectedCommercial] = useState(null)
  const [commercialDetail, setCommercialDetail] = useState(null)
  const [commercialLoading, setCommercialLoading] = useState(false)
  const [commercialError, setCommercialError] = useState(null)
  const [filteredComparison, setFilteredComparison] = useState(null)
  const [filteredComparisonLoading, setFilteredComparisonLoading] = useState(false)
  const [pureDataExpiredMessage, setPureDataExpiredMessage] = useState(null)
  const [sheetsStatus, setSheetsStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)
  const [periods, setPeriods] = useState([])
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [manageFile, setManageFile] = useState(null)
  const [importMode, setImportMode] = useState('append')
  const [managing, setManaging] = useState(false)
  const [manageMessage, setManageMessage] = useState(null)
  const [selectedPeriods, setSelectedPeriods] = useState({})
  const [monthlyEvolution, setMonthlyEvolution] = useState(null)
  const [monthlyEvolutionLoading, setMonthlyEvolutionLoading] = useState(false)
  const [monthlyDetailEntity, setMonthlyDetailEntity] = useState(null)
  const [monthlyClientSearch, setMonthlyClientSearch] = useState('')
  const [selectedEvolutionMonth, setSelectedEvolutionMonth] = useState(null)
  const cacheKey = monthlyEntry ? 'pure_data_last_monthly' : 'pure_data_last'

  // Vérifier si des données Sheets sont disponibles dans Supabase
  // On utilise une ref pour savoir si le cache localStorage a déjà été chargé
  const cacheLoadedRef = useRef(false)

  const refreshPeriods = async () => {
    setPeriodsLoading(true)
    try {
      const data = await getPureDataMonthlyPeriods()
      setPeriods(data?.items || [])
    } catch {
      setPeriods([])
    } finally {
      setPeriodsLoading(false)
    }
  }

  const handleCompareMonthly = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadPureDataMonthly({
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setResult(data)
      setPureDataExpiredMessage(null)
      const meta = { yearCurrent, yearPrevious, month: month === '' ? null : Number(month), pureDataId: data.pure_data_id, savedAt: new Date().toISOString(), source: 'monthly' }
      setLastRunMeta(meta)
      localStorage.setItem(cacheKey, JSON.stringify({ meta, result: data }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur chargement mensuel")
    } finally {
      setLoading(false)
    }
  }

  const fetchMonthlyEvolution = async () => {
    if (!monthlyEntry) return
    setMonthlyEvolutionLoading(true)
    try {
      const data = await getPureDataMonthlyEvolution({
        yearCurrent,
        yearPrevious,
        fournisseur: supplierFilter || undefined,
        topClients: 0,
      })
      setMonthlyEvolution(data)
    } catch {
      setMonthlyEvolution(null)
    } finally {
      setMonthlyEvolutionLoading(false)
    }
  }

  useEffect(() => {
    getPureDataSheetsStatus()
      .then((status) => {
        setSheetsStatus(status)
        // Auto-charger uniquement si pas de données en cache local
        if (status?.has_data && !cacheLoadedRef.current && !monthlyEntry) {
          handleCompareSheets()
        }
      })
      .catch(() => {})
    refreshPeriods()
  }, [monthlyEntry])

  const handleImportMonthly = async () => {
    if (!manageFile) {
      setError("Sélectionne un fichier à intégrer.")
      return
    }
    setManaging(true)
    setError(null)
    setManageMessage(null)
    try {
      const res = await importPureDataMonthlyExcel({ file: manageFile, mode: importMode })
      setManageMessage(
        `${res.rows_inserted} lignes importées${res.rows_deleted ? ` (${res.rows_deleted} remplacées)` : ''}.`
      )
      await refreshPeriods()
      await handleCompareMonthly()
      await fetchMonthlyEvolution()
      setManageFile(null)
      setSelectedPeriods({})
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur import mensuel")
    } finally {
      setManaging(false)
    }
  }

  const togglePeriod = (period) => {
    const key = periodKey(period)
    setSelectedPeriods((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleDeleteSelectedPeriods = async () => {
    const toDelete = periods.filter((p) => selectedPeriods[periodKey(p)])
    if (!toDelete.length) {
      setError("Sélectionne au moins une période à supprimer.")
      return
    }
    const ok = window.confirm(`Supprimer ${toDelete.length} période(s) sélectionnée(s) ?`)
    if (!ok) return

    setManaging(true)
    setError(null)
    setManageMessage(null)
    try {
      let deletedTotal = 0
      for (const p of toDelete) {
        const res = await deletePureDataMonthlyRows({
          years: p.annee ? [p.annee] : undefined,
          months: p.mois ? [p.mois] : undefined,
          fournisseurs: p.fournisseur ? [p.fournisseur] : undefined,
        })
        deletedTotal += Number(res?.deleted_rows || 0)
      }
      setManageMessage(`${deletedTotal} lignes supprimées.`)
      setSelectedPeriods({})
      await refreshPeriods()
      await handleCompareMonthly()
      await fetchMonthlyEvolution()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur suppression des périodes")
    } finally {
      setManaging(false)
    }
  }

  const handleCompareSheets = async () => {
    setLoading(true)
    setError(null)
    try {
      // Utilise le endpoint GET dédié (pas de multipart, pas de fichier)
      const data = await loadPureDataFromSupabase({
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setResult(data)
      setPureDataExpiredMessage(null)
      const meta = { yearCurrent, yearPrevious, month: month === '' ? null : Number(month), pureDataId: data.pure_data_id, savedAt: new Date().toISOString(), source: 'sheets' }
      setLastRunMeta(meta)
      localStorage.setItem(cacheKey, JSON.stringify({ meta, result: data }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }

  const handleSyncSheets = async () => {
    setSyncing(true)
    setSyncSuccess(false)
    setError(null)
    try {
      const res = await syncPureDataFromSheets()
      setSyncSuccess(true)
      setSheetsStatus(s => ({ ...s, has_data: true, row_count: res.rows_imported }))
      setTimeout(() => setSyncSuccess(false), 4000)
      // Recharger la comparaison avec les nouvelles données
      if (!monthlyEntry) {
        await handleCompareSheets()
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur synchronisation")
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return
    try {
      const parsed = JSON.parse(cached)
      if (parsed?.result) {
        cacheLoadedRef.current = true  // Marquer : cache dispo, pas besoin d'auto-load
        setResult(parsed.result)
        setLastRunMeta(parsed.meta || null)
        setYearCurrent(parsed.meta?.yearCurrent ?? yearCurrent)
        setYearPrevious(parsed.meta?.yearPrevious ?? yearPrevious)
        setMonth(parsed.meta?.month ?? '')
      }
    } catch (e) {
      console.warn('Impossible de charger le cache pure data:', e)
    }
  }, [cacheKey])

  useEffect(() => {
    if (!monthlyEntry || !result) {
      setMonthlyEvolution(null)
      return
    }
    fetchMonthlyEvolution()
  }, [monthlyEntry, result, supplierFilter, yearCurrent, yearPrevious])

  const handleCompare = async () => {
    if (!file) {
      setError("Sélectionne un fichier Excel.")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await comparePureData({ file, yearCurrent, yearPrevious, month: month === '' ? null : Number(month) })
      setResult(data)
      setPureDataExpiredMessage(null)
      const meta = { fileName: file?.name || null, yearCurrent, yearPrevious, month: month === '' ? null : Number(month), pureDataId: data.pure_data_id, savedAt: new Date().toISOString() }
      setLastRunMeta(meta)
      localStorage.setItem(cacheKey, JSON.stringify({ meta, result: data }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de l'analyse")
    } finally {
      setLoading(false)
    }
  }

  const clearCache = () => {
    localStorage.removeItem(cacheKey)
    setResult(null)
    setLastRunMeta(null)
    setFilteredComparison(null)
    setPureDataExpiredMessage(null)
    setMonthlyEvolution(null)
  }

  const pureDataId = result?.pure_data_id || lastRunMeta?.pureDataId

  const clearPureDataCache = () => {
    localStorage.removeItem(cacheKey)
    setResult(null)
    setLastRunMeta(null)
    setFilteredComparison(null)
    setMonthlyEvolution(null)
    setPureDataExpiredMessage('Les données Pure Data ont expiré (serveur redémarré ou session perdue). Relancez l’analyse ci-dessous. Si vous venez de mettre à jour le code, redémarrez le serveur backend (port 8001) puis relancez l’analyse.')
  }

  useEffect(() => {
    if (!supplierFilter || !pureDataId) {
      setFilteredComparison(null)
      return
    }
    setFilteredComparisonLoading(true)
    getPureDataComparison({
      pureDataId,
      yearCurrent,
      yearPrevious,
      month: month === '' ? null : Number(month),
      fournisseur: supplierFilter,
    })
      .then((data) => setFilteredComparison(data))
      .catch((err) => {
        setFilteredComparison(null)
        if (err.response?.status === 404) {
          clearPureDataCache()
        }
      })
      .finally(() => setFilteredComparisonLoading(false))
  }, [supplierFilter, pureDataId, yearCurrent, yearPrevious, month])

  const openClientDetail = async (client) => {
    if (!pureDataId) {
      setDetailError("Relance l'analyse pour activer le détail client.")
      setSelectedClient(client)
      return
    }
    setSelectedClient(client)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const data = await getPureDataClientDetail({
        pureDataId,
        codeUnion: client.code_union,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
        fournisseur: supplierFilter || undefined,
      })
      setDetail(data)
    } catch (err) {
      setDetailError(err.response?.data?.detail || err.message || "Erreur lors du détail client")
    } finally {
      setDetailLoading(false)
    }
  }

  const openPlatformDetail = async (platform) => {
    if (!pureDataId) {
      setPlatformError("Relance l'analyse pour activer le détail plateforme.")
      setSelectedPlatform(platform)
      return
    }
    setSelectedPlatform(platform)
    setPlatformDetail(null)
    setPlatformError(null)
    setSelectedMarqueInPlatform(null)
    setMarqueDetail(null)
    setMarqueDetailError(null)
    setPlatformLoading(true)
    try {
      const data = await getPureDataPlatformDetail({
        pureDataId,
        platform: platform.platform,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setPlatformDetail(data)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Erreur lors du détail plateforme"
      setPlatformError(msg)
      if (err.response?.status === 404) clearPureDataCache()
    } finally {
      setPlatformLoading(false)
    }
  }

  const openMarqueDetail = async (marqueRow) => {
    if (!pureDataId || !selectedPlatform) return
    setSelectedMarqueInPlatform(marqueRow)
    setMarqueDetail(null)
    setMarqueDetailError(null)
    setMarqueDetailLoading(true)
    try {
      const data = await getPureDataMarqueDetail({
        pureDataId,
        platform: selectedPlatform.platform,
        marque: marqueRow.marque,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setMarqueDetail(data)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Erreur lors du chargement des magasins"
      setMarqueDetailError(msg)
      if (err.response?.status === 404) clearPureDataCache()
    } finally {
      setMarqueDetailLoading(false)
    }
  }

  useEffect(() => {
    if (marqueDetail !== null || marqueDetailError) {
      magasinsBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [marqueDetail, marqueDetailError])

  const openCommercialDetail = async (commercialRow) => {
    if (!pureDataId) {
      setCommercialError("Relance l'analyse pour activer le détail commercial.")
      setSelectedCommercial(commercialRow)
      return
    }
    setSelectedCommercial(commercialRow)
    setCommercialDetail(null)
    setCommercialError(null)
    setCommercialLoading(true)
    try {
      const data = await getPureDataCommercialDetail({
        pureDataId,
        commercial: commercialRow.commercial,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
        fournisseur: supplierFilter || undefined,
      })
      setCommercialDetail(data)
    } catch (err) {
      setCommercialError(err.response?.data?.detail || err.message || "Erreur lors du détail commercial")
    } finally {
      setCommercialLoading(false)
    }
  }

  const toggleFournisseur = (key) => {
    setExpandedFournisseurs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleMarque = (key) => {
    setExpandedMarques((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  /** Comparaison affichée : filtrée par fournisseur si filtre actif, sinon globale. */
  const comparisonToShow = supplierFilter && filteredComparison
    ? filteredComparison.comparison
    : result?.comparison

  const displayTotals = comparisonToShow?.total ?? null
  const displayPlatforms = comparisonToShow?.platforms ?? []

  const commercialRows = useMemo(() => {
    const rows = comparisonToShow?.commercials || []
    if (!commercialFilter) return rows
    const q = commercialFilter.toLowerCase()
    return rows.filter((row) => (row.commercial || '').toLowerCase().includes(q))
  }, [comparisonToShow, commercialFilter])

  const clientRows = useMemo(() => {
    const rows = comparisonToShow?.clients || []
    if (!clientQuery) return rows
    const q = clientQuery.toLowerCase()
    return rows.filter((row) =>
      (row.code_union || '').toLowerCase().includes(q) ||
      (row.raison_sociale || '').toLowerCase().includes(q)
    )
  }, [comparisonToShow, clientQuery])

  const selectedPeriodsCount = useMemo(
    () => periods.filter((p) => selectedPeriods[periodKey(p)]).length,
    [periods, selectedPeriods]
  )

  return (
    <div className="space-y-6">

      {/* ── Bannière Google Sheets (source principale) — masquée en mode mensuel ── */}
      {!monthlyEntry && (
      <div className={`glass-card p-4 border ${sheetsStatus?.has_data ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Database className={`w-5 h-5 ${sheetsStatus?.has_data ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div>
              <div className="text-white font-semibold text-sm flex items-center gap-2">
                Google Sheets — <span className="font-mono text-xs text-white/60">global New</span>
                {sheetsStatus?.has_data && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    ✓ {sheetsStatus.row_count?.toLocaleString('fr-FR')} lignes en base
                  </span>
                )}
              </div>
              <p className="text-white/40 text-xs">
                {sheetsStatus?.has_data
                  ? 'Données chargées automatiquement depuis Supabase'
                  : 'Aucune donnée — synchronisez depuis Google Sheets'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncSheets}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              syncSuccess
                ? 'bg-emerald-500 text-white'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            }`}
          >
            {syncing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Synchronisation…</>
            ) : syncSuccess ? (
              <><CheckCircle2 className="w-4 h-4" /> Synchronisé !</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Synchroniser depuis Sheets</>
            )}
          </button>
        </div>
      </div>
      )}

      {/* ── Imports mensuels — masqués en mode mensuel (page dédiée dans menu Plus) ── */}
      {!monthlyEntry && (
      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-glass-primary font-semibold">Gestion des imports mensuels</h2>
            <p className="text-glass-secondary text-sm">
              Nouveau mode mensuel isole (2025/2026) : aucune ecriture sur l'historique Pure Data 2024/2025.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshPeriods}
            disabled={periodsLoading || managing}
            className="glass-btn-secondary text-xs px-3 py-2"
          >
            {periodsLoading ? 'Actualisation...' : 'Rafraichir les periodes'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="md:col-span-2">
            <label className="text-glass-secondary text-xs font-semibold">Fichier Excel</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setManageFile(e.target.files?.[0] || null)}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Mode d'import</label>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
              className="glass-input w-full mt-2"
            >
              <option value="append">Ajouter (conserver l'existant)</option>
              <option value="replace_scope">Remplacer la periode du fichier</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={handleImportMonthly}
            disabled={managing || !manageFile}
            className="glass-btn-primary px-4 py-2 text-sm"
          >
            {managing ? 'Import en cours...' : "Importer en base mensuelle"}
          </button>
          <button
            type="button"
            onClick={handleCompareMonthly}
            disabled={loading || managing}
            className="glass-btn-secondary px-4 py-2 text-sm"
          >
            {loading ? 'Chargement...' : 'Afficher la vue mensuelle'}
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedPeriods}
            disabled={managing || selectedPeriodsCount === 0}
            className="glass-btn-secondary px-4 py-2 text-sm"
          >
            Supprimer la selection ({selectedPeriodsCount})
          </button>
        </div>

        {manageMessage && <p className="mt-3 text-emerald-300 text-sm">{manageMessage}</p>}

        <div className="mt-4 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs text-glass-muted bg-white/5">
            Periodes chargees ({periods.length})
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="glass-table text-xs">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Sel.</th>
                  <th className="px-3 py-2 text-left">Periode</th>
                  <th className="px-3 py-2 text-left">Fournisseur</th>
                  <th className="px-3 py-2 text-right">Lignes</th>
                  <th className="px-3 py-2 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const key = periodKey(p)
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedPeriods[key])}
                          onChange={() => togglePeriod(p)}
                        />
                      </td>
                      <td className="px-3 py-2">{monthLabel(p.mois)} {p.annee || '-'}</td>
                      <td className="px-3 py-2">{p.fournisseur || '-'}</td>
                      <td className="px-3 py-2 text-right">{Number(p.row_count || 0).toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(p.total_ca || 0)}</td>
                    </tr>
                  )
                })}
                {!periods.length && !periodsLoading && (
                  <tr>
                    <td className="px-3 py-3 text-center text-glass-secondary" colSpan={5}>
                      Aucune periode disponible.
                    </td>
                  </tr>
                )}
                {periodsLoading && (
                  <tr>
                    <td className="px-3 py-3 text-center text-glass-secondary" colSpan={5}>
                      Chargement...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* ── Contrôles principaux ── */}
      {monthlyEntry ? (
        /* Mode mensuel: header compact + refresh uniquement */
        <div className="glass-card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-glass-primary text-xl font-bold">
                  Mensuel {yearCurrent} / {yearPrevious}
                  {supplierFilter && <span className="ml-2 text-sm font-normal text-white/50">• {supplierFilter}</span>}
                </h1>
                <p className="text-glass-secondary text-xs">Cliquez sur un mois, une plateforme, un commercial ou un adhérent pour le détail.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <input type="number" value={yearCurrent} onChange={(e) => setYearCurrent(Number(e.target.value))} className="glass-input w-20 text-sm" />
                <span className="text-white/40 text-xs">vs</span>
                <input type="number" value={yearPrevious} onChange={(e) => setYearPrevious(Number(e.target.value))} className="glass-input w-20 text-sm" />
              </div>
              <button onClick={handleCompareMonthly} disabled={loading} className="glass-btn-primary px-4 py-2 text-sm flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Chargement…' : 'Actualiser'}
              </button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
          {pureDataExpiredMessage && <div className="mt-3 p-3 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm">{pureDataExpiredMessage}</div>}
        </div>
      ) : (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-glass-primary text-xl font-bold">Pure Data • Comparatif N-1</h1>
              {supplierFilter && (
                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30">
                  Vue {supplierFilter} uniquement
                </span>
              )}
            </div>
            <p className="text-glass-secondary text-sm">
              Analyse mensuelle par adhérent et commercial (N vs N-1){supplierFilter ? ` — vue limitée à ${supplierFilter} (commerciaux et adhérents inclus)` : ''}.
            </p>
            {supplierFilter && filteredComparisonLoading && (
              <p className="text-amber-300 text-xs mt-1">Chargement des données {supplierFilter}…</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card-dark p-4 md:col-span-2">
            <label className="text-glass-secondary text-xs font-semibold">Fichier unique (N + N-1)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files[0])}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Année N</label>
            <input
              type="number"
              value={yearCurrent}
              onChange={(e) => setYearCurrent(Number(e.target.value))}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Année N-1</label>
            <input
              type="number"
              value={yearPrevious}
              onChange={(e) => setYearPrevious(Number(e.target.value))}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Mois (optionnel)</label>
            <input
              type="number"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="1-12"
              className="glass-input w-full mt-2"
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <button
              onClick={monthlyEntry ? handleCompareMonthly : handleCompare}
              className="glass-btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              <Upload className="w-4 h-4" />
              {loading ? 'Analyse...' : monthlyEntry ? 'Rafraichir la vue mensuelle' : 'Comparer'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-rose-300">{error}</div>
        )}
        {pureDataExpiredMessage && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm">
            {pureDataExpiredMessage}
          </div>
        )}
        {lastRunMeta && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-glass-muted">
            <span>Données en cache</span>
            {lastRunMeta.fileName && <span>• {lastRunMeta.fileName}</span>}
            {lastRunMeta.yearCurrent && lastRunMeta.yearPrevious && (
              <span>• {lastRunMeta.yearCurrent} vs {lastRunMeta.yearPrevious}</span>
            )}
            {lastRunMeta.month && <span>• Mois {lastRunMeta.month}</span>}
            <button onClick={clearCache} className="glass-btn-secondary text-xs px-3 py-1">
              Effacer le cache
            </button>
          </div>
        )}
      </div>
      )}

      {result && displayTotals && (
        <>
          {monthlyEntry && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-glass-primary font-semibold">
                  Evolution mensuelle {yearCurrent} vs {yearPrevious}
                </h2>
                {monthlyEvolutionLoading && <span className="text-xs text-glass-muted">Chargement...</span>}
              </div>

              {monthlyEvolution?.months?.length ? (
                <div className="overflow-x-auto">
                  <p className="text-xs text-white/40 mb-2">Cliquez sur un mois pour voir le détail par plateforme.</p>
                  <table className="glass-table text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2">Mois</th>
                        <th className="text-right px-3 py-2">CA {yearCurrent}</th>
                        <th className="text-right px-3 py-2">CA {yearPrevious}</th>
                        <th className="text-right px-3 py-2">Delta</th>
                        <th className="text-right px-3 py-2">Delta %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyEvolution.months.map((m) => (
                        <Fragment key={m.month}>
                          <tr
                            className="cursor-pointer hover:bg-white/10 transition-colors"
                            onClick={() => setSelectedEvolutionMonth(
                              selectedEvolutionMonth === m.month ? null : m.month
                            )}
                          >
                            <td className="px-3 py-2 font-medium flex items-center gap-2">
                              <ChevronDown className={`w-3 h-3 transition-transform text-white/40 ${selectedEvolutionMonth === m.month ? 'rotate-180' : ''}`} />
                              {monthLabel(m.month)}
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(m.current)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(m.previous)}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <span className={getDeltaClass(m.delta)}>{formatDelta(m.delta)}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={getDeltaPctClass(m.delta_pct)}>{formatPercent(m.delta_pct)}</span>
                            </td>
                          </tr>
                          {selectedEvolutionMonth === m.month && (
                            <tr>
                              <td colSpan={5} className="px-3 pb-3">
                                <MonthDetailPanel
                                  month={m.month}
                                  yearCurrent={yearCurrent}
                                  yearPrevious={yearPrevious}
                                  onClose={() => setSelectedEvolutionMonth(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-glass-muted">Aucune ventilation mensuelle disponible.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">CA total N{supplierFilter ? ` (${supplierFilter})` : ''}</div>
              <div className="text-lg font-bold text-glass-primary">
                {formatCurrency(displayTotals.current)}
              </div>
            </div>
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">CA total N-1{supplierFilter ? ` (${supplierFilter})` : ''}</div>
              <div className="text-lg font-bold text-glass-primary">
                {formatCurrency(displayTotals.previous)}
              </div>
            </div>
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">Delta</div>
              <div className={`text-lg font-bold ${displayTotals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatDelta(displayTotals.delta)} • {formatPercent(displayTotals.delta_pct)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Par plateforme ── */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-glass-primary font-semibold">Par plateforme</h2>
                {monthlyEntry && <span className="text-xs text-white/40">Cliquez pour le détail mensuel</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="glass-table text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2">Plateforme</th>
                      <th className="text-right px-3 py-2">CA N</th>
                      <th className="text-right px-3 py-2">CA N-1</th>
                      <th className="text-right px-3 py-2">Delta</th>
                      <th className="text-right px-3 py-2">Delta %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPlatforms.map((row) => (
                      <Fragment key={row.platform}>
                        <tr
                          className="cursor-pointer hover:bg-white/10"
                          onClick={() => monthlyEntry
                            ? setMonthlyDetailEntity({ platform: row.platform, label: row.platform })
                            : openPlatformDetail(row)
                          }
                        >
                          <td className="px-3 py-2 font-medium flex items-center gap-2">
                            {monthlyEntry && <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${monthlyDetailEntity?.platform === row.platform ? 'rotate-180' : ''}`} />}
                            {row.platform}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                          </td>
                        </tr>
                        {monthlyEntry && monthlyDetailEntity?.platform === row.platform && (
                          <tr>
                            <td colSpan={5} className="px-3 pb-3 bg-white/[0.02]">
                              <MonthlyEntityDetailModal
                                entity={{ platform: row.platform, label: row.platform }}
                                yearCurrent={yearCurrent}
                                yearPrevious={yearPrevious}
                                onClose={() => setMonthlyDetailEntity(null)}
                                inline
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {supplierFilter && displayPlatforms.length === 0 && !filteredComparisonLoading && (
                <p className="text-sm text-amber-300 mt-3">Aucune donnée pour la plateforme {supplierFilter} dans ce comparatif.</p>
              )}
            </div>

            {/* ── Par commercial ── */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-300" />
                  <h2 className="text-glass-primary font-semibold">Par commercial</h2>
                  {monthlyEntry && <span className="text-xs text-white/40">Cliquez pour le détail mensuel</span>}
                </div>
                <input
                  value={commercialFilter}
                  onChange={(e) => setCommercialFilter(e.target.value)}
                  placeholder="Filtrer..."
                  className="glass-input w-40"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="glass-table text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2">Commercial</th>
                      <th className="text-right px-3 py-2">CA N</th>
                      <th className="text-right px-3 py-2">CA N-1</th>
                      <th className="text-right px-3 py-2">Delta</th>
                      <th className="text-right px-3 py-2">Delta %</th>
                      <th className="text-right px-3 py-2">Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialRows.map((row) => (
                      <Fragment key={row.commercial}>
                        <tr
                          className="cursor-pointer hover:bg-white/10"
                          onClick={() => monthlyEntry
                            ? setMonthlyDetailEntity(
                                monthlyDetailEntity?.commercial === row.commercial
                                  ? null
                                  : { commercial: row.commercial, label: row.commercial }
                              )
                            : openCommercialDetail(row)
                          }
                        >
                          <td className="px-3 py-2 font-medium flex items-center gap-2">
                            {monthlyEntry && <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${monthlyDetailEntity?.commercial === row.commercial ? 'rotate-180' : ''}`} />}
                            {row.commercial}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">{row.clients}</td>
                        </tr>
                        {monthlyEntry && monthlyDetailEntity?.commercial === row.commercial && (
                          <tr>
                            <td colSpan={6} className="px-3 pb-3 bg-white/[0.02]">
                              <MonthlyEntityDetailModal
                                entity={{ commercial: row.commercial, label: row.commercial }}
                                yearCurrent={yearCurrent}
                                yearPrevious={yearPrevious}
                                onClose={() => setMonthlyDetailEntity(null)}
                                inline
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Par adhérent (fusionné avec la liste mensuelle) ── */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-glass-primary font-semibold">
                  Par adhérent {monthlyEntry && clientRows.length > 0 ? `(${clientRows.length})` : ''}
                </h2>
                {monthlyEntry && <p className="text-xs text-white/40 mt-0.5">Cliquez pour le détail plateforme × mois</p>}
              </div>
              <input
                value={monthlyEntry ? monthlyClientSearch : clientQuery}
                onChange={(e) => monthlyEntry ? setMonthlyClientSearch(e.target.value) : setClientQuery(e.target.value)}
                placeholder="Code Union ou raison sociale..."
                className="glass-input w-64"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="glass-table text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2">Code Union</th>
                    <th className="text-left px-3 py-2">Raison sociale</th>
                    <th className="text-left px-3 py-2">Commercial</th>
                    <th className="text-right px-3 py-2">CA N</th>
                    <th className="text-right px-3 py-2">CA N-1</th>
                    <th className="text-right px-3 py-2">Delta</th>
                    <th className="text-right px-3 py-2">Delta %</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthlyEntry
                    ? (monthlyEvolution?.clients || []).filter((c) => {
                        if (!monthlyClientSearch.trim()) return true
                        const q = monthlyClientSearch.toLowerCase()
                        return (c.code_union || '').toLowerCase().includes(q) ||
                               (c.raison_sociale || '').toLowerCase().includes(q) ||
                               (c.commercial || '').toLowerCase().includes(q)
                      })
                    : clientRows
                  ).map((row) => {
                    const isMonthly = monthlyEntry
                    const key = row.code_union
                    const isExpanded = monthlyDetailEntity?.code_union === key
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer hover:bg-white/10"
                          onClick={() => isMonthly
                            ? setMonthlyDetailEntity(
                                isExpanded ? null : { code_union: key, label: `${key} — ${row.raison_sociale || ''}`.trim() }
                              )
                            : openClientDetail(row)
                          }
                        >
                          <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                            {isMonthly && <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                            <span className={isMonthly ? 'text-teal-300' : ''}>{key}</span>
                          </td>
                          <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                          <td className="px-3 py-2">{row.commercial || '-'}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(isMonthly ? row.total_current : row.ca)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(isMonthly ? row.total_previous : row.ca_previous)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                          </td>
                        </tr>
                        {isMonthly && isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-3 pb-3 bg-white/[0.02]">
                              <MonthlyEntityDetailModal
                                entity={{ code_union: key, label: `${key} — ${row.raison_sociale || ''}`.trim() }}
                                yearCurrent={yearCurrent}
                                yearPrevious={yearPrevious}
                                onClose={() => setMonthlyDetailEntity(null)}
                                inline
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedPlatform && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlatform(null)}>
          <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  Plateforme {selectedPlatform.platform}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedPlatform(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {platformLoading && <div className="text-glass-secondary">Chargement...</div>}
              {platformError && <div className="text-rose-300 text-sm">{platformError}</div>}
              {platformDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(platformDetail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(platformDetail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${platformDetail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(platformDetail.totals.delta)} • {formatPercent(platformDetail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">
                        Marques (global plateforme)
                        <span className="ml-2 text-xs text-glass-secondary">
                          {platformDetail.marques?.length || 0} — cliquez sur une marque pour voir les magasins
                        </span>
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Marque</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {platformDetail.marques?.length ? (
                            platformDetail.marques.map((row) => (
                              <tr
                                key={row.marque}
                                role="button"
                                tabIndex={0}
                                className={`cursor-pointer hover:bg-white/10 ${selectedMarqueInPlatform?.marque === row.marque ? 'bg-white/15 ring-1 ring-inset ring-white/30' : ''}`}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openMarqueDetail(row); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMarqueDetail(row); } }}
                              >
                                <td className="px-3 py-2 font-medium">{row.marque}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-3 text-center text-glass-secondary" colSpan={5}>
                                Aucune marque trouvée pour cette plateforme.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {selectedMarqueInPlatform && (
                      <div ref={magasinsBlockRef} className="p-4 border-t border-white/10 bg-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-glass-primary font-semibold">
                            Magasins qui contribuent à la marque « {selectedMarqueInPlatform.marque} »
                          </h4>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedMarqueInPlatform(null); setMarqueDetail(null); setMarqueDetailError(null); }}
                            className="text-xs text-glass-secondary hover:text-white px-2 py-1 rounded border border-white/20"
                          >
                            Fermer
                          </button>
                        </div>
                        {marqueDetailLoading && <p className="text-glass-secondary text-sm py-4">Chargement des magasins…</p>}
                        {marqueDetailError && <p className="text-rose-300 text-sm py-2">{marqueDetailError}</p>}
                        {!marqueDetailLoading && !marqueDetailError && marqueDetail && marqueDetail.magasins?.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="glass-table text-sm">
                              <thead>
                                <tr>
                                  <th className="text-left px-3 py-2">Code Union</th>
                                  <th className="text-left px-3 py-2">Raison sociale</th>
                                  <th className="text-left px-3 py-2">Commercial</th>
                                  <th className="text-right px-3 py-2">CA N</th>
                                  <th className="text-right px-3 py-2">CA N-1</th>
                                  <th className="text-right px-3 py-2">Delta</th>
                                  <th className="text-right px-3 py-2">Delta %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {marqueDetail.magasins.map((mag) => (
                                  <tr key={mag.code_union}>
                                    <td className="px-3 py-2 font-medium">{mag.code_union}</td>
                                    <td className="px-3 py-2 text-glass-secondary">{mag.raison_sociale || '-'}</td>
                                    <td className="px-3 py-2">{mag.commercial || '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(mag.ca)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(mag.ca_previous)}</td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                      <span className={getDeltaClass(mag.delta)}>{formatDelta(mag.delta)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={getDeltaPctClass(mag.delta_pct)}>{formatPercent(mag.delta_pct)}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!marqueDetailLoading && !marqueDetailError && marqueDetail && (!marqueDetail.magasins || marqueDetail.magasins.length === 0) && (
                          <p className="text-glass-secondary text-sm py-2">Aucun magasin trouvé pour cette marque (vérifiez les années N/N-1).</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Clients de la plateforme</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Code Union</th>
                            <th className="text-left px-3 py-2">Raison sociale</th>
                            <th className="text-left px-3 py-2">Commercial</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {platformDetail.clients.map((row) => (
                            <tr key={row.code_union}>
                              <td className="px-3 py-2 font-medium">{row.code_union}</td>
                              <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                              <td className="px-3 py-2">{row.commercial || '-'}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCommercial && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedCommercial(null)}>
          <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  Commercial {selectedCommercial.commercial}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedCommercial(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {commercialLoading && <div className="text-glass-secondary">Chargement...</div>}
              {commercialError && <div className="text-rose-300 text-sm">{commercialError}</div>}
              {commercialDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(commercialDetail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(commercialDetail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${commercialDetail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(commercialDetail.totals.delta)} • {formatPercent(commercialDetail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Plateformes</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Plateforme</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercialDetail.platforms.map((row) => (
                            <tr key={row.platform}>
                              <td className="px-3 py-2 font-medium">{row.platform}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Clients</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Code Union</th>
                            <th className="text-left px-3 py-2">Raison sociale</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercialDetail.clients.map((row) => (
                            <tr key={row.code_union}>
                              <td className="px-3 py-2 font-medium">{row.code_union}</td>
                              <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedClient(null)}>
          <div className="glass-modal max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {selectedClient.code_union} • {selectedClient.raison_sociale || 'Client'}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedClient(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {detailLoading && <div className="text-glass-secondary">Chargement...</div>}
              {detailError && <div className="text-rose-300 text-sm">{detailError}</div>}
              {detail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(detail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(detail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${detail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(detail.totals.delta)} • {formatPercent(detail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Détail par fournisseur</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Fournisseur</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.breakdown.map((item) => {
                            const key = item.fournisseur
                            const expanded = expandedFournisseurs[key]
                            return (
                              <Fragment key={key}>
                                <tr key={key} className="cursor-pointer hover:bg-white/10" onClick={() => toggleFournisseur(key)}>
                                  <td className="px-3 py-2 font-medium flex items-center gap-2">
                                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    {item.fournisseur}
                                  </td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.ca)}</td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.ca_previous)}</td>
                                  <td className="px-3 py-2 text-right font-semibold">
                                    <span className={getDeltaClass(item.delta)}>{formatDelta(item.delta)}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={getDeltaPctClass(item.delta_pct)}>{formatPercent(item.delta_pct)}</span>
                                  </td>
                                </tr>
                                {expanded && item.children?.map((marque) => {
                                  const marqueKey = `${key}::${marque.marque}`
                                  const marqueExpanded = expandedMarques[marqueKey]
                                  return (
                                    <Fragment key={marqueKey}>
                                      <tr className="bg-white/5 cursor-pointer" onClick={() => toggleMarque(marqueKey)}>
                                        <td className="px-6 py-2 font-medium flex items-center gap-2">
                                          <ChevronDown className={`w-3 h-3 transition-transform ${marqueExpanded ? 'rotate-180' : ''}`} />
                                          {marque.marque}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(marque.ca)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(marque.ca_previous)}</td>
                                        <td className="px-3 py-2 text-right font-semibold">
                                          <span className={getDeltaClass(marque.delta)}>{formatDelta(marque.delta)}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <span className={getDeltaPctClass(marque.delta_pct)}>{formatPercent(marque.delta_pct)}</span>
                                        </td>
                                      </tr>
                                      {marqueExpanded && marque.children?.map((famille) => (
                                        <tr key={`${marqueKey}::${famille.famille}`} className="bg-white/5">
                                          <td className="px-10 py-2 text-glass-secondary">{famille.famille}</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(famille.ca)}</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(famille.ca_previous)}</td>
                                          <td className="px-3 py-2 text-right font-semibold">
                                            <span className={getDeltaClass(famille.delta)}>{formatDelta(famille.delta)}</span>
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <span className={getDeltaPctClass(famille.delta_pct)}>{formatPercent(famille.delta_pct)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </Fragment>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {monthlyEntry && monthlyDetailEntity && (
        <MonthlyEntityDetailModal
          entity={monthlyDetailEntity}
          yearCurrent={yearCurrent}
          yearPrevious={yearPrevious}
          onClose={() => setMonthlyDetailEntity(null)}
        />
      )}
    </div>
  )
}

export default PureDataPage
