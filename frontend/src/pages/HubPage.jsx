import { useState, useEffect, useRef, useCallback } from 'react'
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
  Activity,
  Briefcase,
  Database,
  Euro,
  Target,
} from 'lucide-react'
import { getUnionEntity, getRfaSheetsKpis } from '../api/client'

/* ── Compteur animé (ease-out cubique) ──────────────────────── */
function useAnimatedCounter(target, duration = 1800, delay = 0) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) return
    let raf
    const timeout = setTimeout(() => {
      const start = performance.now()
      const animate = (now) => {
        const elapsed = now - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setValue(Math.round(target * eased))
        if (progress < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, delay)
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf) }
  }, [target, duration, delay])
  return value
}

/* ── Carte KPI 3D (tilt au survol) ─────────────────────────── */
function KpiCard3D({ label, value, icon, color, prefix = '', suffix = '', delay = 0, decimals = 0 }) {
  const ref = useRef(null)
  const animated = useAnimatedCounter(value, 1800, delay)

  const handleMouseMove = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(700px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) scale(1.06) translateZ(10px)`
    el.style.boxShadow = `${-x * 20}px ${y * 20}px 40px rgba(0,0,0,0.4), 0 0 30px ${color}40`
  }, [color])

  const handleMouseLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(700px) rotateY(0deg) rotateX(0deg) scale(1) translateZ(0)'
    el.style.boxShadow = ''
  }, [])

  const displayValue = decimals > 0
    ? animated.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : animated.toLocaleString('fr-FR')

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
        animation: `kpiEntrance 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms both`,
      }}
      className="relative rounded-2xl overflow-hidden cursor-default select-none"
    >
      {/* Fond glassmorphism */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl" />
      {/* Reflet lumineux */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-2xl" />
      {/* Halo coloré */}
      <div className="absolute -inset-1 rounded-2xl blur-xl opacity-30" style={{ background: color }} />

      <div className="relative p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-xs font-bold uppercase tracking-widest">{label}</span>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}30` }}>
            <span style={{ color }}>{icon}</span>
          </div>
        </div>
        <div className="text-3xl font-black text-white leading-none tracking-tight">
          {prefix}{displayValue}{suffix}
        </div>
      </div>
    </div>
  )
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
      getRfaSheetsKpis(currentImportId).catch(() => null),
    ]).then(([union, kpiData]) => {
      const caTotal    = union?.ca?.totals?.global_total || kpiData?.ca_total || 0
      const rfaTotal   = union?.rfa?.totals?.grand_total || 0
      const nbClients  = kpiData?.nb_clients || 0
      const tauxEffectif = caTotal > 0 ? (rfaTotal / caTotal) * 100 : 0
      setKpis({ caTotal, rfaTotal, nbClients, tauxEffectif })
    })
  }, [currentImportId])

  const hour = time.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.displayName || user?.username || 'Martin'

  return (
    <div className="min-h-screen space-y-10 pb-16">
      <style>{`
        @keyframes kpiEntrance {
          from { opacity: 0; transform: perspective(700px) translateZ(-80px) scale(0.85); }
          to   { opacity: 1; transform: perspective(700px) translateZ(0) scale(1); }
        }
      `}</style>

      {/* ── Hero greeting ── */}
      <div className="pt-2">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-blue-300/70 text-sm font-medium uppercase tracking-widest mb-1">
              {time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="text-4xl font-black text-white leading-tight">
              {greeting},{' '}
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                {displayName}
              </span>{' '}
              👋
            </h1>
            <p className="text-blue-300/60 mt-2 text-base">
              Qui souhaitez-vous consulter aujourd&apos;hui ?
            </p>
          </div>
          {currentImportId && (
            <div className="hidden md:flex items-center gap-2 glass-card px-4 py-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-sm font-medium">Données RFA chargées</span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPIs 3D animés ── */}
      {currentImportId && kpis && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
            Chiffres clés — Groupement Union
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard3D
              label="CA Total"
              value={kpis.caTotal}
              suffix=" €"
              icon={<TrendingUp className="w-4 h-4" />}
              color="#3b82f6"
              delay={0}
            />
            <KpiCard3D
              label="RFA Totale"
              value={kpis.rfaTotal}
              suffix=" €"
              icon={<Euro className="w-4 h-4" />}
              color="#10b981"
              delay={150}
            />
            <KpiCard3D
              label="Adhérents"
              value={kpis.nbClients}
              icon={<Users className="w-4 h-4" />}
              color="#8b5cf6"
              delay={300}
            />
            <KpiCard3D
              label="Taux effectif"
              value={kpis.tauxEffectif}
              suffix=" %"
              decimals={2}
              icon={<Target className="w-4 h-4" />}
              color="#f59e0b"
              delay={450}
            />
          </div>
        </div>
      )}

      {/* ── Les 3 agents ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-5">
          Vos collaborateurs IA
        </h2>
        <div className={`grid grid-cols-1 gap-5 ${isCommercial ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>

          {/* ── Nicolas ── */}
          <AgentCard
            name="Nicolas"
            role="Pure Data & Adhérents"
            description="Analyse les chiffres clients, calcule les RFA, interroge Union Intelligence et pilote la liste des adhérents."
            emoji="📊"
            gradient="from-blue-600 via-indigo-600 to-purple-700"
            glowColor="hover:shadow-blue-500/30"
            badge="Données"
            badgeColor="bg-blue-500/20 text-blue-300"
            actions={[
              {
                label: 'Espace client',
                icon: <Users className="w-4 h-4" />,
                onClick: () => onNavigate(currentImportId ? 'client-space' : 'upload'),
                primary: true,
                disabled: !currentImportId,
              },
              {
                label: 'Union Intelligence',
                icon: <Sparkles className="w-4 h-4" />,
                onClick: () => onNavigate(currentImportId ? 'genie' : 'upload'),
                disabled: !currentImportId,
              },
              {
                label: 'Pure Data',
                icon: <BarChart3 className="w-4 h-4" />,
                onClick: () => onNavigate('pure-data'),
              },
            ]}
          />

          {/* ── Paul (admin uniquement) ── */}
          {!isCommercial && (
            <AgentCard
              name="Paul"
              role="Pilotage financier DAF"
              description="Tableau de bord DAF, récapitulatif général des RFA et simulateur de marge pour optimiser la performance."
              emoji="💼"
              gradient="from-yellow-500 via-amber-600 to-orange-600"
              glowColor="hover:shadow-amber-500/30"
              badge="DAF"
              badgeColor="bg-amber-500/20 text-amber-300"
              actions={[
                {
                  label: 'Tableau de bord DAF',
                  icon: <Briefcase className="w-4 h-4" />,
                  onClick: () => onNavigate(currentImportId ? 'paul' : 'upload'),
                  primary: true,
                },
                {
                  label: 'Liste adhérents',
                  icon: <BarChart3 className="w-4 h-4" />,
                  onClick: () => onNavigate(currentImportId ? 'clients' : 'upload'),
                  disabled: !currentImportId,
                },
                {
                  label: 'Récap général',
                  icon: <Calculator className="w-4 h-4" />,
                  onClick: () => onNavigate(currentImportId ? 'recap' : 'upload'),
                  disabled: !currentImportId,
                },
              ]}
            />
          )}

          {/* ── Nathalie ── */}
          <AgentCard
            name="Nathalie"
            role="Ouverture de comptes"
            description="Gère le processus d'ouverture de compte adhérent : formulaire guidé, pièces justificatives, notifications automatiques."
            emoji="🤝"
            gradient="from-emerald-600 via-teal-600 to-cyan-700"
            glowColor="hover:shadow-emerald-500/30"
            badge="Comptes"
            badgeColor="bg-emerald-500/20 text-emerald-300"
            actions={[
              {
                label: 'Créer un dossier',
                icon: <UserPlus className="w-4 h-4" />,
                onClick: () => onNavigate('nathalie'),
                primary: true,
              },
              {
                label: 'Dossiers en cours',
                icon: <FileText className="w-4 h-4" />,
                onClick: () => onNavigate('nathalie'),
              },
            ]}
          />
        </div>
      </div>

      {/* ── Accès rapide ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
          Accès rapide
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Tuiles communes */}
          <QuickTile icon={<TrendingUp className="w-5 h-5" />} label="Pure Data"  color="text-teal-400"  onClick={() => onNavigate('pure-data')} />
          {/* Tuiles admin uniquement */}
          {!isCommercial && <>
            <QuickTile icon={<FileText   className="w-5 h-5" />} label="Contrats"     color="text-purple-400" onClick={() => onNavigate('contracts')} />
            <QuickTile icon={<Calculator className="w-5 h-5" />} label="Simulateur"   color="text-amber-400"  onClick={() => onNavigate('margin-simulator')} />
            <QuickTile icon={<Users      className="w-5 h-5" />} label="Utilisateurs" color="text-blue-400"   onClick={() => onNavigate('users')} />
            <QuickTile icon={<Settings   className="w-5 h-5" />} label="Paramètres"   color="text-slate-400"  onClick={() => onNavigate('settings')} />
          </>}
        </div>
      </div>

      {/* ── Statut données ── */}
      {!currentImportId && (
        <div className="glass-card p-6 border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-sm">Aucune donnée RFA chargée</h3>
              <p className="text-xs text-white/50 mt-0.5">
                Connectez la feuille Google Sheets pour activer Nicolas, Paul et Union Intelligence.
              </p>
            </div>
            <button
              onClick={() => onNavigate('upload')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-sm transition-all"
            >
              Connecter
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Agent Card ─────────────────────────────────────────────── */
function AgentCard({ name, role, description, emoji, gradient, glowColor, badge, badgeColor, actions }) {
  return (
    <div className={`glass-card flex flex-col overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${glowColor}`}>
      {/* Header */}
      <div className={`bg-gradient-to-br ${gradient} p-5 relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 blur-xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <span className="text-4xl">{emoji}</span>
            <div className="mt-3">
              <h3 className="text-xl font-black text-white">{name}</h3>
              <p className="text-white/70 text-sm font-medium">{role}</p>
            </div>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor} border border-white/10`}>
            {badge}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        <p className="text-blue-300/70 text-sm leading-relaxed">{description}</p>
        <div className="flex flex-col gap-2 mt-auto">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                action.primary
                  ? `bg-gradient-to-r ${gradient} text-white shadow-lg hover:opacity-90 hover:shadow-xl`
                  : action.disabled
                  ? 'bg-white/5 text-white/25 cursor-not-allowed'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <span className="flex items-center gap-2">
                {action.icon}
                {action.label}
              </span>
              {!action.disabled && <ChevronRight className="w-4 h-4 opacity-60" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Quick Tile ─────────────────────────────────────────────── */
function QuickTile({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="glass-card p-4 flex flex-col items-center gap-2 hover:scale-105 hover:bg-white/10 transition-all duration-200 group"
    >
      <div className={`${color} group-hover:scale-110 transition-transform duration-200`}>
        {icon}
      </div>
      <span className="text-white/70 text-xs font-medium group-hover:text-white transition-colors">
        {label}
      </span>
    </button>
  )
}
