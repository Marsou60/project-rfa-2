import { useState, useEffect } from 'react'
import {
  BarChart3,
  Users,
  Sparkles,
  TrendingUp,
  FileText,
  Settings,
  Calculator,
  UserPlus,
  ChevronRight,
  Database,
  Euro,
  Activity,
} from 'lucide-react'
import { getUnionEntity, getEntities } from '../api/client'

/* ── Compteur animé ───────────────────────────────────────────── */
function useAnimatedCounter(target, duration = 2000) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) return
    let raf
    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export default function HubPage({ user, currentImportId, isCommercial = false, onNavigate }) {
  const [time, setTime] = useState(new Date())
  const [kpis, setKpis] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!currentImportId) return
    Promise.all([
      getUnionEntity(currentImportId).catch(() => null),
      getEntities(currentImportId, 'client').catch(() => []),
    ]).then(([union, clients]) => {
      const caTotal = union?.ca?.totals?.global_total || 0
      const nbClients = Array.isArray(clients) ? clients.length : 0
      setKpis({ caTotal, nbClients })
    })
  }, [currentImportId])

  const hour = time.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.displayName || user?.username || 'Martin'

  return (
    <div className="fixed inset-0 top-16 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 overflow-auto z-20">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <header className="mb-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1">
                {time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="text-3xl font-bold text-slate-800">
                {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{displayName}</span>
              </h1>
              <p className="text-slate-500 mt-1">
                Bienvenue sur votre espace de gestion RFA
              </p>
            </div>
            {currentImportId && (
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-700 text-sm font-medium">Données synchronisées</span>
              </div>
            )}
          </div>
        </header>

        {/* ── Alerte données manquantes ── */}
        {!currentImportId && (
          <div className="mb-8 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Database className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-slate-800 font-semibold">Aucune donnée RFA chargée</p>
              <p className="text-slate-500 text-sm">Connectez la feuille Google Sheets pour commencer l'analyse.</p>
            </div>
            <button
              onClick={() => onNavigate('upload')}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:-translate-y-0.5"
            >
              Connecter
            </button>
          </div>
        )}

        {/* ── KPIs ── */}
        {currentImportId && kpis && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
            <KpiCard
              label="CA Groupement Union"
              sublabel="Objectif 2025"
              value={kpis.caTotal}
              suffix=" €"
              icon={<Euro className="w-6 h-6" />}
              gradient="from-blue-500 to-indigo-600"
              bgGradient="from-blue-50 to-indigo-50"
            />
            <KpiCard
              label="Adhérents actifs"
              sublabel="Réseau national"
              value={kpis.nbClients}
              icon={<Users className="w-6 h-6" />}
              gradient="from-violet-500 to-purple-600"
              bgGradient="from-violet-50 to-purple-50"
            />
          </div>
        )}

        {/* ── Modules principaux ── */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-5">
            Vos espaces de travail
          </h2>
          <div className={`grid gap-5 ${isCommercial ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>

            {/* Nicolas - Données */}
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

            {/* Paul - DAF */}
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

            {/* Nathalie - Comptes */}
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Accès rapide
          </h2>
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
    </div>
  )
}

/* ── KPI Card ─────────────────────────────────────────────────── */
function KpiCard({ label, sublabel, value, suffix = '', icon, gradient, bgGradient }) {
  const animated = useAnimatedCounter(value)

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgGradient} border border-white/60 p-6 shadow-lg shadow-slate-200/50`}>
      {/* Decorative circle */}
      <div className={`absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br ${gradient} opacity-10 rounded-full blur-2xl`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-slate-500 text-sm font-medium">{label}</p>
            {sublabel && <p className="text-slate-400 text-xs">{sublabel}</p>}
          </div>
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}>
            {icon}
          </div>
        </div>
        <p className="text-4xl font-bold text-slate-800 tabular-nums">
          {animated.toLocaleString('fr-FR')}<span className="text-2xl text-slate-400 ml-1">{suffix}</span>
        </p>
      </div>
    </div>
  )
}

/* ── Module Card ──────────────────────────────────────────────── */
function ModuleCard({ title, subtitle, description, icon, gradient, actions }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-lg shadow-slate-200/50 overflow-hidden hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 flex flex-col">
      {/* Header with gradient accent */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-400">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">{description}</p>
      </div>

      {/* Actions */}
      <div className="p-4 bg-slate-50/50 flex flex-wrap gap-2 mt-auto">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              action.primary
                ? `bg-gradient-to-r ${gradient} text-white shadow-md hover:shadow-lg hover:-translate-y-0.5`
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
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

/* ── Quick Link ───────────────────────────────────────────────── */
function QuickLink({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all shadow-sm hover:shadow"
    >
      <span className="text-slate-400 group-hover:text-slate-500 transition-colors">{icon}</span>
      {label}
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}
