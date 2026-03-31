import { useState, useEffect } from 'react'
import { User, Users, Search, Check, Clock, RotateCcw, Lock, Unlock, ChevronUp, ChevronDown } from 'lucide-react'
import { getEntities, getEntityDetail, getAssignments, getContracts, createAssignment, deleteAssignment, getCotisations, upsertCotisation, deleteCotisation } from '../api/client'
import EntityDetailDrawer from '../components/EntityDetailDrawer'
import ContractAssignmentModal from '../components/ContractAssignmentModal'

function ClientsPage({ importId }) {
  const [mode, setMode] = useState('client')
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sortBy, setSortBy] = useState('id')
  const [sortOrder, setSortOrder] = useState('asc')
  const [selectedContractId, setSelectedContractId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [calculatedClients, setCalculatedClients] = useState(new Set())
  const [assignments, setAssignments] = useState([])
  const [contracts, setContracts] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(null)
  const [dissolvedGroups, setDissolvedGroups] = useState(new Set())
  const [cotisationAmounts, setCotisationAmounts] = useState({})
  const [selectedListGrandTotal, setSelectedListGrandTotal] = useState(null)

  useEffect(() => {
    if (importId) {
      loadEntities()
      loadCalculatedClients()
      loadAssignmentsAndContracts()
      loadDissolvedGroups()
      loadCotisationAmounts()
    } else {
      setError('ID d\'import manquant')
      setLoading(false)
    }
  }, [importId, mode])

  const loadDissolvedGroups = () => {
    if (!importId) return
    const key = `dissolved_groups_${importId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        setDissolvedGroups(new Set(JSON.parse(stored)))
      } catch (e) {
        console.error('Erreur chargement groupes dissous:', e)
      }
    }
  }

  const toggleDissolveGroup = (groupId) => {
    if (!importId) return
    const newSet = new Set(dissolvedGroups)
    if (newSet.has(groupId)) {
      newSet.delete(groupId)
    } else {
      newSet.add(groupId)
    }
    setDissolvedGroups(newSet)
    const key = `dissolved_groups_${importId}`
    localStorage.setItem(key, JSON.stringify(Array.from(newSet)))
  }

  useEffect(() => {
    loadCalculatedClients()
  }, [mode])

  const loadCalculatedClients = () => {
    if (!importId) return
    const key = `calculated_${importId}_${mode}`
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        setCalculatedClients(new Set(JSON.parse(stored)))
      } catch (e) {
        console.error('Erreur chargement clients calculés:', e)
      }
    }
  }

  const migrateCotisationMap = (raw) => {
    if (!raw || typeof raw !== 'object') return {}
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && v > 0) {
        out[k] = { amount: v, facturee: true, deduite: true }
      } else if (v && typeof v === 'object' && typeof v.amount === 'number' && v.amount > 0) {
        const amt = Number(v.amount)
        if ('facturee' in v || 'deduite' in v) {
          out[k] = {
            amount: amt,
            facturee: Boolean(v.facturee),
            deduite: Boolean(v.deduite),
          }
        } else if (v.kind === 'offerte') {
          out[k] = { amount: amt, facturee: false, deduite: false }
        } else {
          out[k] = { amount: amt, facturee: true, deduite: true }
        }
      }
    }
    return out
  }

  const loadCotisationAmounts = async () => {
    try {
      const list = await getCotisations(mode)
      const map = {}
      for (const item of list || []) {
        map[item.entity_key] = { amount: item.amount, facturee: item.facturee, deduite: item.deduite }
      }
      setCotisationAmounts(map)
      if (importId) {
        try { localStorage.setItem(`cotisation_amounts_${importId}`, JSON.stringify(map)) } catch (_) {}
      }
    } catch (e) {
      console.error('Erreur chargement cotisations API:', e)
      // Fallback localStorage
      if (importId) {
        const stored = localStorage.getItem(`cotisation_amounts_${importId}`)
        if (stored) {
          try { setCotisationAmounts(migrateCotisationMap(JSON.parse(stored))) } catch (_) {}
        }
      }
    }
  }

  const updateCotisationAmount = (entityKey, data) => {
    if (!entityKey) return
    const canonical = normalizeValue(entityKey)
    if (!canonical) return
    // Mise à jour optimiste : état immédiat + localStorage, API en arrière-plan
    const next = { ...cotisationAmounts }
    for (const k of Object.keys(next)) {
      if (normalizeValue(k) === canonical) delete next[k]
    }
    if (data && data.amount && Number(data.amount) > 0) {
      next[canonical] = {
        amount: Number(data.amount),
        facturee: Boolean(data.facturee),
        deduite: Boolean(data.deduite),
      }
    }
    setCotisationAmounts(next)
    if (importId) {
      try { localStorage.setItem(`cotisation_amounts_${importId}`, JSON.stringify(next)) } catch (_) {}
    }
    // Persistance DB en arrière-plan (ne bloque pas l'UI)
    const apiCall = !data || !data.amount || Number(data.amount) <= 0
      ? deleteCotisation(mode, canonical)
      : upsertCotisation(mode, canonical, {
          amount: Number(data.amount),
          facturee: Boolean(data.facturee),
          deduite: Boolean(data.deduite),
        })
    apiCall.catch((e) => console.warn('Cotisation DB sync failed (local still updated):', e))
  }

  const saveCalculatedClient = (entityId) => {
    if (!importId) return
    const key = `calculated_${importId}_${mode}`
    const newSet = new Set(calculatedClients)
    newSet.add(entityId)
    setCalculatedClients(newSet)
    localStorage.setItem(key, JSON.stringify(Array.from(newSet)))
  }

  const clearCalculatedClients = () => {
    if (!importId) return
    const key = `calculated_${importId}_${mode}`
    setCalculatedClients(new Set())
    localStorage.removeItem(key)
  }

  const loadAssignmentsAndContracts = async () => {
    try {
      const [assignmentsData, contractsData] = await Promise.all([
        getAssignments(),
        getContracts()
      ])
      setAssignments(assignmentsData)
      setContracts(contractsData)
    } catch (err) {
      console.error('Erreur chargement affectations/contrats:', err)
    }
  }

  const normalizeValue = (value) => {
    if (!value) return ""
    return value.toString().trim().toUpperCase()
  }

  /** Clé localStorage cotisation : groupes = même normalisation que l'agrégation backend (.upper()). */
  const cotisationKeyForEntity = (entity) => {
    if (!entity || typeof entity !== 'object') return ''
    if (mode === 'group') {
      return normalizeValue(entity.groupe_client || entity.id || '')
    }
    return (entity.code_union || entity.id || '').toString().trim()
  }

  const resolveContractForEntity = (entity) => {
    if (mode === 'client' && entity.id) {
      const codeUnionNorm = normalizeValue(entity.id)

      const codeUnionAssignment = assignments.find(a => {
        if (a.target_type !== 'CODE_UNION') return false
        return normalizeValue(a.target_value) === codeUnionNorm
      })

      if (codeUnionAssignment) {
        const contract = contracts.find(c => c.id === codeUnionAssignment.contract_id && c.is_active)
        if (contract) return contract
      }

      if (entity.groupe_client) {
        const groupeNorm = normalizeValue(entity.groupe_client)
        const groupeAssignment = assignments.find(a => {
          if (a.target_type !== 'GROUPE_CLIENT') return false
          return normalizeValue(a.target_value) === groupeNorm
        })

        if (groupeAssignment) {
          const contract = contracts.find(c => c.id === groupeAssignment.contract_id && c.is_active)
          if (contract) return contract
        }
      }
    } else if (mode === 'group' && entity.id) {
      const groupeNorm = normalizeValue(entity.id)

      const groupeAssignment = assignments.find(a => {
        if (a.target_type !== 'GROUPE_CLIENT') return false
        return normalizeValue(a.target_value) === groupeNorm
      })

      if (groupeAssignment) {
        const contract = contracts.find(c => c.id === groupeAssignment.contract_id && c.is_active)
        if (contract) return contract
      }
    }

    return contracts.find(c => c.is_default && c.is_active)
  }

  const loadEntities = async () => {
    if (!importId) {
      setError('ID d\'import manquant')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getEntities(importId, mode)
      setEntities(Array.isArray(data) ? data : [])
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.statusText || err.message || 'Erreur lors du chargement'
      setError(errorMsg)
      setEntities([])
    } finally {
      setLoading(false)
    }
  }

  const handleEntityClick = async (entity) => {
    const id = entity?.id ?? entity
    const listGrandTotal = entity && typeof entity === 'object' ? (entity.grand_total ?? entity.global_total) : null
    setSelectedListGrandTotal(listGrandTotal)
    setDetailLoading(true)
    setSelectedEntity(null)
    setSelectedContractId(null)
    try {
      const detail = await getEntityDetail(importId, mode, id)
      setSelectedEntity(detail)
      setError(null)
      saveCalculatedClient(id)
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erreur lors du chargement du détail'
      setError(errorMsg)
    } finally {
      setDetailLoading(false)
    }
  }

  const getCotisationInfo = (entityKey) => {
    const raw = (entityKey || '').toString()
    let row = cotisationAmounts[raw]
    if (!row && mode === 'group' && raw) {
      const target = normalizeValue(raw)
      for (const [k, v] of Object.entries(cotisationAmounts)) {
        if (normalizeValue(k) === target) {
          row = v
          break
        }
      }
    }
    if (!row || !row.amount || row.amount <= 0) {
      return { amount: 0, facturee: true, deduite: true }
    }
    if ('deduite' in row || 'facturee' in row) {
      let facturee = Boolean(row.facturee)
      let deduite = Boolean(row.deduite)
      // Ancien UI : deux cases indépendantes — on ramène au modèle binaire Facturer (tout oui) / Offrir (tout non)
      if (facturee !== deduite) {
        facturee = true
        deduite = true
      }
      return {
        amount: Number(row.amount),
        facturee,
        deduite,
      }
    }
    if (row.kind === 'offerte') {
      return { amount: Number(row.amount), facturee: false, deduite: false }
    }
    return { amount: Number(row.amount), facturee: true, deduite: true }
  }

  const mergeCotisationPatch = (entityKey, patch) => {
    const cur = getCotisationInfo(entityKey)
    const amount = patch.amount !== undefined ? patch.amount : cur.amount
    const facturee = patch.facturee !== undefined ? patch.facturee : cur.facturee
    const deduite = patch.deduite !== undefined ? patch.deduite : cur.deduite
    if (!amount || amount <= 0) updateCotisationAmount(entityKey, null)
    else updateCotisationAmount(entityKey, { amount, facturee, deduite })
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Groupes dont on affiche quand même les clients individuellement
  const GROUP_EXCEPTIONS = ['independant union', 'les lyonnais']

  const isFromExceptionGroup = (entity) => {
    if (!entity.groupe_client) return true
    const g = entity.groupe_client.toLowerCase().trim()
    return GROUP_EXCEPTIONS.some((ex) => g.includes(ex))
  }

  const filteredEntities = entities
    .filter((entity) => {
      // En mode client, masquer les clients appartenant à un vrai groupe
      if (mode === 'client' && !isFromExceptionGroup(entity)) return false

      const isCalculated = calculatedClients.has(entity.id)
      if (filterStatus === 'calculated' && !isCalculated) return false
      if (filterStatus === 'pending' && isCalculated) return false

      const search = searchTerm.toLowerCase()
      return (
        entity.id.toLowerCase().includes(search) ||
        entity.label.toLowerCase().includes(search)
      )
    })
    .sort((a, b) => {
      let aVal, bVal
      if (sortBy === 'id') {
        aVal = a.id
        bVal = b.id
      } else if (sortBy === 'grand_total') {
        aVal = a.grand_total ?? a.global_total
        bVal = b.grand_total ?? b.global_total
      } else {
        aVal = a.grand_total ?? a.global_total
        bVal = b.grand_total ?? b.global_total
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-glass-secondary">Chargement...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card p-6 border-red-500/30">
        <p className="font-semibold text-red-400">Erreur</p>
        <p className="text-red-300">{error}</p>
        {importId && (
          <p className="text-sm mt-2 text-glass-muted">
            Import ID: {importId} | Mode: {mode}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow-blue">
                {mode === 'client' ? (
                  <User className="w-6 h-6 text-white" />
                ) : (
                  <Users className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {mode === 'client' ? 'Clients' : 'Groupes Clients'}
                </h2>
                <p className="text-sm text-glass-secondary">
                  {entities.length} {mode === 'client' ? 'client(s)' : 'groupe(s)'} au total
                </p>
              </div>
            </div>

            {/* Toggle mode */}
            <div className="flex glass-card-dark rounded-xl p-1">
              <button
                onClick={() => setMode('client')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'client'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                    : 'text-glass-secondary hover:text-white'
                }`}
              >
                Par client
              </button>
              <button
                onClick={() => setMode('group')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'group'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                    : 'text-glass-secondary hover:text-white'
                }`}
              >
                Par groupe
              </button>
            </div>
          </div>

          {/* Recherche et filtres */}
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-glass-muted" />
                <input
                  type="text"
                  placeholder={mode === 'client'
                    ? "Rechercher par Code Union ou Nom Client..."
                    : "Rechercher par Groupe Client..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="glass-input pl-12"
                />
              </div>
              <div className="flex gap-2">
                <FilterButton
                  active={filterStatus === 'all'}
                  onClick={() => setFilterStatus('all')}
                  label={`Tous (${entities.length})`}
                  color="blue"
                />
                <FilterButton
                  active={filterStatus === 'calculated'}
                  onClick={() => setFilterStatus('calculated')}
                  icon={<Check className="w-3.5 h-3.5" />}
                  label={`Calculés (${calculatedClients.size})`}
                  color="emerald"
                />
                <FilterButton
                  active={filterStatus === 'pending'}
                  onClick={() => setFilterStatus('pending')}
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label={`À faire (${entities.length - calculatedClients.size})`}
                  color="orange"
                />
                {calculatedClients.size > 0 && (
                  <button
                    onClick={clearCalculatedClients}
                    className="glass-btn-icon"
                    title="Réinitialiser les marquages"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {filterStatus !== 'all' && (
              <div className="text-sm text-glass-secondary">
                {filterStatus === 'calculated' && (
                  <span>Affichage des {filteredEntities.length} entité(s) déjà calculée(s)</span>
                )}
                {filterStatus === 'pending' && (
                  <span>Affichage des {filteredEntities.length} entité(s) restante(s) à calculer</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="glass-table">
            <thead>
              <tr>
                {mode === 'client' ? (
                  <>
                    <th
                      onClick={() => handleSort('id')}
                      className="cursor-pointer hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        Code Union
                        {sortBy === 'id' && (
                          sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </th>
                    <th>Nom Client</th>
                    <th>Groupe Client</th>
                  </>
                ) : (
                  <>
                    <th
                      onClick={() => handleSort('id')}
                      className="cursor-pointer hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        Groupe Client
                        {sortBy === 'id' && (
                          sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </th>
                    <th>Nb Comptes</th>
                  </>
                )}
                <th
                  onClick={() => handleSort('grand_total')}
                  className="cursor-pointer hover:text-white transition-colors text-right"
                >
                  <span className="flex items-center justify-end gap-1">
                    Total Global
                    {sortBy === 'grand_total' && (
                      sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </th>
                <th className="text-right">Total RFA</th>
                <th>Contrat affecté</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntities.map((entity) => (
                <tr
                  key={entity.id}
                  onClick={() => handleEntityClick(entity)}
                  className={`cursor-pointer transition-all ${
                    calculatedClients.has(entity.id)
                      ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                      : ''
                  }`}
                >
                  {mode === 'client' ? (
                    <>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entity.id}</span>
                          {calculatedClients.has(entity.id) && (
                            <span className="glass-badge-emerald text-xs">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-glass-secondary max-w-[200px] truncate" title={entity.label.includes(' - ') ? entity.label.split(' - ')[1] : '-'}>
                        {entity.label.includes(' - ') ? entity.label.split(' - ')[1] : '-'}
                      </td>
                      <td className="text-glass-secondary max-w-[180px] truncate" title={entity.groupe_client || '-'}>
                        {entity.groupe_client || '-'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entity.label}</span>
                          {calculatedClients.has(entity.id) && (
                            <span className="glass-badge-emerald text-xs">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                          {dissolvedGroups.has(entity.id.toUpperCase()) && (
                            <span className="glass-badge-orange text-xs flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              Dissous
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-glass-secondary">
                        {entity.nb_comptes || 0}
                      </td>
                    </>
                  )}
                  <td className="text-right font-semibold">
                    {formatAmount(entity.global_total)}
                  </td>
                  <td className="text-right">
                    {entity.rfa_total !== null && entity.rfa_total !== undefined
                      ? (() => {
                          const storageKey =
                            mode === 'client' || mode === 'group'
                              ? cotisationKeyForEntity(entity)
                              : ''
                          const { amount: cotisation, facturee: cFact, deduite: cDed } =
                            mode === 'client' || mode === 'group'
                              ? getCotisationInfo(storageKey)
                              : { amount: 0, facturee: true, deduite: true }
                          const offerte = cotisation > 0 && !cFact && !cDed
                          const adjusted =
                            (mode === 'client' || mode === 'group') && cotisation > 0 && cDed
                              ? Math.max(entity.rfa_total - cotisation, 0)
                              : entity.rfa_total
                          return (
                            <div className="flex flex-col items-end">
                              <span className="font-semibold text-blue-400">{formatAmount(adjusted)}</span>
                              {cotisation > 0 && cDed && (
                                <span className="text-xs text-orange-400">- {formatAmount(cotisation)}</span>
                              )}
                              {cotisation > 0 && cFact && (
                                <span className="text-xs text-blue-300/90">fact. {formatAmount(cotisation)}</span>
                              )}
                              {offerte && (
                                <span className="text-xs text-emerald-400/90">geste GU (PDF 2 lignes)</span>
                              )}
                            </div>
                          )
                        })()
                      : <span className="text-glass-muted">-</span>
                    }
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const contract = resolveContractForEntity(entity)
                        const existingAssignment = mode === 'client' && entity.id
                          ? assignments.find(a =>
                              a.target_type === 'CODE_UNION' &&
                              normalizeValue(a.target_value) === normalizeValue(entity.id)
                            )
                          : mode === 'group' && entity.id
                          ? assignments.find(a =>
                              a.target_type === 'GROUPE_CLIENT' &&
                              normalizeValue(a.target_value) === normalizeValue(entity.id)
                            )
                          : null

                        if (!contract) {
                          return (
                            <>
                              <span className="text-xs text-glass-muted">-</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowAssignModal({ entity, mode })
                                }}
                                className="text-xs text-blue-400 hover:text-blue-300 underline"
                                title="Assigner un contrat"
                              >
                                Assigner
                              </button>
                            </>
                          )
                        }
                        return (
                          <>
                            <span className="text-sm font-medium">{contract.name}</span>
                            {contract.is_default && (
                              <span className="glass-badge-emerald text-xs">Défaut</span>
                            )}
                            {!contract.is_active && (
                              <span className="glass-badge-gray text-xs">Inactif</span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowAssignModal({ entity, mode, currentContract: contract, existingAssignment })
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 underline ml-1"
                              title="Modifier l'affectation"
                            >
                              Modifier
                            </button>
                          </>
                        )
                      })()}
                      {mode === 'group' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleDissolveGroup(entity.id.toUpperCase())
                          }}
                          className={`ml-2 text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                            dissolvedGroups.has(entity.id.toUpperCase())
                              ? 'glass-badge-emerald'
                              : 'glass-badge-orange'
                          }`}
                          title={dissolvedGroups.has(entity.id.toUpperCase())
                            ? "Restaurer le groupe"
                            : "Dissoudre le groupe"}
                        >
                          {dissolvedGroups.has(entity.id.toUpperCase()) ? (
                            <>
                              <Lock className="w-3 h-3" />
                              Restaurer
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" />
                              Dissoudre
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer détail */}
      <EntityDetailDrawer
        entity={selectedEntity}
        mode={mode}
        loading={detailLoading}
        onClose={() => {
          setSelectedEntity(null)
          setSelectedContractId(null)
          setSelectedListGrandTotal(null)
        }}
        listGrandTotal={selectedListGrandTotal}
        importId={importId}
        onContractChange={async (contractId) => {
          if (!selectedEntity) return
          setSelectedContractId(contractId)
          setDetailLoading(true)
          try {
            const entityId = mode === 'client'
              ? (selectedEntity.code_union || selectedEntity.id)
              : normalizeValue(selectedEntity.groupe_client || selectedEntity.id || '')
            const detail = await getEntityDetail(importId, mode, entityId, contractId)
            setSelectedEntity(detail)
          } catch (err) {
            console.error('Erreur chargement détail avec contrat:', err)
          } finally {
            setDetailLoading(false)
          }
        }}
        onAssignContract={(entity, mode) => {
          const contract = resolveContractForEntity(entity)
          const existingAssignment = mode === 'client' && entity.id
            ? assignments.find(a =>
                a.target_type === 'CODE_UNION' &&
                normalizeValue(a.target_value) === normalizeValue(entity.id)
              )
            : mode === 'group' && entity.id
            ? assignments.find(a =>
                a.target_type === 'GROUPE_CLIENT' &&
                normalizeValue(a.target_value) === normalizeValue(entity.id)
              )
            : null
          setShowAssignModal({ entity, mode, currentContract: contract, existingAssignment })
        }}
        cotisationAmount={
          selectedEntity && (mode === 'client' || mode === 'group')
            ? getCotisationInfo(cotisationKeyForEntity(selectedEntity)).amount
            : 0
        }
        cotisationFacturee={
          selectedEntity && (mode === 'client' || mode === 'group')
            ? getCotisationInfo(cotisationKeyForEntity(selectedEntity)).facturee
            : true
        }
        cotisationDeduite={
          selectedEntity && (mode === 'client' || mode === 'group')
            ? getCotisationInfo(cotisationKeyForEntity(selectedEntity)).deduite
            : true
        }
        onCotisationChange={(patch) => {
          if (!selectedEntity || (mode !== 'client' && mode !== 'group')) return
          mergeCotisationPatch(cotisationKeyForEntity(selectedEntity), patch)
        }}
        onRefresh={async () => {
          if (!selectedEntity) return
          setDetailLoading(true)
          try {
            const entityId =
              mode === 'client'
                ? (selectedEntity.code_union || selectedEntity.id)
                : normalizeValue(selectedEntity.groupe_client || selectedEntity.id || '')
            const detail = await getEntityDetail(importId, mode, entityId, selectedContractId)
            setSelectedEntity(detail)
          } catch (err) {
            console.error('Erreur rechargement detail:', err)
          } finally {
            setDetailLoading(false)
          }
        }}
      />

      {/* Modal d'assignation de contrat */}
      {showAssignModal && (
        <ContractAssignmentModal
          entity={showAssignModal.entity}
          mode={showAssignModal.mode}
          contracts={contracts.filter(c => c.is_active)}
          currentContract={showAssignModal.currentContract}
          existingAssignment={showAssignModal.existingAssignment}
          onClose={() => setShowAssignModal(null)}
          onSave={async (contractId) => {
            try {
              const entity = showAssignModal.entity
              const targetType = showAssignModal.mode === 'client' ? 'CODE_UNION' : 'GROUPE_CLIENT'
              const targetValue = entity.id

              if (showAssignModal.existingAssignment) {
                await deleteAssignment(showAssignModal.existingAssignment.id)
              }

              if (contractId) {
                await createAssignment({
                  contract_id: contractId,
                  target_type: targetType,
                  target_value: targetValue
                })
              }

              await loadAssignmentsAndContracts()
              await loadEntities()

              setShowAssignModal(null)
            } catch (err) {
              console.error('Erreur lors de l\'assignation:', err)
              alert('Erreur lors de l\'assignation: ' + (err.response?.data?.detail || err.message))
            }
          }}
        />
      )}
    </div>
  )
}

function FilterButton({ active, onClick, label, color, icon }) {
  const colorClasses = {
    blue: active
      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-glow-blue'
      : 'glass-btn-secondary',
    emerald: active
      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-glow-emerald'
      : 'glass-btn-secondary',
    orange: active
      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
      : 'glass-btn-secondary',
  }

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${colorClasses[color]}`}
    >
      {icon}
      {label}
    </button>
  )
}

export default ClientsPage
