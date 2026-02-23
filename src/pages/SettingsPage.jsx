import { useState, useEffect, useRef } from 'react'
import { Settings, Upload, Trash2, Building2, Info, Loader2, X, Check } from 'lucide-react'
import { getSetting, setSetting, uploadLogo, getImageUrl } from '../api/client'

function SettingsPage() {
  const [companyLogo, setCompanyLogo] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const logoResult = await getSetting('company_logo')
      if (logoResult.value) {
        setCompanyLogo(logoResult.value)
      }
    } catch (err) {
      console.log('Paramètres non trouvés')
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(null)
    setUploading(true)

    try {
      const result = await uploadLogo(file)
      setCompanyLogo(result.url)

      await setSetting('company_logo', result.url)
      setSuccess('Logo mis à jour avec succès !')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    setSaving(true)
    try {
      await setSetting('company_logo', '')
      setCompanyLogo(null)
      setSuccess('Logo supprimé')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center shadow-lg">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Paramètres</h1>
          <p className="text-sm text-glass-secondary">Configuration de l'application</p>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="glass-card p-4 border-emerald-500/30 text-emerald-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            {success}
          </span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Logo de l'entreprise */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Logo de l'entreprise</h2>
        <p className="text-sm text-glass-secondary mb-6">
          Ce logo sera affiché dans l'en-tête de l'application et sur la page de connexion.
        </p>

        <div className="flex items-start gap-6">
          {/* Aperçu */}
          <div className="flex-shrink-0">
            <div className="text-xs text-glass-muted mb-2">Aperçu</div>
            <div className="w-40 h-24 glass-card-dark rounded-xl flex items-center justify-center overflow-hidden">
              {companyLogo ? (
                <img
                  src={getImageUrl(companyLogo)}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain p-2"
                />
              ) : (
                <div className="text-center text-glass-muted">
                  <Building2 className="w-10 h-10 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Aucun logo</p>
                </div>
              )}
            </div>
          </div>

          {/* Upload */}
          <div className="flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              id="logo-upload"
            />

            <div className="space-y-3">
              <label
                htmlFor="logo-upload"
                className={`glass-btn-secondary inline-flex items-center gap-2 cursor-pointer ${
                  uploading ? 'opacity-50 cursor-wait' : ''
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Upload en cours...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{companyLogo ? 'Changer le logo' : 'Uploader un logo'}</span>
                  </>
                )}
              </label>

              {companyLogo && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={saving}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer le logo
                </button>
              )}

              <p className="text-xs text-glass-muted">
                Formats acceptés : PNG, JPG, GIF, WebP, SVG<br />
                Taille recommandée : 200x60 pixels minimum
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Infos système */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-400" />
          Informations
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="glass-card-dark p-4 rounded-xl">
            <span className="text-glass-muted">Version</span>
            <p className="font-medium text-white mt-1">1.0.0</p>
          </div>
          <div className="glass-card-dark p-4 rounded-xl">
            <span className="text-glass-muted">Plateforme</span>
            <p className="font-medium text-white mt-1">Groupement Union RFA</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
