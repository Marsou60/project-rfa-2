import { useEffect, useState } from 'react'

export function useUpdater() {
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)   // { downloaded, total, percent }
  const [error, setError] = useState(null)

  const checkForUpdates = async () => {
    if (typeof window === 'undefined' || !window.__TAURI__) return null
    setChecking(true)
    setError(null)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const u = await check()
      setUpdate(u)
      return u
    } catch (e) {
      setError(e.message || 'Erreur lors de la vérification')
      return null
    } finally {
      setChecking(false)
    }
  }

  const downloadAndInstall = async () => {
    if (!update) return
    setDownloading(true)
    setProgress(null)
    setError(null)
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')

      let downloaded = 0
      let total = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength || 0
          setProgress({ downloaded: 0, total, percent: 0 })
        } else if (event.event === 'Progress') {
          downloaded += event.data?.chunkLength || 0
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : null
          setProgress({ downloaded, total, percent })
        } else if (event.event === 'Finished') {
          setProgress({ downloaded: total, total, percent: 100 })
        }
      })

      // Courte pause pour que l'utilisateur voit "100% — Installation..."
      await new Promise((r) => setTimeout(r, 800))
      await relaunch()
    } catch (e) {
      setError(e.message || "Erreur lors de l'installation")
      setDownloading(false)
      setProgress(null)
    }
  }

  return { update, checking, downloading, progress, error, checkForUpdates, downloadAndInstall, setUpdate }
}


/**
 * Overlay de progression affiché pendant le téléchargement/installation.
 * Rendu par App.jsx — reçoit les props depuis useUpdater.
 */
export function UpdateProgressOverlay({ progress, version }) {
  const fmt = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  }

  const isInstalling = progress?.percent === 100

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="text-lg font-bold text-white mb-1">
          {isInstalling ? '⚡ Installation en cours…' : '⬇ Téléchargement v' + version}
        </h3>
        <p className="text-white/50 text-sm mb-4">
          {isInstalling
            ? "L'application va redémarrer automatiquement."
            : "Ne fermez pas l'application."}
        </p>

        {/* Barre de progression */}
        <div className="w-full bg-white/10 rounded-full h-3 mb-2 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-white/50">
          <span>
            {progress?.percent != null ? `${progress.percent}%` : '…'}
          </span>
          <span>
            {progress?.total
              ? `${fmt(progress.downloaded)} / ${fmt(progress.total)}`
              : ''}
          </span>
        </div>
      </div>
    </div>
  )
}


/**
 * Effet : vérification automatique au démarrage (une fois, Tauri uniquement).
 */
export function AppUpdaterEffect() {
  const { checkForUpdates, update, downloadAndInstall, downloading, progress } = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI__ || dismissed) return
    const t = setTimeout(() => { checkForUpdates() }, 3000)
    return () => clearTimeout(t)
  }, [dismissed])

  if (downloading && progress) {
    return <UpdateProgressOverlay progress={progress} version={update?.version} />
  }

  if (!update || dismissed) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-white mb-2">Mise à jour disponible</h3>
        <p className="text-white/60 text-sm mb-4">
          Version <strong className="text-white">{update.version}</strong>
          {update.body && <span className="block mt-2 text-white/40">{update.body}</span>}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-1 px-4 py-2 rounded-xl border border-white/20 text-white/70 hover:bg-white/10 transition"
          >
            Plus tard
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => downloadAndInstall()}
            className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {downloading ? 'Démarrage…' : 'Installer maintenant'}
          </button>
        </div>
      </div>
    </div>
  )
}
