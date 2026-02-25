import { useEffect, useMemo, useState, useRef } from 'react'
import { getEntities, getEntityDetail, getContractRules, getEntityOverrides, getSupplierLogos, getImageUrl, exportEntityPdf, getSmartPlans } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import AdsTicker from '../components/AdsTicker'

function ClientSpacePage({ importId, linkedCodeUnion, linkedGroupe, isAdherent }) {
  const { supplierFilter, getKeysForCurrentSupplier } = useSupplierFilter()
  const supplierKeys = useMemo(() => getKeysForCurrentSupplier(), [getKeysForCurrentSupplier])

  // Si adhérent avec lien, déterminer le mode automatiquement
  const getInitialMode = () => {
    if (linkedCodeUnion) return 'client'
    if (linkedGroupe) return 'group'
    return 'client'
  }
  
  const [mode, setMode] = useState(getInitialMode())
  const [entities, setEntities] = useState([])
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState(null)
  const [rulesMap, setRulesMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [supplierLogos, setSupplierLogos] = useState({})
  const [exportingPdf, setExportingPdf] = useState(false)
  const [smartPlans, setSmartPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)

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

  // Charger automatiquement l'entité liée pour les adhérents
  useEffect(() => {
    if (isAdherent && (linkedCodeUnion || linkedGroupe)) {
      const entityId = linkedCodeUnion || linkedGroupe
      const entityMode = linkedCodeUnion ? 'client' : 'group'
      setMode(entityMode)
      loadEntity(entityId)
    }
  }, [isAdherent, linkedCodeUnion, linkedGroupe, importId])

  useEffect(() => {
    // Ne pas charger toutes les entités si adhérent avec lien
    if (isAdherent && (linkedCodeUnion || linkedGroupe)) {
      return
    }
    
    const loadEntities = async () => {
      try {
        const data = await getEntities(importId, mode)
        setEntities(data || [])
      } catch (err) {
        setError(err.response?.data?.detail || `Erreur lors du chargement des ${mode === 'client' ? 'clients' : 'groupes'}`)
      }
    }
    if (importId) {
      loadEntities()
      setEntity(null)
      setQuery('')
      setRulesMap({})
    }
  }, [importId, mode, isAdherent, linkedCodeUnion, linkedGroupe])

  const suggestions = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return entities.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8)
  }, [entities, query])

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

  const loadEntity = async (entityId) => {
    if (!entityId) return
    try {
      setLoading(true)
      setError(null)
      const detail = await getEntityDetail(importId, mode, entityId)
      setEntity(detail)
      
      if (detail?.contract_applied?.id) {
        const rules = await getContractRules(detail.contract_applied.id)
        const map = {}
        for (const rule of rules || []) {
          map[rule.key] = {
            ...rule,
            tiers_rfa: parseTiers(rule.tiers_rfa),
            tiers_bonus: parseTiers(rule.tiers_bonus),
            tiers: parseTiers(rule.tiers),
          }
        }
        
        const targetType = mode === 'client' ? 'CODE_UNION' : 'GROUPE_CLIENT'
        try {
          const overrides = await getEntityOverrides(targetType, entityId)
          for (const override of overrides || []) {
            const key = override.field_key
            if (!map[key]) {
              map[key] = { key, tiers_rfa: [], tiers_bonus: [], tiers: [] }
            }
            try {
              const customTiers = JSON.parse(override.custom_tiers || '[]')
              const parsedTiers = customTiers.map(t => ({ min: Number(t.min) || 0, rate: Number(t.rate) || 0 }))
                .sort((a, b) => a.min - b.min)
              
              if (override.tier_type === 'rfa') {
                map[key].tiers_rfa = parsedTiers
                map[key].has_override_rfa = true
              } else if (override.tier_type === 'bonus') {
                map[key].tiers_bonus = parsedTiers
                map[key].has_override_bonus = true
              } else if (override.tier_type === 'tri') {
                map[key].tiers = parsedTiers
                map[key].has_override_tri = true
              }
            } catch (e) {
              console.warn('Erreur parsing override:', e)
            }
          }
        } catch (err) {
          console.warn('Impossible de charger les overrides:', err)
        }
        
        setRulesMap(map)
      } else {
        setRulesMap({})
      }

      // Charger les plans d'achat optimisés
      setLoadingPlans(true)
      try {
        const plans = await getSmartPlans(importId, entityId)
        setSmartPlans(plans || [])
      } catch (e) {
        console.warn('Plans non disponibles:', e)
        setSmartPlans([])
      } finally {
        setLoadingPlans(false)
      }
    } catch (err) {
      setError(err.response?.data?.detail || `Erreur lors du chargement ${mode === 'client' ? 'du client' : 'du groupe'}`)
      setEntity(null)
      setRulesMap({})
      setSmartPlans([])
    } finally {
      setLoading(false)
    }
  }

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
        hasOverride: rule?.has_override_rfa || rule?.has_override_bonus,
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
        hasOverride: rule?.has_override_tri,
      }
    })
  }, [entity, rulesMap])

  // Totaux affichés : quand filtre fournisseur actif = uniquement CA et RFA de la plateforme sélectionnée
  const { caTotalDisplay, rfaTotalDisplay, rfaRateDisplay } = useMemo(() => {
    const filteredGlobal = globalRows.filter(r => !r.noRules)
    const filteredTri = triRows.filter(r => !r.noRules)
    const g = supplierFilter && supplierKeys.length ? filteredGlobal.filter(r => supplierKeys.includes(r.key)) : filteredGlobal
    const t = supplierFilter && supplierKeys.length ? filteredTri.filter(r => supplierKeys.includes(r.key)) : filteredTri
    if (supplierFilter && (g.length > 0 || t.length > 0)) {
      const ca = g.reduce((s, r) => s + (r.ca || 0), 0) + t.reduce((s, r) => s + (r.ca || 0), 0)
      const rfa = g.reduce((s, r) => s + (r.currentRfaAmount || 0), 0) + t.reduce((s, r) => s + (r.currentRfaAmount || 0), 0)
      return { caTotalDisplay: ca, rfaTotalDisplay: rfa, rfaRateDisplay: ca > 0 ? rfa / ca : 0 }
    }
    const globalTotal = entity?.ca?.totals?.global_total || 0
    const rfaTotal = entity?.rfa?.totals?.grand_total || 0
    return { caTotalDisplay: globalTotal, rfaTotalDisplay: rfaTotal, rfaRateDisplay: globalTotal > 0 ? rfaTotal / globalTotal : 0 }
  }, [entity, supplierFilter, supplierKeys, globalRows, triRows])

  // Filtrer les lignes sans règles + par fournisseur si filtre actif
  const filteredGlobalRows = useMemo(() => {
    const base = globalRows.filter(r => !r.noRules)
    if (!supplierFilter || supplierKeys.length === 0) return base
    return base.filter(r => supplierKeys.includes(r.key))
  }, [globalRows, supplierFilter, supplierKeys])
  const filteredTriRows = useMemo(() => {
    const base = triRows.filter(r => !r.noRules)
    if (!supplierFilter || supplierKeys.length === 0) return base
    return base.filter(r => supplierKeys.includes(r.key))
  }, [triRows, supplierFilter, supplierKeys])

  // Gain potentiel = seulement les objectifs PROCHES (sur lignes filtrées)
  const potentialGainNear = useMemo(() => {
    const globalGain = filteredGlobalRows.filter(r => r.near).reduce((sum, row) => sum + (row.projectedGain || 0), 0)
    const triGain = filteredTriRows.filter(r => r.near).reduce((sum, row) => sum + (row.projectedGain || 0), 0)
    return globalGain + triGain
  }, [filteredGlobalRows, filteredTriRows])

  // Compteurs (sur les lignes filtrées affichées)
  const achievedGlobal = filteredGlobalRows.filter(r => r.achieved)
  const achievedTri = filteredTriRows.filter(r => r.achieved)
  const nearGlobal = filteredGlobalRows.filter(r => r.near)
  const nearTri = filteredTriRows.filter(r => r.near)
  const achievedCount = achievedGlobal.length + achievedTri.length
  const nearCount = nearGlobal.length + nearTri.length
  const totalObjectives = filteredGlobalRows.length + filteredTriRows.length

  // Refs pour scroll
  const rowRefs = useRef({})
  
  const scrollToRow = (key) => {
    if (rowRefs.current[key]) {
      rowRefs.current[key].scrollIntoView({ behavior: 'smooth', block: 'center' })
      rowRefs.current[key].classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2')
      setTimeout(() => {
        rowRefs.current[key]?.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2')
      }, 2000)
    }
  }
  
  const scrollToFirstAchieved = () => {
    const first = [...achievedGlobal, ...achievedTri][0]
    if (first) scrollToRow(first.key)
  }
  
  const scrollToFirstNear = () => {
    const first = [...nearGlobal, ...nearTri][0]
    if (first) scrollToRow(first.key)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 -mx-6 -mt-6 px-6 py-6 mb-6 rounded-b-2xl shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-white">🎯 Espace Client</h1>
          {supplierFilter && (
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30">
              Vue {supplierFilter} uniquement
            </span>
          )}
        </div>
        <p className="text-indigo-100 text-sm mt-1">Suivez vos performances et maximisez vos RFA{supplierFilter ? ` (données ${supplierFilter})` : ''}</p>
      </div>

      <AdsTicker />

      {/* Tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💡</span>
            <p className="text-sm text-amber-800">
              <span className="font-bold">66€/jour</span> = ~20K€/an • <span className="font-bold">166€/jour</span> = ~50K€/an
            </p>
          </div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <p className="text-sm text-violet-800">
              Freinage + Embrayage = <span className="font-bold">50%</span> de vos achats → RFA maximisée !
            </p>
          </div>
        </div>
      </div>

      {/* Recherche - masquée pour les adhérents avec entité liée */}
      {!(isAdherent && (linkedCodeUnion || linkedGroupe)) && (
        <div className="card p-5">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => setMode('client')}
                className={`px-4 py-2 text-sm font-medium transition-all ${
                  mode === 'client' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                👤 Client
              </button>
              <button
                onClick={() => setMode('group')}
                className={`px-4 py-2 text-sm font-medium transition-all ${
                  mode === 'group' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                👥 Groupe
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === 'client' ? 'Code Union ou raison sociale...' : 'Nom du groupe...'}
              className="input-field w-full pl-10"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            {suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors text-sm"
                    onClick={() => { setQuery(item.label); loadEntity(item.id) }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => loadEntity(query.split(' - ')[0].trim())}
              className="btn-primary"
              disabled={!query || loading}
            >
              {loading ? '⏳ Chargement...' : '🚀 Consulter'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {entity && (
        <>
          {/* Export PDF + KPI Cards */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              type="button"
              onClick={async () => {
                const entityId = mode === 'client' ? (entity.code_union || entity.id) : (entity.groupe_client || entity.id)
                if (!importId || !entityId) return
                setExportingPdf(true)
                try {
                  await exportEntityPdf(importId, mode, entityId, entity.contract_applied?.id)
                } catch (err) {
                  alert('Erreur lors de l\'export PDF: ' + (err.response?.data?.detail || err.message))
                } finally {
                  setExportingPdf(false)
                }
              }}
              disabled={exportingPdf}
              className="px-4 py-2 bg-white border-2 border-indigo-500 text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-all disabled:opacity-50 flex items-center gap-2 shadow-md"
            >
              {exportingPdf ? '⏳ Génération...' : '📄 Exporter en PDF'}
            </button>
            <p className="text-sm text-gray-500">Export identique à cette page pour envoyer les détails RFA au client.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4 bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <div className="text-slate-400 text-xs">{mode === 'client' ? 'Client' : 'Groupe'}</div>
              <div className="text-lg font-bold truncate">{entity.code_union || entity.groupe_client}</div>
              <div className="text-xs text-slate-400 truncate">{entity.contract_applied?.name || 'Défaut'}</div>
            </div>
            <div className="card p-4 bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <div className="text-blue-100 text-xs">💼 CA {supplierFilter ? `(${supplierFilter})` : 'Global'}</div>
              <div className="text-xl font-black">{formatAmount(caTotalDisplay)}</div>
            </div>
            <div className="card p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <div className="text-emerald-100 text-xs">💰 RFA Totale{supplierFilter ? ` (${supplierFilter})` : ''}</div>
              <div className="text-xl font-black">{formatAmount(rfaTotalDisplay)}</div>
              <div className="text-emerald-100 text-xs">{formatPercent(rfaRateDisplay)}</div>
            </div>
            <div className={`card p-4 text-white ${nearCount > 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
              <div className="text-white/80 text-xs">🎯 Gain à portée</div>
              <div className="text-xl font-black">{nearCount > 0 ? `+${formatAmount(potentialGainNear)}` : '-'}</div>
              <div className="text-white/80 text-xs">{nearCount} objectif{nearCount > 1 ? 's' : ''} proche{nearCount > 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Stats badges cliquables */}
          <div className="flex flex-wrap gap-2 justify-center">
            {achievedCount > 0 && (
              <button onClick={scrollToFirstAchieved} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 transition-all cursor-pointer">
                🏆 {achievedCount} atteint{achievedCount > 1 ? 's' : ''}
              </button>
            )}
            {nearCount > 0 && (
              <button onClick={scrollToFirstNear} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold hover:bg-amber-200 transition-all cursor-pointer animate-pulse">
                🔥 {nearCount} proche{nearCount > 1 ? 's' : ''} (+{formatAmount(potentialGainNear)})
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-sm">
              📊 {totalObjectives} objectif{totalObjectives > 1 ? 's' : ''}
            </span>
          </div>

          {/* Plans d'achat optimisés — AU-DESSUS des fournisseurs */}
          {smartPlans.length > 0 && (() => {
            // Calcul RFA totale actuelle et projetée (plateforme sélectionnée si filtre)
            const currentRfaTotal = rfaTotalDisplay
            const bestPlanGain = smartPlans.reduce((sum, plan) => {
              const bonusOk = plan.bonus_reasonable
              return sum + (bonusOk && plan.bonus_effort > 0 ? (plan.gain_option_b || 0) : (plan.gain_option_a || 0))
            }, 0)
            const projectedRfaTotal = currentRfaTotal + bestPlanGain
            const totalInvestment = smartPlans.reduce((sum, plan) => {
              const bonusOk = plan.bonus_reasonable
              return sum + (bonusOk && plan.bonus_effort > 0 ? (plan.total_with_bonus || 0) : (plan.total_ca_needed || 0))
            }, 0)

            return (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-violet-500 to-indigo-600">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold">🎯 Plans d'achat optimisés</h3>
                    <p className="text-violet-100 text-xs">Combinez vos tri-partites pour débloquer plusieurs paliers avec les mêmes euros</p>
                  </div>
                  {bestPlanGain > 0 && (
                    <div className="text-right bg-white/15 rounded-xl px-4 py-2">
                      <div className="text-violet-100 text-xs">Si tous les plans sont exécutés</div>
                      <div className="text-white font-bold text-sm">
                        {formatAmount(currentRfaTotal)} → <span className="text-emerald-300">{formatAmount(projectedRfaTotal)}</span>
                      </div>
                      <div className="text-emerald-300 text-xs font-semibold">+{formatAmount(bestPlanGain)} de RFA avec {formatAmount(totalInvestment)} d'achat</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {smartPlans.map((plan, idx) => {
                  const bonus = plan.bonus_effort || 0
                  const bonusOk = plan.bonus_reasonable
                  const gainA = plan.gain_option_a || 0
                  const gainB = plan.gain_option_b || 0
                  return (
                    <div key={idx} className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{plan.tiers_unlocked >= 3 || (bonusOk && plan.tiers_with_bonus >= 3) ? '🏆' : '🎯'}</span>
                        <div>
                          <div className="font-bold text-gray-900">
                            {plan.global_label}
                            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                              {plan.global_unlocked ? `${plan.tiers_unlocked} paliers` : bonusOk ? `jusqu'à ${plan.tiers_with_bonus} paliers` : `${plan.tiers_unlocked} paliers`}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            CA global actuel {formatAmount(plan.global_ca)} → palier à {formatAmount(plan.global_ca + plan.global_missing)} (manque {formatAmount(plan.global_missing)})
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 ml-10 mb-3">
                        {plan.plan_items.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                              <div className="text-xs text-gray-500">CA {formatAmount(item.ca)} ({Math.round(item.progress)}%) — contribue au global {plan.global_label}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-violet-600">+{formatAmount(item.ca_to_push)}</div>
                              <div className="text-xs text-emerald-600 font-semibold">→ +{formatAmount(item.projected_gain)} RFA</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="ml-10 space-y-1.5">
                        {plan.global_unlocked ? (
                          <div className="bg-emerald-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-emerald-600 font-bold text-sm">✅ {formatAmount(plan.total_ca_needed)} d'achat</span>
                              <span className="text-gray-500 text-sm">→</span>
                              <span className="text-sm font-bold text-gray-900">{plan.tiers_unlocked} palier(s) débloqués</span>
                              <span className="text-gray-500 text-sm">→</span>
                              <span className="text-emerald-600 font-bold text-sm">RFA passe de {formatAmount(rfaTotalDisplay)} à {formatAmount(rfaTotalDisplay + gainA)} (+{formatAmount(gainA)})</span>
                            </div>
                            <div className="text-xs text-emerald-700 mt-1">Les achats tri-partites suffisent à déclencher le palier global {plan.global_label}</div>
                          </div>
                        ) : (
                          <>
                            <div className="bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-gray-700 font-semibold text-sm">Option A : {formatAmount(plan.total_ca_needed)} d'achat</span>
                              <span className="text-gray-400 text-sm">→</span>
                              <span className="text-sm font-bold text-gray-900">{plan.tiers_unlocked} palier(s)</span>
                              <span className="text-gray-400 text-sm">→</span>
                              <span className="text-emerald-600 font-bold text-sm">RFA passe de {formatAmount(rfaTotalDisplay)} à {formatAmount(rfaTotalDisplay + gainA)}</span>
                              </div>
                            </div>
                            {bonusOk && bonus > 0 && (
                              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-amber-700 font-bold text-sm">🔥 Option B : {formatAmount(plan.total_with_bonus)} d'achat</span>
                                  <span className="text-gray-400 text-sm">→</span>
                                  <span className="text-sm font-bold text-gray-900">{plan.tiers_with_bonus} palier(s)</span>
                                  <span className="text-gray-400 text-sm">→</span>
                                  <span className="text-emerald-600 font-bold text-sm">RFA passe de {formatAmount(rfaTotalDisplay)} à {formatAmount(rfaTotalDisplay + gainB)}</span>
                                </div>
                                <div className="mt-2 text-sm text-amber-800 bg-amber-100 rounded-md px-2 py-1.5">
                                  💡 Avec seulement <strong>{formatAmount(bonus)} d'achat en plus</strong> (n'importe quel produit {plan.global_label}),
                                  vous déclenchez le <strong>palier global {plan.global_label}</strong> à {formatAmount(plan.global_ca + plan.global_missing)}.
                                  Votre RFA totale passe de <strong>{formatAmount(rfaTotalDisplay)}</strong> à <strong className="text-emerald-700">{formatAmount(rfaTotalDisplay + gainB)}</strong> (+{formatAmount(gainB)}) !
                                </div>
                              </div>
                            )}
                            {!plan.global_unlocked && (plan.remaining_for_global || 0) > 0 && !(bonusOk && bonus > 0) && (
                              <div className="mt-2 text-xs text-blue-700 bg-blue-50 rounded-md px-2 py-1.5">
                                📦 Les achats tri-partites ci-dessus comptent <strong>aussi pour le global {plan.global_label}</strong>. Il reste <strong>{formatAmount(plan.remaining_for_global)}</strong> à faire sur les autres lignes {plan.global_label} pour atteindre le palier global → <strong className="text-emerald-700">+{formatAmount(plan.global_gain)} RFA</strong>. Faisable !
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })()}
          {loadingPlans && (
            <div className="card p-6 text-center text-gray-400">
              <span className="animate-pulse">🎯 Analyse des plans d'achat...</span>
            </div>
          )}

          {/* Tableau Plateformes */}
          {filteredGlobalRows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-600">
                <h3 className="text-white font-bold">📦 Objectifs Plateformes</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Plateforme</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">CA</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Taux</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">RFA</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Prochain</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Gain</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-48">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredGlobalRows.map((row) => {
                      const supplierKey = row.key.replace('GLOBAL_', '')
                      const logo = supplierLogos[supplierKey]
                      return (
                      <tr 
                        key={row.key}
                        ref={el => rowRefs.current[row.key] = el}
                        className={`transition-all duration-300 ${
                          row.achieved
                            ? 'bg-emerald-100'
                            : row.near
                              ? 'bg-amber-100'
                              : 'bg-white'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {logo && <img src={getImageUrl(logo.image_url)} alt={supplierKey} className="h-6 w-auto object-contain" onError={(e) => { e.target.style.display = 'none' }} />}
                            <span className="font-semibold text-gray-900">{row.label}</span>
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
                            {row.hasOverride && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">✏️</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(row.ca)}</td>
                        <td className="px-4 py-3 text-right">
                          {row.nextCombinedRate !== null && !row.achieved ? (
                            <span className="text-sm">
                              {formatPercent(row.combinedRate)} → <span className="text-amber-600 font-bold">{formatPercent(row.nextCombinedRate)}</span>
                            </span>
                          ) : (
                            <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                              {formatPercent(row.combinedRate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatAmount(row.currentRfaAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.achieved ? (
                            <span className="text-emerald-600 font-semibold">✓ Max</span>
                          ) : (
                            <div>
                              <div className="text-gray-900">{formatAmount(row.combinedNextMin)}</div>
                              {row.missingCa > 0 && (
                                <div className="text-xs text-gray-400">-{formatAmount(row.missingCa)}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.projectedGain > 0 && !row.achieved ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                              +{formatAmount(row.projectedGain)}
                            </span>
                          ) : row.achieved ? (
                            <span className="text-emerald-500">—</span>
                          ) : (
                            <span className="text-gray-400">—</span>
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
                                      : 'bg-indigo-500'
                                }`}
                                style={{ width: `${row.combinedProgress}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold min-w-[3rem] text-right ${
                              row.achieved ? 'text-emerald-600' : row.near ? 'text-amber-600' : 'text-gray-600'
                            }`}>
                              {Math.round(row.combinedProgress)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tableau Tripartites */}
          {filteredTriRows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-purple-500 to-pink-600">
                <h3 className="text-white font-bold">🤝 Objectifs Tri-partites</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tri-partite</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">CA</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Taux</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">RFA</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Prochain</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Gain</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-48">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTriRows.map((row) => (
                      <tr 
                        key={row.key}
                        ref={el => rowRefs.current[row.key] = el}
                        className={`transition-all duration-300 ${
                          row.achieved
                            ? 'bg-emerald-100'
                            : row.near
                              ? 'bg-amber-100'
                              : 'bg-white'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{row.label}</span>
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
                            {row.hasOverride && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">✏️</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatAmount(row.ca)}</td>
                        <td className="px-4 py-3 text-right">
                          {row.triProgress.nextMin && !row.achieved ? (
                            <span className="text-sm">
                              {formatPercent(row.triProgress.rate)} → <span className="text-amber-600 font-bold">{formatPercent(getRateForThreshold(rulesMap[row.key]?.tiers || [], row.triProgress.nextMin))}</span>
                            </span>
                          ) : (
                            <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                              {formatPercent(row.triProgress.rate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${row.achieved ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatAmount(row.currentRfaAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.achieved ? (
                            <span className="text-emerald-600 font-semibold">✓ Max</span>
                          ) : (
                            <div>
                              <div className="text-gray-900">{formatAmount(row.triProgress.nextMin)}</div>
                              {row.missingCa > 0 && (
                                <div className="text-xs text-gray-400">-{formatAmount(row.missingCa)}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.projectedGain > 0 && !row.achieved ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                              +{formatAmount(row.projectedGain)}
                            </span>
                          ) : row.achieved ? (
                            <span className="text-emerald-500">—</span>
                          ) : (
                            <span className="text-gray-400">—</span>
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
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ClientSpacePage
