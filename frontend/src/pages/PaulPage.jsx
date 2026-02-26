import { useState } from 'react'
import {
  BarChart3,
  Calculator,
  Briefcase,
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
  RefreshCw,
  Save,
  CheckCircle2,
} from 'lucide-react'

const SECTIONS = [
  {
    id: 'union-space',
    label: 'Tableau de bord DAF',
    icon: <Briefcase className="w-4 h-4" />,
    emoji: '📋',
    description: 'Vue consolidée des plateformes ACR, DCA, EXADIS, ALLIANCE avec RFA détaillées par adhérent.',
    color: 'from-yellow-500 to-amber-600',
    glow: 'hover:shadow-amber-500/30',
    needsImport: true,
  },
  {
    id: 'recap',
    label: 'Récap général',
    icon: <BarChart3 className="w-4 h-4" />,
    emoji: '📊',
    description: 'Récapitulatif global de toutes les RFA par adhérent, plateforme et contrat.',
    color: 'from-blue-500 to-indigo-600',
    glow: 'hover:shadow-blue-500/30',
    needsImport: true,
  },
  {
    id: 'clients',
    label: 'Liste adhérents',
    icon: <TrendingUp className="w-4 h-4" />,
    emoji: '👥',
    description: 'Liste complète des adhérents avec CA, RFA totale, contrat appliqué et analyse marge par plateforme.',
    color: 'from-orange-500 to-rose-600',
    glow: 'hover:shadow-orange-500/30',
    needsImport: true,
  },
  {
    id: 'margin-simulator',
    label: 'Simulateur de marge',
    icon: <Calculator className="w-4 h-4" />,
    emoji: '🧮',
    description: 'Simulez les marges et RFA en ajustant les paramètres de chaque scénario.',
    color: 'from-violet-500 to-purple-600',
    glow: 'hover:shadow-violet-500/30',
    needsImport: false,
  },
]

// Clé localStorage partagée avec EntityDetailDrawer
const LS_KEY = 'gu_supplier_rates'

const PLATFORM_META = {
  GLOBAL_ACR:      { label: 'ACR',      emoji: '🔵', defaultRate: 18 },
  GLOBAL_DCA:      { label: 'DCA',      emoji: '🟣', defaultRate: 16 },
  GLOBAL_ALLIANCE: { label: 'ALLIANCE', emoji: '🟡', defaultRate: 14 },
  GLOBAL_EXADIS:   { label: 'EXADIS',  emoji: '🟢', defaultRate: 13 },
}

function loadRates() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return Object.fromEntries(
    Object.entries(PLATFORM_META).map(([k, v]) => [k, v.defaultRate])
  )
}

export default function PaulPage({ importId, onNavigate }) {
  const [rates, setRates] = useState(loadRates)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(rates))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    const defaults = Object.fromEntries(
      Object.entries(PLATFORM_META).map(([k, v]) => [k, v.defaultRate])
    )
    setRates(defaults)
    localStorage.setItem(LS_KEY, JSON.stringify(defaults))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-8 pb-16">

      {/* ── Header agent ── */}
      <div className="glass-card overflow-hidden">
        <div className="bg-gradient-to-r from-yellow-600 via-amber-600 to-orange-700 px-6 py-5 relative">
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-4xl shadow-inner">
              💼
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-white">Paul</h1>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-200 border border-white/10">
                  Pilotage financier
                </span>
              </div>
              <p className="text-white/70 text-sm">
                RFA, récap général, simulateur de marge — tout le pilotage DAF au même endroit
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerte si pas de données ── */}
      {!importId && (
        <div className="glass-card px-5 py-4 border border-amber-500/30 bg-amber-500/10 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-amber-300 flex-shrink-0" />
          <p className="text-amber-200 text-sm">
            Le tableau de bord DAF et le récap nécessitent des données RFA.{' '}
            <button
              onClick={() => onNavigate('upload')}
              className="font-semibold underline underline-offset-2 hover:text-white transition"
            >
              Connecter la feuille RFA →
            </button>
          </p>
        </div>
      )}

      {/* ── Cartes espaces ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
          Espaces de travail
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SECTIONS.map((s) => {
            const locked = s.needsImport && !importId
            return (
              <button
                key={s.id}
                onClick={() => !locked && onNavigate(s.id)}
                disabled={locked}
                className={`glass-card text-left flex flex-col overflow-hidden transition-all duration-300 group ${
                  locked
                    ? 'opacity-50 cursor-not-allowed'
                    : `hover:scale-[1.02] hover:shadow-2xl ${s.glow}`
                }`}
              >
                <div className={`bg-gradient-to-br ${s.color} p-5 relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/5 blur-xl" />
                  <div className="relative flex items-start justify-between">
                    <span className="text-3xl">{s.emoji}</span>
                    {!locked && (
                      <ArrowUpRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    )}
                  </div>
                  <div className="relative mt-3">
                    <h3 className="text-lg font-black text-white leading-tight">{s.label}</h3>
                  </div>
                </div>
                <div className="p-5 flex flex-col flex-1 gap-4">
                  <p className="text-blue-300/70 text-sm leading-relaxed">{s.description}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
                      locked
                        ? 'bg-white/5 text-white/30'
                        : `bg-gradient-to-r ${s.color} text-white shadow-lg`
                    }`}>
                      {s.icon}
                      {locked ? 'Données requises' : 'Ouvrir'}
                    </span>
                    {!locked && (
                      <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/70 transition" />
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Taux fournisseurs entrants ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
          Taux fournisseurs entrants (contrats GU ↔ Fournisseurs)
        </h2>
        <div className="glass-card p-5 space-y-5">
          <p className="text-white/50 text-sm">
            Ces taux représentent ce que les fournisseurs reversent à Groupement Union.
            Ils servent au calcul de la <strong className="text-white/80">marge GU</strong> dans les fiches adhérents.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(PLATFORM_META).map(([key, meta]) => (
              <div key={key} className="glass-card-dark rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta.emoji}</span>
                  <span className="text-white font-bold text-sm">{meta.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    inputMode="decimal"
                    value={rates[key] ?? meta.defaultRate}
                    onChange={(e) => {
                      setSaved(false)
                      setRates(r => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))
                    }}
                    className="flex-1 glass-input text-center font-bold text-lg py-2"
                  />
                  <span className="text-white/60 text-sm font-semibold">%</span>
                </div>
                <p className="text-white/30 text-[10px]">
                  Défaut : {meta.defaultRate} %
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-white/10">
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-gray-900'
              }`}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Enregistré — actif sur toutes les fiches
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer les taux
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="text-white/40 hover:text-white/70 text-xs underline underline-offset-2 transition"
            >
              Remettre les valeurs par défaut
            </button>
          </div>
        </div>
      </div>

      {/* ── Accès rapides (si données) ── */}
      {importId && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
            Accès rapides
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Briefcase className="w-5 h-5" />, label: 'Tableau DAF',  color: 'text-amber-400',  id: 'union-space' },
              { icon: <BarChart3  className="w-5 h-5" />, label: 'Récap',        color: 'text-blue-400',   id: 'recap' },
              { icon: <Calculator className="w-5 h-5" />, label: 'Simulateur',  color: 'text-violet-400', id: 'margin-simulator' },
              { icon: <TrendingUp className="w-5 h-5" />, label: 'Performances', color: 'text-emerald-400',id: 'union-space' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => onNavigate(item.id)}
                className="glass-card p-4 flex flex-col items-center gap-2 hover:scale-105 hover:bg-white/10 transition-all duration-200 group"
              >
                <div className={`${item.color} group-hover:scale-110 transition-transform duration-200`}>
                  {item.icon}
                </div>
                <span className="text-white/70 text-xs font-medium group-hover:text-white transition-colors">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
