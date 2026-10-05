import { useState, useEffect } from 'react'
import { Link2, Plus, Search, User, Users, Trash2, FileText, X } from 'lucide-react'
import { getAssignments, createAssignment, deleteAssignment, getContracts, getEntities, getRfaFusions, createRfaFusion, updateRfaFusion, deleteRfaFusion, nathalieGetClients } from '../api/client'

function AssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [contracts, setContracts] = useState([])
  const [availableEntities, setAvailableEntities] = useState({ codeUnion: [], groups: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('code_union')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [fusions, setFusions] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [assignmentsData, contractsData, fusionsData] = await Promise.all([
        getAssignments(),
        getContracts(),
        getRfaFusions().catch(() => [])
      ])
      setAssignments(assignmentsData)
      setContracts(contractsData.filter(c => c.is_active))
      setFusions(fusionsData || [])
      setError(null)

      const lastImportId = localStorage.getItem('lastImportId')
      if (lastImportId) {
        try {
          const [clients, groups] = await Promise.all([
            getEntities(lastImportId, 'client').catch(() => []),
            getEntities(lastImportId, 'group').catch(() => [])
          ])
          setAvailableEntities({
            codeUnion: clients || [],
            groups: groups || []
          })
        } catch (e) {
          console.log('Pas d\'import disponible pour les suggestions')
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (assignmentData) => {
    try {
      await createAssignment(assignmentData)
      setShowCreateForm(false)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la crÃ©ation')
      throw err
    }
  }

  const handleDelete = async (assignmentId, targetValue) => {
    if (!window.confirm(`Supprimer l'affectation pour "${targetValue}" ?`)) {
      return
    }
    try {
      await deleteAssignment(assignmentId)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const codeUnionAssignments = assignments.filter(a => a.target_type === 'CODE_UNION')
  const groupeAssignments = assignments.filter(a => a.target_type === 'GROUPE_CLIENT')

  const stats = {
    total: assignments.length,
    codeUnion: codeUnionAssignments.length,
    groupe: groupeAssignments.length,
    contracts: new Set(assignments.map(a => a.contract_id)).size
  }

  const filteredAssignments = (activeTab === 'code_union' ? codeUnionAssignments : groupeAssignments)
    .filter(a => {
      if (!searchTerm) return true
      const search = searchTerm.toLowerCase()
      return a.target_value.toLowerCase().includes(search)
    })

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-glass-secondary">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow-purple">
            <Link2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Affectations de Contrats
            </h1>
            <p className="text-sm text-glass-secondary mt-1">
              GÃ©rez les contrats assignÃ©s aux Code Union et Groupes Client
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="glass-btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle affectation</span>
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

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total" value={stats.total} icon={<FileText className="w-6 h-6" />} color="blue" />
        <StatCard title="Code Union" value={stats.codeUnion} icon={<User className="w-6 h-6" />} color="emerald" subtitle="PrioritÃ© 100" />
        <StatCard title="Groupes" value={stats.groupe} icon={<Users className="w-6 h-6" />} color="purple" subtitle="PrioritÃ© 50" />
        <StatCard title="Contrats utilisÃ©s" value={stats.contracts} icon={<FileText className="w-6 h-6" />} color="orange" />
      </div>

      <FusionPanel
        fusions={fusions}
        contracts={contracts}
        onChanged={loadData}
        onError={setError}
      />

      {showCreateForm && (
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Nouvelle affectation</h2>
            <button
              onClick={() => setShowCreateForm(false)}
              className="glass-btn-icon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <AssignmentCreateForm
            contracts={contracts}
            availableEntities={availableEntities}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex glass-card overflow-hidden">
        <button
          onClick={() => setActiveTab('code_union')}
          className={`flex-1 px-6 py-4 font-medium transition-all flex items-center justify-center gap-2 ${
            activeTab === 'code_union'
              ? 'bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-400'
              : 'text-glass-secondary hover:text-white hover:bg-white/5'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Code Union</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            activeTab === 'code_union' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-glass-muted'
          }`}>
            {codeUnionAssignments.length}
          </span>
          <span className="text-xs text-glass-muted">(PrioritÃ© 100)</span>
        </button>
        <button
          onClick={() => setActiveTab('groupe')}
          className={`flex-1 px-6 py-4 font-medium transition-all flex items-center justify-center gap-2 ${
            activeTab === 'groupe'
              ? 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-400'
              : 'text-glass-secondary hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Groupe Client</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            activeTab === 'groupe' ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-glass-muted'
          }`}>
            {groupeAssignments.length}
          </span>
          <span className="text-xs text-glass-muted">(PrioritÃ© 50)</span>
        </button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-glass-muted" />
        <input
          type="text"
          placeholder={`Rechercher un ${activeTab === 'code_union' ? 'Code Union' : 'Groupe Client'}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="glass-input pl-12"
        />
      </div>

      {/* Liste des affectations en cartes */}
      {filteredAssignments.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
            <FileText className="w-8 h-8 text-glass-muted" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Aucune affectation {activeTab === 'code_union' ? 'Code Union' : 'Groupe Client'}
          </h3>
          <p className="text-glass-secondary mb-6">
            {searchTerm ? 'Aucun rÃ©sultat pour votre recherche' : 'CrÃ©ez votre premiÃ¨re affectation pour commencer'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="glass-btn-primary"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              CrÃ©er une affectation
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => {
            const contract = contracts.find(c => c.id === assignment.contract_id)
            return (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                contract={contract}
                type={activeTab === 'code_union' ? 'code_union' : 'groupe'}
                onDelete={handleDelete}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color, subtitle }) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-indigo-500/20 border-blue-400/30 text-blue-400',
    emerald: 'from-emerald-500/20 to-teal-500/20 border-emerald-400/30 text-emerald-400',
    purple: 'from-purple-500/20 to-violet-500/20 border-purple-400/30 text-purple-400',
    orange: 'from-orange-500/20 to-amber-500/20 border-orange-400/30 text-orange-400'
  }

  return (
    <div className={`glass-card p-5 bg-gradient-to-br ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-glass-secondary">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-glass-muted mt-1">{subtitle}</p>
          )}
        </div>
        <div className="opacity-50">{icon}</div>
      </div>
    </div>
  )
}

function AssignmentCard({ assignment, contract, type, onDelete }) {
  const isCodeUnion = type === 'code_union'
  const colorClasses = isCodeUnion
    ? 'border-l-emerald-500 bg-gradient-to-r from-emerald-500/5 to-transparent'
    : 'border-l-purple-500 bg-gradient-to-r from-purple-500/5 to-transparent'

  return (
    <div className={`glass-card p-5 border-l-4 ${colorClasses} hover:scale-[1.02] transition-transform`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isCodeUnion ? <User className="w-5 h-5 text-emerald-400" /> : <Users className="w-5 h-5 text-purple-400" />}
            <h3 className="text-lg font-semibold text-white">{assignment.target_value}</h3>
          </div>
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            isCodeUnion ? 'glass-badge-emerald' : 'glass-badge-purple'
          }`}>
            PrioritÃ© {assignment.priority}
          </div>
        </div>
        <button
          onClick={() => onDelete(assignment.id, assignment.target_value)}
          className="glass-btn-icon text-red-400 hover:text-red-300"
          title="Supprimer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-xs text-glass-muted mb-1">Contrat assignÃ©</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{contract?.name || 'Contrat introuvable'}</span>
              {contract?.is_default && (
                <span className="glass-badge-blue text-xs">DÃ©faut</span>
              )}
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${
            contract?.is_active ? 'bg-emerald-500' : 'bg-white/30'
          }`} title={contract?.is_active ? 'Actif' : 'Inactif'} />
        </div>
      </div>
    </div>
  )
}

function AssignmentCreateForm({ contracts, availableEntities, onSubmit, onCancel }) {
  const [targetType, setTargetType] = useState('CODE_UNION')
  const [targetValue, setTargetValue] = useState('')
  const [contractId, setContractId] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = targetType === 'CODE_UNION'
    ? availableEntities.codeUnion.filter(e =>
        targetValue && e.id.toLowerCase().includes(targetValue.toLowerCase())
      ).slice(0, 5)
    : availableEntities.groups.filter(e =>
        targetValue && e.label.toLowerCase().includes(targetValue.toLowerCase())
      ).slice(0, 5)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!contractId) {
      alert('Veuillez sÃ©lectionner un contrat')
      return
    }
    onSubmit({
      target_type: targetType,
      target_value: targetValue.trim(),
      contract_id: parseInt(contractId)
    })
    setTargetValue('')
    setContractId('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          Type d'affectation *
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTargetType('CODE_UNION')
              setTargetValue('')
            }}
            className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
              targetType === 'CODE_UNION'
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : 'border-white/20 bg-white/5 text-glass-secondary hover:border-white/30'
            }`}
          >
            <User className="w-4 h-4" />
            <span className="font-medium">Code Union</span>
            <span className="text-xs glass-badge-emerald">PrioritÃ© 100</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetType('GROUPE_CLIENT')
              setTargetValue('')
            }}
            className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
              targetType === 'GROUPE_CLIENT'
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-white/20 bg-white/5 text-glass-secondary hover:border-white/30'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="font-medium">Groupe Client</span>
            <span className="text-xs glass-badge-purple">PrioritÃ© 50</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          {targetType === 'CODE_UNION' ? 'Code Union ou Raison Sociale' : 'Groupe Client'} *
        </label>
        <input
          type="text"
          value={targetValue}
          onChange={(e) => {
            setTargetValue(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          required
          placeholder={targetType === 'CODE_UNION'
            ? 'Tapez un Code Union (ex: M0022) ou une raison sociale...'
            : 'Ex: GROUPE APA MARSEILLE'}
          className="glass-input"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 glass-dropdown max-h-64 overflow-y-auto">
            {suggestions.map((entity) => {
              const displayValue = targetType === 'CODE_UNION' ? entity.id : entity.label
              const secondaryText = targetType === 'CODE_UNION' && entity.label ? entity.label : null

              return (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => {
                    setTargetValue(displayValue)
                    setShowSuggestions(false)
                  }}
                  className="glass-dropdown-item w-full text-left"
                >
                  <div className="font-medium">{displayValue}</div>
                  {secondaryText && (
                    <div className="text-sm text-glass-muted mt-1">{secondaryText}</div>
                  )}
                  {targetType === 'CODE_UNION' && entity.groupe_client && (
                    <div className="text-xs text-glass-muted mt-1">
                      Groupe: {entity.groupe_client}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {targetType === 'CODE_UNION' && availableEntities.codeUnion.length > 0 && (
          <p className="text-xs text-glass-muted mt-1">
            {availableEntities.codeUnion.length} Code Union disponible(s) depuis le dernier import
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-glass-secondary mb-2">
          Contrat *
        </label>
        <select
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          required
          className="glass-select"
        >
          <option value="">SÃ©lectionner un contrat</option>
          {contracts.filter(c => c.is_active && (c.scope === 'ADHERENT' || !c.scope)).map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.name} {contract.is_default && '(DÃ©faut)'}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
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
          CrÃ©er l'affectation
        </button>
      </div>
    </form>
  )
}

function FusionPanel({ fusions, contracts, onChanged, onError }) {
  const [label, setLabel] = useState('')
  const [labelTouched, setLabelTouched] = useState(false)
  const [selected, setSelected] = useState([])
  const [contractId, setContractId] = useState('')
  const [query, setQuery] = useState('')
  const [directory, setDirectory] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    nathalieGetClients()
      .then((data) => setDirectory(data?.clients || []))
      .catch(() => setDirectory([]))
  }, [])

  const byCode = {}
  for (const client of directory) {
    const code = (client.code_union || '').trim().toUpperCase()
    if (code) byCode[code] = client.nom_client || ''
  }

  const suggestLabel = (accounts) => {
    const names = accounts.map((a) => a.name).filter(Boolean)
    if (names.length >= 2 && names[0] === names[1]) return names[0]
    return names.filter(Boolean).join(' + ')
  }

  const addAccount = (account) => {
    const code = (account.code || '').trim().toUpperCase()
    if (!code || selected.some((a) => a.code === code)) return
    const next = [...selected, { code, name: account.name || byCode[code] || '' }]
    setSelected(next)
    if (!labelTouched) setLabel(suggestLabel(next))
    setQuery('')
    setOpen(false)
  }

  const removeAccount = (code) => {
    const next = selected.filter((a) => a.code !== code)
    setSelected(next)
    if (!labelTouched) setLabel(suggestLabel(next))
  }

  const resetForm = () => {
    setLabel('')
    setLabelTouched(false)
    setSelected([])
    setContractId('')
    setQuery('')
    setEditingId(null)
    setOpen(false)
  }

  const startEdit = (fusion) => {
    setEditingId(fusion.id)
    setLabel(fusion.label || '')
    setLabelTouched(true)
    setContractId(String(fusion.contract_id || ''))
    setSelected((fusion.codes || []).map((code) => ({ code, name: byCode[code] || '' })))
    setQuery('')
    setOpen(false)
  }

  const needle = query.trim().toLowerCase()
  const suggestions = needle.length < 1 ? [] : directory
    .filter((client) => {
      const code = (client.code_union || '').trim().toUpperCase()
      if (!code || selected.some((a) => a.code === code)) return false
      const nom = (client.nom_client || '').toLowerCase()
      const ville = (client.ville || '').toLowerCase()
      return code.toLowerCase().includes(needle) || nom.includes(needle) || ville.includes(needle)
    })
    .slice(0, 8)

  const typedCode = query.trim().toUpperCase()
  const canAddTyped = typedCode.length >= 2
    && !selected.some((a) => a.code === typedCode)
    && !suggestions.some((c) => (c.code_union || '').trim().toUpperCase() === typedCode)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (selected.length < 2) {
      onError('Choisissez au moins deux magasins.')
      return
    }
    if (!contractId) {
      onError('Choisissez le contrat de la fusion.')
      return
    }
    const payload = {
      label: label.trim() || suggestLabel(selected),
      contract_id: parseInt(contractId, 10),
      codes: selected.map((a) => a.code),
    }
    setBusy(true)
    try {
      if (editingId) await updateRfaFusion(editingId, payload)
      else await createRfaFusion(payload)
      resetForm()
      onError(null)
      onChanged()
    } catch (err) {
      onError(err.response?.data?.detail || 'Erreur lors de la fusion')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (fusion) => {
    const who = (fusion.codes || []).join(' + ')
    if (!window.confirm(`Supprimer la fusion Â« ${fusion.label} Â» (${who}) ? Chaque compte reprendra son propre calcul.`)) {
      return
    }
    try {
      await deleteRfaFusion(fusion.id)
      if (editingId === fusion.id) resetForm()
      onChanged()
    } catch (err) {
      onError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const changeContract = async (fusion, nextId) => {
    try {
      await updateRfaFusion(fusion.id, { contract_id: parseInt(nextId, 10) })
      onError(null)
      onChanged()
    } catch (err) {
      onError(err.response?.data?.detail || 'Impossible de changer le contrat')
    }
  }

  return (
    <div className="glass-card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Fusion de comptes</h2>
        <p className="text-sm text-glass-secondary mt-1">
          Pour un changement de Kbis : cherchez les magasins, choisissez le contrat. Le chiffre dâ€™affaires est additionnÃ© et la RFA est la mÃªme sur chaque compte.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-4">
        {editingId && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100">
            <span>Modification en cours</span>
            <button type="button" onClick={resetForm} className="text-indigo-200 hover:text-white">Annuler</button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-glass-secondary mb-2">Magasins Ã  additionner</label>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selected.map((account) => (
                <span key={account.code} className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-sm text-white">
                  <span className="font-semibold">{account.code}</span>
                  {account.name && <span className="text-glass-secondary">{account.name}</span>}
                  <button type="button" onClick={() => removeAccount(account.code)} className="text-glass-muted hover:text-white" aria-label={`Retirer ${account.code}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (suggestions[0]) {
                  addAccount({
                    code: suggestions[0].code_union,
                    name: suggestions[0].nom_client || '',
                  })
                } else if (canAddTyped) {
                  addAccount({ code: typedCode, name: byCode[typedCode] || '' })
                }
              }}
              placeholder="Rechercher un magasin, une ville ou un code"
              className="glass-input"
            />
            {open && (suggestions.length > 0 || canAddTyped) && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-slate-900/95 shadow-xl overflow-hidden">
                {suggestions.map((client) => {
                  const code = (client.code_union || '').trim().toUpperCase()
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => addAccount({ code, name: client.nom_client || '' })}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-baseline gap-3"
                    >
                      <span className="text-sm font-semibold text-white shrink-0">{code}</span>
                      <span className="text-sm text-glass-secondary truncate">
                        {client.nom_client || 'Sans nom'}
                        {client.ville ? ` Â· ${client.ville}` : ''}
                      </span>
                    </button>
                  )
                })}
                {canAddTyped && (
                  <button
                    type="button"
                    onClick={() => addAccount({ code: typedCode, name: byCode[typedCode] || '' })}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-indigo-200"
                  >
                    Ajouter le code {typedCode}
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-glass-muted mt-1">Au moins deux comptes. Vous pouvez aussi coller un code qui nâ€™est pas dans lâ€™annuaire.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Nom affichÃ©</label>
            <input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setLabelTouched(true) }}
              placeholder="Repris des noms de magasins"
              className="glass-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Contrat appliquÃ© Ã  la somme</label>
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              required
              className="glass-select"
            >
              <option value="">SÃ©lectionner un contrat</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={busy || selected.length < 2} className="glass-btn-primary">
            {busy ? 'Enregistrementâ€¦' : editingId ? 'Enregistrer la fusion' : 'CrÃ©er la fusion'}
          </button>
        </div>
      </form>

      {fusions.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          {fusions.map((fusion) => (
            <div key={fusion.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{fusion.label}</p>
                  <p className="text-xs text-glass-secondary mt-1">
                    {(fusion.codes || []).map((code) => byCode[code] ? `${code} ${byCode[code]}` : code).join(' + ')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => startEdit(fusion)} className="text-xs text-indigo-200 hover:text-white px-2 py-1">
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(fusion)}
                    className="glass-btn-icon text-red-400 hover:text-red-300"
                    title="Supprimer la fusion"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <select
                value={fusion.contract_id || ''}
                onChange={(e) => changeContract(fusion, e.target.value)}
                className="glass-select"
                aria-label={`Contrat de ${fusion.label}`}
              >
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>{contract.name}</option>
                ))}
                {fusion.contract_id && !contracts.some((c) => c.id === fusion.contract_id) && (
                  <option value={fusion.contract_id}>{fusion.contract_name || 'Contrat inactif'}</option>
                )}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AssignmentsPage

