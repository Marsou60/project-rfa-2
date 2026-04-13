import { useEffect, useState } from 'react'

export function useUpdater() {
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const checkForUpdates = async () => {
    if (typeof window === 'undefined' || (!window.__TAURI__ && !window.__TAURI_INTERNALS__)) return null
    setChecking(true)
    setError(null)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const u = await check()
      setUpdate(u || null)
      return u
    } catch (e) {
      console.error('[Updater] checkForUpdates error:', e)
      setError(e?.message || 'Erreur lors de la vérification')
      return null
    } finally {
      setChecking(false)
    }
  }

  const downloadAndInstall = async () => {
    if (!update) return
    setDownloading(true)
    setProgress({ downloaded: 0, total: 0, percent: null })  // affiche l'overlay immédiatement
    setError(null)
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      let downloaded = 0
      let total = 0

      await update.downloadAndInstall((event) => {
        try {
          if (event.event === 'Started') {
            total = event.data?.contentLength || 0
            setProgress({ downloaded: 0, total, percent: total > 0 ? 0 : null })
          } else if (event.event === 'Progress') {
            downloaded += event.data?.chunkLength || 0
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : null
            setProgress({ downloaded, total, percent })
          } else if (event.event === 'Finished') {
            setProgress({ downloaded: total || downloaded, total, percent: 100 })
          }
        } catch (evtErr) {
          console.warn('[Updater] progress event error:', evtErr)
        }
      })

      setProgress({ downloaded: 0, total: 0, percent: 100 })
      await new Promise((r) => setTimeout(r, 1000))
      await relaunch()
    } catch (e) {
      console.error('[Updater] downloadAndInstall error:', e)
      setError(e?.message || "Erreur lors de l'installation")
      setDownloading(false)
      setProgress(null)
    }
  }

  return { update, checking, downloading, progress, error, checkForUpdates, downloadAndInstall, setUpdate }
}


export function UpdateProgressOverlay({ progress, version, error }) {
  const fmt = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
        <div className="bg-[#1e293b] border border-rose-500/30 rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <h3 className="text-lg font-bold text-rose-400 mb-2">Erreur de mise à jour</h3>
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  const isInstalling = progress?.percent === 100
  const pct = progress?.percent ?? 0

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="text-lg font-bold text-white mb-1">
          {isInstalling ? '⚡ Installation…' : `⬇ Téléchargement v${version || ''}`}
        </h3>
        <p className="text-white/50 text-sm mb-5">
          {isInstalling
            ? "Redémarrage automatique dans un instant."
            : progress?.total > 0
              ? `${fmt(progress.downloaded)} / ${fmt(progress.total)}`
              : "Démarrage du téléchargement…"}
        </p>
        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(pct, progress?.percent == null ? 5 : 0)}%` }}
          />
        </div>
        {progress?.percent != null && (
          <p className="text-right text-xs text-white/40 mt-1">{pct}%</p>
        )}
      </div>
    </div>
  )
}


export function AppUpdaterEffect() {
  const { checkForUpdates, update, downloadAndInstall, downloading, progress, error } = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || (!window.__TAURI__ && !window.__TAURI_INTERNALS__)) return
    const t = setTimeout(() => { checkForUpdates() }, 3000)
    return () => clearTimeout(t)
  }, [])

  if (downloading) {
    return <UpdateProgressOverlay progress={progress} version={update?.version} error={error} />
  }

  if (!update || dismissed) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-white mb-2">Mise à jour disponible</h3>
        <p className="text-white/60 text-sm mb-1">
          Version <strong className="text-indigo-300">{update.version}</strong> est disponible.
        </p>
        {update.body && (
          <p className="text-white/40 text-xs mb-4">{update.body}</p>
        )}
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-1 px-4 py-2 rounded-xl border border-white/20 text-white/70 hover:bg-white/10 transition text-sm"
          >
            Plus tard
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => downloadAndInstall()}
            className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50 transition text-sm"
          >
            Installer maintenant
          </button>
        </div>
      </div>
    </div>
  )
}
