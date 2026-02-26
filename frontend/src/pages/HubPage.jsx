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
  Activity,
  Briefcase,
  Database,
} from 'lucide-react'

export default function HubPage({ user, currentImportId, isCommercial = false, onNavigate }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const hour = time.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.displayName || user?.username || 'Martin'

  return (
    <div className="min-h-screen space-y-10 pb-16">

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
