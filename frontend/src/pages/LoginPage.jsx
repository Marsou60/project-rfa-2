import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Lock, User, LogIn, Loader2, AlertCircle, TrendingUp, ShieldCheck, Sparkles } from 'lucide-react'

function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-background min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Halos décoratifs */}
      <div className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-indigo-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 w-[26rem] h-[26rem] rounded-full bg-violet-500/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 left-1/4 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & marque */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-600 shadow-2xl shadow-indigo-900/50 mb-5 ring-1 ring-white/20">
            <span className="text-white font-black text-2xl tracking-tight">GU</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">Groupement Union</h1>
          <p className="text-indigo-200/70 text-sm">Plateforme de pilotage RFA</p>
        </div>

        {/* Carte connexion */}
        <div className="glass-card p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">Connexion</h2>
            <p className="text-glass-secondary text-sm mt-1">Accédez à votre espace</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/15 border border-red-400/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-300" />
              </div>
              <span className="text-red-200 text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-indigo-100/80 mb-2">Nom d'utilisateur</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-indigo-300/60" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/60 transition-all"
                  placeholder="Identifiant"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-indigo-100/80 mb-2">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-indigo-300/60" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/60 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-600 to-violet-600 hover:from-blue-600 hover:via-indigo-700 hover:to-violet-700 text-white font-semibold shadow-lg shadow-indigo-900/40 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Connexion...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Se connecter</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Bandeau atouts */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: <TrendingUp className="w-4 h-4" />, label: 'RFA en temps réel' },
            { icon: <Sparkles className="w-4 h-4" />, label: 'Pilotage 2026' },
            { icon: <ShieldCheck className="w-4 h-4" />, label: 'Accès sécurisé' },
          ].map((f) => (
            <div key={f.label} className="glass-card-dark rounded-xl px-3 py-2.5 flex flex-col items-center gap-1 text-center">
              <span className="text-indigo-300">{f.icon}</span>
              <span className="text-[11px] text-indigo-100/70 leading-tight">{f.label}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-indigo-200/40 text-xs mt-8">
          Groupement Union © {new Date().getFullYear()} — Tous droits réservés
        </p>
      </div>
    </div>
  )
}

export default LoginPage
