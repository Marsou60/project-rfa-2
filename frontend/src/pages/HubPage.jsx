import { useState, useEffect } from 'react'
import {
  BarChart3,
  Users,
  Sparkles,
  ArrowRight,
  TrendingUp,
  FileText,
  Settings,
  Calculator,
  Clock,
  CheckCircle2,
  Zap,
  Mail,
  CalendarDays,
  UserPlus,
  ChevronRight,
  Activity,
} from 'lucide-react'

export default function HubPage({ user, currentImportId, onNavigate }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const hour = time.getHours()
  const greeting =
    hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  const displayName = user?.displayName || user?.username || 'Martin'

  return (
    <div className="min-h-screen space-y-10 pb-16">
      {/* ── Hero greeting ── */}
      <div className="pt-2">
        <div className="flex items-end justify-between">
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
              Que souhaitez-vous faire aujourd&apos;hui ?
            </p>
          </div>
          {currentImportId && (
            <div className="hidden md:flex items-center gap-2 glass-card px-4 py-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-sm font-medium">Données chargées</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bots ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
          Vos collaborateurs IA
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Nicolas */}
          <BotCard
            name="Nicolas"
            role="Chiffres & RFA"
            description="Analyse les performances, calcule les RFA, compare les contrats et répond à vos questions en langage naturel."
            emoji="📊"
            gradient="from-blue-600 via-indigo-600 to-purple-700"
            glowColor="shadow-blue-500/30"
            badgeColor="bg-blue-500/20 text-blue-300"
            badge="Actif"
            actions={[
              {
                label: currentImportId ? 'Tableau de bord DAF' : 'Charger les données',
                icon: <BarChart3 className="w-4 h-4" />,
                onClick: () => onNavigate(currentImportId ? 'union-space' : 'upload'),
                primary: true,
              },
              {
                label: 'Union Intelligence',
                icon: <Sparkles className="w-4 h-4" />,
                onClick: () => onNavigate(currentImportId ? 'genie' : 'upload'),
                disabled: !currentImportId,
              },
              {
                label: 'Récap clients',
                icon: <Users className="w-4 h-4" />,
                onClick: () => onNavigate(currentImportId ? 'clients' : 'upload'),
                disabled: !currentImportId,
              },
            ]}
          />

          {/* Nathalie */}
          <BotCard
            name="Nathalie"
            role="Ouverture de comptes"
            description="Gère le processus d'ouverture de compte adhérent : formulaire guidé, vérification des pièces, notifications automatiques."
            emoji="🤝"
            gradient="from-emerald-600 via-teal-600 to-cyan-700"
            glowColor="shadow-emerald-500/30"
            badgeColor="bg-emerald-500/20 text-emerald-300"
            badge="Nouveau"
            actions={[
              {
                label: 'Créer un dossier',
                icon: <UserPlus className="w-4 h-4" />,
                onClick: () => onNavigate('nathalie'),
                primary: true,
              },
              {
                label: 'Dossiers en cours',
                icon: <Clock className="w-4 h-4" />,
                onClick: () => onNavigate('nathalie'),
              },
            ]}
          />

          {/* 3ème bot — à venir */}
          <BotCard
            name="Alex"
            role="Mail & Rendez-vous"
            description="Résume vos emails, prépare vos rendez-vous avec le contexte client, et gère votre agenda intelligent."
            emoji="📧"
            gradient="from-amber-600 via-orange-600 to-rose-700"
            glowColor="shadow-amber-500/30"
            badgeColor="bg-amber-500/20 text-amber-300"
            badge="Bientôt"
            comingSoon
            actions={[
              {
                label: 'Résumer mes mails',
                icon: <Mail className="w-4 h-4" />,
                onClick: () => {},
                disabled: true,
              },
              {
                label: 'Préparer un RDV',
                icon: <CalendarDays className="w-4 h-4" />,
                onClick: () => {},
                disabled: true,
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
          <QuickTile
            icon={<FileText className="w-5 h-5" />}
            label="Contrats"
            color="text-purple-400"
            onClick={() => onNavigate('contracts')}
          />
          <QuickTile
            icon={<TrendingUp className="w-5 h-5" />}
            label="Pure Data"
            color="text-teal-400"
            onClick={() => onNavigate('pure-data')}
          />
          <QuickTile
            icon={<Calculator className="w-5 h-5" />}
            label="Simulateur"
            color="text-amber-400"
            onClick={() => onNavigate('margin-simulator')}
          />
          <QuickTile
            icon={<Users className="w-5 h-5" />}
            label="Utilisateurs"
            color="text-blue-400"
            onClick={() => onNavigate('users')}
          />
          <QuickTile
            icon={<Settings className="w-5 h-5" />}
            label="Paramètres"
            color="text-slate-400"
            onClick={() => onNavigate('settings')}
          />
        </div>
      </div>

      {/* ── To-do (coming soon) ── */}
      <div className="glass-card p-6 opacity-60 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">To-do & Tâches</h3>
              <p className="text-xs text-blue-300/50">Bientôt disponible</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300">
            Prochainement
          </span>
        </div>
        <div className="flex gap-2">
          {['Contacter M. Dupont', 'Revoir contrat ACR', 'Préparer réunion RFA'].map((t) => (
            <div key={t} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <Zap className="w-3 h-3 text-violet-400/50" />
              <span className="text-xs text-white/40">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────── */
function BotCard({ name, role, description, emoji, gradient, glowColor, badgeColor, badge, actions, comingSoon }) {
  return (
    <div
      className={`glass-card flex flex-col overflow-hidden transition-all duration-300 ${
        comingSoon ? 'opacity-70' : 'hover:scale-[1.02] hover:shadow-2xl hover:' + glowColor
      }`}
    >
      {/* Header */}
      <div className={`bg-gradient-to-br ${gradient} p-5 relative overflow-hidden`}>
        <div className="absolute inset-0 bg-black/20" />
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
        {/* Decorative orb */}
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 blur-xl" />
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        <p className="text-blue-300/70 text-sm leading-relaxed">{description}</p>

        {/* Actions */}
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
