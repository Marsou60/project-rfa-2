import { useEffect, useMemo, useState } from 'react'
import { getUnionEntity, getContractRules, getSupplierLogos, getImageUrl, exportUnionExcel, exportUnionPdf } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import AdsTicker from '../components/AdsTicker'

function UnionSpacePage({ importId }) {
  const { supplierFilter, getKeysForCurrentSupplier } = useSupplierFilter()
  const supplierKeys = useMemo(() => getKeysForCurrentSupplier(), [getKeysForCurrentSupplier])

  const [entity, setEntity] = useState(null)
  const [rulesMap, setRulesMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [supplierLogos, setSupplierLogos] = useState({})
  const [exporting, setExporting] = useState({ pdf: false, excel: false })
  const [exportSuccess, setExportSuccess] = useState(null)

  // Charger les logos fournisseurs
  useEffect(() => {
    getSupplierLogos().then(logos => {
      const map = {}
      for (const logo of logos || []) {
        map[logo.supplier_key] = logo
      }
      setSupplierLogos(map)
    }).catch(() => {})
  }, [])

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0)
  }

  const formatPercent = (rate) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }).format(rate || 0)
  }

  const parseTiers = (tiersJson) => {
    if (!tiersJson) return []
    try {
      const parsed = JSON.parse(tiersJson)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((t) => ({ min: Number(t.min) || 0, rate: Number(t.rate) || 0 }))
        .sort((a, b) => a.min - b.min)
    } catch (e) {
      return []
    }
  }

  const getTierProgress = (ca, tiers) => {
    if (!tiers || tiers.length === 0) {
      return { minReached: null, minThreshold: null, nextMin: null, rate: 0, progress: 0 }
    }
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    const minThreshold = sorted[0].min
    let minReached = null
    let rate = 0
    for (const tier of sorted) {
      if (tier.min <= ca) {
        minReached = tier.min
        rate = tier.rate
      } else break
    }
    const nextTier = sorted.find((tier) => tier.min > ca) || null
    const nextMin = nextTier ? nextTier.min : null
    const progress = nextMin ? Math.min((ca / nextMin) * 100, 100) : 100
    return { minReached, minThreshold, nextMin, rate, progress }
  }

  const getRateForThreshold = (tiers, threshold) => {
    if (!tiers || tiers.length === 0 || threshold === null || threshold === undefined) return 0
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    let rate = 0
    for (const tier of sorted) {
      if (tier.min <= threshold) rate = tier.rate
      else break
    }
    return rate
  }

  useEffect(() => {
    const loadEntity = async () => {
      if (!importId) return
      try {
        setLoading(true)
        setError(null)
        const detail = await getUnionEntity(importId)
        setEntity(detail)
        
        // Charger les regles de TOUS les contrats Union
        const contractIds = detail?.contract_applied?.ids || 
          (detail?.contract_applied?.id ? [detail.contract_applied.id] : [])
        
        if (contractIds.length > 0) {
          const map = {}
          for (const contractId of contractIds) {
            const rules = await getContractRules(contractId)
            for (const rule of rules || []) {
              const parsed = {
                ...rule,
                tiers_rfa: parseTiers(rule.tiers_rfa),
                tiers_bonus: parseTiers(rule.tiers_bonus),
                tiers: parseTiers(rule.tiers),
              }
              // Ne garder que les regles avec de vrais paliers (ne pas ecraser une regle valide par une vide)
              const hasData = (parsed.tiers_rfa && parsed.tiers_rfa.length > 0) ||
                              (parsed.tiers_bonus && parsed.tiers_bonus.length > 0) ||
                              (parsed.tiers && parsed.tiers.length > 0)
              if (hasData || !map[rule.key]) {
                map[rule.key] = parsed
              }
            }
          }
          setRulesMap(map)
        } else {
          setRulesMap({})
        }
      } catch (err) {
        setError(err.response?.data?.detail || "Erreur lors du chargement Union")
        setEntity(null)
        setRulesMap({})
      } finally {
        setLoading(false)
      }
    }
    loadEntity()
  }, [importId])

  const globalRows = useMemo(() => {
    if (!entity?.rfa?.global) return []
    return Object.entries(entity.rfa.global).map(([key, item]) => {
      const rule = rulesMap[key]
      const rfaProgress = getTierProgress(item.ca || 0, rule?.tiers_rfa || [])
      const bonusProgress = getTierProgress(item.ca || 0, rule?.tiers_bonus || [])
      const combinedNextMinCandidates = [rfaProgress.nextMin, bonusProgress.nextMin].filter(
        (value) => value !== null && value !== undefined
      )
      const combinedNextMin = combinedNextMinCandidates.length ? Math.min(...combinedNextMinCandidates) : null
      const combinedProgress = combinedNextMin ? Math.min((item.ca / combinedNextMin) * 100, 100) : 100
      const combinedRate = (rfaProgress.rate || 0) + (bonusProgress.rate || 0)
      const nextRfaRate = combinedNextMin !== null ? getRateForThreshold(rule?.tiers_rfa || [], combinedNextMin) : 0
      const nextBonusRate = combinedNextMin !== null ? getRateForThreshold(rule?.tiers_bonus || [], combinedNextMin) : 0
      const nextCombinedRate = combinedNextMin !== null ? (nextRfaRate + nextBonusRate) : null
      const currentRfaAmount = (combinedRate || 0) * (item.ca || 0)
      const missingCa = combinedNextMin !== null ? Math.max((combinedNextMin || 0) - (item.ca || 0), 0) : null
      const projectedRfaAmount = combinedNextMin !== null && nextCombinedRate !== null ? nextCombinedRate * (combinedNextMin || 0) : null
      const projectedGain = projectedRfaAmount !== null ? Math.max(projectedRfaAmount - currentRfaAmount, 0) : null
      return {
        key, label: item.label, ca: item.ca || 0, rfaProgress, bonusProgress, combinedNextMin, combinedProgress, combinedRate, nextCombinedRate, currentRfaAmount, missingCa, projectedRfaAmount, projectedGain,
        achieved: combinedNextMin === null && (rfaProgress.minReached !== null || bonusProgress.minReached !== null),
        near: combinedNextMin !== null && combinedProgress >= 80,
        noRules: (!rule?.tiers_rfa || rule.tiers_rfa.length === 0) && (!rule?.tiers_bonus || rule.tiers_bonus.length === 0),
      }
    })
  }, [entity, rulesMap])

  const triRows = useMemo(() => {
    if (!entity?.rfa?.tri) return []
    return Object.entries(entity.rfa.tri).map(([key, item]) => {
      const rule = rulesMap[key]
      const triProgress = getTierProgress(item.ca || 0, rule?.tiers || [])
      const currentRfaAmount = (triProgress.rate || 0) * (item.ca || 0)
      const missingCa = triProgress.nextMin !== null ? Math.max((triProgress.nextMin || 0) - (item.ca || 0), 0) : null
      const nextTriRate = triProgress.nextMin !== null ? getRateForThreshold(rule?.tiers || [], triProgress.nextMin) : null
      const projectedRfaAmount = triProgress.nextMin !== null && nextTriRate !== null ? nextTriRate * (triProgress.nextMin || 0) : null
      const projectedGain = projectedRfaAmount !== null ? Math.max(projectedRfaAmount - currentRfaAmount, 0) : null
      return {
        key, label: item.label, ca: item.ca || 0, triProgress, currentRfaAmount, missingCa, projectedRfaAmount, projectedGain,
        achieved: triProgress.nextMin === null && triProgress.minReached !== null,
        near: triProgress.nextMin !== null && triProgress.progress >= 80,
        noRules: !rule?.tiers || rule.tiers.length === 0,
      }
    })
  }, [entity, rulesMap])

  const globalTotal = entity?.ca?.totals?.global_total || 0
  const rfaTotal = entity?.rfa?.totals?.grand_total || 0
  const marketingTotal = entity?.rfa?.totals?.marketing_total || 0
  const rfaNormaleTotal = rfaTotal - marketingTotal
  const rfaRateGlobal = globalTotal > 0 ? rfaNormaleTotal / globalTotal : 0

  // Totaux affichés : quand filtre fournisseur = uniquement CA et RFA de la plateforme
  const displayTotals = useMemo(() => {
    if (!supplierFilter || supplierKeys.length === 0) {
      const totalMarketing = entity?.rfa?.totals?.marketing_total || 0
      const totalRfaNormale = (entity?.rfa?.totals?.grand_total || 0) - totalMarketing
      return { 
        ca: globalTotal, 
        rfa: totalRfaNormale, 
        rate: globalTotal > 0 ? totalRfaNormale / globalTotal : 0,
        marketing: totalMarketing
      }
    }
    
    // Calculer les totaux filtrés
    const g = globalRows.filter(r => supplierKeys.includes(r.key))
    const t = triRows.filter(r => supplierKeys.includes(r.key))
    
    // CA : Global + Tri (attention aux doublons si tri inclus dans global ? Non, CA tri est une partie du CA global généralement, mais ici on additionne tout pour le "CA Total" affiché ?)
    // Le backend fait CA Global + CA Tri pour le grand total CA ?
    // Vérifions aggregation backend : grand_total = global_total + tri_total.
    // Donc oui on somme tout.
    const ca = g.reduce((s, r) => s + (r.ca || 0), 0) + t.reduce((s, r) => s + (r.ca || 0), 0)
    
    // RFA : Global + Tri (RFA "normale")
    let rfa = g.reduce((s, r) => s + (r.currentRfaAmount || 0), 0) + t.reduce((s, r) => s + (r.currentRfaAmount || 0), 0)
    
    // Marketing (calculé à part)
    let marketing = 0
    if (entity?.rfa?.marketing) {
      Object.entries(entity.rfa.marketing).forEach(([key, item]) => {
        if (supplierKeys.includes(key)) {
          marketing += item.amount
        }
      })
    }

    return { ca, rfa, marketing, rate: ca > 0 ? rfa / ca : 0 }
  }, [supplierFilter, supplierKeys, globalTotal, rfaTotal, rfaRateGlobal, globalRows, triRows, entity?.rfa?.marketing])

  const filteredGlobalRows = useMemo(() => {
    const base = globalRows
    if (!supplierFilter || supplierKeys.length === 0) return base
    return base.filter(r => supplierKeys.includes(r.key))
  }, [globalRows, supplierFilter, supplierKeys])
  const filteredTriRows = useMemo(() => {
    const base = triRows
    if (!supplierFilter || supplierKeys.length === 0) return base
    return base.filter(r => supplierKeys.includes(r.key))
  }, [triRows, supplierFilter, supplierKeys])

  // Regrouper par fournisseur
  const groupedBySupplier = useMemo(() => {
    const groups = {}
    
    // Ajouter les globales
    filteredGlobalRows.forEach(row => {
      const supplier = row.key.replace('GLOBAL_', '')
      if (!groups[supplier]) {
        groups[supplier] = {
          name: row.label.replace('RFA Globale ', ''),
          global: null,
          tris: [],
          marketing: null,
          totalRfa: 0,
          totalCa: 0
        }
      }
      groups[supplier].global = row
      groups[supplier].totalRfa += row.currentRfaAmount
      groups[supplier].totalCa = row.ca // Le CA global du fournisseur
    })
    
    // Ajouter les tri-partites
    filteredTriRows.forEach(row => {
      const match = row.key.match(/TRI_([A-Z]+)_/)
      if (match) {
        const supplier = match[1]
        if (!groups[supplier]) {
          groups[supplier] = {
            name: supplier,
            global: null,
            tris: [],
            marketing: null,
            totalRfa: 0,
            totalCa: 0
          }
        }
        groups[supplier].tris.push(row)
        groups[supplier].totalRfa += row.currentRfaAmount
        // Si pas de global, utiliser le plus gros CA tri-partite comme référence
        if (!groups[supplier].totalCa) {
          groups[supplier].totalCa = Math.max(groups[supplier].totalCa, row.ca)
        }
      }
    })

    // Ajouter les marketing (nouveau)
    if (entity?.rfa?.marketing) {
      Object.entries(entity.rfa.marketing).forEach(([key, item]) => {
        const supplier = key.replace('GLOBAL_', '')
        if (!groups[supplier]) {
          // Si le fournisseur n'existe pas encore (cas rare sans global ni tri), on le crée
          // Mais il faut un CA total pour le taux global. On essaie de le trouver.
          // Le base_amount du marketing est souvent le CA global.
          groups[supplier] = {
            name: supplier,
            global: null,
            tris: [],
            marketing: null,
            totalRfa: 0,
            totalCa: item.base_amount || 0
          }
        }
        groups[supplier].marketing = item
        // Note: On n'ajoute PAS le marketing au totalRfa (RFA Normale), c'est un budget à part
        // groups[supplier].totalRfa += item.amount 
      })
    }
    
    // Calculer le taux global pour chaque fournisseur
    Object.keys(groups).forEach(supplier => {
      const group = groups[supplier]
      group.globalRate = group.totalCa > 0 ? group.totalRfa / group.totalCa : 0
    })
    
    return groups
  }, [filteredGlobalRows, filteredTriRows, entity?.rfa?.marketing])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données Union...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="font-semibold text-red-800 mb-1">Erreur</h3>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="p-8 bg-gray-50 border border-gray-200 rounded-xl shadow-lg text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune donnée disponible</h3>
        <p className="text-gray-600">Veuillez importer un fichier de données pour voir les statistiques Union.</p>
      </div>
    )
  }

  // Vérifier si aucun contrat Union n'est configuré
  if (!entity.contract_applied) {
    return (
      <div className="p-8 bg-amber-50 border border-amber-300 rounded-xl shadow-lg text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun contrat Union configuré</h3>
        <p className="text-gray-600 mb-4">
          Pour afficher les calculs RFA, vous devez d'abord créer ou importer un contrat Union.
        </p>
        <div className="bg-white rounded-lg p-4 text-left text-sm text-gray-700 mb-4">
          <p className="font-semibold mb-2">📋 Étapes à suivre :</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Allez dans <strong>Contrats</strong></li>
            <li>Cliquez sur <strong>"Contrats Union (DAF)"</strong></li>
            <li>Importez un contrat JSON (ACR, DCA, etc.)</li>
            <li>Définissez-le comme <strong>défaut</strong> (⭐)</li>
          </ol>
        </div>
        <button
          onClick={() => window.location.hash = '#contracts'}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
        >
          Aller aux Contrats
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 -mx-6 -mt-6 px-6 py-8 mb-6 rounded-b-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-3xl font-black text-white">🏢 Espace Groupement Union</h1>
              {supplierFilter && (
                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30">
                  Vue {supplierFilter} uniquement
                </span>
              )}
            </div>
            <p className="text-emerald-100 text-sm">Direction Administrative et Financière - Pilotage RFA{supplierFilter ? ` (données ${supplierFilter})` : ''}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/30">
            <div className="text-xs text-white/80">Import actif</div>
            <div className="text-sm font-bold text-white">{importId || 'N/A'}</div>
          </div>
        </div>

        {/* Menu Navigation */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white text-emerald-600 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span>Vue d'ensemble</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'suppliers'
                ? 'bg-white text-emerald-600 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🏢</span>
              <span>Détail Fournisseurs</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('synthesis')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'synthesis'
                ? 'bg-white text-emerald-600 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📈</span>
              <span>Synthèse Consolidée</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'export'
                ? 'bg-white text-emerald-600 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📄</span>
              <span>Exports & Rapports</span>
            </div>
          </button>
        </div>
      </div>

      <AdsTicker />

      {/* VUE D'ENSEMBLE */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💼</span>
                </div>
                <div>
                  <div className="text-gray-500 text-xs font-medium">CA Total{supplierFilter ? ` (${supplierFilter})` : ''}</div>
                  <div className="text-2xl font-bold text-gray-900">{formatAmount(displayTotals.ca)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">{supplierFilter ? `Chiffre d'affaires ${supplierFilter}` : "Chiffre d'affaires groupement"}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 border border-indigo-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <div className="text-gray-500 text-xs font-medium">Taux Global</div>
                  <div className="text-2xl font-bold text-indigo-600">{formatPercent(displayTotals.rate)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">{supplierFilter ? `Taux RFA ${supplierFilter}` : 'Taux RFA effectif Union'}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 border border-emerald-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
                <div>
                  <div className="text-gray-500 text-xs font-medium">RFA Normale{supplierFilter ? ` (${supplierFilter})` : ''}</div>
                  <div className="text-2xl font-bold text-emerald-600">{formatAmount(displayTotals.rfa)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">{supplierFilter ? `RFA ${supplierFilter}` : 'Revenus RFA groupement'}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 border border-pink-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎉</span>
                </div>
                <div>
                  <div className="text-gray-500 text-xs font-medium">Marketing</div>
                  <div className="text-2xl font-bold text-pink-600">{formatAmount(displayTotals.marketing)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">Budget Marketing & Événement</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 border border-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🏢</span>
                </div>
                <div>
                  <div className="text-gray-500 text-xs font-medium">Fournisseurs</div>
                  <div className="text-2xl font-bold text-purple-600">{Object.keys(groupedBySupplier).length}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">{supplierFilter ? 'Vue 1 plateforme' : 'Plateformes actives'}</div>
            </div>
          </div>

          {/* BLOC BUDGET MARKETING (COPIE POUR VUE D'ENSEMBLE) */}
          {Object.values(groupedBySupplier).some(g => g.marketing) && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-pink-200">
              <div className="p-5 border-b border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>🎉</span> Budget Marketing & Événement
                </h3>
                <p className="text-sm text-gray-600">Participation des fournisseurs aux événements du Groupement Union</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-pink-50/50 border-b border-pink-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Fournisseur</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Type de rémunération</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Base de calcul</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(groupedBySupplier).map(([supplier, group]) => (
                      group.marketing && (
                        <tr key={supplier} className="hover:bg-pink-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {supplierLogos[supplier] ? (
                                <img 
                                  src={getImageUrl(supplierLogos[supplier].image_url)} 
                                  alt={supplier} 
                                  className="h-8 w-auto object-contain"
                                  onError={(e) => { e.target.style.display = 'none' }}
                                />
                              ) : (
                                <span className="font-bold text-gray-700">{supplier}</span>
                              )}
                              <span className="font-medium text-gray-900">{group.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {group.marketing.calculation_type === 'fixed' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Forfait fixe
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {formatPercent(group.marketing.rate)} du CA
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {group.marketing.calculation_type === 'rate' ? (
                              <span className="text-gray-700 font-medium">{formatAmount(group.marketing.base_amount)}</span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-pink-600 text-lg">{formatAmount(group.marketing.amount)}</span>
                          </td>
                        </tr>
                      )
                    ))}
                    {/* Total row */}
                    <tr className="bg-gradient-to-r from-pink-50 to-rose-50 border-t-2 border-pink-300 font-bold">
                      <td colSpan="3" className="px-6 py-4 text-gray-900 text-right uppercase tracking-wider text-sm">Total Budget Marketing</td>
                      <td className="px-6 py-4 text-right text-pink-700 text-2xl">
                        {formatAmount(Object.values(groupedBySupplier).reduce((sum, g) => sum + (g.marketing?.amount || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Synthèse par fournisseur */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h3 className="text-xl font-bold text-gray-900">📋 Récapitulatif par Fournisseur</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Fournisseur</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">CA Total</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Taux Effectif</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">RFA Total</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700">Règles Actives</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Part du CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(groupedBySupplier).map(([supplier, group]) => (
                    <tr key={supplier} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setActiveTab('suppliers')}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {supplierLogos[supplier] ? (
                            <img 
                              src={getImageUrl(supplierLogos[supplier].image_url)} 
                              alt={supplier} 
                              className="h-10 w-auto object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{group.name[0]}</span>
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900">{group.name}</div>
                            <div className="text-xs text-gray-500">
                              {group.global ? '1 Global' : ''}{group.global && group.tris.length > 0 ? ' + ' : ''}{group.tris.length > 0 ? `${group.tris.length} Tri-partite${group.tris.length > 1 ? 's' : ''}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatAmount(group.totalCa)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-indigo-100 text-indigo-700">
                          {formatPercent(group.globalRate)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-bold text-emerald-600">{formatAmount(group.totalRfa)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                          {(group.global ? 1 : 0) + group.tris.length} règle{((group.global ? 1 : 0) + group.tris.length) > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full"
                              style={{ width: `${displayTotals.ca > 0 ? (group.totalCa / displayTotals.ca) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 min-w-[3rem]">
                            {formatPercent(displayTotals.ca > 0 ? group.totalCa / displayTotals.ca : 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t-2 border-emerald-300">
                  <tr>
                    <td className="px-6 py-4 font-bold text-gray-900">TOTAL UNION</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">{formatAmount(displayTotals.ca)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-indigo-600 text-white">
                        {formatPercent(rfaRateGlobal)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xl font-bold text-emerald-600">{formatAmount(displayTotals.rfa)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">
                        {Object.values(groupedBySupplier).reduce((sum, g) => sum + (g.global ? 1 : 0) + g.tris.length, 0)} règles
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DÉTAIL FOURNISSEURS */}
      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-5 border border-blue-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏢</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Détail par Fournisseur</h2>
                <p className="text-sm text-gray-600">Calculs détaillés RFA, bonus et tri-partites</p>
              </div>
            </div>
          </div>
          {/* RFA par Fournisseur */}
          {Object.keys(groupedBySupplier).length > 0 && (
            <div className="space-y-6">
              {Object.entries(groupedBySupplier).map(([supplier, group]) => (
            <div key={supplier} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
              {/* En-tête fournisseur */}
              <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {supplierLogos[supplier] ? (
                      <img 
                        src={getImageUrl(supplierLogos[supplier].image_url)} 
                        alt={supplier} 
                        className="h-10 w-auto object-contain"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <span className="text-xl">🏢</span>
                    )}
                    <h3 className="text-xl font-bold text-gray-900">{group.name}</h3>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                      {group.global && group.tris.length > 0 ? `1 Global + ${group.tris.length} Tri-partites` : group.global ? '1 Global' : `${group.tris.length} Tri-partites`}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-6">
                      <div>
                        <div className="text-sm text-gray-500">Taux Global</div>
                        <div className="text-xl font-bold text-indigo-600">{formatPercent(group.globalRate)}</div>
                      </div>
                      <div className="h-12 w-px bg-gray-300" />
                      <div>
                        <div className="text-sm text-gray-500">Total RFA {group.name}</div>
                        <div className="text-2xl font-bold text-emerald-600">{formatAmount(group.totalRfa)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tableau */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Type / Règle</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">CA Concerné</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Taux RFA</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Montant RFA</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Taux Bonus</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Montant Ligne</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-gray-700">Prochain Objectif</th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-700">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* === ACR : Décomposition spécifique (Inconditionnel + Paliers + Tranche) === */}
                    {supplier === 'ACR' && group.global && group.global.rfaProgress.rate > 0 && (
                      <tr 
                        className="bg-white hover:bg-blue-50 transition-all duration-300"
                        title={`RFA Inconditionnel : ${formatPercent(group.global.rfaProgress.rate)} du CA dès le 1er euro`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 pl-2">
                            <span className="text-xl">📊</span>
                            <div>
                              <div className="font-semibold text-gray-900">RFA Inconditionnel</div>
                              <div className="text-xs text-gray-500">Dès le 1er euro</div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Actif</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(group.global.ca)}</td>
                        <td className="px-4 py-3 text-right"><span className="font-bold text-blue-600">{formatPercent(group.global.rfaProgress.rate)}</span></td>
                        <td className="px-4 py-3 text-right"><span className="font-bold text-gray-900">{formatAmount(group.global.rfaProgress.rate * group.global.ca)}</span></td>
                        <td className="px-4 py-3 text-right text-gray-400">—</td>
                        <td className="px-4 py-3 text-right"><span className="font-bold text-gray-900">{formatAmount(group.global.rfaProgress.rate * group.global.ca)}</span></td>
                        <td className="px-4 py-3 text-right"><span className="text-blue-600 font-semibold">✓ Acquis</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500 w-full" /></div>
                            <span className="text-sm font-bold min-w-[3rem] text-right text-blue-600">100%</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ACR : Bonus Paliers Progressifs */}
                    {supplier === 'ACR' && group.global && group.global.bonusProgress.rate > 0 && (
                      <>
                        <tr 
                          className={`transition-all duration-300 ${group.global.bonusProgress.minReached ? 'bg-emerald-50' : group.global.combinedProgress >= 80 ? 'bg-amber-50' : 'bg-white'}`}
                          title={`Bonus Paliers Progressifs jusqu'à 5M€ : Max 7% à 5M€${group.global.bonusProgress.nextMin && group.global.bonusProgress.nextMin <= 5000000 ? ` | Prochain palier: ${formatAmount(group.global.bonusProgress.nextMin)}` : ''}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 pl-2">
                              <span className="text-xl">🎯</span>
                              <div>
                                <div className="font-semibold text-gray-900">Bonus Paliers Progressifs</div>
                                <div className="text-xs text-gray-500">
                                  {group.global.ca >= 5000000 ? 'Palier 5M€ atteint (7%)' : group.global.bonusProgress.minReached ? `Palier ${formatAmount(group.global.bonusProgress.minReached)} atteint` : 'Seuil minimum non atteint'}
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${group.global.bonusProgress.minReached ? 'bg-emerald-100 text-emerald-700' : group.global.combinedProgress >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {group.global.bonusProgress.minReached ? 'Actif' : group.global.combinedProgress >= 80 ? 'Proche' : 'En cours'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(group.global.ca)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">—</td>
                          <td className="px-4 py-3 text-right text-gray-400">—</td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-bold text-indigo-600">{group.global.ca >= 5000000 ? formatPercent(0.07) : formatPercent(group.global.bonusProgress.rate)}</div>
                            <div className="text-xs text-gray-500">Max 7% à 5M€</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${group.global.bonusProgress.minReached ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {formatAmount((group.global.ca >= 5000000 ? 0.07 : group.global.bonusProgress.rate) * group.global.ca)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {group.global.ca >= 5000000 ? (
                              <span className="text-emerald-600 font-semibold">✓ 5M€ atteint</span>
                            ) : group.global.bonusProgress.nextMin === null || group.global.bonusProgress.nextMin > 5000000 ? (
                              <div><div className="text-gray-900 font-semibold">{formatAmount(5000000)}</div><div className="text-xs text-gray-500">Palier max</div></div>
                            ) : (
                              <div>
                                <div className="text-gray-900 font-semibold">{formatAmount(group.global.bonusProgress.nextMin)}</div>
                                <div className="text-xs text-red-500">-{formatAmount(Math.max(0, group.global.bonusProgress.nextMin - group.global.ca))}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${group.global.ca >= 5000000 ? 'bg-emerald-500' : group.global.combinedProgress >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${Math.min((group.global.ca / 5000000) * 100, 100)}%` }} />
                              </div>
                              <span className={`text-sm font-bold min-w-[3rem] text-right ${group.global.ca >= 5000000 ? 'text-emerald-600' : group.global.combinedProgress >= 80 ? 'text-amber-600' : 'text-gray-600'}`}>
                                {Math.round(Math.min((group.global.ca / 5000000) * 100, 100))}%
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* ACR : Bonus Tranche Isolée au-delà de 5M€ */}
                        {group.global.ca > 5000000 && (
                          <tr className="bg-violet-50 transition-all duration-300"
                            title={`Bonus +0.5% sur tranche isolée : ${formatAmount(group.global.ca - 5000000)} au-delà de 5M€`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 pl-2">
                                <span className="text-xl">⭐</span>
                                <div>
                                  <div className="font-semibold text-gray-900">Bonus Tranche Isolée +0.5%</div>
                                  <div className="text-xs text-violet-600">Sur CA au-delà de 5M€ : {formatAmount(group.global.ca - 5000000)}</div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">Actif</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-semibold text-violet-600">{formatAmount(group.global.ca - 5000000)}</div>
                              <div className="text-xs text-gray-500">Tranche &gt; 5M€</div>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-bold text-violet-600">{formatPercent(Math.floor((group.global.ca - 5000000) / 250000) * 0.005)}</div>
                              <div className="text-xs text-gray-500">{Math.floor((group.global.ca - 5000000) / 250000)} x 0.5%</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-violet-600">{formatAmount((group.global.ca - 5000000) * Math.floor((group.global.ca - 5000000) / 250000) * 0.005)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div><div className="text-gray-900 font-semibold">{formatAmount(5000000 + (Math.floor((group.global.ca - 5000000) / 250000) + 1) * 250000)}</div>
                              <div className="text-xs text-gray-500">Prochaine tranche +0.5%</div></div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-violet-500 transition-all duration-500"
                                    style={{ width: `${Math.min((((group.global.ca - 5000000) % 250000) / 250000) * 100, 100)}%` }} />
                                </div>
                                <span className="text-sm font-bold min-w-[3rem] text-right text-violet-600">
                                  {Math.round(((group.global.ca - 5000000) % 250000) / 250000 * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )}

                    {/* === AUTRES FOURNISSEURS (DCA, ALLIANCE, EXADIS...) : Affichage générique des paliers === */}
                    {supplier !== 'ACR' && group.global && (group.global.rfaProgress.rate > 0 || group.global.bonusProgress.rate > 0) && (
                      <tr 
                        className={`transition-all duration-300 ${
                          group.global.achieved ? 'bg-emerald-50' : group.global.near ? 'bg-amber-50' : 'bg-white'
                        }`}
                        title={`${group.name} : Taux ${formatPercent(group.global.combinedRate)} sur CA de ${formatAmount(group.global.ca)}${group.global.bonusProgress.nextMin ? ` | Prochain palier: ${formatAmount(group.global.bonusProgress.nextMin)}` : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 pl-2">
                            <span className="text-xl">📊</span>
                            <div>
                              <div className="font-semibold text-gray-900">RFA Globale {group.name}</div>
                              <div className="text-xs text-gray-500">
                                {group.global.bonusProgress.minReached 
                                  ? `Palier ${formatAmount(group.global.bonusProgress.minReached)} atteint` 
                                  : group.global.rfaProgress.minReached
                                    ? `Palier ${formatAmount(group.global.rfaProgress.minReached)} atteint`
                                    : 'Seuil minimum non atteint'}
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              (group.global.bonusProgress.minReached || group.global.rfaProgress.minReached) ? 'bg-emerald-100 text-emerald-700' : group.global.combinedProgress >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {(group.global.bonusProgress.minReached || group.global.rfaProgress.minReached) ? 'Actif' : group.global.combinedProgress >= 80 ? 'Proche' : 'En cours'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(group.global.ca)}</td>
                        <td className="px-4 py-3 text-right">
                          {group.global.rfaProgress.rate > 0 ? (
                            <span className="font-bold text-blue-600">{formatPercent(group.global.rfaProgress.rate)}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.global.rfaProgress.rate > 0 ? (
                            <span className="font-bold text-gray-900">{formatAmount(group.global.rfaProgress.rate * group.global.ca)}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.global.bonusProgress.rate > 0 ? (
                            <span className="font-bold text-indigo-600">{formatPercent(group.global.bonusProgress.rate)}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${(group.global.bonusProgress.minReached || group.global.rfaProgress.minReached) ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {formatAmount(group.global.currentRfaAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.global.combinedNextMin ? (
                            <div>
                              <div className="text-gray-900 font-semibold">{formatAmount(group.global.combinedNextMin)}</div>
                              <div className="text-xs text-red-500">-{formatAmount(Math.max(0, group.global.combinedNextMin - group.global.ca))}</div>
                            </div>
                          ) : (group.global.bonusProgress.minReached || group.global.rfaProgress.minReached) ? (
                            <span className="text-emerald-600 font-semibold">✓ Max atteint</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${
                                group.global.achieved ? 'bg-emerald-500' : group.global.near ? 'bg-amber-500' : 'bg-indigo-500'
                              }`} style={{ width: `${Math.min(group.global.combinedProgress, 100)}%` }} />
                            </div>
                            <span className={`text-sm font-bold min-w-[3rem] text-right ${
                              group.global.achieved ? 'text-emerald-600' : group.global.near ? 'text-amber-600' : 'text-gray-600'
                            }`}>{Math.round(Math.min(group.global.combinedProgress, 100))}%</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Lignes tri-partites */}
                    {group.tris.map((row) => (
                      <tr 
                        key={row.key}
                        className={`transition-all duration-300 ${
                          row.achieved
                            ? 'bg-emerald-100'
                            : row.near
                              ? 'bg-amber-100'
                              : 'bg-white'
                        }`}
                        title={`Tri-partite: ${formatPercent(row.triProgress.rate)} sur ${row.label}${row.triProgress.nextMin ? ` | Prochain seuil: ${formatAmount(row.triProgress.nextMin)}` : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 pl-6">
                            <span className="text-xl">🎯</span>
                            <div>
                              <div className="font-semibold text-gray-900">{row.label}</div>
                              <div className="text-xs text-gray-500">
                                {row.noRules
                                  ? 'Règle non configurée dans le contrat Union'
                                  : `Tri-partite ${row.triProgress.minReached ? `(Seuil ${formatAmount(row.triProgress.minReached)} atteint)` : '(Seuil non atteint)'}`}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                row.achieved
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : row.near
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.achieved ? 'Atteint' : row.near ? 'Proche' : 'En cours'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(row.ca)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-purple-600">{formatPercent(row.triProgress.rate)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatAmount(row.currentRfaAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          <span className="text-xs">N/A</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatAmount(row.currentRfaAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.achieved || row.triProgress.nextMin === null ? (
                            <span className="text-emerald-600 font-semibold">✓ Max</span>
                          ) : (
                            <div>
                              <div className="text-gray-900 font-semibold">{formatAmount(row.triProgress.nextMin)}</div>
                              {row.missingCa > 0 && (
                                <div className="text-xs text-red-500">-{formatAmount(row.missingCa)}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  row.achieved 
                                    ? 'bg-emerald-500' 
                                    : row.near 
                                      ? 'bg-amber-500' 
                                      : 'bg-purple-500'
                                }`}
                                style={{ width: `${row.triProgress.progress}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold min-w-[3rem] text-right ${
                              row.achieved ? 'text-emerald-600' : row.near ? 'text-amber-600' : 'text-gray-600'
                            }`}>
                              {Math.round(row.triProgress.progress)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Bonus Groupes (ex: Soutien APA +3%) */}
                    {entity?.rfa?.bonus_groups && entity.rfa.bonus_groups
                      .filter(bg => bg.supplier === supplier)
                      .map((bg, idx) => (
                        <tr key={`bg-${idx}`} className="bg-orange-50 transition-all duration-300">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 pl-6">
                              <span className="text-xl">🤝</span>
                              <div>
                                <div className="font-semibold text-gray-900">{bg.label}</div>
                                <div className="text-xs text-orange-600">{bg.groupe_client} — Bonus +{(bg.bonus_rate * 100).toFixed(0)}%</div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Actif</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-orange-600">{formatAmount(bg.ca)}</div>
                            <div className="text-xs text-gray-500">CA {bg.groupe_client}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">—</td>
                          <td className="px-4 py-3 text-right text-gray-400">—</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-orange-600">{formatPercent(bg.bonus_rate)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-orange-600">{formatAmount(bg.value)}</span>
                          </td>
                          <td className="px-4 py-3 text-right"><span className="text-orange-600 font-semibold">Bonus Groupe</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-orange-500 w-full" />
                              </div>
                              <span className="text-sm font-bold min-w-[3rem] text-right text-orange-600">100%</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    }

                    {/* Marketing & Événement - Retiré d'ici pour être dans un bloc à part */}

                    {/* Ligne sous-total */}
                    <tr className="bg-gradient-to-r from-emerald-50 to-teal-50 font-bold border-t-2 border-emerald-300">
                      <td className="px-4 py-4" colSpan="3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">💰</span>
                          <div>
                            <div className="text-gray-900 text-lg">TOTAL RFA {group.name}</div>
                            <div className="text-xs font-normal text-gray-600">
                              {group.global ? 'Inconditionnel + Bonus' : ''}{group.global && group.tris.length > 0 ? ' + ' : ''}{group.tris.length > 0 ? `${group.tris.length} Tri-partite${group.tris.length > 1 ? 's' : ''}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-gray-700 text-sm font-normal">CA Total</div>
                        <div className="text-lg text-gray-900">{formatAmount(group.totalCa)}</div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-gray-700 text-sm font-normal">Taux Global</div>
                        <div className="text-2xl text-indigo-600">{formatPercent(group.globalRate)}</div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-gray-700 text-sm font-normal">Montant Total</div>
                        <div className="text-2xl text-emerald-600">{formatAmount(group.totalRfa)}</div>
                      </td>
                      <td colSpan="2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
              ))}
            </div>
          )}

          {/* BLOC BUDGET MARKETING (SÉPARÉ) */}
          {Object.values(groupedBySupplier).some(g => g.marketing) && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-pink-200 mt-8">
              <div className="p-5 border-b border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>🎉</span> Budget Marketing & Événement
                </h3>
                <p className="text-sm text-gray-600">Participation des fournisseurs aux événements du Groupement Union</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-pink-50/50 border-b border-pink-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Fournisseur</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Type de rémunération</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Base de calcul</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(groupedBySupplier).map(([supplier, group]) => (
                      group.marketing && (
                        <tr key={supplier} className="hover:bg-pink-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {supplierLogos[supplier] ? (
                                <img 
                                  src={getImageUrl(supplierLogos[supplier].image_url)} 
                                  alt={supplier} 
                                  className="h-8 w-auto object-contain"
                                  onError={(e) => { e.target.style.display = 'none' }}
                                />
                              ) : (
                                <span className="font-bold text-gray-700">{supplier}</span>
                              )}
                              <span className="font-medium text-gray-900">{group.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {group.marketing.calculation_type === 'fixed' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Forfait fixe
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {formatPercent(group.marketing.rate)} du CA
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {group.marketing.calculation_type === 'rate' ? (
                              <span className="text-gray-700 font-medium">{formatAmount(group.marketing.base_amount)}</span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-pink-600 text-lg">{formatAmount(group.marketing.amount)}</span>
                          </td>
                        </tr>
                      )
                    ))}
                    {/* Total row */}
                    <tr className="bg-gradient-to-r from-pink-50 to-rose-50 border-t-2 border-pink-300 font-bold">
                      <td colSpan="3" className="px-6 py-4 text-gray-900 text-right uppercase tracking-wider text-sm">Total Budget Marketing</td>
                      <td className="px-6 py-4 text-right text-pink-700 text-2xl">
                        {formatAmount(Object.values(groupedBySupplier).reduce((sum, g) => sum + (g.marketing?.amount || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SYNTHÈSE CONSOLIDÉE */}
      {activeTab === 'synthesis' && (() => {
        const suppliers = Object.entries(groupedBySupplier)
        const totalCaAll = suppliers.reduce((sum, [, g]) => sum + (g.totalCa || 0), 0)
        const totalRfaAll = suppliers.reduce((sum, [, g]) => sum + (g.totalRfa || 0), 0)
        const totalMarketingAll = suppliers.reduce((sum, [, g]) => sum + (g.marketing?.amount || 0), 0)
        const triTotalAll = filteredTriRows.reduce((sum, r) => sum + r.currentRfaAmount, 0)
        const grandTotalRfa = totalRfaAll + triTotalAll
        // Trier par CA decroissant
        const sortedSuppliers = [...suppliers].sort((a, b) => (b[1].totalCa || 0) - (a[1].totalCa || 0))
        // Couleurs par fournisseur
        const supplierColors = { ACR: 'blue', DCA: 'emerald', EXADIS: 'purple', ALLIANCE: 'amber', SCHAEFFLER: 'rose', PURFLUX: 'slate' }
        const getColor = (key) => supplierColors[key] || 'gray'
        // Alertes proximite paliers
        const alerts = []
        filteredGlobalRows.forEach(row => {
          if (row.combinedNextMin && row.missingCa && row.missingCa > 0) {
            const supplierKey = row.key.replace('GLOBAL_', '')
            
            // ACR au-dessus de 5M : le gain vient du bonus tranche isolee (+0.5% par 250K)
            // et non des paliers standards. On recalcule correctement.
            if (supplierKey === 'ACR' && row.ca >= 5000000) {
              const currentTranches = Math.floor((row.ca - 5000000) / 250000)
              const nextTrancheThreshold = 5000000 + (currentTranches + 1) * 250000
              const missingForNextTranche = nextTrancheThreshold - row.ca
              const progressTranche = ((row.ca - 5000000) % 250000) / 250000 * 100
              // Gain = sur la tranche au-dela de 5M, le taux bonus augmente de 0.5%
              // Nouveau montant bonus = (nextTranches * 0.005) * (nextTrancheThreshold - 5000000)
              // Ancien montant bonus = (currentTranches * 0.005) * (row.ca - 5000000)
              const currentBonus = currentTranches * 0.005 * (row.ca - 5000000)
              const nextBonus = (currentTranches + 1) * 0.005 * (nextTrancheThreshold - 5000000)
              const realGain = nextBonus - currentBonus
              alerts.push({
                supplier: supplierKey,
                label: `${row.label} — Bonus Tranche Isolee`,
                currentCa: row.ca,
                nextThreshold: nextTrancheThreshold,
                missing: missingForNextTranche,
                currentRate: currentTranches * 0.005,
                nextRate: (currentTranches + 1) * 0.005,
                projectedGain: Math.round(realGain * 100) / 100,
                progress: progressTranche
              })
              return
            }
            
            alerts.push({
              supplier: supplierKey,
              label: row.label,
              currentCa: row.ca,
              nextThreshold: row.combinedNextMin,
              missing: row.missingCa,
              currentRate: row.combinedRate,
              nextRate: row.nextCombinedRate,
              projectedGain: row.projectedGain,
              progress: row.combinedProgress
            })
          }
        })
        filteredTriRows.forEach(row => {
          if (row.triProgress.nextMin && row.missingCa && row.missingCa > 0) {
            const match = row.key.match(/TRI_([A-Z]+)_/)
            alerts.push({
              supplier: match ? match[1] : '?',
              label: row.label,
              currentCa: row.ca,
              nextThreshold: row.triProgress.nextMin,
              missing: row.missingCa,
              currentRate: row.triProgress.rate,
              nextRate: null,
              projectedGain: row.projectedGain,
              progress: row.triProgress.progress
            })
          }
        })
        // Trier alertes par montant manquant croissant (les plus proches en premier)
        alerts.sort((a, b) => a.missing - b.missing)

        return (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-lg p-5 border border-purple-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📈</span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Synthese Consolidee</h2>
                  <p className="text-sm text-gray-600">Vue croisee et analyse inter-fournisseurs</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm text-gray-500">CA Total Union</div>
                  <div className="text-xl font-bold text-gray-900">{formatAmount(totalCaAll)}</div>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="text-right">
                  <div className="text-sm text-gray-500">RFA Normale</div>
                  <div className="text-xl font-bold text-emerald-600">{formatAmount(totalRfaAll)}</div>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="text-right">
                  <div className="text-sm text-gray-500">Marketing</div>
                  <div className="text-xl font-bold text-pink-600">{formatAmount(totalMarketingAll)}</div>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="text-right">
                  <div className="text-sm text-gray-500">Taux Moyen</div>
                  <div className="text-xl font-bold text-indigo-600">{totalCaAll > 0 ? formatPercent(totalRfaAll / totalCaAll) : '0 %'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 1. Repartition CA par fournisseur */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>📊</span> Repartition du CA par fournisseur
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {sortedSuppliers.map(([key, group]) => {
                const pctCa = totalCaAll > 0 ? (group.totalCa / totalCaAll) * 100 : 0
                const pctRfa = totalRfaAll > 0 ? (group.totalRfa / totalRfaAll) * 100 : 0
                const color = getColor(key)
                return (
                  <div key={key} className="flex items-center gap-4">
                    {/* Logo + Nom */}
                    <div className="w-40 flex items-center gap-2 flex-shrink-0">
                      {supplierLogos[key] ? (
                        <img src={getImageUrl(supplierLogos[key].image_url)} alt={key} className="h-8 w-auto object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                      ) : (
                        <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                          <span className={`font-bold text-xs text-${color}-600`}>{key[0]}</span>
                        </div>
                      )}
                      <span className="font-semibold text-gray-900 text-sm">{group.name}</span>
                    </div>
                    {/* Barre CA */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 w-8">CA</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700`}
                            style={{ width: `${pctCa}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-gray-700 w-24 text-right">{formatAmount(group.totalCa)}</span>
                        <span className="text-xs text-gray-500 w-12 text-right">{pctCa.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-8">RFA</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700`}
                            style={{ width: `${pctRfa}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-emerald-600 w-24 text-right">{formatAmount(group.totalRfa)}</span>
                        <span className="text-xs text-gray-500 w-12 text-right">{pctRfa.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. Comparatif Taux RFA effectifs */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-teal-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>🎯</span> Comparatif des taux RFA effectifs
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-sm font-semibold text-gray-700">Fournisseur</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">CA Global</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">RFA Globale</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">Tri-partites</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">Marketing</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">RFA Normale</th>
                    <th className="text-right px-5 py-3 text-sm font-semibold text-gray-700">Taux Effectif</th>
                    <th className="px-5 py-3 text-sm font-semibold text-gray-700">Poids RFA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedSuppliers.map(([key, group]) => {
                    const triRfa = group.tris.reduce((sum, t) => sum + t.currentRfaAmount, 0)
                    const globalRfa = group.totalRfa - triRfa  // RFA globale seule (sans tri)
                    const marketing = group.marketing ? group.marketing.amount : 0
                    const totalSupplierRfa = group.totalRfa  // totalRfa inclut deja global + tri (mais pas marketing)
                    const effectiveRate = group.totalCa > 0 ? totalSupplierRfa / group.totalCa : 0
                    const pctOfTotal = totalRfaAll > 0 ? (totalSupplierRfa / totalRfaAll) * 100 : 0
                    return (
                      <tr key={key} className="hover:bg-blue-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {supplierLogos[key] ? (
                              <img src={getImageUrl(supplierLogos[key].image_url)} alt={key} className="h-7 w-auto object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                            ) : null}
                            <span className="font-semibold text-gray-900">{group.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatAmount(group.totalCa)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-semibold text-blue-600">{formatAmount(globalRfa)}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${triRfa > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                            {triRfa > 0 ? formatAmount(triRfa) : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${marketing > 0 ? 'text-pink-600' : 'text-gray-400'}`}>
                            {marketing > 0 ? formatAmount(marketing) : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-bold text-emerald-600">{formatAmount(totalSupplierRfa)}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-bold text-lg ${effectiveRate >= 0.15 ? 'text-emerald-600' : effectiveRate >= 0.10 ? 'text-blue-600' : 'text-gray-600'}`}>
                            {formatPercent(effectiveRate)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500" style={{ width: `${Math.min(pctOfTotal, 100)}%` }} />
                            </div>
                            <span className="text-sm font-bold text-gray-600 w-12 text-right">{pctOfTotal.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Ligne total */}
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 font-bold border-t-2 border-gray-300">
                    <td className="px-5 py-3 text-gray-900">TOTAL UNION</td>
                    <td className="px-5 py-3 text-right text-gray-900">{formatAmount(totalCaAll)}</td>
                    <td className="px-5 py-3 text-right text-blue-600">{formatAmount(totalRfaAll - filteredTriRows.reduce((s, r) => s + r.currentRfaAmount, 0))}</td>
                    <td className="px-5 py-3 text-right text-purple-600">{formatAmount(filteredTriRows.reduce((s, r) => s + r.currentRfaAmount, 0))}</td>
                    <td className="px-5 py-3 text-right text-pink-600">{formatAmount(totalMarketingAll)}</td>
                    <td className="px-5 py-3 text-right text-emerald-600">{formatAmount(totalRfaAll)}</td>
                    <td className="px-5 py-3 text-right text-indigo-600 text-lg">{totalCaAll > 0 ? formatPercent(totalRfaAll / totalCaAll) : '0 %'}</td>
                    <td className="px-5 py-3 text-right text-gray-900">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Alertes proximite paliers */}
          {alerts.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-amber-200">
              <div className="p-5 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>🚀</span> Opportunites de gains — Paliers proches ({alerts.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">Fournisseurs proches d'un palier superieur, tries par CA manquant</p>
              </div>
              <div className="divide-y divide-gray-100">
                {alerts.slice(0, 10).map((alert, idx) => (
                  <div key={idx} className={`p-4 flex items-center gap-4 ${alert.progress >= 90 ? 'bg-amber-50' : 'bg-white'} hover:bg-blue-50 transition-colors`}>
                    <div className="flex-shrink-0">
                      {supplierLogos[alert.supplier] ? (
                        <img src={getImageUrl(supplierLogos[alert.supplier].image_url)} alt={alert.supplier} className="h-8 w-auto object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                          <span className="font-bold text-amber-700 text-xs">{alert.supplier}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{alert.label}</span>
                        {alert.progress >= 90 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse">Tres proche !</span>
                        )}
                        {alert.progress >= 80 && alert.progress < 90 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Proche</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        CA actuel : {formatAmount(alert.currentCa)} — Prochain palier : {formatAmount(alert.nextThreshold)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-red-600">-{formatAmount(alert.missing)}</div>
                      <div className="text-xs text-gray-500">CA manquant</div>
                    </div>
                    <div className="text-right flex-shrink-0 w-20">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${alert.progress >= 90 ? 'bg-red-500' : alert.progress >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(alert.progress, 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold">{Math.round(alert.progress)}%</span>
                      </div>
                    </div>
                    {alert.projectedGain > 0 && (
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-emerald-600">+{formatAmount(alert.projectedGain)}</div>
                        <div className="text-xs text-gray-500">Gain potentiel</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BLOC BUDGET MARKETING (COPIE POUR SYNTHÈSE) */}
          {Object.values(groupedBySupplier).some(g => g.marketing) && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-pink-200">
              <div className="p-5 border-b border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>🎉</span> Budget Marketing & Événement
                </h3>
                <p className="text-sm text-gray-600">Participation des fournisseurs aux événements du Groupement Union</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-pink-50/50 border-b border-pink-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Fournisseur</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">Type de rémunération</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Base de calcul</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-700">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(groupedBySupplier).map(([supplier, group]) => (
                      group.marketing && (
                        <tr key={supplier} className="hover:bg-pink-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {supplierLogos[supplier] ? (
                                <img 
                                  src={getImageUrl(supplierLogos[supplier].image_url)} 
                                  alt={supplier} 
                                  className="h-8 w-auto object-contain"
                                  onError={(e) => { e.target.style.display = 'none' }}
                                />
                              ) : (
                                <span className="font-bold text-gray-700">{supplier}</span>
                              )}
                              <span className="font-medium text-gray-900">{group.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {group.marketing.calculation_type === 'fixed' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Forfait fixe
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {formatPercent(group.marketing.rate)} du CA
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {group.marketing.calculation_type === 'rate' ? (
                              <span className="text-gray-700 font-medium">{formatAmount(group.marketing.base_amount)}</span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-pink-600 text-lg">{formatAmount(group.marketing.amount)}</span>
                          </td>
                        </tr>
                      )
                    ))}
                    {/* Total row */}
                    <tr className="bg-gradient-to-r from-pink-50 to-rose-50 border-t-2 border-pink-300 font-bold">
                      <td colSpan="3" className="px-6 py-4 text-gray-900 text-right uppercase tracking-wider text-sm">Total Budget Marketing</td>
                      <td className="px-6 py-4 text-right text-pink-700 text-2xl">
                        {formatAmount(Object.values(groupedBySupplier).reduce((sum, g) => sum + (g.marketing?.amount || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. KPIs rapides */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-md p-5 border border-blue-100">
              <div className="text-sm text-gray-500 mb-1">Fournisseurs actifs</div>
              <div className="text-3xl font-bold text-blue-600">{sortedSuppliers.filter(([,g]) => g.totalCa > 0).length}</div>
              <div className="text-xs text-gray-400 mt-1">avec du CA</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-5 border border-emerald-100">
              <div className="text-sm text-gray-500 mb-1">Meilleur taux RFA</div>
              {(() => {
                const best = sortedSuppliers.filter(([,g]) => g.totalCa > 0).sort((a, b) => (b[1].globalRate || 0) - (a[1].globalRate || 0))[0]
                return best ? (
                  <>
                    <div className="text-3xl font-bold text-emerald-600">{formatPercent(best[1].globalRate)}</div>
                    <div className="text-xs text-gray-400 mt-1">{best[1].name}</div>
                  </>
                ) : <div className="text-3xl font-bold text-gray-400">—</div>
              })()}
            </div>
            <div className="bg-white rounded-xl shadow-md p-5 border border-amber-100">
              <div className="text-sm text-gray-500 mb-1">Paliers proches</div>
              <div className="text-3xl font-bold text-amber-600">{alerts.filter(a => a.progress >= 80).length}</div>
              <div className="text-xs text-gray-400 mt-1">{'>'}80% de progression</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-5 border border-purple-100">
              <div className="text-sm text-gray-500 mb-1">Gains potentiels</div>
              <div className="text-3xl font-bold text-purple-600">{formatAmount(alerts.reduce((sum, a) => sum + (a.projectedGain || 0), 0))}</div>
              <div className="text-xs text-gray-400 mt-1">si paliers atteints</div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* EXPORTS & RAPPORTS */}
      {activeTab === 'export' && (() => {
        const handleExportPdf = async () => {
          try {
            setExporting(prev => ({ ...prev, pdf: true }))
            setExportSuccess(null)
            const blob = await exportUnionPdf(importId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `RFA_Union_${importId.slice(0, 8)}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
            setExportSuccess('pdf')
            setTimeout(() => setExportSuccess(null), 3000)
          } catch (err) {
            alert('Erreur lors de la generation du PDF: ' + (err.message || 'erreur inconnue'))
          } finally {
            setExporting(prev => ({ ...prev, pdf: false }))
          }
        }

        const handleExportExcel = async () => {
          try {
            setExporting(prev => ({ ...prev, excel: true }))
            setExportSuccess(null)
            const blob = await exportUnionExcel(importId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `RFA_Union_${importId.slice(0, 8)}.xlsx`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
            setExportSuccess('excel')
            setTimeout(() => setExportSuccess(null), 3000)
          } catch (err) {
            alert('Erreur lors de l\'export Excel: ' + (err.message || 'erreur inconnue'))
          } finally {
            setExporting(prev => ({ ...prev, excel: false }))
          }
        }

        return (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-5 border border-green-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📄</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Exports & Rapports</h2>
                <p className="text-sm text-gray-600">Telechargez vos rapports RFA Union en PDF ou Excel</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export PDF */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:border-red-300 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">📑</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Rapport PDF</h3>
                  <p className="text-sm text-gray-600">Rapport complet pour la direction</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 mb-4 space-y-1 ml-4">
                <li>- KPIs : CA total, RFA totale, taux moyen</li>
                <li>- Detail RFA globales par fournisseur</li>
                <li>- Detail tri-partites</li>
                <li>- Grand total avec taux global</li>
              </ul>
              <button 
                onClick={handleExportPdf}
                disabled={exporting.pdf || !importId}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition-all shadow-lg flex items-center justify-center gap-2 ${
                  exportSuccess === 'pdf' 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700 disabled:opacity-50'
                }`}
              >
                {exporting.pdf ? (
                  <><span className="animate-spin">⏳</span> Generation en cours...</>
                ) : exportSuccess === 'pdf' ? (
                  <><span>✅</span> PDF telecharge !</>
                ) : (
                  <><span>📑</span> Generer le rapport PDF</>
                )}
              </button>
            </div>

            {/* Export Excel */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:border-green-300 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">📊</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Export Excel</h3>
                  <p className="text-sm text-gray-600">Donnees structurees pour analyse</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 mb-4 space-y-1 ml-4">
                <li>- Feuille Synthese Union complete</li>
                <li>- RFA globales avec taux et montants</li>
                <li>- Tri-partites avec seuils et paliers</li>
                <li>- Formatable et exploitable dans Excel</li>
              </ul>
              <button 
                onClick={handleExportExcel}
                disabled={exporting.excel || !importId}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition-all shadow-lg flex items-center justify-center gap-2 ${
                  exportSuccess === 'excel' 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 disabled:opacity-50'
                }`}
              >
                {exporting.excel ? (
                  <><span className="animate-spin">⏳</span> Generation en cours...</>
                ) : exportSuccess === 'excel' ? (
                  <><span>✅</span> Excel telecharge !</>
                ) : (
                  <><span>📊</span> Telecharger en Excel</>
                )}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Informations sur les exports</p>
                <p>Les rapports sont generes a partir des donnees de l'import en cours. Ils incluent toutes les RFA calculees avec les contrats Union actifs ({entity?.contract_applied?.name || 'N/A'}).</p>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

export default UnionSpacePage
