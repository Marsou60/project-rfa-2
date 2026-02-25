import { useEffect, useMemo, useState, useRef } from 'react'
import { Megaphone, Plus, Pencil, Trash2, Upload, Loader2, X, Check, Image } from 'lucide-react'
import { createAd, deleteAd, getAds, updateAd, uploadAdImage, getSupplierLogos, uploadSupplierLogo, deleteSupplierLogo, getImageUrl } from '../api/client'

const emptyForm = {
  title: '',
  subtitle: '',
  image_url: '',
  link_url: '',
  kind: 'logo',
  is_active: true,
  sort_order: 0,
  start_at: '',
  end_at: ''
}

function AdsPage() {
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [activeSection, setActiveSection] = useState('ads') // 'ads' ou 'supplier-logos'
  
  // Supplier Logos state
  const [supplierLogos, setSupplierLogos] = useState([])
  const [logoForm, setLogoForm] = useState({ supplier_key: '', supplier_name: '' })
  const [logoFile, setLogoFile] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoFileRef = useRef(null)

  useEffect(() => {
    loadAds()
    loadSupplierLogos()
  }, [])

  const loadSupplierLogos = async () => {
    try {
      const data = await getSupplierLogos()
      setSupplierLogos(data || [])
    } catch (err) {
      console.error('Erreur chargement logos fournisseurs:', err)
    }
  }

  const handleLogoUpload = async (e) => {
    e.preventDefault()
    if (!logoForm.supplier_key || !logoForm.supplier_name || !logoFile) return
    try {
      setLogoUploading(true)
      await uploadSupplierLogo(logoForm.supplier_key, logoForm.supplier_name, logoFile)
      setLogoForm({ supplier_key: '', supplier_name: '' })
      setLogoFile(null)
      if (logoFileRef.current) logoFileRef.current.value = ''
      await loadSupplierLogos()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur upload logo')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleDeleteLogo = async (logoId) => {
    if (!confirm('Supprimer ce logo ?')) return
    try {
      await deleteSupplierLogo(logoId)
      await loadSupplierLogos()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur suppression')
    }
  }

  const loadAds = async () => {
    try {
      setLoading(true)
      const data = await getAds({ activeOnly: false })
      setAds(data || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement des annonces')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (ad) => {
    setEditingId(ad.id)
    setForm({
      title: ad.title || '',
      subtitle: ad.subtitle || '',
      image_url: ad.image_url || '',
      link_url: ad.link_url || '',
      kind: ad.kind || 'logo',
      is_active: ad.is_active ?? true,
      sort_order: ad.sort_order ?? 0,
      start_at: toInputDate(ad.start_at),
      end_at: toInputDate(ad.end_at)
    })
  }

  const handleCancel = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url.trim() || null,
      link_url: form.link_url.trim() || null,
      kind: form.kind,
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order) || 0,
      start_at: form.start_at ? toIsoDate(form.start_at) : null,
      end_at: form.end_at ? toIsoDate(form.end_at) : null
    }
    try {
      if (editingId) {
        await updateAd(editingId, payload)
      } else {
        await createAd(payload)
      }
      handleCancel()
      loadAds()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'enregistrement')
    }
  }

  const handleDelete = async (ad) => {
    if (!window.confirm(`Supprimer l'annonce "${ad.title}" ?`)) {
      return
    }
    try {
      await deleteAd(ad.id)
      loadAds()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const handleToggleActive = async (ad) => {
    try {
      await updateAd(ad.id, { is_active: !ad.is_active })
      loadAds()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour')
    }
  }

  const sortedAds = useMemo(() => {
    return [...ads].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [ads])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-glass-secondary">Chargement des annonces...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Publicités & partenaires
            </h1>
            <p className="text-sm text-glass-secondary mt-1">Gérez le bandeau défilant et les logos fournisseurs</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('ads')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeSection === 'ads'
              ? 'bg-amber-500 text-white shadow-lg'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            Bandeau Partenaires
          </div>
        </button>
        <button
          onClick={() => setActiveSection('supplier-logos')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            activeSection === 'supplier-logos'
              ? 'bg-indigo-500 text-white shadow-lg'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4" />
            Logos Fournisseurs
            {supplierLogos.length > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs">{supplierLogos.length}</span>
            )}
          </div>
        </button>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== SECTION LOGOS FOURNISSEURS ==================== */}
      {activeSection === 'supplier-logos' && (
        <div className="space-y-6">
          {/* Formulaire d'upload */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Ajouter un logo fournisseur
            </h2>
            <form onSubmit={handleLogoUpload} className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm text-glass-secondary mb-1">Code fournisseur</label>
                <select
                  value={logoForm.supplier_key}
                  onChange={(e) => {
                    const key = e.target.value
                    const names = { ACR: 'ACR', DCA: 'DCA', EXADIS: 'EXADIS', ALLIANCE: 'ALLIANCE', SCHAEFFLER: 'Schaeffler', PURFLUX: 'Purflux / Coopers (Alliance+ACR)' }
                    setLogoForm({ supplier_key: key, supplier_name: names[key] || key })
                  }}
                  className="glass-input px-3 py-2 rounded-lg"
                  required
                >
                  <option value="">Choisir...</option>
                  <option value="ACR">ACR</option>
                  <option value="DCA">DCA</option>
                  <option value="EXADIS">EXADIS</option>
                  <option value="ALLIANCE">ALLIANCE</option>
                  <option value="SCHAEFFLER">Schaeffler</option>
                  <option value="PURFLUX">Purflux / Coopers (Alliance+ACR)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-glass-secondary mb-1">Nom affiche</label>
                <input
                  type="text"
                  value={logoForm.supplier_name}
                  onChange={(e) => setLogoForm({ ...logoForm, supplier_name: e.target.value })}
                  className="glass-input px-3 py-2 rounded-lg"
                  placeholder="Ex: ACR Distribution"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-glass-secondary mb-1">Image (PNG, JPG)</label>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files[0])}
                  className="glass-input px-3 py-2 rounded-lg text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={logoUploading || !logoForm.supplier_key || !logoFile}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {logoUploading ? 'Upload...' : 'Ajouter'}
              </button>
            </form>
          </div>

          {/* Liste des logos */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Image className="w-5 h-5" />
              Logos fournisseurs ({supplierLogos.length})
            </h2>
            {supplierLogos.length === 0 ? (
              <p className="text-glass-secondary text-center py-8">Aucun logo fournisseur configure. Ajoutez-en un ci-dessus.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {supplierLogos.map((logo) => (
                  <div key={logo.id} className="bg-white rounded-xl p-4 flex flex-col items-center gap-3 shadow-md hover:shadow-lg transition-shadow relative group">
                    <button
                      onClick={() => handleDeleteLogo(logo.id)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {logo.image_url ? (
                      <img
                        src={getImageUrl(logo.image_url)}
                        alt={logo.supplier_name}
                        className="h-16 w-auto object-contain"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                        <Image className="w-8 h-8" />
                      </div>
                    )}
                    <div className="text-center">
                      <div className="font-bold text-gray-800 text-sm">{logo.supplier_key}</div>
                      <div className="text-xs text-gray-500">{logo.supplier_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SECTION BANDEAU PARTENAIRES ==================== */}
      {activeSection === 'ads' && <><div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          {editingId ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {editingId ? 'Modifier une annonce' : 'Créer une annonce'}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Titre *</label>
            <input
              className="glass-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Sous-titre</label>
            <input
              className="glass-input"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Image</label>
            <div className="space-y-2">
              <ImageUploader
                currentUrl={form.image_url}
                onUpload={(url) => setForm({ ...form, image_url: url })}
              />
              <div className="text-xs text-glass-muted">ou URL externe :</div>
              <input
                className="glass-input"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Lien (URL)</label>
            <input
              className="glass-input"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Type</label>
            <select
              className="glass-select"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="logo">Logo partenaire</option>
              <option value="promo">Promo</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-sm text-glass-primary">Annonce active</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Ordre d'affichage</label>
            <input
              type="number"
              className="glass-input"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Début</label>
            <input
              type="date"
              className="glass-input"
              value={form.start_at}
              onChange={(e) => setForm({ ...form, start_at: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Fin</label>
            <input
              type="date"
              className="glass-input"
              value={form.end_at}
              onChange={(e) => setForm({ ...form, end_at: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex gap-3 pt-4 border-t border-white/10">
            <button type="submit" className="glass-btn-primary">
              {editingId ? 'Mettre à jour' : 'Créer'}
            </button>
            {editingId && (
              <button type="button" className="glass-btn-secondary" onClick={handleCancel}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="glass-table">
          <thead>
            <tr>
              <th className="text-left">Annonce</th>
              <th className="text-left">Type</th>
              <th className="text-center">Actif</th>
              <th className="text-left">Période</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAds.map(ad => (
              <tr key={ad.id}>
                <td>
                  <div className="flex items-center gap-3">
                    {ad.image_url && (
                      <img src={ad.image_url} alt={ad.title} className="h-10 w-auto object-contain rounded" />
                    )}
                    <div>
                      <div className="font-semibold text-white">{ad.title}</div>
                      {ad.subtitle && <div className="text-xs text-glass-muted">{ad.subtitle}</div>}
                    </div>
                  </div>
                </td>
                <td className="text-glass-secondary">{ad.kind || 'logo'}</td>
                <td className="text-center">
                  <button
                    onClick={() => handleToggleActive(ad)}
                    className={`glass-badge ${
                      ad.is_active ? 'glass-badge-emerald' : 'glass-badge-gray'
                    }`}
                  >
                    {ad.is_active ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Actif
                      </span>
                    ) : (
                      'Inactif'
                    )}
                  </button>
                </td>
                <td className="text-glass-secondary text-sm">
                  {formatRange(ad.start_at, ad.end_at)}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="glass-btn-icon" onClick={() => handleEdit(ad)} title="Modifier">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button className="glass-btn-icon text-red-400 hover:text-red-300" onClick={() => handleDelete(ad)} title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!sortedAds.length && (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-glass-muted">
                  Aucune annonce pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  )
}

const toInputDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const toIsoDate = (value) => {
  return new Date(`${value}T00:00:00`).toISOString()
}

const formatRange = (startAt, endAt) => {
  const start = toInputDate(startAt)
  const end = toInputDate(endAt)
  if (!start && !end) return '—'
  if (start && !end) return `Dès le ${start}`
  if (!start && end) return `Jusqu'au ${end}`
  return `${start} → ${end}`
}

function ImageUploader({ currentUrl, onUpload }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      const result = await uploadAdImage(file)
      onUpload(result.url)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="image-upload"
      />
      <label
        htmlFor="image-upload"
        className={`glass-btn-secondary inline-flex items-center gap-2 cursor-pointer ${
          uploading ? 'opacity-50 cursor-wait' : ''
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Upload en cours...</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span className="text-sm">Uploader une image</span>
          </>
        )}
      </label>

      {currentUrl && (
        <div className="flex items-center gap-2">
          <img
            src={currentUrl.startsWith('/api') ? `http://localhost:8001${currentUrl}` : currentUrl}
            alt="Preview"
            className="h-10 w-auto object-contain rounded border border-white/20"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <button
            type="button"
            onClick={() => onUpload('')}
            className="glass-btn-icon text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  )
}

export default AdsPage
