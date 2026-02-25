import { useState, useEffect } from 'react'
import {
  UserPlus, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Building2, Phone, Mail, MapPin, FileText, Send, ArrowLeft,
  Sparkles, Search, RefreshCw, Loader2, Eye, X, Copy, Check,
  FileCheck, FileMinus, ExternalLink, UploadCloud,
} from 'lucide-react'
import {
  nathalieGetClients,
  nathalieGetSuppliers,
  nathalieGenerateEmails,
  nathalieGetClientDetail,
  nathalieCreateClient,
  nathalieSendEmails,
} from '../api/client'

/* ── Fournisseurs connus (pour les cases à cocher) ─────────── */
const KNOWN_SUPPLIERS = ['ACR', 'ALLIANCE', 'DCA', 'EXADIS', 'PURFLUX']

/* ── Groupes (pour le routage Drive) ───────────────────────── */
const GROUPES = [
  'INDEPENDANT',
  'GROUPE JUMBO',
  'GROUPE EMERIC',
  'GROUPE APA MARSEILLE',
  'GROUPE AUTO MOURAD',
  'GROUPE DISCOUNT',
  'GROUPE LES LYONNAIS',
  'GROUPE STARCOM',
]

const STATUS_STYLE = {
  'docs_ok':      { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Docs complets' },
  'docs_partial': { bg: 'bg-amber-500/20',   text: 'text-amber-300',   label: 'Docs incomplets' },
  'no_ouverture': { bg: 'bg-slate-500/20',   text: 'text-slate-400',   label: 'Sans fournisseur' },
}

function clientStatus(client) {
  if (!client.ouverture_chez) return 'no_ouverture'
  return client.docs_complets ? 'docs_ok' : 'docs_partial'
}

/* ═══════════════════════════════════════════════════════════════ */
export default function NathaliePage() {
  const [view, setView] = useState('accueil') // accueil | nouveau | dossiers | client | emails
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

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, s] = await Promise.all([
        nathalieGetClients(false),
        nathalieGetSuppliers(),
      ])
      setClients(c.clients || [])
      setSuppliers(s.suppliers || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de charger les données depuis Google Sheets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openClient = async (client) => {
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
      c.ouverture_chez?.toLowerCase().includes(s)
    )
  })

  const stats = {
    total: clients.length,
    avecFournisseur: clients.filter(c => c.ouverture_chez).length,
    docsOk: clients.filter(c => c.ouverture_chez && c.docs_complets).length,
    docsKo: clients.filter(c => c.ouverture_chez && !c.docs_complets).length,
  }

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
          onVoirDossiers={() => setView('dossiers')}
          onNouveau={() => setView('nouveau')}
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
          clients={filteredClients}
          loading={loading}
          search={search}
          setSearch={setSearch}
          onBack={() => setView('accueil')}
          onSelectClient={openClient}
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
          onBack={() => setView('dossiers')}
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
              <span className="text-white/80 text-xs font-medium">Google Sheets connecté</span>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="glass-btn-icon"
            title="Actualiser depuis Sheets"
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
function AccueilView({ stats, loading, onVoirDossiers, onNouveau }) {
  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Adhérents total', value: stats.total, color: 'text-blue-300', icon: '👥' },
          { label: 'À ouvrir', value: stats.avecFournisseur, color: 'text-amber-300', icon: '📋' },
          { label: 'Docs complets', value: stats.docsOk, color: 'text-emerald-300', icon: '✅' },
          { label: 'Docs manquants', value: stats.docsKo, color: 'text-red-300', icon: '⚠️' },
        ].map(k => (
          <div key={k.label} className="glass-card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-300/50 font-medium">{k.label}</span>
              <span className="text-lg">{k.icon}</span>
            </div>
            <div className={`text-2xl font-black ${k.color}`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Nouveau Dossier */}
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
            Créer un adhérent : formulaire guidé, upload de pièces, création automatique du dossier Drive et ligne Sheet.
          </p>
        </button>

        {/* Liste Dossiers */}
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
            Suivre les dossiers, voir les statuts documents, générer les emails fournisseurs.
          </p>
        </button>
      </div>
    </div>
  )
}

/* ── Nouveau Dossier ───────────────────────────────────────────── */
function NouveauDossierView({ onBack, onSuccess, onPrepareEmails }) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  
  const [form, setForm] = useState({
    nom_client: '',
    groupe: 'INDEPENDANT',
    siret: '',
    adresse: '',
    code_postal: '',
    ville: '',
    telephone: '',
    mail: '',
    agent_union: '',
    contrat_type: '',
    notes: '',
  })
  
  const [files, setFiles] = useState({
    rib: null,
    kbis: null,
    piece_identite: null,
  })

  const handleFileChange = (key, e) => {
    if (e.target.files?.[0]) {
      setFiles(f => ({ ...f, [key]: e.target.files[0] }))
    }
  }

  const handleSubmit = async () => {
    if (!form.nom_client) return
    setSubmitted(true)
    
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v))
      if (files.rib) formData.append('rib', files.rib)
      if (files.kbis) formData.append('kbis', files.kbis)
      if (files.piece_identite) formData.append('piece_identite', files.piece_identite)
      
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
          <div className="flex justify-between items-center">
            <span className="text-blue-300/50 text-sm">Dossier Drive</span>
            <a href={result.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
              Ouvrir <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-blue-300/50 text-sm">Ligne Sheet</span>
            <span className="text-white/60 text-sm">Ajoutée ✓</span>
          </div>
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
          <p className="text-blue-300/60 mt-2">Nathalie crée le dossier Drive, uploade les fichiers et met à jour le Sheet.</p>
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
            <label className="label-field">SIRET</label>
            <input value={form.siret} onChange={e => setForm({...form, siret: e.target.value})} className="input-field" placeholder="14 chiffres" />
          </div>
        </div>

        {/* Contact */}
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="label-field">Email contact</label>
            <input type="email" value={form.mail} onChange={e => setForm({...form, mail: e.target.value})} className="input-field" placeholder="contact@garage.fr" />
          </div>
          <div>
            <label className="label-field">Téléphone</label>
            <input type="tel" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} className="input-field" placeholder="06 12 34 56 78" />
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

        <div className="pt-6">
          <button
            onClick={handleSubmit}
            disabled={!form.nom_client}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-lg shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            Créer le dossier complet
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Dossiers ─────────────────────────────────────────────────── */
function DossiersView({ clients, loading, search, setSearch, onBack, onSelectClient }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-bold text-white flex-1">Dossiers adhérents</h2>
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

      {loading ? (
        <div className="flex items-center justify-center py-20 text-blue-300/60 gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement depuis Google Sheets…
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Code Union', 'Nom client', 'Ville', 'Ouverture chez', 'Docs', 'Agent'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-blue-300/50 font-semibold text-xs uppercase tracking-wider">{h}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-white/30">Aucun résultat</td></tr>
              )}
              {clients.map((c, i) => {
                const st = STATUS_STYLE[clientStatus(c)]
                return (
                  <tr
                    key={c.code_union + i}
                    className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                    onClick={() => onSelectClient(c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-300/70">{c.code_union}</td>
                    <td className="px-4 py-3 font-semibold text-white max-w-[180px] truncate">{c.nom_client}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{c.ville}</td>
                    <td className="px-4 py-3">
                      {c.ouverture_chez ? (
                        <div className="flex gap-1 flex-wrap">
                          {c.ouverture_chez.split(/[,;/\s]+/).filter(Boolean).map(s => (
                            <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">{s.trim()}</span>
                          ))}
                        </div>
                      ) : <span className="text-white/20 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">{c.agent_union}</td>
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

/* ── Client detail ────────────────────────────────────────────── */
function ClientView({ client, clientDetail, suppliers, selectedSuppliers, setSelectedSuppliers, generating, onGenerate, onBack }) {
  const toggleSupplier = (name) => {
    setSelectedSuppliers(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    )
  }

  // Liste des fournisseurs disponibles (connus + ceux dans le Sheet)
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="glass-btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h2 className="text-lg font-bold text-white">{client.nom_client}</h2>
          <p className="text-blue-300/50 text-xs font-mono">{client.code_union}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Infos client */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" /> Informations
          </h3>
          <div className="space-y-2 text-sm">
            {[
              ['SIRET', client.siret],
              ['Adresse', [client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ')],
              ['Téléphone', client.telephone],
              ['Email', client.mail],
              ['Agent Union', client.agent_union],
              ['Groupe', client.groupe],
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
        </div>

        {/* Documents */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" /> Documents
          </h3>
          <div className="space-y-2">
            {docsFields.map(({ key, label, icon }) => {
              const val = client[key]
              return (
                <div key={key} className={`flex items-center justify-between p-3 rounded-xl ${val ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="flex items-center gap-2">
                    <span className={val ? 'text-emerald-400' : 'text-red-400'}>{icon}</span>
                    <span className={`text-sm font-medium ${val ? 'text-emerald-300' : 'text-red-300'}`}>{label}</span>
                  </div>
                  {val ? (
                    val.startsWith('http') ? (
                      <a href={val} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
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
          </div>
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
