import { useState, useEffect, useRef } from 'react'
import { FileText, Plus, Copy, Star, Power, Trash2, Pencil, Upload, Loader2, X } from 'lucide-react'
import { getContracts, createContract, duplicateContract, setDefaultContract, toggleActiveContract, deleteContract, importContractJson } from '../api/client'
import ContractEditor from '../components/ContractEditor'

function ContractsPage() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingContract, setEditingContract] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [scopeFilter, setScopeFilter] = useState('ADHERENT')

  useEffect(() => {
    loadContracts()
  }, [])

  const loadContracts = async () => {
    try {
      setLoading(true)
      const data = await getContracts()
      console.log('📋 Contrats reçus:', data)
      console.log('📋 Premier contrat scope:', data[0]?.scope)
      console.log('📋 Filtre actuel:', scopeFilter)
      setContracts(data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement des contrats')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (contractData) => {
    try {
      await createContract(contractData)
      setShowCreateForm(false)
      loadContracts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
      throw err
    }
  }

  const handleDuplicate = async (contractId) => {
    try {
      await duplicateContract(contractId)
      loadContracts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la duplication')
    }
  }

  const handleSetDefault = async (contractId) => {
    try {
      await setDefaultContract(contractId)
      loadContracts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la modification')
    }
  }

  const handleToggleActive = async (contractId) => {
    try {
      await toggleActiveContract(contractId)
      loadContracts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la modification')
    }
  }

  const handleDelete = async (contractId, contractName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le contrat "${contractName}" ?\n\nCette action supprimera également toutes les règles et affectations associées.`)) {
      return
    }

    try {
      await deleteContract(contractId)
      loadContracts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-glass-secondary">Chargement des contrats...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-glow-purple">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Contrats
            </h1>
            <p className="text-sm text-glass-secondary mt-1">Gérez vos contrats et leurs barèmes RFA</p>
          </div>
        </div>
        <div className="flex gap-3">
          <ImportJsonButton onSuccess={loadContracts} />
          <button
            onClick={() => setShowCreateForm(true)}
            className="glass-btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un contrat</span>
          </button>
        </div>
      </div>

      {/* Filtre Scope */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setScopeFilter('ADHERENT')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            scopeFilter === 'ADHERENT' 
              ? 'bg-indigo-600 text-white' 
              : 'glass-card text-glass-secondary hover:text-white'
          }`}
        >
          Contrats Adhérents
        </button>
        <button
          onClick={() => setScopeFilter('UNION')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            scopeFilter === 'UNION' 
              ? 'bg-emerald-600 text-white' 
              : 'glass-card text-glass-secondary hover:text-white'
          }`}
        >
          Contrats Union (DAF)
        </button>
      </div>

      <div className="mb-4 p-3 glass-card border-white/10 rounded-lg text-sm text-glass-secondary">
        <strong className="text-white">À savoir :</strong>
        <ul className="mt-1 list-disc list-inside space-y-0.5">
          <li><strong>Contrats Adhérents</strong> : utilisés pour les adhérents (Espace Client). Définissez un contrat par défaut (étoile) pour ceux sans affectation.</li>
          <li><strong>Contrats Union (DAF)</strong> : utilisés uniquement dans le DAF. Seuls les contrats dont le nom contient &quot;Union&quot; ou &quot;Groupement&quot; sont pris en compte (ex. &quot;ACR Groupement Union&quot;). Un contrat mal affiché ? Éditez-le et changez le <strong>Type</strong> en haut de l’éditeur.</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 p-4 glass-card border-red-500/30 text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-6 glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Nouveau contrat</h2>
          <ContractCreateForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {editingContract && (
        <ContractEditor
          contract={editingContract}
          onClose={() => setEditingContract(null)}
          onSave={loadContracts}
        />
      )}

      <div className="glass-card overflow-hidden">
        <table className="glass-table">
          <thead>
            <tr>
              <th className="text-left">Nom</th>
              <th className="text-left">Type</th>
              <th className="text-left">Description</th>
              <th className="text-center">Défaut</th>
              <th className="text-center">Actif</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contracts.filter(c => c.scope === scopeFilter).length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-glass-secondary">
                  Aucun contrat {scopeFilter === 'ADHERENT' ? 'Adhérent' : 'Union'} trouvé.
                  <br />
                  <small className="text-glass-muted">
                    (Contrats totaux: {contracts.length}, Scope filtre: {scopeFilter})
                  </small>
                </td>
              </tr>
            ) : (
              contracts.filter(c => c.scope === scopeFilter).map((contract) => (
                <tr key={contract.id}>
                  <td className="font-medium">{contract.name}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${contract.scope === 'UNION' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                      {contract.scope === 'UNION' ? 'Union (DAF)' : 'Adhérent'}
                    </span>
                  </td>
                  <td className="text-glass-secondary">{contract.description || '-'}</td>
                  <td className="text-center">
                    {contract.is_default ? (
                      <span className="glass-badge-emerald">Oui</span>
                    ) : (
                      <span className="text-glass-muted">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {contract.is_active ? (
                      <span className="glass-badge-blue">Actif</span>
                    ) : (
                      <span className="glass-badge-gray">Inactif</span>
                    )}
                  </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingContract(contract)}
                      className="glass-btn-icon"
                      title="Éditer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(contract.id)}
                      className="glass-btn-icon"
                      title="Dupliquer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!contract.is_default && (
                      <button
                        onClick={() => handleSetDefault(contract.id)}
                        className="glass-btn-icon text-yellow-400 hover:text-yellow-300"
                        title="Définir par défaut"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(contract.id)}
                      className={`glass-btn-icon ${contract.is_active ? 'text-orange-400 hover:text-orange-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                      title={contract.is_active ? 'Désactiver' : 'Activer'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    {!contract.is_default && (
                      <button
                        onClick={() => handleDelete(contract.id, contract.name)}
                        className="glass-btn-icon text-red-400 hover:text-red-300"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ContractCreateForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState('ADHERENT')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      name,
      description: description || null,
      scope,
      is_default: false,
      is_active: true
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          Nom *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="glass-input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          Type de contrat *
        </label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="glass-input"
        >
          <option value="ADHERENT">Adhérent</option>
          <option value="UNION">Union (DAF)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="glass-input"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="glass-btn-secondary"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="glass-btn-primary"
        >
          Créer
        </button>
      </div>
    </form>
  )
}

function ImportJsonButton({ onSuccess }) {
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.name.endsWith('.json')) {
      setError('Le fichier doit être au format JSON')
      return
    }

    setImporting(true)
    setError(null)

    try {
      const response = await importContractJson(file, 'merge')

      if (response.errors && response.errors.length > 0) {
        setError(`Import terminé avec des erreurs: ${response.errors.join(', ')}`)
      } else {
        alert(`Import réussi: ${response.imported} importés, ${response.updated} mis à jour`)
        onSuccess()
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'import')
      console.error(err)
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
        id="json-import-input"
      />
      <label
        htmlFor="json-import-input"
        className={`glass-btn-success flex items-center gap-2 cursor-pointer ${
          importing ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {importing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Import en cours...</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span>Importer JSON</span>
          </>
        )}
      </label>
      {error && (
        <div className="absolute top-full mt-2 left-0 glass-card p-3 text-sm text-red-300 z-10 whitespace-nowrap border-red-500/30">
          {error}
        </div>
      )}
    </div>
  )
}

export default ContractsPage
