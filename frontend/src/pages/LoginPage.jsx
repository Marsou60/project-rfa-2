import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Lock, User, LogIn, Loader2 } from 'lucide-react'

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
    <div className="glass-background relative overflow-hidden">
      {/* Particules flottantes décoratives */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-float" />
        <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-1/4 left-1/3 w-48 h-48 bg-indigo-500/15 rounded-full blur-2xl animate-float" />
      </div>

      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo Groupement Union */}
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-24 h-24 glass-card mb-6 animate-float">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-glow-purple">
                <span className="text-white font-black text-3xl tracking-tight">GU</span>
              </div>
            </div>
            <h1 className="text-4xl font-black text-white mb-2">
              Groupement Union
            </h1>
            <p className="text-blue-300/80 text-sm tracking-wide">
              Plateforme de gestion RFA
            </p>
          </div>

          {/* Card de connexion */}
          <div className="glass-card p-8 animate-slide-in-up">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">Connexion</h2>
              <p className="text-glass-secondary text-sm mt-1">
                Accédez à votre espace
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 glass-card-dark border-red-500/30 text-red-300 text-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-400">!</span>
                </div>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Nom d'utilisateur
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="w-5 h-5 text-blue-300/50" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="glass-input pl-12"
                    placeholder="admin"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Mot de passe
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-blue-300/50" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input pl-12"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full glass-btn-primary py-3.5 text-base flex items-center justify-center gap-2"
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

            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-center text-glass-muted text-xs">
                Compte par défaut : <span className="text-blue-300">admin</span> / <span className="text-blue-300">admin123</span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-glass-muted text-xs mt-8">
            Groupement Union © 2026 - Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
