import { useEffect, useState } from 'react'

/**
 * Vérifie les mises à jour (Tauri uniquement).
 * Au chargement : vérification silencieuse ; si une mise à jour est dispo, affiche une modale.
 * Expose aussi une fonction pour vérification manuelle (ex. bouton dans Paramètres).
 */
export function useUpdater() {
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
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

  const downloadAndInstall = async (onProgress) => {
    if (!update) return
    setDownloading(true)
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await update.downloadAndInstall(onProgress)
      await relaunch()
    } catch (e) {
      setError(e.message || 'Erreur lors de l\'installation')
    } finally {
      setDownloading(false)
    }
  }

  return { update, checking, downloading, error, checkForUpdates, downloadAndInstall, setUpdate }
}

/**
 * Effet : vérification automatique au démarrage (une fois, Tauri uniquement).
 */
export function AppUpdaterEffect() {
  const { checkForUpdates, update, downloadAndInstall, downloading } = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI__ || dismissed) return
    const t = setTimeout(() => { checkForUpdates() }, 3000)
    return () => clearTimeout(t)
  }, [dismissed])

  if (!update || dismissed) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Mise à jour disponible</h3>
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
          Version <strong>{update.version}</strong>
          {update.body && <span className="block mt-2 text-gray-500">{update.body}</span>}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Plus tard
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => downloadAndInstall()}
            className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? 'Téléchargement...' : 'Installer'}
          </button>
        </div>
      </div>
    </div>
  )
}
