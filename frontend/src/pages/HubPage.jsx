import { useState, useEffect } from 'react'
import {
  BarChart3,
  Users,
  Sparkles,
  TrendingUp,
  TrendingDown,
  FileText,
  Settings,
  Calculator,
  UserPlus,
  ChevronRight,
  Database,
  Euro,
  Activity,
  Target,
  Layers,
  Gift,
} from 'lucide-react'
import { getUnionEntity, getPureDataMonthlyEvolution, getSetting } from '../api/client'
import { CA_OBJECTIF_2026_KEY, CA_OBJECTIF_2026_DEFAULT, CA_2025_REALISE_KEY, CA_2025_REALISE_DEFAULT } from './SettingsPage'

/* ── Compteur animé ── */
function useAnimatedCounter(target, duration = 1600) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) { setValue(0); return }
    let raf
    const start = performance.now()
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

const fmtEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const fmtCompact = (v) => {
  const n = Number(v || 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`
  return `${sign}${Math.round(abs).toLocaleString('fr-FR')} €`
}
const MONTHS = ['', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function HubPage({ user, currentImportId, isCommercial = false, onNavigate }) {
  const [time, setTime] = useState(new Date())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getSetting(CA_OBJECTIF_2026_KEY).catch(() => null),
      getSetting(CA_2025_REALISE_KEY).catch(() => null),
      getPureDataMonthlyEvolution({ yearCurrent: 2026, yearPrevious: 2025 }).catch(() => null),
      currentImportId ? getUnionEntity(currentImportId).catch(() => null) : Promise.resolve(null),
    ]).then(([objRes, ca25Res, evo, union]) => {
      if (!alive) return
      const objectif = Number(objRes?.value) || CA_OBJECTIF_2026_DEFAULT
      const ca2025Realise = Number(ca25Res?.value) || CA_2025_REALISE_DEFAULT
      const months = evo?.months || []
      const ca2026 = months.reduce((s, m) => s + (m.current || 0), 0)
      // Comparaison MÊME PÉRIODE (2026 YTD vs 2025 sur les mêmes mois)
      const ca2025SamePeriod = months.reduce((s, m) => s + (m.previous || 0), 0)
      const delta = ca2026 - ca2025SamePeriod
      const deltaPct = ca2025SamePeriod > 0 ? (delta / ca2025SamePeriod) * 100 : null
      const topClients = [...(evo?.clients || [])].sort((a, b) => (b.delta || 0) - (a.delta || 0)).slice(0, 3)
      setData({
        objectif,
        ca2026,
        ca2025Realise,
        ca2025SamePeriod,
        delta,
        deltaPct,
        months,
        nbClients: (evo?.clients || []).length,
        nbGroups: (evo?.groups || []).length,
        rfaTotal: union?.rfa?.totals?.grand_total || 0,
        caGlobal: union?.ca?.totals?.global_total || 0,
        topClients,
        hasMonthly: months.length > 0,
      })
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [currentImportId])

  const hour = time.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.displayName || user?.username || ''

  const objectif = data?.objectif || CA_OBJECTIF_2026_DEFAULT
  const ca2026 = data?.ca2026 || 0
  const pct = objectif > 0 ? Math.min((ca2026 / objectif) * 100, 100) : 0
  const reste = Math.max(objectif - ca2026, 0)
  const animatedCa = useAnimatedCounter(ca2026)

  return (
    <div className="space-y-8">
      {/* ── En-tête ── */}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-glass-muted text-sm font-medium mb-1 capitalize">
            {time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-3xl font-black text-white">
            {greeting}{displayName ? ', ' : ''}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-violet-300">{displayName}</span>
          </h1>
          <p className="text-glass-secondary mt-1">Tableau de bord — pilotage RFA & performance 2026</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
          data?.hasMonthly ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-amber-500/10 border-amber-400/30'
        }`}>
          <Activity className={`w-4 h-4 ${data?.hasMonthly ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className={`text-sm font-medium ${data?.hasMonthly ? 'text-emerald-200' : 'text-amber-200'}`}>
            {data?.hasMonthly ? 'Données mensuelles à jour' : 'Pure Data mensuel à importer'}
          </span>
        </div>
      </header>

      {/* ── HERO : Objectif CA 2026 ── */}
      <section className="glass-card overflow-hidden">
        <div className="relative p-6 md:p-8">
          <div className="pointer-events-none absolute -top-16 -right-10 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-center">
            {/* Jauge radiale */}
            <div className="flex items-center justify-center">
              <RadialGauge percent={pct} />
            </div>

            {/* Détails objectif */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">Objectif Direction 2026</span>
              </div>
              <p className="text-glass-secondary text-sm mb-1">Chiffre d'affaires cumulé 2026</p>
              <div className="flex items-end gap-3 flex-wrap">
                <span className="text-4xl md:text-5xl font-black text-white tabular-nums">{fmtEur(loading ? ca2026 : animatedCa)}</span>
                <span className="text-glass-muted text-lg mb-1">/ {fmtCompact(objectif)}</span>
              </div>

              {/* Barre de progression */}
              <div className="mt-5">
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-emerald-300 font-bold">{pct.toFixed(1)} % de l'objectif</span>
                  <span className="text-glass-muted">Reste <strong className="text-white">{fmtCompact(reste)}</strong></span>
                </div>
              </div>

              {/* Comparatif même période N-1 */}
              {data?.hasMonthly && (
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-glass-muted text-sm">vs 2025 (même période) :</span>
                    <span className={`inline-flex items-center gap-1 text-sm font-bold ${data.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {data.delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {data.delta >= 0 ? '+' : ''}{fmtCompact(data.delta)}
                      {data.deltaPct != null && <span className="opacity-80">({data.deltaPct >= 0 ? '+' : ''}{data.deltaPct.toFixed(1)} %)</span>}
                    </span>
                  </div>
                  <span className="text-glass-muted text-sm">CA 2025 réalisé : <strong className="text-white/80">{fmtCompact(data.ca2025Realise)}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Mini évolution mensuelle */}
          {data?.hasMonthly && data.months.length > 0 && (
            <div className="relative mt-7 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-glass-muted">Évolution mensuelle 2026 vs 2025</span>
                <button onClick={() => onNavigate('pure-data-monthly')} className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1">
                  Détail <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <MiniMonthlyBars months={data.months} />
            </div>
          )}
        </div>
      </section>

      {/* ── Indicateurs ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Adhérents actifs"
          value={(data?.nbClients || 0).toLocaleString('fr-FR')}
          accent="from-violet-500 to-purple-600"
        />
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label="Groupes"
          value={(data?.nbGroups || 0).toLocaleString('fr-FR')}
          accent="from-blue-500 to-indigo-600"
        />
        <StatCard
          icon={<Euro className="w-5 h-5" />}
          label="CA 2025 réalisé"
          value={fmtCompact(data?.ca2025Realise || 0)}
          accent="from-cyan-500 to-teal-600"
        />
        <StatCard
          icon={<Gift className="w-5 h-5" />}
          label="RFA totale"
          value={fmtCompact(data?.rfaTotal || 0)}
          accent="from-emerald-500 to-green-600"
          hint={!currentImportId ? 'Feuille RFA non connectée' : null}
        />
      </section>

      {/* ── Alerte données manquantes ── */}
      {!currentImportId && (
        <div className="glass-card p-5 flex items-center gap-4 border border-amber-400/30">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Database className="w-6 h-6 text-amber-300" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold">Feuille RFA non connectée</p>
            <p className="text-glass-secondary text-sm">Connectez la feuille Google Sheets pour activer les RFA et le récap.</p>
          </div>
          <button onClick={() => onNavigate('upload')} className="glass-btn-primary">Connecter</button>
        </div>
      )}

      {/* ── Top adhérents en progression ── */}
      {data?.topClients?.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-glass-muted mb-4">Top progressions 2026</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.topClients.map((c, i) => (
              <div key={c.code_union || i} className="glass-card-dark rounded-xl p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-white text-sm ${['bg-amber-500','bg-slate-400','bg-orange-700'][i] || 'bg-slate-500'}`}>
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold truncate">{c.code_union}</p>
                  <p className="text-glass-muted text-xs truncate">{c.raison_sociale || ''}</p>
                </div>
                <span className={`text-sm font-bold ${(c.delta || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {(c.delta || 0) >= 0 ? '+' : ''}{fmtCompact(c.delta)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Modules ── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-glass-muted mb-4">Vos espaces de travail</h2>
        <div className={`grid gap-5 ${isCommercial ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          <ModuleCard
            title="Espace Client"
            subtitle="Données & Intelligence"
            description="Consultez les RFA par client, analysez les tendances avec l'IA."
            icon={<BarChart3 className="w-7 h-7" />}
            gradient="from-blue-500 to-cyan-500"
            actions={[
              { label: 'Clients', onClick: () => onNavigate(currentImportId ? 'client-space' : 'upload'), primary: true },
              { label: 'Intelligence', onClick: () => onNavigate(currentImportId ? 'genie' : 'upload'), icon: <Sparkles className="w-3.5 h-3.5" /> },
              { label: 'Pure Data', onClick: () => onNavigate('pure-data') },
            ]}
          />
          {!isCommercial && (
            <ModuleCard
              title="Pilotage DAF"
              subtitle="Finance & Performance"
              description="Tableau de bord financier, récapitulatif et simulateur de marge."
              icon={<TrendingUp className="w-7 h-7" />}
              gradient="from-amber-500 to-orange-500"
              actions={[
                { label: 'Dashboard', onClick: () => onNavigate(currentImportId ? 'paul' : 'upload'), primary: true },
                { label: 'Adhérents', onClick: () => onNavigate(currentImportId ? 'clients' : 'upload') },
                { label: 'Récap', onClick: () => onNavigate(currentImportId ? 'recap' : 'upload') },
              ]}
            />
          )}
          <ModuleCard
            title="Gestion Comptes"
            subtitle="Ouverture & Suivi"
            description="Créez et suivez les dossiers d'ouverture de compte adhérent."
            icon={<UserPlus className="w-7 h-7" />}
            gradient="from-emerald-500 to-teal-500"
            actions={[
              { label: 'Nouveau dossier', onClick: () => onNavigate('nathalie'), primary: true },
              { label: 'En cours', onClick: () => onNavigate('nathalie') },
            ]}
          />
        </div>
      </section>

      {/* ── Accès rapide ── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-glass-muted mb-4">Accès rapide</h2>
        <div className="flex flex-wrap gap-3">
          <QuickLink icon={<TrendingUp className="w-4 h-4" />} label="Pure Data" onClick={() => onNavigate('pure-data')} />
          {!isCommercial && (
            <>
              <QuickLink icon={<FileText className="w-4 h-4" />} label="Contrats" onClick={() => onNavigate('contracts')} />
              <QuickLink icon={<Calculator className="w-4 h-4" />} label="Simulateur" onClick={() => onNavigate('margin-simulator')} />
              <QuickLink icon={<Users className="w-4 h-4" />} label="Utilisateurs" onClick={() => onNavigate('users')} />
              <QuickLink icon={<Settings className="w-4 h-4" />} label="Paramètres" onClick={() => onNavigate('settings')} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/* ── Jauge radiale SVG ── */
function RadialGauge({ percent }) {
  const size = 200
  const stroke = 16
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const p = Math.max(0, Math.min(percent || 0, 100))
  const dash = (p / 100) * C
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white tabular-nums">{p.toFixed(0)}<span className="text-xl text-glass-muted">%</span></span>
        <span className="text-[11px] uppercase tracking-widest text-glass-muted mt-1">objectif</span>
      </div>
    </div>
  )
}

/* ── Mini barres mensuelles ── */
function MiniMonthlyBars({ months }) {
  const max = months.reduce((m, x) => Math.max(m, x.current || 0, x.previous || 0), 0) || 1
  const H = 60
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {months.map((m) => {
        const hC = Math.max(((m.current || 0) / max) * H, 2)
        const hP = Math.max(((m.previous || 0) / max) * H, 2)
        return (
          <div key={m.month} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 34 }}>
            <div className="flex items-end gap-0.5" style={{ height: H }}>
              <div title={fmtEur(m.previous)} style={{ height: hP, width: 8 }} className="rounded-t bg-white/20" />
              <div title={fmtEur(m.current)} style={{ height: hC, width: 8 }} className="rounded-t bg-gradient-to-t from-emerald-500 to-teal-400" />
            </div>
            <span className="text-[10px] text-glass-muted">{MONTHS[m.month]}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Carte stat ── */
function StatCard({ icon, label, value, accent, hint }) {
  return (
    <div className="glass-card p-5 relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center text-white shadow-lg mb-3`}>
          {icon}
        </div>
        <p className="text-glass-muted text-xs font-medium">{label}</p>
        <p className="text-2xl font-black text-white mt-0.5 tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-amber-300/80 mt-1">{hint}</p>}
      </div>
    </div>
  )
}

/* ── Carte module ── */
function ModuleCard({ title, subtitle, description, icon, gradient, actions }) {
  return (
    <div className="glass-card-hover overflow-hidden flex flex-col">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-glass-muted">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-glass-secondary mt-3 leading-relaxed">{description}</p>
      </div>
      <div className="p-4 flex flex-wrap gap-2 mt-auto">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              action.primary
                ? `bg-gradient-to-r ${gradient} text-white shadow-md hover:shadow-lg hover:-translate-y-0.5`
                : 'bg-white/5 border border-white/15 text-glass-secondary hover:bg-white/10 hover:text-white'
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Lien rapide ── */
function QuickLink({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm font-medium text-glass-secondary hover:bg-white/10 hover:text-white transition-all"
    >
      <span className="text-glass-muted group-hover:text-white transition-colors">{icon}</span>
      {label}
      <ChevronRight className="w-4 h-4 text-glass-muted group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}
