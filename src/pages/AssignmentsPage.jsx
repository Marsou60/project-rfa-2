import { useState, useEffect } from 'react'
import { Link2, Plus, Search, User, Users, Trash2, FileText, X } from 'lucide-react'
import { getAssignments, createAssignment, deleteAssignment, getContracts, getEntities } from '../api/client'

function AssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [contracts, setContracts] = useState([])
  const [availableEntities, setAvailableEntities] = useState({ codeUnion: [], groups: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('code_union')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [assignmentsData, contractsData] = await Promise.all([
        getAssignments(),
        getContracts()
      ])
      setAssignments(assignmentsData)
      setContracts(contractsData.filter(c => c.is_active))
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
      setError(err.response?.data?.detail || 'Erreur lors de la création')
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
              Gérez les contrats assignés aux Code Union et Groupes Client
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
        <StatCard title="Code Union" value={stats.codeUnion} icon={<User className="w-6 h-6" />} color="emerald" subtitle="Priorité 100" />
        <StatCard title="Groupes" value={stats.groupe} icon={<Users className="w-6 h-6" />} color="purple" subtitle="Priorité 50" />
        <StatCard title="Contrats utilisés" value={stats.contracts} icon={<FileText className="w-6 h-6" />} color="orange" />
      </div>

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
          <span className="text-xs text-glass-muted">(Priorité 100)</span>
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
          <span className="text-xs text-glass-muted">(Priorité 50)</span>
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
            {searchTerm ? 'Aucun résultat pour votre recherche' : 'Créez votre première affectation pour commencer'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="glass-btn-primary"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              Créer une affectation
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
            Priorité {assignment.priority}
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
            <p className="text-xs text-glass-muted mb-1">Contrat assigné</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{contract?.name || 'Contrat introuvable'}</span>
              {contract?.is_default && (
                <span className="glass-badge-blue text-xs">Défaut</span>
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
      alert('Veuillez sélectionner un contrat')
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
            <span className="text-xs glass-badge-emerald">Priorité 100</span>
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
            <span className="text-xs glass-badge-purple">Priorité 50</span>
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
          <option value="">Sélectionner un contrat</option>
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.name} {contract.is_default && '(Défaut)'}
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
          Créer l'affectation
        </button>
      </div>
    </form>
  )
}

export default AssignmentsPage
