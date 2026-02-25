import { useState, useEffect, useRef } from 'react'
import {
  Loader2, RefreshCw, TrendingUp, Users, Euro, Target,
  ChevronUp, ChevronDown, Send, RotateCcw, AlertTriangle,
} from 'lucide-react'
import { genieQuery, getUnionEntity, getEntities, getRfaSheetsKpis } from '../api/client'

/* ── Formatage ──────────────────────────────────────────────── */
const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    : '—'

const fmtPct = (n) =>
  typeof n === 'number' ? `${(n * 100).toFixed(2)} %` : '—'

/* ── KPI Card ───────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:   'from-blue-500/20 to-indigo-500/20 border-blue-500/30 text-blue-300',
    green:  'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300',
    amber:  'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-300',
    violet: 'from-violet-500/20 to-purple-500/20 border-violet-500/30 text-violet-300',
    red:    'from-red-500/20 to-rose-500/20 border-red-500/30 text-red-300',
  }
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${colors[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</span>
        {icon && <span className="opacity-60">{icon}</span>}
      </div>
      <div className="text-2xl font-black text-white leading-tight">{value ?? '—'}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  )
}

/* ── Section titre ──────────────────────────────────────────── */
function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-3">{children}</h2>
  )
}

/* ── Chat rapide ────────────────────────────────────────────── */
const SUGGESTIONS = [
  { emoji: '📊', label: 'Vue d\'ensemble',    q: 'dashboard' },
  { emoji: '⚖️',  label: 'Balance E/S',       q: 'balance' },
  { emoji: '🏆', label: 'Top gains',           q: 'top_gains' },
  { emoji: '🎯', label: 'Objectifs proches',   q: 'near_by_objective' },
  { emoji: '💡', label: 'Leviers Union',        q: 'union_opportunities' },
]

function RichLine({ text }) {
  if (text === '---') return <hr className="border-white/10 my-1" />
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{p}</strong> : <span key={i}>{p}</span>
      )}
    </span>
  )
}

function formatChatResult(data) {
  if (!data) return ['Aucun résultat.']
  const lines = []
  const t = data.resultType

  if (t === 'dashboard' && data.data && !Array.isArray(data.data)) {
    const s = data.data
    if (s.total_clients) lines.push(`**${s.total_clients}** adhérents analysés`)
    if (s.total_near) lines.push(`**${s.total_near}** objectifs proches d'un palier`)
    if (s.total_achieved) lines.push(`**${s.total_achieved}** objectifs déjà atteints`)
    if (s.total_gain_potential) lines.push(`Gain potentiel : **${fmt(s.total_gain_potential)}**`)
  }
  if (data.alerts?.length) {
    lines.push('---')
    lines.push(`**${data.alerts.length} alerte(s) :**`)
    data.alerts.slice(0, 5).forEach((a) => {
      const icon = a.priority === 'critical' ? '🔴' : a.priority === 'high' ? '🟠' : '🟡'
      lines.push(`${icon} ${a.title} — ${a.message}`)
    })
  }
  if (t === 'balance' && Array.isArray(data.data)) {
    data.data.slice(0, 8).forEach((row) => {
      const arrow = (row.balance || 0) >= 0 ? '📈' : '📉'
      lines.push(`${arrow} **${row.label || row.key}** — entrant ${fmt(row.inbound)} / sortant ${fmt(row.outbound)} / solde **${fmt(row.balance)}**`)
    })
  }
  if (t === 'top_gains' && Array.isArray(data.data)) {
    data.data.slice(0, 8).forEach((item, i) => {
      lines.push(`**${i + 1}.** ${item.label || item.id} — ${fmt(item.rfa_total || item.value)}`)
    })
  }
  if (t === 'near_by_objective' && data.data) {
    const entries = Array.isArray(data.data)
      ? data.data
      : Object.entries(data.data).flatMap(([, v]) => (Array.isArray(v) ? v : []))
    entries.slice(0, 8).forEach((item) => {
      const name = item.label || item.id || item.nom_client
      const gap = item.gap_to_next !== undefined ? ` (manque **${fmt(item.gap_to_next)}**)` : ''
      lines.push(`🎯 **${name}**${gap}`)
    })
  }
  if (t === 'union_opportunities' && data.data) {
    const entries = Array.isArray(data.data)
      ? data.data
      : Object.entries(data.data).map(([k, v]) => ({ label: k, ...v }))
    entries.slice(0, 6).forEach((opp) => {
      lines.push(`💡 **${opp.label || opp.key}** — ${opp.description || opp.detail || ''}`)
    })
  }
  if (lines.length === 0) lines.push('Analyse effectuée. Consultez Union Intelligence pour le détail complet.')
  return lines
}

/* ══════════════════════════════════════════════════════════════ */
export default function NicolasPage({ importId }) {
  const [dashboard, setDashboard]       = useState(null)
  const [union, setUnion]               = useState(null)
  const [clients, setClients]           = useState([])
  const [kpiSuppliers, setKpiSuppliers] = useState({})
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  // Chat
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const load = async () => {
    if (!importId) return
    setLoading(true)
    setError(null)
    try {
      const [kpis, unionData, clientList] = await Promise.all([
        getRfaSheetsKpis(importId).catch(() => null),
        getUnionEntity(importId).catch(() => null),
        getEntities(importId, 'client').catch(() => []),
      ])
      // Convertit les KPIs en format dashboard compatible
      if (kpis) {
        setDashboard({
          data: {
            total_clients: kpis.nb_clients,
            total_near: null,
            total_achieved: null,
            total_gain_potential: null,
          },
          alerts: [],
        })
        setClients(kpis.top_clients?.map(c => ({
          id: c.id, label: c.label, rfa_total: null,
          global_total: c.ca, tri_total: 0, grand_total: c.ca,
        })) || [])
        // Construit globalRows depuis ca_by_supplier
        if (kpis.ca_by_supplier) {
          setKpiSuppliers(kpis.ca_by_supplier)
        }
      }
      setUnion(unionData)
      if (clientList && Array.isArray(clientList) && clientList.length > 0) {
        setClients(clientList)
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [importId])

  /* ── Données dérivées ── */
  const rfa = union?.rfa || {}
  const totals = rfa.totals || {}
  const globalRfa    = totals.global_total ?? null
  const triRfa       = totals.tri_total    ?? null
  const grandTotal   = totals.grand_total  ?? null
  const caTotal      = union?.global_total ?? union?.ca_total ?? null
  const txRfa        = caTotal && grandTotal ? grandTotal / caTotal : null
  const nbClients    = dashboard?.data?.total_clients ?? clients.length ?? null
  const gainPotentiel= dashboard?.data?.total_gain_potential ?? null
  const nbProches    = dashboard?.data?.total_near ?? null

  // Données fournisseurs : depuis Union Space (rfa) ou depuis KPIs directs
  const globalRows = (() => {
    if (Array.isArray(rfa.global_items) && rfa.global_items.length > 0) return rfa.global_items
    if (rfa.global && Object.keys(rfa.global).length > 0)
      return Object.entries(rfa.global).map(([key, v]) => ({ key, ...(typeof v === 'object' ? v : { ca: 0 }) }))
    // Fallback : KPIs depuis le nouvel endpoint
    return Object.entries(kpiSuppliers).map(([label, ca]) => ({
      key: `GLOBAL_${label}`, ca, rfa: { value: 0, rate: 0 }, bonus: { value: 0 }
    }))
  })()

  const topClients = [...clients]
    .filter(c => c.rfa_total > 0)
    .sort((a, b) => (b.rfa_total ?? 0) - (a.rfa_total ?? 0))
    .slice(0, 10)

  const nearClients = (() => {
    const data = dashboard?.data
    if (!data) return []
    const raw = data.near_clients || data.near || []
    if (Array.isArray(raw)) return raw.slice(0, 8)
    return Object.values(raw).flat().slice(0, 8)
  })()

  const alerts = dashboard?.alerts || []

  /* ── Chat helpers ── */
  const sendChat = async (queryType, userLabel) => {
    if (!importId) return
    setMessages(m => [...m, { role: 'user', text: userLabel || queryType }])
    setChatLoading(true)
    try {
      const result = await genieQuery(importId, queryType)
      setMessages(m => [...m, { role: 'nicolas', lines: formatChatResult(result) }])
    } catch {
      setMessages(m => [...m, { role: 'nicolas', lines: ['Erreur lors de l\'analyse.'] }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    const lower = text.toLowerCase()
    if (lower.includes('balance') || lower.includes('entrant') || lower.includes('sortant')) sendChat('balance', text)
    else if (lower.includes('gain') || lower.includes('top') || lower.includes('meilleur')) sendChat('top_gains', text)
    else if (lower.includes('palier') || lower.includes('objectif') || lower.includes('proche')) sendChat('near_by_objective', text)
    else if (lower.includes('levier') || lower.includes('opportunit')) sendChat('union_opportunities', text)
    else sendChat('dashboard', text)
  }

  /* ── Pas de données ── */
  if (!importId) {
    return (
      <div className="max-w-3xl mx-auto mt-12 text-center space-y-4">
        <div className="text-5xl">📊</div>
        <h2 className="text-xl font-bold text-white">Aucune donnée chargée</h2>
        <p className="text-white/50 text-sm">Connectez la feuille RFA depuis <strong>Import & source RFA</strong> et lancez une mise à jour.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">

      {/* ── Header ── */}
      <div className="glass-card overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-800 px-5 py-4 relative">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">📊</div>
              <div>
                <h1 className="text-xl font-black text-white leading-tight">Nicolas</h1>
                <p className="text-white/60 text-xs font-medium">Tableau de bord RFA — chiffres en direct</p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="glass-btn-icon"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div className="glass-card bg-red-500/10 border border-red-500/30 px-5 py-3 text-red-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-blue-300/60">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement des données…
        </div>
      )}

      {!loading && (
        <>
          {/* ── KPIs principaux ── */}
          <div>
            <SectionTitle>Chiffres clés</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="CA Total"
                value={fmt(caTotal)}
                sub="chiffre d'affaires groupement"
                color="blue"
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <KpiCard
                label="RFA Totale"
                value={fmt(grandTotal)}
                sub={txRfa ? `Taux effectif : ${fmtPct(txRfa)}` : 'toutes plateformes'}
                color="green"
                icon={<Euro className="w-4 h-4" />}
              />
              <KpiCard
                label="Adhérents"
                value={nbClients}
                sub="comptes analysés"
                color="violet"
                icon={<Users className="w-4 h-4" />}
              />
              <KpiCard
                label="Gain potentiel"
                value={gainPotentiel != null ? fmt(gainPotentiel) : '—'}
                sub={nbProches ? `${nbProches} objectifs proches` : 'objectifs à atteindre'}
                color="amber"
                icon={<Target className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* ── RFA par plateforme ── */}
          {globalRows.length > 0 && (
            <div>
              <SectionTitle>RFA par plateforme (global)</SectionTitle>
              <div className="glass-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Plateforme', 'CA', 'RFA', 'Bonus', 'Total', 'Taux'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {globalRows.map((row, i) => {
                      const key = row.key || row.fournisseur || ''
                      const label = key.replace('GLOBAL_', '')
                      const ca = row.ca ?? row.global_total ?? 0
                      const rfaV = row.rfa?.value ?? row.currentRfaAmount ?? 0
                      const bonusV = row.bonus?.value ?? row.currentBonusAmount ?? 0
                      const total = rfaV + bonusV
                      const taux = ca > 0 ? total / ca : 0
                      return (
                        <tr key={key} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="px-4 py-3 font-bold text-white">{label}</td>
                          <td className="px-4 py-3 text-white/70 font-mono">{fmt(ca)}</td>
                          <td className="px-4 py-3 text-emerald-400 font-mono">{fmt(rfaV)}</td>
                          <td className="px-4 py-3 text-amber-400 font-mono">{fmt(bonusV)}</td>
                          <td className="px-4 py-3 text-white font-bold font-mono">{fmt(total)}</td>
                          <td className="px-4 py-3 text-blue-300 text-xs">{fmtPct(taux)}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t border-white/20 bg-white/5">
                      <td className="px-4 py-3 font-black text-white text-xs uppercase">Total RFA Union</td>
                      <td className="px-4 py-3 font-bold text-white font-mono">{fmt(caTotal)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-400 font-mono">{fmt(globalRfa)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 font-black text-white font-mono">{fmt(grandTotal)}</td>
                      <td className="px-4 py-3 font-bold text-blue-300 text-xs">{fmtPct(txRfa)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Alertes ── */}
          {alerts.length > 0 && (
            <div>
              <SectionTitle>Alertes & points d'attention</SectionTitle>
              <div className="space-y-2">
                {alerts.slice(0, 6).map((a, i) => (
                  <div key={i} className={`glass-card px-4 py-3 flex items-start gap-3 border ${
                    a.priority === 'critical' ? 'border-red-500/30 bg-red-500/10' :
                    a.priority === 'high'     ? 'border-amber-500/30 bg-amber-500/10' :
                    'border-white/10'
                  }`}>
                    <span className="text-lg flex-shrink-0">
                      {a.priority === 'critical' ? '🔴' : a.priority === 'high' ? '🟠' : '🟡'}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm">{a.title}</p>
                      <p className="text-white/60 text-xs mt-0.5">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Grille Objectifs proches + Top clients ── */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Top 10 adhérents par RFA */}
            {topClients.length > 0 && (
              <div>
                <SectionTitle>Top adhérents — RFA</SectionTitle>
                <div className="glass-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['#', 'Adhérent', 'RFA'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topClients.map((c, i) => (
                        <tr key={c.id} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="px-4 py-2.5 text-white/30 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-white font-medium text-xs truncate max-w-[140px]">{c.label || c.id}</p>
                            <p className="text-white/30 text-[10px]">{c.groupe_client}</p>
                          </td>
                          <td className="px-4 py-2.5 text-emerald-400 font-bold font-mono text-xs">{fmt(c.rfa_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Objectifs proches d'un palier */}
            {nearClients.length > 0 && (
              <div>
                <SectionTitle>Objectifs proches d'un palier</SectionTitle>
                <div className="glass-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Adhérent', 'Manque', 'Gain'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nearClients.map((c, i) => (
                        <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="px-4 py-2.5">
                            <p className="text-white font-medium text-xs truncate max-w-[130px]">{c.label || c.nom_client || c.id}</p>
                            <p className="text-white/30 text-[10px]">{c.key?.replace('GLOBAL_', '') || ''}</p>
                          </td>
                          <td className="px-4 py-2.5 text-amber-400 font-bold font-mono text-xs">{c.gap_to_next != null ? fmt(c.gap_to_next) : '—'}</td>
                          <td className="px-4 py-2.5 text-emerald-400 font-bold font-mono text-xs">{c.gain_at_next != null ? fmt(c.gain_at_next) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── Chat rapide (accordéon) ── */}
          <div className="glass-card overflow-hidden">
            <button
              onClick={() => setChatOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <span className="text-lg">💬</span>
                Analyser plus en détail
              </div>
              {chatOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
            </button>

            {chatOpen && (
              <div className="border-t border-white/10">
                {/* Suggestions */}
                <div className="px-4 py-3 flex gap-2 flex-wrap border-b border-white/10">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.q}
                      onClick={() => sendChat(s.q, s.label)}
                      disabled={chatLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-medium transition disabled:opacity-40"
                    >
                      <span>{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 text-white/30 hover:text-white/60 text-xs transition ml-auto"
                    >
                      <RotateCcw className="w-3 h-3" /> Effacer
                    </button>
                  )}
                </div>

                {/* Messages */}
                {messages.length > 0 && (
                  <div className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'nicolas' && (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs flex-shrink-0">📊</div>
                        )}
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white/5 text-blue-100/90 rounded-bl-sm border border-white/10'
                        }`}>
                          {msg.text && <span>{msg.text}</span>}
                          {msg.lines && (
                            <div className="space-y-1">
                              {msg.lines.map((line, li) => (
                                <div key={li}><RichLine text={line} /></div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex items-end gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs">📊</div>
                        <div className="bg-white/5 rounded-2xl rounded-bl-sm px-3 py-2 border border-white/10">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-300/60" />
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Posez une question à Nicolas…"
                    className="flex-1 bg-transparent text-white placeholder-white/30 text-xs focus:outline-none"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={chatLoading || !input.trim()}
                    className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:opacity-90 transition disabled:opacity-30"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
