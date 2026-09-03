import { useState, useEffect, useRef } from 'react'
import {
  UserPlus, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Building2, Phone, Mail, MapPin, FileText, Send, ArrowLeft,
  Sparkles, Search, RefreshCw, Loader2, Eye, X, Copy, Check,
  FileCheck, FileMinus, ExternalLink, UploadCloud, ScanSearch, Users,
  Pencil, Save, Camera, Trash2,
} from 'lucide-react'
import {
  nathalieGetClients,
  nathalieGetSuppliers,
  nathalieGenerateEmails,
  nathalieGetClientDetail,
  nathalieCreateClient,
  nathalieUpdateClient,
  nathalieDeleteClient,
  nathalieSendEmails,
  nathalieSearchEntreprise,
  nathalieExtractKbis,
  nathalieInspectDrive,
  nathalieSyncDrive,
} from '../api/client'

/* ── Fournisseurs connus (pour les cases à cocher) ─────────── */
const KNOWN_SUPPLIERS = ['ACR', 'ALLIANCE', 'DCA', 'EXADIS', 'PURFLUX']

/* ── Groupes (pour le routage Drive) ───────────────────────── */
const AGENTS_UNION = [
  'Vanessa', 'Emeric', 'El Mehdi', 'Rayane', 'Agathe', 'Alya', 'Coralie', 'Martial',
]

const PHOTO_SLOTS = [
  { key: 'photo_devanture', label: 'Photo 1 — Devanture', urlKey: 'photo_devanture_url' },
  { key: 'photo_comptoir', label: 'Photo 2 — Comptoir', urlKey: 'photo_comptoir_url' },
  { key: 'photo_stock', label: 'Photo 3 — Stock', urlKey: 'photo_stock_url' },
  { key: 'photo_autre_1', label: 'Photo 4 — Autre', urlKey: 'photo_autre_1_url' },
  { key: 'photo_autre_2', label: 'Photo 5 — Autre', urlKey: 'photo_autre_2_url' },
]

function formatCompteDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const GROUPES = [
  'INDEPENDANT UNION',
  'GROUPE JUMBO',
  'GROUPE EMERIC',
  'GROUPE APA MARSEILLE',
  'GROUPE AUTO MOURAD',
  'GROUPE DISCOUNT',
  'GROUPE LES LYONNAIS',
  'GROUPE STARCOM',
  'GROUPE CENTER',
  'GROUPE CODIFA',
]

const STATUS_STYLE = {
  'docs_ok':      { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Complet' },
  'docs_partial': { bg: 'bg-amber-500/20',   text: 'text-amber-300',   label: 'Incomplet' },
  'a_scanner':    { bg: 'bg-slate-500/20',   text: 'text-slate-400',   label: 'À scanner' },
}

function isDossierComplet(client) {
  return Boolean(client.has_rib ?? client.rib) && Boolean(client.has_kbis ?? client.kbis)
}

function isDriveChecked(client) {
  return Boolean(client.drive_checked || client.drive_checked_at || client.drive_folder_id)
}

function clientStatus(client) {
  if (isDossierComplet(client)) return 'docs_ok'
  if (!isDriveChecked(client)) return 'a_scanner'
  return 'docs_partial'
}

/* ═══════════════════════════════════════════════════════════════ */
export default function NathaliePage() {
  const [view, setView] = useState('accueil') // accueil | nouveau | dossiers | annuaire | client | emails
  const [listOrigin, setListOrigin] = useState('dossiers')
  const [annuaireFilter, setAnnuaireFilter] = useState('tous') // tous | ouverts | fermes
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientDetail, setClientDetail] = useState(null)
  const [selectedSuppliers, setSelectedSuppliers] = useState([])
  const [generatedEmails, setGeneratedEmails] = useState([])
  const [generating, setGenerating] = useState(false)

  const [scanning, setScanning] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await nathalieGetClients(false)
      setClients(c.clients || [])
      try {
        const s = await nathalieGetSuppliers()
        setSuppliers(s.suppliers || [])
      } catch {
        setSuppliers([])
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de charger l’annuaire adhérents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openClient = async (client, origin = view) => {
    if (origin === 'annuaire' || origin === 'dossiers') setListOrigin(origin)
    setSelectedClient(client)
    setGeneratedEmails([])
    const preselect = (client.ouverture_chez || '')
      .split(/[,;/\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => KNOWN_SUPPLIERS.includes(s))
    setSelectedSuppliers(preselect.length ? preselect : [])
    setView('client')
    try {
      const detail = await nathalieGetClientDetail(client.code_union)
      setClientDetail(detail)
    } catch {
      setClientDetail(null)
    }
  }

  /** Après création d'un client : ouvrir sa fiche pour préparer les emails fournisseurs. */
  const openNewClientForEmails = async (codeUnion) => {
    setError(null)
    setView('client')
    setGeneratedEmails([])
    setSelectedSuppliers([])
    try {
      const detail = await nathalieGetClientDetail(codeUnion)
      setSelectedClient(detail.client)
      setClientDetail(detail)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de charger le client.')
      setSelectedClient(null)
      setClientDetail(null)
    }
  }

  const handleGenerateEmails = async () => {
    if (!selectedClient || !selectedSuppliers.length) return
    setGenerating(true)
    try {
      const result = await nathalieGenerateEmails(selectedClient.code_union, selectedSuppliers)
      setGeneratedEmails(result.emails || [])
      setView('emails')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur lors de la génération des emails.')
    } finally {
      setGenerating(false)
    }
  }

  // Filtre recherche
  const filteredClients = clients.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      c.nom_client?.toLowerCase().includes(s) ||
      c.code_union?.toLowerCase().includes(s) ||
      c.ville?.toLowerCase().includes(s) ||
      c.groupe?.toLowerCase().includes(s) ||
      c.region_commerciale?.toLowerCase().includes(s) ||
      c.agent_union?.toLowerCase().includes(s) ||
      c.ouverture_chez?.toLowerCase().includes(s)
    )
  })

  const scanDrive = async () => {
    setScanning(true)
    setError(null)
    try {
      await nathalieSyncDrive()
      await loadData()
      setView('dossiers')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de scanner Drive.')
    } finally {
      setScanning(false)
    }
  }

  const stats = {
    total: clients.length,
    enCours: clients.filter(c => isDriveChecked(c) && !isDossierComplet(c)).length,
    complets: clients.filter(c => isDossierComplet(c)).length,
    aScanner: clients.filter(c => !isDriveChecked(c)).length,
  }

  const dossiersEnCours = filteredClients.filter(c => isDriveChecked(c) && !isDossierComplet(c))

  return (
    <div className="min-h-screen space-y-6 pb-16">
      {/* Header Nathalie */}
      <NathalieHeader onRefresh={loadData} loading={loading} />

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-3 glass-card bg-red-500/10 border border-red-500/30 px-5 py-4 text-red-300 text-sm rounded-xl">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Vues */}
      {view === 'accueil' && (
        <AccueilView
          stats={stats}
          loading={loading}
          scanning={scanning}
          onVoirDossiers={() => { setSearch(''); setView('dossiers') }}
          onVoirAnnuaire={() => { setSearch(''); setAnnuaireFilter('tous'); setView('annuaire') }}
          onNouveau={() => setView('nouveau')}
          onScanDrive={scanDrive}
        />
      )}

      {view === 'nouveau' && (
        <NouveauDossierView
          onBack={() => setView('accueil')}
          onSuccess={() => { loadData(); setView('dossiers') }}
          onPrepareEmails={openNewClientForEmails}
        />
      )}

      {view === 'dossiers' && (
        <DossiersView
          clients={dossiersEnCours}
          loading={loading}
          scanning={scanning}
          aScanner={stats.aScanner}
          search={search}
          setSearch={setSearch}
          onBack={() => setView('accueil')}
          onSelectClient={(c) => openClient(c, 'dossiers')}
          onScanDrive={scanDrive}
        />
      )}

      {view === 'annuaire' && (
        <AnnuaireView
          clients={filteredClients.filter(c => {
            if (annuaireFilter === 'fermes') return Boolean(c.is_closed)
            if (annuaireFilter === 'ouverts') return !c.is_closed
            return true
          })}
          total={clients.length}
          loading={loading}
          search={search}
          setSearch={setSearch}
          filter={annuaireFilter}
          setFilter={setAnnuaireFilter}
          onBack={() => setView('accueil')}
          onSelectClient={(c) => openClient(c, 'annuaire')}
        />
      )}

      {view === 'client' && selectedClient && (
        <ClientView
          client={selectedClient}
          clientDetail={clientDetail}
          suppliers={suppliers}
          selectedSuppliers={selectedSuppliers}
          setSelectedSuppliers={setSelectedSuppliers}
          generating={generating}
          onGenerate={handleGenerateEmails}
          onClientUpdated={(c) => { setSelectedClient(c); loadData() }}
          onDeleted={() => { setSelectedClient(null); loadData(); setView('annuaire') }}
          onBack={() => { loadData(); setView(listOrigin === 'annuaire' ? 'annuaire' : 'dossiers') }}
        />
      )}

      {view === 'emails' && generatedEmails.length > 0 && (
        <EmailsView
          emails={generatedEmails}
          client={selectedClient}
          onBack={() => setView('client')}
        />
      )}
    </div>
  )
}

/* ── Header ─────────────────────────────────────────────────── */
function NathalieHeader({ onRefresh, loading }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 relative">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🤝</div>
            <div>
              <h1 className="text-xl font-black text-white">Nathalie</h1>
              <p className="text-white/60 text-xs font-medium">Ouverture de comptes adhérents</p>
            </div>
            <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 ml-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span className="text-white/80 text-xs font-medium">Base Union (Supabase)</span>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="glass-btn-icon"
            title="Actualiser l’annuaire"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-white/5 blur-2xl" />
      </div>
    </div>
  )
}

/* ── Accueil ─────────────────────────────────────────────────── */
function AccueilView({ stats, loading, scanning, onVoirDossiers, onVoirAnnuaire, onNouveau, onScanDrive }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'En cours', value: stats.enCours, color: 'text-amber-300', onClick: onVoirDossiers },
          { label: 'Complets', value: stats.complets, color: 'text-emerald-300', onClick: onVoirAnnuaire },
          { label: 'À scanner', value: stats.aScanner, color: 'text-slate-300', onClick: onVoirAnnuaire },
          { label: 'Annuaire', value: stats.total, color: 'text-blue-300', onClick: onVoirAnnuaire },
        ].map(k => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            className="glass-card p-4 flex flex-col gap-1 text-left hover:bg-white/5"
          >
            <span className="text-xs text-blue-300/50 font-medium">{k.label}</span>
            <div className={`text-2xl font-black ${k.color}`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : k.value}
            </div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <button
          onClick={onNouveau}
          className="glass-card p-6 text-left hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/70 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Nouveau dossier</h3>
          <p className="text-blue-300/60 text-sm">
            Créer un adhérent : Kbis ou recherche INSEE, pièces, dossier Drive, base Union.
          </p>
        </button>

        <button
          onClick={onVoirDossiers}
          className="glass-card p-6 text-left hover:scale-[1.02] hover:shadow-2xl hover:shadow-teal-500/20 transition-all duration-300 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/70 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Dossiers en cours</h3>
          <p className="text-blue-300/60 text-sm">
            File des magasins dont le RIB ou le Kbis manque encore dans Drive.
            {typeof stats.enCours === 'number' ? ` ${stats.enCours} en attente.` : ''}
          </p>
        </button>

        <button
          onClick={onVoirAnnuaire}
          className="glass-card p-6 text-left hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/70 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Annuaire complet</h3>
          <p className="text-blue-300/60 text-sm">
            Les {stats.total || 0} adhérents Union : ouverts, fermés, région, agent, SIRET.
          </p>
        </button>
      </div>

      {stats.aScanner > 0 && (
        <button
          type="button"
          onClick={onScanDrive}
          disabled={scanning}
          className="w-full glass-card p-4 flex items-center justify-between text-left hover:bg-white/5"
        >
          <div>
            <div className="text-white font-semibold">Scanner les dossiers Drive</div>
            <div className="text-xs text-blue-300/60 mt-1">
              {stats.aScanner} fiches pas encore comparées à Drive — ça alimente la file des incomplets.
            </div>
          </div>
          {scanning ? <Loader2 className="w-5 h-5 animate-spin text-emerald-300" /> : <RefreshCw className="w-5 h-5 text-emerald-300" />}
        </button>
      )}
    </div>
  )
}

function isSiret14(value) {
  return String(value || '').replace(/\D/g, '').length === 14
}

function applyEntrepriseToForm(current, row) {
  if (!row) return current
  const siret = isSiret14(row.siret) ? String(row.siret).replace(/\D/g, '') : current.siret
  const next = {
    ...current,
    nom_client: row.nom_client || current.nom_client,
    siret,
    tva: row.tva || current.tva,
    adresse: row.adresse || current.adresse,
    code_postal: row.code_postal || current.code_postal,
    ville: row.ville || current.ville,
    contact_magasin: row.contact_magasin || current.contact_magasin,
  }
  if (row.raison_sociale && row.raison_sociale !== row.nom_client) {
    const line = `Raison sociale : ${row.raison_sociale}`
    if (!(next.notes || '').includes(line)) {
      next.notes = next.notes ? `${next.notes}\n${line}` : line
    }
  }
  return next
}

/* ── Nouveau Dossier ───────────────────────────────────────────── */
function NouveauDossierView({ onBack, onSuccess, onPrepareEmails }) {
  const [submitting, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const skipSiretLookup = useRef(false)
  const skipQuerySearch = useRef(false)

  const [form, setForm] = useState({
    nom_client: '',
    groupe: 'INDEPENDANT UNION',
    siret: '',
    tva: '',
    contact_magasin: '',
    contact_responsable_pdv: '',
    telephone_responsable: '',
    adresse: '',
    code_postal: '',
    ville: '',
    telephone: '',
    mail: '',
    agent_union: '',
    region_commerciale: '',
    contrat_type: '',
    notes: '',
  })

  const [files, setFiles] = useState({
    rib: null,
    kbis: null,
    piece_identite: null,
    photo_devanture: null,
    photo_comptoir: null,
    photo_stock: null,
    photo_autre_1: null,
    photo_autre_2: null,
  })
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [readingKbis, setReadingKbis] = useState(false)
  const [autofill, setAutofill] = useState(null)
  const [lookupError, setLookupError] = useState(null)

  const applyRow = (row, source, extra = {}) => {
    skipSiretLookup.current = true
    skipQuerySearch.current = true
    setForm(current => applyEntrepriseToForm(current, row))
    setAutofill({
      source,
      siret: isSiret14(row.siret) ? String(row.siret).replace(/\D/g, '') : null,
      via: extra.via || source,
      rcs: extra.rcs || row.siren || null,
      nom: extra.nom || null,
      label: row.label || row.nom_client,
    })
    setSuggestions([])
    setQuery(row.nom_client || '')
    setLookupError(null)
  }

  const readKbis = async (file) => {
    if (!file) return
    setFiles(f => ({ ...f, kbis: file }))
    setReadingKbis(true)
    setLookupError(null)
    try {
      const data = await nathalieExtractKbis(file)
      if (data.entreprise && isSiret14(data.entreprise.siret)) {
        applyRow(data.entreprise, data.method === 'ocr' ? 'kbis-ocr' : 'kbis', {
          via: data.resolved_via,
          rcs: data.siren,
          nom: (data.noms_kbis || [])[0],
        })
      } else if ((data.suggestions || []).length) {
        setSuggestions(data.suggestions)
      }
      if (data.warning) setLookupError(data.warning)
    } catch (e) {
      setLookupError(e?.response?.data?.detail || 'Impossible de lire ce Kbis.')
    } finally {
      setReadingKbis(false)
    }
  }

  const handleFileChange = (key, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (key === 'kbis') readKbis(file)
    else setFiles(f => ({ ...f, [key]: file }))
  }

  useEffect(() => {
    const q = query.trim()
    if (skipQuerySearch.current) {
      skipQuerySearch.current = false
      return undefined
    }
    if (q.length < 3) {
      setSuggestions([])
      return undefined
    }
    const handle = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await nathalieSearchEntreprise(q)
        setSuggestions(data.results || [])
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 280)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    const digits = (form.siret || '').replace(/\D/g, '')
    if (skipSiretLookup.current) {
      skipSiretLookup.current = false
      return undefined
    }
    if (digits.length !== 14) return undefined
    const handle = setTimeout(async () => {
      try {
        const data = await nathalieSearchEntreprise(digits)
        const row = (data.results || [])[0]
        if (row) applyRow(row, 'siret')
      } catch {
        /* saisie manuelle toujours possible */
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [form.siret])

  const handleSubmit = async () => {
    if (!form.nom_client || submitting) return
    setSubmitted(true)

    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v))
      if (files.rib) formData.append('rib', files.rib)
      if (files.kbis) formData.append('kbis', files.kbis)
      if (files.piece_identite) formData.append('piece_identite', files.piece_identite)
      PHOTO_SLOTS.forEach(({ key }) => {
        if (files[key]) formData.append(key, files[key])
      })

      const res = await nathalieCreateClient(formData)
      setResult(res)
    } catch (e) {
      alert("Erreur : " + (e?.response?.data?.detail || e.message))
      setSubmitted(false)
    }
  }

  if (result) {
    return (
      <div className="glass-card p-10 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30 animate-float">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-white mb-2">Dossier créé !</h2>
          <p className="text-blue-300/70 text-lg">
            Le client <strong className="text-white">{form.nom_client}</strong> a été enregistré.
          </p>
        </div>
        
        <div className="bg-white/5 rounded-2xl p-6 max-w-md mx-auto text-left space-y-3 border border-white/10">
          <div className="flex justify-between items-center">
            <span className="text-blue-300/50 text-sm">Code Union généré</span>
            <span className="text-emerald-400 font-mono font-bold text-lg">{result.code_union}</span>
          </div>
          {formatCompteDate(result.date_creation_compte) && (
            <div className="flex justify-between items-center">
              <span className="text-blue-300/50 text-sm">Compte créé le</span>
              <span className="text-white/80 text-sm">{formatCompteDate(result.date_creation_compte)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-blue-300/50 text-sm">Dossier Drive</span>
            {result.drive_link ? (
              <a href={result.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
                Ouvrir <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-amber-300 text-sm">Non créé</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-blue-300/50 text-sm">Base Union</span>
            <span className="text-white/60 text-sm">Enregistré ✓</span>
          </div>
          {result.drive_warning && (
            <p className="text-xs text-amber-300/80 pt-1">Drive : {result.drive_warning}</p>
          )}
          {result.sheet_warning && (
            <p className="text-xs text-amber-300/80 pt-1">Liste Client 2 : {result.sheet_warning}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-6">
          {onPrepareEmails && (
            <button
              onClick={() => onPrepareEmails(result.code_union)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold hover:bg-white/20 transition-all shadow-lg"
            >
              <Send className="w-4 h-4" />
              Envoyer la demande d'ouverture aux fournisseurs
            </button>
          )}
          <button
            onClick={onSuccess}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:opacity-90 transition-opacity shadow-lg"
          >
            Retour à la liste
          </button>
        </div>
      </div>
    )
  }

  if (submitting) {
    return (
      <div className="glass-card p-20 text-center flex flex-col items-center gap-6">
        <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
        <div>
          <h3 className="text-xl font-bold text-white">Création en cours...</h3>
          <p className="text-blue-300/60 mt-2">Nathalie génère le code Union, crée le dossier Drive et enregistre l’adhérent.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-2xl font-bold text-white">Nouveau dossier adhérent</h2>
      </div>

      <div className="glass-card p-8 space-y-8">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5 space-y-4">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              <ScanSearch className="w-5 h-5 text-emerald-400" />
              Préremplir la fiche
            </h3>
            <p className="text-sm text-blue-300/60 mt-1">
              Déposez le Kbis : on cherche avec le RCS ou la dénomination, puis on enregistre le SIRET (14 chiffres).
            </p>
          </div>

          <label
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
              files.kbis
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-white/15 hover:border-emerald-400/40 bg-white/5'
            }`}
          >
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) readKbis(e.target.files[0]) }}
            />
            {readingKbis ? (
              <span className="flex items-center gap-2 text-emerald-300 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Lecture du Kbis…
              </span>
            ) : files.kbis ? (
              <span className="text-emerald-300 text-sm font-medium">Kbis : {files.kbis.name}</span>
            ) : (
              <>
                <UploadCloud className="w-6 h-6 text-emerald-400" />
                <span className="text-white text-sm font-semibold">Déposer le Kbis (PDF ou photo)</span>
                <span className="text-blue-300/50 text-xs">INPI, scan, ou photo lisible</span>
              </>
            )}
          </label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input-field pl-10"
              placeholder="Ou chercher : nom, SIRET, ville…"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-emerald-300" />
            )}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-2 w-full max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-900/95 shadow-xl">
                {suggestions.map(row => (
                  <li key={row.siret || row.label}>
                    <button
                      type="button"
                      onClick={() => applyRow(row, 'annuaire')}
                      className="w-full text-left px-4 py-3 hover:bg-white/10 border-b border-white/5 last:border-0"
                    >
                      <div className="text-white text-sm font-semibold">{row.nom_client}</div>
                      <div className="text-xs text-blue-300/60 mt-0.5">
                        {row.siret} · {[row.adresse, row.code_postal, row.ville].filter(Boolean).join(' ')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {autofill && (
            <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {autofill.siret
                  ? `SIRET ${autofill.siret} — c’est ce numéro qui sera stocké${
                      autofill.via === 'rcs' && autofill.rcs
                        ? ` (recherché via RCS ${autofill.rcs})`
                        : autofill.via === 'nom'
                          ? ' (recherché via la dénomination du Kbis)'
                          : ''
                    }.`
                  : 'Fiche préremplie. Vérifiez le SIRET avant d’enregistrer.'}
              </span>
            </div>
          )}
          {lookupError && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{lookupError}</span>
            </div>
          )}
        </div>

        {/* Info Base */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="label-field">Raison sociale *</label>
            <input value={form.nom_client} onChange={e => setForm({...form, nom_client: e.target.value})} className="input-field" placeholder="Garage Dupont" autoFocus />
          </div>
          
          <div>
            <label className="label-field">Groupe</label>
            <select value={form.groupe} onChange={e => setForm({...form, groupe: e.target.value})} className="input-field">
              {GROUPES.map(g => <option key={g} value={g} className="text-black">{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">SIRET (stocké, 14 chiffres)</label>
            <input value={form.siret} onChange={e => setForm({...form, siret: e.target.value})} className="input-field" placeholder="14 chiffres" />
          </div>
          <div>
            <label className="label-field">N° TVA</label>
            <input value={form.tva} onChange={e => setForm({...form, tva: e.target.value})} className="input-field" placeholder="FR…" />
          </div>
          <div>
            <label className="label-field">Région commerciale</label>
            <input value={form.region_commerciale} onChange={e => setForm({...form, region_commerciale: e.target.value})} className="input-field" placeholder="IDF, PACA…" />
          </div>
          <div>
            <label className="label-field">Agent Union</label>
            <select value={form.agent_union} onChange={e => setForm({...form, agent_union: e.target.value})} className="input-field">
              <option value="" className="text-black">Choisir…</option>
              {AGENTS_UNION.map(a => <option key={a} value={a} className="text-black">{a}</option>)}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5 pt-2">
          <div className="md:col-span-2 text-xs font-semibold text-emerald-300/80 uppercase tracking-wider">Gérant</div>
          <div>
            <label className="label-field">Nom du gérant</label>
            <input value={form.contact_magasin} onChange={e => setForm({...form, contact_magasin: e.target.value})} className="input-field" placeholder="Nom du gérant" />
          </div>
          <div>
            <label className="label-field">Téléphone gérant</label>
            <input type="tel" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} className="input-field" placeholder="06 12 34 56 78" />
          </div>
          <div className="md:col-span-2">
            <label className="label-field">Email gérant</label>
            <input type="email" value={form.mail} onChange={e => setForm({...form, mail: e.target.value})} className="input-field" placeholder="gerant@magasin.fr" />
          </div>
          <div className="md:col-span-2 text-xs font-semibold text-emerald-300/80 uppercase tracking-wider pt-2">Responsable magasin</div>
          <div>
            <label className="label-field">Nom du responsable magasin</label>
            <input value={form.contact_responsable_pdv} onChange={e => setForm({...form, contact_responsable_pdv: e.target.value})} className="input-field" placeholder="Nom du responsable" />
          </div>
          <div>
            <label className="label-field">Téléphone responsable magasin</label>
            <input type="tel" value={form.telephone_responsable} onChange={e => setForm({...form, telephone_responsable: e.target.value})} className="input-field" placeholder="06 …" />
          </div>
          <div className="md:col-span-2">
            <label className="label-field">Adresse complète</label>
            <div className="grid grid-cols-6 gap-3">
              <input value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} className="input-field col-span-6" placeholder="Numéro et rue" />
              <input value={form.code_postal} onChange={e => setForm({...form, code_postal: e.target.value})} className="input-field col-span-2" placeholder="CP" />
              <input value={form.ville} onChange={e => setForm({...form, ville: e.target.value})} className="input-field col-span-4" placeholder="Ville" />
            </div>
          </div>
        </div>

        {/* Uploads */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <h3 className="font-bold text-white flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-400" /> Pièces jointes
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { k: 'rib', l: 'RIB' },
              { k: 'kbis', l: 'Kbis' },
              { k: 'piece_identite', l: 'Pièce d\'identité' }
            ].map(({k, l}) => (
              <div key={k} className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                files[k] ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 hover:border-white/30 bg-white/5'
              }`}>
                <input type="file" id={k} className="hidden" onChange={e => handleFileChange(k, e)} />
                <label htmlFor={k} className="cursor-pointer block h-full">
                  {files[k] ? (
                    <div className="text-emerald-300 text-sm font-medium truncate px-2">
                      ✓ {files[k].name}
                    </div>
                  ) : (
                    <>
                      <div className="text-white/40 text-xs mb-1 uppercase font-bold">{l}</div>
                      <span className="text-emerald-400 text-xs font-medium bg-emerald-400/10 px-2 py-1 rounded">Choisir</span>
                    </>
                  )}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/10">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" /> Photos magasin
          </h3>
          <p className="text-xs text-blue-300/50">Enregistrées dans le dossier Drive du client.</p>
          <div className="grid md:grid-cols-5 gap-3">
            {PHOTO_SLOTS.map(({ key, label }) => (
              <div key={key} className={`border-2 border-dashed rounded-xl p-3 text-center transition-colors ${
                files[key] ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 hover:border-white/30 bg-white/5'
              }`}>
                <input type="file" id={key} accept="image/*" className="hidden" onChange={e => handleFileChange(key, e)} />
                <label htmlFor={key} className="cursor-pointer block h-full">
                  {files[key] ? (
                    <div className="text-emerald-300 text-xs font-medium truncate">{files[key].name}</div>
                  ) : (
                    <>
                      <div className="text-white/50 text-[10px] mb-1 font-semibold leading-tight">{label}</div>
                      <span className="text-emerald-400 text-[10px] font-medium bg-emerald-400/10 px-2 py-0.5 rounded">Choisir</span>
                    </>
                  )}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6">
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.nom_client || (form.siret || '').replace(/\D/g, '').length !== 14}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-lg shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {submitting ? 'Création en cours…' : 'Créer le dossier complet'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Dossiers ─────────────────────────────────────────────────── */
function DossiersView({ clients, loading, scanning, aScanner, search, setSearch, onBack, onSelectClient, onScanDrive }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[180px]">
          <h2 className="text-lg font-bold text-white">Dossiers en cours</h2>
          <p className="text-xs text-blue-300/50">
            {clients.length} dossiers incomplets — RIB ou Kbis manquant
          </p>
        </div>
        <button
          type="button"
          onClick={onScanDrive}
          disabled={scanning}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          Scanner Drive
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="pl-9 pr-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-400/50 w-52"
          />
        </div>
      </div>

      {aScanner > 0 && (
        <div className="text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          {aScanner} fiches pas encore comparées à Drive. Lancez un scan pour remplir cette file.
        </div>
      )}

      {loading || scanning ? (
        <div className="flex items-center justify-center py-20 text-blue-300/60 gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          {scanning ? 'Scan Drive en cours…' : 'Chargement…'}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Code Union', 'Nom client', 'Groupe', 'Ville', 'Manque', 'Drive'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-white/30">
                    {aScanner > 0 ? 'Aucun incomplet connu pour l’instant — scannez Drive.' : 'Aucun dossier incomplet. Tout est à jour.'}
                  </td>
                </tr>
              )}
              {clients.map((c, i) => {
                const missing = c.missing_docs?.length ? c.missing_docs : [
                  ...(c.has_rib || c.rib ? [] : ['RIB']),
                  ...(c.has_kbis || c.kbis ? [] : ['Kbis']),
                ]
                return (
                  <tr
                    key={c.code_union + i}
                    className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                    onClick={() => onSelectClient(c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-300/70">{c.code_union}</td>
                    <td className="px-4 py-3 font-semibold text-white max-w-[220px] truncate">{c.nom_client}</td>
                    <td className="px-4 py-3 text-white/50 text-xs max-w-[140px] truncate">{c.groupe || '—'}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{c.ville}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {missing.map(doc => (
                          <span key={doc} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-semibold">{doc}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.drive_link ? (
                        <a
                          href={c.drive_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                          onClick={e => e.stopPropagation()}
                        >
                          Ouvrir <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-white/30" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Annuaire complet ─────────────────────────────────────────── */
function AnnuaireView({ clients, total, loading, search, setSearch, filter, setFilter, onBack, onSelectClient }) {
  const filters = [
    { id: 'tous', label: 'Tous' },
    { id: 'ouverts', label: 'Ouverts' },
    { id: 'fermes', label: 'Fermés' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[180px]">
          <h2 className="text-lg font-bold text-white">Annuaire complet</h2>
          <p className="text-xs text-blue-300/50">
            {clients.length} / {total} adhérents
          </p>
        </div>
        <div className="flex rounded-xl bg-white/10 border border-white/15 p-0.5">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                filter === f.id ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Code, magasin, ville, agent…"
            className="pl-9 pr-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-400/50 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-blue-300/60 gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement…
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Code Union', 'Nom client', 'Groupe', 'Région', 'Agent', 'Ville', 'Statut'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-white/30">
                    Aucun adhérent pour ce filtre.
                  </td>
                </tr>
              )}
              {clients.map((c, i) => {
                const st = c.is_closed ? null : STATUS_STYLE[clientStatus(c)]
                return (
                  <tr
                    key={c.code_union + i}
                    className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                    onClick={() => onSelectClient(c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-300/70">{c.code_union}</td>
                    <td className="px-4 py-3 font-semibold text-white max-w-[220px] truncate">{c.nom_client}</td>
                    <td className="px-4 py-3 text-white/50 text-xs max-w-[140px] truncate">{c.groupe || '—'}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{c.region_commerciale || '—'}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{c.agent_union || '—'}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{c.ville || '—'}</td>
                    <td className="px-4 py-3">
                      {c.is_closed ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-semibold">Fermé</span>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-white/30" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formFromClient(c) {
  return {
    nom_client: c.nom_client || '',
    groupe: c.groupe || 'INDEPENDANT UNION',
    siret: c.siret || '',
    tva: c.tva || '',
    contact_magasin: c.contact_magasin || '',
    contact_responsable_pdv: c.contact_responsable_pdv || '',
    telephone_responsable: c.telephone_responsable || '',
    adresse: c.adresse || '',
    code_postal: c.code_postal || '',
    ville: c.ville || '',
    telephone: c.telephone || '',
    mail: c.mail || '',
    agent_union: c.agent_union || '',
    region_commerciale: c.region_commerciale || '',
    contrat_type: c.contrat_union || '',
    notes: c.notes || c.note_generale || '',
    is_closed: Boolean(c.is_closed),
  }
}

/* ── Client detail ────────────────────────────────────────────── */
function ClientView({ client, clientDetail, suppliers, selectedSuppliers, setSelectedSuppliers, generating, onGenerate, onBack, onClientUpdated, onDeleted }) {
  const [drive, setDrive] = useState(null)
  const [driveLoading, setDriveLoading] = useState(true)
  const [driveError, setDriveError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [form, setForm] = useState(() => formFromClient(client))
  const [photoFiles, setPhotoFiles] = useState({})

  useEffect(() => {
    setForm(formFromClient(client))
    setPhotoFiles({})
    setEditing(false)
  }, [client.code_union])

  const inspectDrive = async () => {
    if (!client?.code_union) return
    setDriveLoading(true)
    setDriveError(null)
    try {
      const data = await nathalieInspectDrive(client.code_union)
      setDrive(data)
      if (data?.error && !data.folder_found) setDriveError(data.error)
    } catch (e) {
      setDriveError(e?.response?.data?.detail || 'Impossible de lire le Drive.')
    } finally {
      setDriveLoading(false)
    }
  }

  useEffect(() => { inspectDrive() }, [client.code_union])
  const toggleSupplier = (name) => {
    setSelectedSuppliers(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    )
  }

  // Fournisseurs connus + ceux de CONTACT FOURNISSEURS
  const allSupplierNames = [
    ...new Set([
      ...KNOWN_SUPPLIERS,
      ...suppliers.map(s => s.entreprise?.toUpperCase()).filter(Boolean),
    ])
  ]

  const docsFields = [
    { key: 'rib', label: 'RIB', icon: <FileCheck className="w-4 h-4" /> },
    { key: 'kbis', label: 'Kbis', icon: <FileCheck className="w-4 h-4" /> },
    { key: 'piece_identite', label: "Pièce d'identité", icon: <FileCheck className="w-4 h-4" /> },
  ]

  const createdLabel = formatCompteDate(client.date_creation_compte)

  const saveFiche = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'is_closed') formData.append(k, v ? 'true' : 'false')
        else formData.append(k, v ?? '')
      })
      PHOTO_SLOTS.forEach(({ key }) => {
        if (photoFiles[key]) formData.append(key, photoFiles[key])
      })
      const res = await nathalieUpdateClient(client.code_union, formData)
      if (res.client && onClientUpdated) onClientUpdated(res.client)
      setEditing(false)
      setPhotoFiles({})
      const n = Object.values(res.reassigned || {}).reduce((a, b) => a + b, 0)
      let msg = res.agent_changed
        ? `Fiche enregistrée. CA et analyses réaffectés à ${res.client?.agent_union || 'l’agent'} (${n} lignes).`
        : 'Fiche enregistrée.'
      if (res.sheet_warning) {
        msg += ` Copie Liste Client 2 : ${res.sheet_warning}`
      }
      setSaveMsg(msg)
      inspectDrive()
    } catch (e) {
      setSaveMsg(e?.response?.data?.detail || e.message || 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  const deleteFiche = async () => {
    const ok = window.confirm(
      `Supprimer définitivement ${client.nom_client} (${client.code_union}) ?\n\nLa fiche disparaît de l’annuaire et le dossier Drive va à la corbeille. Le CA / les analyses Pure Data ne sont pas effacés.`
    )
    if (!ok) return
    setDeleting(true)
    setSaveMsg(null)
    try {
      await nathalieDeleteClient(client.code_union)
      if (onDeleted) onDeleted()
    } catch (e) {
      setSaveMsg(e?.response?.data?.detail || e.message || 'Suppression impossible.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white">{client.nom_client}</h2>
          <p className="text-blue-300/50 text-xs font-mono">
            {client.code_union}
            {createdLabel ? ` · Compte créé le ${createdLabel}` : ''}
          </p>
        </div>
        {client.is_closed ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-semibold">Fermé</span>
        ) : null}
        {!editing ? (
          <>
            <button type="button" onClick={() => { setForm(formFromClient(client)); setEditing(true); setSaveMsg(null) }} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white/80 hover:bg-white/15">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
            <button type="button" onClick={deleteFiche} disabled={deleting} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 disabled:opacity-50">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Supprimer
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditing(false); setForm(formFromClient(client)); setPhotoFiles({}) }} className="text-xs px-3 py-2 rounded-xl bg-white/10 text-white/70">Annuler</button>
            <button type="button" onClick={saveFiche} disabled={saving} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Enregistrer
            </button>
          </div>
        )}
      </div>
      {saveMsg && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">{saveMsg}</div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Infos client */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" /> Informations
          </h3>
          {editing ? (
            <div className="space-y-3 text-sm">
              <input value={form.nom_client} onChange={e => setForm({ ...form, nom_client: e.target.value })} className="input-field" placeholder="Raison sociale" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.groupe} onChange={e => setForm({ ...form, groupe: e.target.value })} className="input-field">
                  {GROUPES.map(g => <option key={g} value={g} className="text-black">{g}</option>)}
                </select>
                <select value={form.agent_union} onChange={e => setForm({ ...form, agent_union: e.target.value })} className="input-field">
                  <option value="" className="text-black">Agent Union…</option>
                  {AGENTS_UNION.map(a => <option key={a} value={a} className="text-black">{a}</option>)}
                </select>
              </div>
              <input value={form.region_commerciale} onChange={e => setForm({ ...form, region_commerciale: e.target.value })} className="input-field" placeholder="Région commerciale" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.siret} onChange={e => setForm({ ...form, siret: e.target.value })} className="input-field" placeholder="SIRET" />
                <input value={form.tva} onChange={e => setForm({ ...form, tva: e.target.value })} className="input-field" placeholder="TVA" />
              </div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/70 pt-1">Gérant</p>
              <input value={form.contact_magasin} onChange={e => setForm({ ...form, contact_magasin: e.target.value })} className="input-field" placeholder="Nom du gérant" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} className="input-field" placeholder="Tél. gérant" />
                <input value={form.mail} onChange={e => setForm({ ...form, mail: e.target.value })} className="input-field" placeholder="Email gérant" />
              </div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/70 pt-1">Responsable magasin</p>
              <input value={form.contact_responsable_pdv} onChange={e => setForm({ ...form, contact_responsable_pdv: e.target.value })} className="input-field" placeholder="Nom du responsable" />
              <input value={form.telephone_responsable} onChange={e => setForm({ ...form, telephone_responsable: e.target.value })} className="input-field" placeholder="Tél. responsable magasin" />
              <input value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} className="input-field" placeholder="Adresse" />
              <div className="grid grid-cols-3 gap-2">
                <input value={form.code_postal} onChange={e => setForm({ ...form, code_postal: e.target.value })} className="input-field" placeholder="CP" />
                <input value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} className="input-field col-span-2" placeholder="Ville" />
              </div>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[72px]" placeholder="Notes" />
              <label className="flex items-center gap-2 text-white/70 text-xs">
                <input type="checkbox" checked={form.is_closed} onChange={e => setForm({ ...form, is_closed: e.target.checked })} />
                Magasin fermé
              </label>
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/70 pt-1">Photos magasin</p>
              <div className="grid grid-cols-1 gap-2">
                {PHOTO_SLOTS.map(({ key, label, urlKey }) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-white/60">{label}</span>
                    <div className="flex items-center gap-2">
                      {client[urlKey] && (
                        <a href={client[urlKey]} target="_blank" rel="noreferrer" className="text-emerald-400">Voir</a>
                      )}
                      <input type="file" accept="image/*" className="text-[10px] text-white/50 w-36" onChange={e => setPhotoFiles(f => ({ ...f, [key]: e.target.files?.[0] }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                {[
                  ['SIRET', client.siret],
                  ['TVA', client.tva],
                  ['Raison sociale', client.raison_sociale],
                  ['État INSEE', client.etat_insee],
                  ['Périmètre', client.perimetre],
                  ['Région', client.region_commerciale],
                  ['Gérant', client.contact_magasin],
                  ['Tél. gérant', client.telephone],
                  ['Email gérant', client.mail],
                  ['Responsable magasin', client.contact_responsable_pdv],
                  ['Tél. responsable', client.telephone_responsable],
                  ['Achat / Appro', client.contact_appro],
                  ['Adresse', [client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ')],
                  ['Agent Union', client.agent_union],
                  ['Groupe', client.groupe],
                  ['Compte créé le', createdLabel],
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex justify-between">
                    <span className="text-blue-300/50">{label}</span>
                    <span className="text-white/80 text-right max-w-[60%] break-words">{value}</span>
                  </div>
                ) : null)}
              </div>
              {client.note_generale && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                  📝 {client.note_generale}
                </div>
              )}
            </>
          )}
        </div>

        {/* Documents */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" /> Documents Drive
            </h3>
            <button
              type="button"
              onClick={inspectDrive}
              disabled={driveLoading}
              className="text-xs text-emerald-300/80 hover:text-emerald-200 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${driveLoading ? 'animate-spin' : ''}`} />
              Vérifier
            </button>
          </div>

          {driveLoading && !drive ? (
            <div className="flex items-center gap-2 text-sm text-blue-300/60 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Lecture du dossier Drive…
            </div>
          ) : (
            <>
              <div className={`rounded-xl px-3 py-2 text-xs ${
                drive?.folder_found
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              }`}>
                {drive?.folder_found ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>Dossier trouvé : {drive.folder_name}</span>
                    {drive.drive_link && (
                      <a href={drive.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 shrink-0">
                        Ouvrir <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <span>{driveError || 'Aucun dossier Drive pour ce code Union.'}</span>
                )}
              </div>

              <div className="space-y-2">
                {docsFields.map(({ key, label, icon }) => {
                  const fromDrive = drive?.[key]
                  const fromDb = client[key]
                  const present = Boolean(fromDrive || fromDb)
                  const link = fromDrive?.link || (typeof fromDb === 'string' && fromDb.startsWith('http') ? fromDb : null)
                  const fileName = fromDrive?.name
                  return (
                    <div key={key} className={`flex items-center justify-between p-3 rounded-xl ${present ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={present ? 'text-emerald-400' : 'text-red-400'}>{icon}</span>
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${present ? 'text-emerald-300' : 'text-red-300'}`}>{label}</div>
                          {fileName && <div className="text-[11px] text-white/40 truncate">{fileName}</div>}
                        </div>
                      </div>
                      {present ? (
                        link ? (
                          <a href={link} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink className="w-3 h-3" /> Voir
                          </a>
                        ) : (
                          <span className="text-xs text-emerald-400">✓ Présent</span>
                        )
                      ) : (
                        <span className="text-xs text-red-400">Manquant</span>
                      )}
                    </div>
                  )
                })}
                {PHOTO_SLOTS.map(({ key, label, urlKey }) => {
                  const fromDrive = drive?.[key]
                  const fromDb = client[urlKey]
                  const present = Boolean(fromDrive || fromDb)
                  const link = fromDrive?.link || (typeof fromDb === 'string' && fromDb.startsWith('http') ? fromDb : null)
                  return (
                    <div key={key} className={`flex items-center justify-between p-3 rounded-xl ${present ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 border border-white/10'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Camera className={`w-4 h-4 ${present ? 'text-emerald-400' : 'text-white/30'}`} />
                        <div className={`text-sm font-medium ${present ? 'text-emerald-300' : 'text-white/40'}`}>{label}</div>
                      </div>
                      {present && link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-400">
                          <ExternalLink className="w-3 h-3" /> Voir
                        </a>
                      ) : (
                        <span className="text-xs text-white/25">—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sélection fournisseurs */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-400" />
          Fournisseurs à contacter
          {client.ouverture_chez && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full ml-2">
              Suggéré : {client.ouverture_chez}
            </span>
          )}
        </h3>
        <div className="flex gap-2 flex-wrap">
          {allSupplierNames.map(name => (
            <button
              key={name}
              onClick={() => toggleSupplier(name)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                selectedSuppliers.includes(name)
                  ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300'
                  : 'bg-white/5 border-white/15 text-white/50 hover:bg-white/10 hover:text-white/80'
              }`}
            >
              {selectedSuppliers.includes(name) && <span className="mr-1">✓</span>}
              {name}
            </button>
          ))}
        </div>

        <button
          onClick={onGenerate}
          disabled={!selectedSuppliers.length || generating}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 w-full md:w-auto justify-center"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating
            ? 'Génération en cours…'
            : `Générer ${selectedSuppliers.length} email${selectedSuppliers.length > 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Tâches existantes */}
      {clientDetail?.tasks?.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Tâches associées ({clientDetail.tasks.length})
          </h3>
          {clientDetail.tasks.slice(0, 5).map(t => (
            <div key={t.id_tache} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
              <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                t.statut === 'terminé' ? 'bg-emerald-400' : t.statut === 'en cours' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm font-medium truncate">{t.description}</p>
                <p className="text-blue-300/40 text-xs">{t.date_echeance} — {t.assigne_a}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                t.terminee ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>{t.terminee ? 'Terminé' : t.statut}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Emails générés ───────────────────────────────────────────── */
function EmailsView({ emails, client, onBack }) {
  const [copied, setCopied] = useState(null)
  const [expanded, setExpanded] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  const copyToClipboard = async (text, idx) => {
    await navigator.clipboard.writeText(text)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleSendEmails = async () => {
    const supplierNames = emails.map(e => e.fournisseur).filter(Boolean)
    if (!supplierNames.length || !client?.code_union) return
    setSending(true)
    setSendResult(null)
    try {
      const data = await nathalieSendEmails(client.code_union, supplierNames)
      setSendResult(data)
    } catch (e) {
      setSendResult({
        sent: 0,
        total: supplierNames.length,
        results: supplierNames.map(f => ({ fournisseur: f, success: false, error: e?.response?.data?.detail || e.message })),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h2 className="text-lg font-bold text-white">Emails générés — {client.nom_client}</h2>
          <p className="text-blue-300/50 text-xs">{emails.length} email{emails.length > 1 ? 's' : ''} prêt{emails.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-3 bg-emerald-500/10 border border-emerald-500/20">
        <Send className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <p className="text-emerald-300 text-sm flex-1">
          Les pièces jointes (RIB, Kbis, pièce d'identité) sont incluses. Envoi via Gmail depuis le compte Groupement Union.
        </p>
        <button
          onClick={handleSendEmails}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Envoi en cours…' : `Envoyer les ${emails.length} email${emails.length > 1 ? 's' : ''}`}
        </button>
      </div>

      {sendResult && (
        <div className={`glass-card p-4 ${sendResult.sent === sendResult.total ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'} border`}>
          <p className="font-semibold text-white mb-2">
            {sendResult.sent === sendResult.total
              ? `✓ ${sendResult.sent} email${sendResult.sent > 1 ? 's' : ''} envoyé${sendResult.sent > 1 ? 's' : ''}`
              : `${sendResult.sent} / ${sendResult.total} envoyé${sendResult.total > 1 ? 's' : ''}`}
          </p>
          {sendResult.results?.some(r => !r.success) && (
            <ul className="text-sm text-amber-300 space-y-1">
              {sendResult.results.filter(r => !r.success).map((r, i) => (
                <li key={i}><strong>{r.fournisseur}</strong> : {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {emails.map((email, i) => (
        <div key={i} className="glass-card overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition"
            onClick={() => setExpanded(expanded === i ? -1 : i)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
                {i + 1}
              </div>
              <div>
                <p className="font-bold text-white text-sm">{email.fournisseur}</p>
                <p className="text-blue-300/50 text-xs">{email.destinataire || 'Email à compléter'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); copyToClipboard(email.corps, i) }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
              >
                {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === i ? 'Copié !' : 'Copier'}
              </button>
              {email.destinataire && (
                <a
                  href={`mailto:${email.destinataire}?subject=${encodeURIComponent(email.sujet)}&body=${encodeURIComponent(email.corps)}`}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Ouvrir dans Mail
                </a>
              )}
            </div>
          </div>

          {expanded === i && (
            <div className="border-t border-white/10 px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-300/50 text-xs">Destinataire</span>
                  <p className="text-white font-medium">{email.destinataire || '—'}</p>
                </div>
                <div>
                  <span className="text-blue-300/50 text-xs">Sujet</span>
                  <p className="text-white font-medium">{email.sujet}</p>
                </div>
              </div>
              <div>
                <span className="text-blue-300/50 text-xs mb-2 block">Corps de l'email</span>
                <pre className="bg-white/5 rounded-xl p-4 text-white/80 text-xs whitespace-pre-wrap font-sans leading-relaxed border border-white/10">
                  {email.corps}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
