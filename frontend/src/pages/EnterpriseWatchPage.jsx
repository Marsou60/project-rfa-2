import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import {
  acknowledgeEnterpriseWatchAlert,
  getEnterpriseWatchAlerts,
  runEnterpriseWatch,
} from '../api/client'
import { useAuth } from '../context/AuthContext'

const TYPE_META = {
  ADDRESS_CHANGE: { label: 'Adresse', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  DIRECTOR_CHANGE: { label: 'Dirigeant', className: 'bg-violet-100 text-violet-800 border-violet-200' },
  COMPANY_STATUS_CHANGE: { label: 'Statut entreprise', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  ESTABLISHMENT_STATUS_CHANGE: { label: 'Statut établissement', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  LEGAL_NAME_CHANGE: { label: 'Raison sociale', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  LEGAL_FORM_CHANGE: { label: 'Forme juridique', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  COLLECTIVE_PROCEEDING: { label: 'Procédure collective', className: 'bg-rose-200 text-rose-900 border-rose-300' },
}

function formatLegalValue(value) {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) {
    return value.map((item) => (item?.role ? `${item.name} (${item.role})` : String(item))).join(', ') || '—'
  }
  if (typeof value === 'object') {
    return (
      value.nature
      || value.detail
      || [value.address, value.postal_code, value.city].filter(Boolean).join(' ')
      || JSON.stringify(value)
    )
  }
  if (value === 'A') return 'Actif'
  if (value === 'C' || value === 'F') return 'Fermé / cessé'
  return String(value)
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type, className: 'bg-slate-100 text-slate-700 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export default function EnterpriseWatchPage() {
  const { isAdmin, isCommercial } = useAuth()
  const canRun = isAdmin || isCommercial
  const [data, setData] = useState({ alerts: [], unacknowledged: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [showTreated, setShowTreated] = useState(false)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getEnterpriseWatchAlerts({
        acknowledged: showTreated,
        limit: 400,
      })
      setData(res)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Impossible de charger les alertes légales.')
    } finally {
      setLoading(false)
    }
  }, [showTreated])

  useEffect(() => { load() }, [load])

  const acknowledge = async (alertId) => {
    try {
      await acknowledgeEnterpriseWatchAlert(alertId)
      setData((current) => ({
        ...current,
        alerts: current.alerts.filter((alert) => alert.id !== alertId),
        unacknowledged: Math.max(0, (current.unacknowledged || 0) - 1),
      }))
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de marquer cette alerte comme traitée.')
    }
  }

  const runWatch = async () => {
    setRunning(true)
    setError(null)
    try {
      await runEnterpriseWatch(true)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Vérification légale impossible.')
    } finally {
      setRunning(false)
    }
  }

  const alerts = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data.alerts || []).filter((alert) => {
      if (showTreated && !alert.acknowledged) return false
      if (!showTreated && alert.acknowledged) return false
      if (typeFilter && alert.alert_type !== typeFilter) return false
      if (!term) return true
      const blob = [
        alert.code_union,
        alert.title,
        alert.siret,
        formatLegalValue(alert.old_value),
        formatLegalValue(alert.new_value),
      ].join(' ').toLowerCase()
      return blob.includes(term)
    })
  }, [data.alerts, q, typeFilter, showTreated])

  const counts = useMemo(() => {
    const byType = {}
    for (const alert of data.alerts || []) {
      if (!showTreated && alert.acknowledged) continue
      byType[alert.alert_type] = (byType[alert.alert_type] || 0) + 1
    }
    return byType
  }, [data.alerts, showTreated])

  return (
    <div className="space-y-6 pb-16">
      <div className="glass-card overflow-hidden">
        <div className="bg-gradient-to-r from-rose-800 via-red-700 to-orange-600 px-6 py-5 relative">
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-black text-white">Alertes légales</h1>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/15 text-white/80 border border-white/10 uppercase tracking-wider">
                    Annuaire + BODACC
                  </span>
                </div>
                <p className="text-white/70 text-sm">
                  Changements d’adresse, de dirigeant, de statut et procédures collectives des adhérents.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="glass-btn-icon" title="Actualiser" disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {canRun && (
                <button
                  onClick={runWatch}
                  disabled={running}
                  className="px-3 py-2 rounded-xl bg-white text-rose-800 text-sm font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {running ? 'Vérification…' : 'Vérifier maintenant'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Non traitées</div>
          <div className="text-2xl font-black text-white mt-1">{data.unacknowledged || 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Procédures</div>
          <div className="text-2xl font-black text-white mt-1">{counts.COLLECTIVE_PROCEEDING || 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Adresses</div>
          <div className="text-2xl font-black text-white mt-1">{counts.ADDRESS_CHANGE || 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Dirigeants</div>
          <div className="text-2xl font-black text-white mt-1">{counts.DIRECTOR_CHANGE || 0}</div>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code Union, SIRET, nom…"
            className="w-full bg-white/10 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/35"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="" className="text-slate-900">Tous les types</option>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <option key={key} value={key} className="text-slate-900">{meta.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowTreated((v) => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
            showTreated
              ? 'bg-white text-slate-800 border-white'
              : 'bg-white/10 text-white/80 border-white/10'
          }`}
        >
          {showTreated ? 'Alertes traitées' : 'Non traitées'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/15 text-rose-100 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-white/60">
            <Loader2 className="w-5 h-5 animate-spin" /> Chargement des alertes…
          </div>
        )}
        {!loading && !alerts.length && (
          <div className="py-16 text-center text-white/60">
            {showTreated
              ? 'Aucune alerte traitée pour ce filtre.'
              : 'Aucune alerte légale en attente. Lancez une vérification pour scanner les adhérents.'}
          </div>
        )}
        {!loading && alerts.map((alert) => (
          <div key={alert.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-t border-white/10 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <TypeBadge type={alert.alert_type} />
                <span className="font-black text-white">{alert.code_union}</span>
                {alert.siret && <span className="text-xs text-white/45">{alert.siret}</span>}
                <span className="text-xs text-white/45">
                  {alert.detected_at ? new Date(alert.detected_at).toLocaleDateString('fr-FR') : ''}
                </span>
              </div>
              <div className="text-sm font-semibold text-white">{alert.title}</div>
              {alert.alert_type === 'COLLECTIVE_PROCEEDING' ? (
                <div className="text-sm text-white/70 mt-1">{formatLegalValue(alert.new_value)}</div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm text-white/70 mt-1">
                  <span>{formatLegalValue(alert.old_value)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  <b className="text-white">{formatLegalValue(alert.new_value)}</b>
                </div>
              )}
              {alert.source && (
                <div className="text-[11px] text-white/40 mt-1">Source : {alert.source}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {alert.source_url && (
                <a
                  href={alert.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-btn-icon"
                  title={`Voir sur ${alert.source}`}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {!alert.acknowledged && (
                <button
                  type="button"
                  onClick={() => acknowledge(alert.id)}
                  className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 text-sm font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Traité
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
