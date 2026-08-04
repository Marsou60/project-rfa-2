import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { getEntities, getEntityFull, getSupplierLogos, getImageUrl, exportEntityPdf, getContractPdfMeta, downloadContractPdf, getSmartPlans, getCotisations, getBonuses, getClientMonthlyEvolution, getPureDataCumulativeClientDashboard, getClientRfa2026, upsertCotisation } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import AdsTicker from '../components/AdsTicker'
import { readCotisationMap, resolveCotisationInfo } from '../utils/cotisationStorage'

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
  const [contractPdfMeta, setContractPdfMeta] = useState(null)
  const [loadingContractPdf, setLoadingContractPdf] = useState(false)
  const [smartPlans, setSmartPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [plansRequested, setPlansRequested] = useState(false)
  const loadIdRef = useRef(null)
  const [cotisationMap, setCotisationMap] = useState({})
  const [bonusMap, setBonusMap] = useState({})
  const [activeViewTab, setActiveViewTab] = useState('monthly')

  const refreshCotisationMap = useCallback(async () => {
    try {
      // Espace client Pure Data = RFA 2026 → cotisations year=2026 (séparées du legacy 2025)
      const list = await getCotisations(mode, 2026)
      const map = {}
      for (const item of list || []) {
        map[item.entity_key] = {
          amount: item.amount,
          facturee: item.facturee,
          deduite: item.deduite,
          year: 2026,
        }
      }
      setCotisationMap(map)
    } catch {
      // Fallback localStorage si API indisponible
      if (importId) {
        try {
          const s = localStorage.getItem(`cotisation_amounts_${importId}`)
          if (s) setCotisationMap(JSON.parse(s))
        } catch (_) {}
      }
    }
  }, [importId, mode])

  const refreshBonusMap = useCallback(async () => {
    try {
      const list = await getBonuses(mode)
      const map = {}
      for (const item of list || []) {
        map[item.entity_key] = { amount: item.amount, designation: item.designation }
      }
      setBonusMap(map)
    } catch {
      setBonusMap({})
    }
  }, [mode])

  useEffect(() => {
    refreshCotisationMap()
    refreshBonusMap()
  }, [refreshCotisationMap, refreshBonusMap])

  useEffect(() => {
    const onFocus = () => refreshCotisationMap()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshCotisationMap])
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
  const formatMonthlyAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
    const myId = entityId
    loadIdRef.current = myId
    setActiveViewTab('monthly')
    setSmartPlans([])
    setLoadingPlans(false)
    setPlansRequested(false)
    setLoading(true)
    setError(null)
    try {
      const full = await getEntityFull(importId, mode, entityId)
      if (loadIdRef.current !== myId) return
      const detail = full.entity
      setEntity(detail)

      const rules = full.rules || []
      const overrides = full.overrides || []
      const map = {}
      for (const rule of rules) {
        map[rule.key] = {
          ...rule,
          tiers_rfa: parseTiers(rule.tiers_rfa),
          tiers_bonus: parseTiers(rule.tiers_bonus),
          tiers: parseTiers(rule.tiers),
        }
      }
      for (const override of overrides) {
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
      setRulesMap(map)
      refreshCotisationMap()

      // PDF contrat 2026 (commercial + espace adhérent)
      const eid = mode === 'client'
        ? (detail.code_union || detail.id || entityId)
        : (detail.groupe_client || detail.id || entityId)
      const grp = mode === 'client' ? (detail.groupe_client || null) : null
      getContractPdfMeta(mode, eid, grp)
        .then((meta) => {
          if (loadIdRef.current === myId) setContractPdfMeta(meta)
        })
        .catch(() => {
          if (loadIdRef.current === myId) setContractPdfMeta(null)
        })
    } catch (err) {
      if (loadIdRef.current !== myId) return
      setError(err.response?.data?.detail || `Erreur lors du chargement ${mode === 'client' ? 'du client' : 'du groupe'}`)
      setEntity(null)
      setRulesMap({})
      setSmartPlans([])
      setContractPdfMeta(null)
    } finally {
      if (loadIdRef.current === myId) setLoading(false)
    }
  }

  const loadPlansOnce = () => {
    if (plansRequested || loadingPlans || !entity) return
    const entityId = mode === 'client' ? (entity.code_union || entity.id) : (entity.groupe_client || entity.id)
    if (!importId || !entityId) return
    setPlansRequested(true)
    setLoadingPlans(true)
    getSmartPlans(importId, entityId)
      .then((plans) => setSmartPlans(plans || []))
      .catch((e) => {
        console.warn('Plans non disponibles:', e)
        setSmartPlans([])
      })
      .finally(() => setLoadingPlans(false))
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

  const cotisationInfo = useMemo(
    () => resolveCotisationInfo(cotisationMap, mode, entity),
    [cotisationMap, mode, entity],
  )

  const setCotisation2026Status = useCallback(async ({ facturee, deduite, amount }) => {
    if (!entity) return
    const key = (mode === 'group'
      ? (entity.groupe_client || entity.id || '')
      : (entity.code_union || entity.id || '')
    ).toString().trim().toUpperCase()
    if (!key) return
    const amt = Number(amount ?? cotisationInfo.amount) || 0
    if (amt <= 0) return
    try {
      await upsertCotisation(mode === 'group' ? 'group' : 'client', key, {
        amount: amt,
        facturee: Boolean(facturee),
        deduite: Boolean(deduite),
        year: 2026,
      })
      await refreshCotisationMap()
    } catch (err) {
      console.error('Cotisation 2026:', err)
      setError(err?.response?.data?.detail || err.message || 'Erreur cotisation')
    }
  }, [entity, mode, cotisationInfo.amount, refreshCotisationMap])

  const cotisationMonthly = useMemo(
    () => (cotisationInfo.amount > 0 ? cotisationInfo.amount / 12 : 0),
    [cotisationInfo.amount],
  )
  const rfaTotalWithCotisation = useMemo(() => {
    const base = rfaTotalDisplay
    if (!cotisationInfo.amount || !cotisationInfo.isFacture) return base
    return Math.max(base - cotisationInfo.amount, 0)
  }, [rfaTotalDisplay, cotisationInfo])

  const bonusInfo = useMemo(() => {
    if (!entity) return { amount: 0, designation: '' }
    const primary = (mode === 'group'
      ? (entity.groupe_client || entity.id || '')
      : (entity.code_union || entity.id || '')
    ).toString().trim().toUpperCase()
    let row = bonusMap[primary]
    if (!row && primary) {
      for (const [k, v] of Object.entries(bonusMap)) {
        if ((k || '').toString().trim().toUpperCase() === primary) { row = v; break }
      }
    }
    if (!row || !row.amount || row.amount <= 0) return { amount: 0, designation: '' }
    return { amount: Number(row.amount), designation: row.designation || '' }
  }, [bonusMap, mode, entity])

  const rfaCardTotal = useMemo(() => {
    const base = cotisationInfo.isFacture ? rfaTotalWithCotisation : rfaTotalDisplay
    return base + (bonusInfo.amount > 0 ? bonusInfo.amount : 0)
  }, [cotisationInfo, rfaTotalWithCotisation, rfaTotalDisplay, bonusInfo])

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
              disabled={!query}
            >
              {loading ? '⏳ Chargement...' : '🚀 Consulter'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {entity && (
        <>
          {/* Export PDF + Contrat PDF + KPI Cards */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              type="button"
              onClick={async () => {
                const entityId =
                  mode === 'client'
                    ? (entity.code_union || entity.id)
                    : (entity.groupe_client || entity.id || '').toString().trim().toUpperCase()
                if (!importId || !entityId) return
                setExportingPdf(true)
                try {
                  const { amount, facturee, deduite } = resolveCotisationInfo(cotisationMap, mode, entity)
                  await exportEntityPdf(
                    importId,
                    mode,
                    entityId,
                    entity.contract_applied?.id,
                    amount > 0 ? { amount, facturee, deduite } : undefined,
                    bonusInfo.amount > 0 ? { amount: bonusInfo.amount, designation: bonusInfo.designation } : undefined,
                  )
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
            {contractPdfMeta?.available && (
              <button
                type="button"
                title={contractPdfMeta.label || 'Voir le contrat PDF'}
                onClick={async () => {
                  const entityId =
                    mode === 'client'
                      ? (entity.code_union || entity.id)
                      : (entity.groupe_client || entity.id || '').toString().trim().toUpperCase()
                  if (!entityId) return
                  setLoadingContractPdf(true)
                  try {
                    await downloadContractPdf(
                      mode,
                      entityId,
                      mode === 'client' ? (entity.groupe_client || null) : null,
                      true,
                    )
                  } catch (err) {
                    alert('Impossible d\'ouvrir le contrat PDF : ' + (err.message || err))
                  } finally {
                    setLoadingContractPdf(false)
                  }
                }}
                disabled={loadingContractPdf}
                className="px-4 py-2 bg-white border-2 border-amber-500 text-amber-700 rounded-xl font-semibold hover:bg-amber-50 transition-all disabled:opacity-50 flex items-center gap-2 shadow-md"
              >
                {loadingContractPdf
                  ? '⏳ Ouverture...'
                  : contractPdfMeta.kind === 'special'
                    ? '📑 Voir l\'annexe contrat'
                    : '📑 Voir le contrat 2026'}
              </button>
            )}
            <p className="text-sm text-gray-500">
              {contractPdfMeta?.available
                ? (contractPdfMeta.label || 'Contrat PDF disponible')
                : 'Export identique à cette page pour envoyer les détails RFA au client.'}
            </p>
          </div>

          {/* Onglets de vue */}
          <div className="mb-4">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveViewTab('monthly')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeViewTab === 'monthly'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                📅 Chiffres mensuels
              </button>
              <button
                type="button"
                onClick={() => setActiveViewTab('rfa')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeViewTab === 'rfa'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                💰 Vue RFA (2025)
              </button>
              <button
                type="button"
                onClick={() => setActiveViewTab('rfa2026')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeViewTab === 'rfa2026'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                💎 RFA 2026
              </button>
              <button
                type="button"
                onClick={() => setActiveViewTab('puredata')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeViewTab === 'puredata'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                📊 Dashboard Pure Data
              </button>
            </div>
          </div>

          {activeViewTab === 'rfa' && (
            <>
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
              <div className="text-xl font-black">{formatAmount(rfaCardTotal)}</div>
              <div className="text-emerald-100 text-xs">
                {formatPercent(rfaRateDisplay)}{bonusInfo.amount > 0 ? ` • dont bonus +${formatAmount(bonusInfo.amount)}` : ''}
              </div>
            </div>
            <div className={`card p-4 text-white ${nearCount > 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
              <div className="text-white/80 text-xs">🎯 Gain à portée</div>
              <div className="text-xl font-black">{nearCount > 0 ? `+${formatAmount(potentialGainNear)}` : '-'}</div>
              <div className="text-white/80 text-xs">{nearCount} objectif{nearCount > 1 ? 's' : ''} proche{nearCount > 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Bonus exceptionnel : bandeau bien visible sous les KPI */}
          {bonusInfo.amount > 0 && (
            <div className="rounded-xl border-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-amber-50 border-amber-300 text-amber-900">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">🎁 Bonus exceptionnel</div>
                <div className="text-lg font-black">+{formatAmount(bonusInfo.amount)}</div>
                <p className="text-sm mt-1">
                  <span className="font-semibold text-amber-800">{bonusInfo.designation || 'Bonus exceptionnel — accord direction'}</span> — montant
                  accordé à titre exceptionnel, venant s&apos;ajouter à votre RFA.
                </p>
              </div>
              <span className="shrink-0 px-3 py-1.5 rounded-full text-sm font-bold bg-amber-200 text-amber-900">
                Accordé
              </span>
            </div>
          )}

          {/* Cotisation offerte : bandeau sous les KPI (même réglage que la liste adhérents) */}
          {cotisationInfo.amount > 0 && cotisationInfo.isOfferte && (
            <div className="rounded-xl border-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 border-emerald-300 text-emerald-900">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Cotisation Union 2026</div>
                <div className="text-lg font-black">{formatAmount(cotisationInfo.amount)}</div>
                <div className="text-xs mt-0.5 opacity-90">
                  {formatMonthlyAmount(cotisationMonthly)} × 12 mois = {formatAmount(cotisationInfo.amount)}
                </div>
                <p className="text-sm mt-1">
                  <span className="font-semibold text-emerald-800">Geste commercial</span> — cotisation Union offerte. La RFA
                  affichée reste intégrale.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="shrink-0 px-3 py-1.5 rounded-full text-sm font-bold bg-emerald-200 text-emerald-900">
                  Offerte
                </span>
                {!isAdherent && (
                  <button
                    type="button"
                    onClick={() => setCotisation2026Status({ facturee: true, deduite: true, amount: cotisationInfo.amount })}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                  >
                    Facturer à la place
                  </button>
                )}
              </div>
            </div>
          )}
          {entity && cotisationInfo.amount === 0 && !isAdherent && (
            <p className="text-xs text-gray-500 -mt-2">
              Aucune cotisation 2026 enregistrée pour cet adhérent — lancez le seed cotisations ou activez-la manuellement.
            </p>
          )}

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

          {/* Plans d'achat optimisés — chargement à la demande */}
          {!plansRequested && !loadingPlans && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 bg-gradient-to-r from-violet-500 to-indigo-600 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-bold">🎯 Plans d'achat optimisés</h3>
                  <p className="text-violet-100 text-xs">Combinez vos tri-partites pour débloquer plusieurs paliers</p>
                </div>
                <button
                  type="button"
                  onClick={loadPlansOnce}
                  className="px-4 py-2 bg-white text-violet-600 rounded-xl font-semibold hover:bg-violet-50 transition-all shadow-md"
                >
                  Afficher les plans d'achat
                </button>
              </div>
            </div>
          )}
          {plansRequested && !loadingPlans && smartPlans.length === 0 && (
            <div className="card p-6 text-center text-gray-500">
              Aucun plan d'achat optimisé pour ce client.
            </div>
          )}
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

          {/* Cotisation facturée : après le dernier bloc tri-partites (bas de page visuel) */}
          {cotisationInfo.amount > 0 && cotisationInfo.isFacture && (
            <div className="rounded-xl border-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-orange-50 border-orange-300 text-orange-950">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Cotisation Union 2026</div>
                <div className="text-lg font-black">{formatAmount(cotisationInfo.amount)}</div>
                <div className="text-xs mt-0.5 opacity-90">
                  {formatMonthlyAmount(cotisationMonthly)} × 12 mois = {formatAmount(cotisationInfo.amount)}
                </div>
                <p className="text-sm mt-1">
                  <span className="font-semibold text-orange-800">Facturée</span> — déduite du montant RFA 2026.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="shrink-0 px-3 py-1.5 rounded-full text-sm font-bold bg-orange-200 text-orange-900">
                  Facturée
                </span>
                {!isAdherent && (
                  <button
                    type="button"
                    onClick={() => setCotisation2026Status({ facturee: false, deduite: false, amount: cotisationInfo.amount })}
                    className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow"
                  >
                    Offrir (ne pas déduire)
                  </button>
                )}
              </div>
            </div>
          )}
            </>
          )}

          {/* ── Évolution mensuelle 2025/2026 ── */}
          {activeViewTab === 'monthly' && (
            <ClientMonthlySection
              codeUnion={mode === 'client' ? entity?.code_union : null}
              groupeClient={mode === 'group' ? entity?.groupe_client : null}
              isAdherent={isAdherent}
            />
          )}

          {activeViewTab === 'rfa2026' && (
            <ClientRfa2026Section
              codeUnion={mode === 'client' ? entity?.code_union : null}
              groupeClient={mode === 'group' ? entity?.groupe_client : null}
              caN1Rfa={entity?.ca?.totals?.global_total ?? null}
              caN1Label="CA 2025 (Vue RFA)"
            />
          )}

          {activeViewTab === 'puredata' && (
            <ClientPureDataDashboardSection
              codeUnion={mode === 'client' ? entity?.code_union : null}
              groupeClient={mode === 'group' ? entity?.groupe_client : null}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ── Évolution mensuelle 2025/2026 — composant sécurisé ── */
/* ── Chiffres mensuels — helpers visuels (light) ── */
const cmsFmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const cmsCompact = (v) => {
  const n = Number(v || 0), abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`
  return `${sign}${Math.round(abs).toLocaleString('fr-FR')} €`
}
const cmsDeltaPct = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} %`
const CMS_MONTHS = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function cmsResolveLogo(platform, logos) {
  const p = (platform || '').toString().trim().toUpperCase()
  if (!p || !logos) return null
  if (logos[p]) return logos[p]
  for (const k of Object.keys(logos)) {
    const ku = k.toUpperCase()
    if (p.startsWith(ku) || p.includes(ku) || ku.includes(p)) return logos[k]
  }
  return null
}

function CmsPlatformLogo({ platform, logos, size = 28 }) {
  const url = cmsResolveLogo(platform, logos)
  const px = `${size}px`
  if (url) {
    return <img src={getImageUrl(url)} alt={platform} onError={(e) => { e.target.style.display = 'none' }} className="rounded-lg object-contain bg-white border border-gray-100 shrink-0" style={{ width: px, height: px, padding: 2 }} />
  }
  return (
    <span className="rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br from-blue-500 to-indigo-600" style={{ width: px, height: px }}>
      {(platform || '?').slice(0, 3).toUpperCase()}
    </span>
  )
}

/* Histogramme groupé N vs N-1 par mois (light) */
function CmsGroupedBars({ months, yearN, yearN1, height = 150 }) {
  const data = (months || []).filter((m) => (m.current || 0) > 0 || (m.previous || 0) > 0)
  const max = data.reduce((mx, m) => Math.max(mx, m.current || 0, m.previous || 0), 0) || 1
  if (!data.length) return <p className="text-sm text-gray-400">Aucune donnée.</p>
  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: height + 26 }}>
        {data.map((m) => {
          const hC = Math.max(((m.current || 0) / max) * height, 2)
          const hP = Math.max(((m.previous || 0) / max) * height, 2)
          const up = (m.delta || 0) >= 0
          return (
            <div key={m.month} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 44 }}>
              <div className="flex items-end gap-1" style={{ height }}>
                <div title={`${yearN1} : ${cmsFmt(m.previous)}`} style={{ height: hP, width: 13 }} className="rounded-t bg-slate-200" />
                <div title={`${yearN} : ${cmsFmt(m.current)}`} style={{ height: hC, width: 13 }} className={`rounded-t ${up ? 'bg-gradient-to-t from-emerald-500 to-teal-400' : 'bg-gradient-to-t from-rose-500 to-rose-400'}`} />
              </div>
              <span className="text-[10px] text-gray-500">{CMS_MONTHS[m.month]}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />{yearN}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200" />{yearN1}</span>
      </div>
    </div>
  )
}

function ClientMonthlySection({ codeUnion, groupeClient, isAdherent }) {
  const { supplierFilter } = useSupplierFilter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expandedPlatform, setExpandedPlatform] = useState(null)
  const [expandedStore, setExpandedStore] = useState(null)
  const [logos, setLogos] = useState({})

  useEffect(() => {
    getSupplierLogos().then((list) => {
      const map = {}
      for (const l of list || []) if (l.supplier_key) map[l.supplier_key.toUpperCase()] = l.image_url
      setLogos(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!codeUnion && !groupeClient) { setData(null); return }
    setLoading(true)
    setData(null)
    setExpandedPlatform(null)
    setExpandedStore(null)
    getClientMonthlyEvolution({
      codeUnion,
      groupeClient,
      fournisseur: supplierFilter || undefined,
    })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [codeUnion, groupeClient, supplierFilter])

  if (loading) return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 text-blue-500 text-sm">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Chargement de l'évolution mensuelle…
      </div>
    </div>
  )

  if (!data?.available) return null

  const yearN = data.year_current
  const yearN1 = data.year_previous
  const t = data.totals || {}
  const platMax = (data.platforms || []).reduce((mx, p) => Math.max(mx, p.total_current || 0), 0) || 1
  const storeMax = (data.stores || []).reduce((mx, s) => Math.max(mx, s.total_current || 0), 0) || 1

  return (
    <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-6 py-5">
        <h3 className="text-white font-black text-lg">Chiffres mensuels {yearN} vs {yearN1}</h3>
        <p className="text-blue-100 text-xs mt-0.5">
          Évolution du chiffre d'affaires par mois et par fournisseur{supplierFilter ? ` — vue ${supplierFilter}` : ''}
        </p>
      </div>

      <div className="p-5 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
            <div className="text-xs font-semibold text-blue-700">CA {yearN} (à date)</div>
            <div className="text-2xl font-black text-blue-900">{cmsFmt(t.current)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500">CA {yearN1} (même période)</div>
            <div className="text-2xl font-black text-gray-700">{cmsFmt(t.previous)}</div>
          </div>
          <div className={`rounded-xl border p-4 ${(t.delta || 0) >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
            <div className="text-xs font-semibold text-gray-500">Évolution</div>
            <div className={`text-2xl font-black ${(t.delta || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {(t.delta || 0) >= 0 ? '+' : ''}{cmsCompact(t.delta)}
            </div>
            <div className={`text-xs font-semibold ${(t.delta || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{cmsDeltaPct(t.delta_pct)}</div>
          </div>
        </div>

        {/* Histogramme mensuel */}
        {data.months?.length > 0 && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Évolution mois par mois</h4>
            <CmsGroupedBars months={data.months} yearN={yearN} yearN1={yearN1} />
          </div>
        )}

        {/* Détail par fournisseur (cartes + logos + barres) */}
        {data.platforms?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Par fournisseur — cliquez pour le détail mensuel</h4>
            <div className="space-y-2">
              {data.platforms.map((p) => {
                const isOpen = expandedPlatform === p.platform
                const up = (p.delta || 0) >= 0
                const share = platMax > 0 ? Math.max((p.total_current / platMax) * 100, 2) : 0
                return (
                  <div key={p.platform} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                    <button type="button" onClick={() => setExpandedPlatform(isOpen ? null : p.platform)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left">
                      <CmsPlatformLogo platform={p.platform} logos={logos} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-800 text-sm">{p.platform}</span>
                          <span className="font-mono text-sm text-gray-900">{cmsFmt(p.total_current)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${up ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`} style={{ width: `${share}%` }} />
                        </div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {up ? '+' : ''}{cmsCompact(p.delta)} ({cmsDeltaPct(p.delta_pct)})
                      </span>
                      <svg className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isOpen && p.months?.length > 0 && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                        <CmsGroupedBars months={p.months} yearN={yearN} yearN1={yearN1} height={110} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Détail par magasin du groupe */}
        {groupeClient && data.stores?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Par magasin du groupe — cliquez pour le détail</h4>
            <div className="space-y-2">
              {data.stores.map((s) => {
                const key = s.code_union || 'UNKNOWN'
                const isOpen = expandedStore === key
                const up = (s.delta || 0) >= 0
                const share = storeMax > 0 ? Math.max((s.total_current / storeMax) * 100, 2) : 0
                return (
                  <div key={key} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                    <button type="button" onClick={() => setExpandedStore(isOpen ? null : key)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left">
                      <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-black text-white bg-gradient-to-br from-slate-500 to-slate-700">{(s.code_union || '?').slice(0, 2)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-800 text-sm truncate">{s.code_union}{s.nom_client ? ` · ${s.nom_client}` : ''}</span>
                          <span className="font-mono text-sm text-gray-900 shrink-0">{cmsFmt(s.total_current)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${up ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`} style={{ width: `${share}%` }} />
                        </div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {up ? '+' : ''}{cmsCompact(s.delta)} ({cmsDeltaPct(s.delta_pct)})
                      </span>
                      <svg className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-4">
                        {s.months?.length > 0 && <CmsGroupedBars months={s.months} yearN={yearN} yearN1={yearN1} height={100} />}
                        {s.platforms?.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Par plateforme du magasin</p>
                            {s.platforms.map((p) => {
                              const pUp = (p.delta || 0) >= 0
                              return (
                                <div key={`${key}::${p.platform}`} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                  <CmsPlatformLogo platform={p.platform} logos={logos} size={22} />
                                  <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{p.platform}</span>
                                  <span className="font-mono text-xs text-gray-900">{cmsFmt(p.total_current)}</span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {pUp ? '+' : ''}{cmsCompact(p.delta)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Dashboard Pure Data — briques visuelles (zéro dépendance) ── */
const PD_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#3b82f6', '#eab308', '#22c55e', '#db2777']
const pdColor = (i) => PD_COLORS[((i % PD_COLORS.length) + PD_COLORS.length) % PD_COLORS.length]
const pdAmount = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const pdInitials = (label) => (label || '?').trim().slice(0, 2).toUpperCase()
const pdDeltaPct = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}
// Nom de fichier normalisé pour retrouver le logo d'une marque : /marques/<SLUG>.png
const pdSlugRaw = (s) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '')
// Alias : libellé marque (dans les données) -> nom de fichier logo existant
const PD_LOGO_ALIASES = {
  KYB: 'KAYABA',
}
const pdSlug = (s) => {
  const slug = pdSlugRaw(s)
  return PD_LOGO_ALIASES[slug] || slug
}

function PdNodeIcon({ node, accent, size = 28 }) {
  const [err, setErr] = useState(false)
  const slug = pdSlug(node?.label)
  const isMarque = node?.level === 'marque'
  const px = `${size}px`
  if (isMarque && slug && !err) {
    return (
      <img
        src={`/marques/${slug}.png`}
        alt={node.label}
        onError={() => setErr(true)}
        className="rounded-lg object-contain bg-white border border-gray-100 shrink-0"
        style={{ width: px, height: px }}
      />
    )
  }
  return (
    <span
      className="rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black text-white"
      style={{ width: px, height: px, background: accent }}
    >
      {pdInitials(node?.label)}
    </span>
  )
}

function PdDonut({ items = [] }) {
  const total = items.reduce((s, it) => s + (it.ca_current || 0), 0)
  const size = 168, stroke = 28, r = (size - stroke) / 2, C = 2 * Math.PI * r
  if (!items.length || total <= 0) return <p className="text-sm text-gray-400">Aucune donnée.</p>
  let acc = 0
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {items.map((it, i) => {
          const frac = (it.ca_current || 0) / total
          const dash = frac * C
          const el = (
            <circle
              key={it.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={pdColor(i)}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          acc += dash
          return el
        })}
        <text x="50%" y="46%" textAnchor="middle" className="fill-gray-900 font-bold" style={{ fontSize: 17 }}>{pdAmount(total)}</text>
        <text x="50%" y="58%" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>CA cumulé</text>
      </svg>
      <div className="flex-1 min-w-[180px] space-y-1.5">
        {items.map((it, i) => (
          <div key={it.label} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: pdColor(i) }} />
            <span className="font-semibold text-gray-700 truncate flex-1">{it.label}</span>
            <span className="font-mono text-gray-900">{pdAmount(it.ca_current)}</span>
            <span className="text-gray-400 w-10 text-right">{((it.ca_current / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PdGroupedBars({ items = [], yearN, yearN1 }) {
  const top = items.slice(0, 8)
  const max = top.reduce((m, it) => Math.max(m, it.ca_current || 0, it.ca_previous || 0), 0)
  if (!top.length || max <= 0) return <p className="text-sm text-gray-400">Aucune donnée.</p>
  const H = 150
  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: H + 26 }}>
        {top.map((it, i) => {
          const hC = Math.max(((it.ca_current || 0) / max) * H, 2)
          const hP = Math.max(((it.ca_previous || 0) / max) * H, 2)
          return (
            <div key={it.label} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 58 }}>
              <div className="flex items-end gap-1" style={{ height: H }}>
                <div title={`${yearN}: ${pdAmount(it.ca_current)}`} style={{ height: hC, width: 14, background: pdColor(i) }} className="rounded-t" />
                <div title={`${yearN1}: ${pdAmount(it.ca_previous)}`} style={{ height: hP, width: 14, background: '#cbd5e1' }} className="rounded-t" />
              </div>
              <span className="text-[10px] text-gray-500 text-center leading-tight truncate w-full">{it.label}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-500" />{yearN}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-300" />{yearN1}</span>
      </div>
    </div>
  )
}

function PdDrillNode({ node, maxCa, accent, depth = 0 }) {
  const [open, setOpen] = useState(false)
  const children = Array.isArray(node.children) ? node.children : []
  const hasChildren = children.length > 0
  const width = maxCa > 0 ? Math.max((node.ca_current / maxCa) * 100, 1.5) : 0
  const childMax = children.reduce((m, c) => Math.max(m, c.ca_current || 0), 0)
  const deltaUp = Number(node.delta || 0) >= 0
  return (
    <div className="rounded-lg" style={{ background: depth === 0 ? '#fff' : 'transparent' }}>
      <button
        type="button"
        onClick={() => hasChildren && setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg ${hasChildren ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ${depth === 0 ? 'border border-gray-100' : ''}`}
      >
        {hasChildren ? (
          <svg className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        {(depth === 0 || node.level === 'marque') && (
          <PdNodeIcon node={node} accent={accent} size={depth === 0 ? 28 : 22} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate ${depth === 0 ? 'font-bold text-gray-800 text-sm' : 'font-semibold text-gray-600 text-xs'}`}>{node.label}</span>
            <span className={`font-mono shrink-0 ${depth === 0 ? 'text-sm text-gray-900' : 'text-xs text-gray-700'}`}>{pdAmount(node.ca_current)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${width}%`, background: accent }} />
          </div>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${deltaUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {deltaUp ? '+' : ''}{pdAmount(node.delta)} ({pdDeltaPct(node.delta_pct)})
        </span>
      </button>
      {open && hasChildren && (
        <div className="ml-6 pl-2 border-l border-gray-100 space-y-1 py-1">
          {children.map((c) => (
            <PdDrillNode key={c.label} node={c} maxCa={childMax} accent={accent} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClientPureDataDashboardSection({ codeUnion, groupeClient }) {
  const { supplierFilter } = useSupplierFilter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [axis, setAxis] = useState('marque')

  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmtP = (v) => {
    if (v == null) return '—'
    const num = Number(v)
    const sign = num > 0 ? '+' : ''
    return `${sign}${num.toFixed(1)}%`
  }
  const fmtDelta = (v) => {
    const n = Number(v || 0)
    const sign = n > 0 ? '+' : ''
    return `${sign}${fmt(n)}`
  }
  const dc = (v) => {
    const n = Number(v || 0)
    if (n > 0) return 'text-emerald-600'
    if (n < 0) return 'text-rose-600'
    return 'text-gray-500'
  }
  const monthLabel = (m) => {
    const names = ['', 'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
    return (m >= 1 && m <= 12) ? names[m] : ''
  }

  useEffect(() => {
    if (!codeUnion && !groupeClient) {
      setData(null)
      return
    }
    setLoading(true)
    setData(null)
    setAxis('marque')
    getPureDataCumulativeClientDashboard({
      codeUnion,
      groupeClient,
      yearCurrent: 2026,
      yearPrevious: 2025,
      fournisseur: supplierFilter || undefined,
    })
      .then(setData)
      .catch(() => setData({ available: false }))
      .finally(() => setLoading(false))
  }, [codeUnion, groupeClient, supplierFilter])

  if (loading) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-violet-500 text-sm">
          <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          Chargement du dashboard Pure Data cumule...
        </div>
      </div>
    )
  }

  if (!data?.available) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
        <h3 className="text-violet-900 font-bold">Dashboard Pure Data</h3>
        <p className="text-sm text-gray-500 mt-2">
          Aucune donnee cumulee disponible pour le moment.
        </p>
      </div>
    )
  }

  const axisData = axis === 'plateforme'
    ? (data.platforms || [])
    : axis === 'famille'
      ? (data.by_famille || [])
      : (data.by_marque || [])
  const axisMax = axisData.reduce((m, n) => Math.max(m, n.ca_current || 0), 0)
  const platformSummary = data.platform_summary || []

  return (
    <div className="rounded-2xl border border-violet-100 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-white font-bold text-base">Dashboard Pure Data cumulé</h3>
            <p className="text-violet-100 text-xs mt-0.5">
              Cumul annuel {data.year_current} vs {data.year_previous}
              {supplierFilter ? ` — vue ${supplierFilter}` : ''}
            </p>
          </div>
          {data.reporting_period && (
            <div className="text-right">
              <div className="text-violet-200 text-[11px] font-semibold uppercase">Période d'import</div>
              <div className="text-white text-sm font-bold">
                {monthLabel(data.reporting_period.month)} {data.reporting_period.year || ''}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* KPI hero */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4">
            <div className="text-xs font-semibold text-violet-700">CA cumulé {data.year_current}</div>
            <div className="text-2xl font-black text-violet-900">{fmt(data.totals?.current)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500">CA cumulé {data.year_previous}</div>
            <div className="text-2xl font-black text-gray-700">{fmt(data.totals?.previous)}</div>
          </div>
          <div className={`rounded-xl border p-4 ${Number(data.totals?.delta || 0) >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
            <div className="text-xs font-semibold text-gray-500">Évolution</div>
            <div className={`text-2xl font-black ${dc(data.totals?.delta)}`}>{fmtDelta(data.totals?.delta)}</div>
            <div className={`text-xs font-semibold ${dc(data.totals?.delta)}`}>{fmtP(data.totals?.delta_pct)}</div>
          </div>
        </div>

        {/* Graphiques : répartition (donut) + comparatif N vs N-1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Répartition du CA par plateforme</h4>
            <PdDonut items={platformSummary} />
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Comparatif {data.year_current} vs {data.year_previous}</h4>
            <PdGroupedBars items={platformSummary} yearN={data.year_current} yearN1={data.year_previous} />
          </div>
        </div>

        {/* Analyse détaillée avec sélecteur d'axe + drill-down */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Analyse détaillée — cliquez pour explorer
            </h4>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
              {[
                { id: 'marque', label: 'Par marque' },
                { id: 'famille', label: 'Par famille' },
                { id: 'plateforme', label: 'Par plateforme' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAxis(opt.id)}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${axis === opt.id ? 'bg-violet-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {axisData.length === 0 && (
              <p className="text-sm text-gray-400">Aucune donnée pour cet axe.</p>
            )}
            {axisData.map((node, i) => (
              <PdDrillNode key={node.label} node={node} maxCa={axisMax} accent={pdColor(i)} depth={0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── RFA 2026 : helpers de progression (additifs, indépendants du 2025) ── */
const rfa26ParseTiers = (t) => {
  if (!t) return []
  let arr = t
  if (!Array.isArray(t)) { try { arr = JSON.parse(t) } catch { arr = [] } }
  return (arr || []).map((x) => ({ min: Number(x.min) || 0, rate: Number(x.rate) || 0 })).sort((a, b) => a.min - b.min)
}
const rfa26RateForThreshold = (tiers, threshold) => {
  if (!tiers?.length || threshold == null) return 0
  let rate = 0
  for (const t of tiers) { if (t.min <= threshold) rate = t.rate; else break }
  return rate
}
const rfa26Prog = (ca, tiers) => {
  const sorted = [...(tiers || [])].sort((a, b) => a.min - b.min)
  let rate = 0, minReached = null
  for (const t of sorted) { if (t.min <= ca) { rate = t.rate; minReached = t.min } else break }
  const next = sorted.find((t) => t.min > ca) || null
  return { rate, nextMin: next ? next.min : null, minReached }
}
/** Progression combinée (rfa + bonus) pour une plateforme globale. */
function rfa26GlobalProgress(ca, tiersRfa, tiersBonus) {
  const pr = rfa26Prog(ca, tiersRfa)
  const pb = rfa26Prog(ca, tiersBonus)
  const nexts = [pr.nextMin, pb.nextMin].filter((v) => v != null)
  const nextMin = nexts.length ? Math.min(...nexts) : null
  const rate = (pr.rate || 0) + (pb.rate || 0)
  const nextRate = nextMin != null ? rfa26RateForThreshold(tiersRfa, nextMin) + rfa26RateForThreshold(tiersBonus, nextMin) : null
  const progress = nextMin ? Math.min((ca / nextMin) * 100, 100) : 100
  const currentValue = rate * ca
  const missing = nextMin != null ? Math.max(nextMin - ca, 0) : 0
  const projectedGain = nextMin != null && nextRate != null ? Math.max(nextRate * nextMin - currentValue, 0) : 0
  return { rate, nextMin, nextRate, progress, currentValue, missing, projectedGain, achieved: nextMin == null && (pr.minReached != null || pb.minReached != null) }
}
/** Progression simple pour une tri-partite. */
function rfa26TriProgress(ca, tiers) {
  const p = rfa26Prog(ca, tiers)
  const nextRate = p.nextMin != null ? rfa26RateForThreshold(tiers, p.nextMin) : null
  const progress = p.nextMin ? Math.min((ca / p.nextMin) * 100, 100) : 100
  const currentValue = (p.rate || 0) * ca
  const missing = p.nextMin != null ? Math.max(p.nextMin - ca, 0) : 0
  const projectedGain = p.nextMin != null && nextRate != null ? Math.max(nextRate * p.nextMin - currentValue, 0) : 0
  return { rate: p.rate, nextMin: p.nextMin, nextRate, progress, currentValue, missing, projectedGain, achieved: p.nextMin == null && p.minReached != null }
}

function sortedUnique(arr) {
  return [...new Set(arr.filter((v) => v != null))].sort((a, b) => a - b)
}

const RFA26_LEVEL_STYLE = {
  CLASSIQUE: 'bg-slate-100 text-slate-700 border-slate-300',
  SILVER: 'bg-gradient-to-r from-slate-200 to-slate-100 text-slate-900 border-slate-400',
  GOLD: 'bg-amber-100 text-amber-900 border-amber-300',
}

function Rfa26LevelBadge({ level, size = 'md' }) {
  if (!level) return null
  const id = String(level).toUpperCase()
  const cls = RFA26_LEVEL_STYLE[id] || 'bg-indigo-50 text-indigo-800 border-indigo-200'
  const pad = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
  return (
    <span className={`inline-flex items-center rounded-lg border font-bold tracking-wide ${pad} ${cls}`}>
      {id === 'GOLD' ? 'Gold' : id === 'SILVER' ? 'Silver' : id === 'CLASSIQUE' ? 'Classique' : id}
    </span>
  )
}

function Rfa26TierLadder({ tierGroups, ca, fmt, fmtPct, levelLabel = null }) {
  const rfaTiers = (tierGroups.find((g) => /rfa/i.test(g.label)) || {}).tiers || []
  const bonusTiers = (tierGroups.find((g) => /bonus/i.test(g.label)) || {}).tiers || []
  const mins = sortedUnique([
    ...rfaTiers.map((t) => t.min),
    ...bonusTiers.map((t) => t.min),
  ])
  const combined = mins.map((min) => ({
    min,
    rfa: rfa26RateForThreshold(rfaTiers, min),
    bonus: rfa26RateForThreshold(bonusTiers, min),
  })).map((row) => ({ ...row, total: (row.rfa || 0) + (row.bonus || 0) }))

  let reachedIdx = -1
  combined.forEach((t, i) => { if (t.min <= ca) reachedIdx = i })
  const nextIdx = combined.findIndex((t) => t.min > ca)
  const plainGroups = tierGroups.filter((g) => g.tiers?.length > 0 && !/rfa|bonus/i.test(g.label || ''))

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 animate-[fadeIn_0.2s_ease-out]">
      {levelLabel && (
        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">{levelLabel}</div>
      )}
      {combined.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Barème RFA + Bonus
          </div>
          <div className="space-y-1">
            {combined.map((t, i) => {
              const isReached = i === reachedIdx
              const isNext = i === nextIdx
              return (
                <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 ${
                  isReached ? 'bg-emerald-50 text-emerald-800 font-semibold' : isNext ? 'bg-amber-50 text-amber-900' : 'text-slate-500'
                }`}>
                  <span>{isReached && '✓ '}{isNext && '→ '}≥ {fmt(t.min)}</span>
                  <span className="font-mono text-right">
                    <span className="text-slate-400">{fmtPct(t.rfa)}+{fmtPct(t.bonus)}</span>
                    <span className="ml-2 font-bold">{fmtPct(t.total)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {plainGroups.map((g) => {
        const sorted = [...g.tiers].sort((a, b) => a.min - b.min)
        let gReached = -1
        sorted.forEach((t, i) => { if (t.min <= ca) gReached = i })
        const gNext = sorted.findIndex((t) => t.min > ca)
        return (
          <div key={g.label}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.label}</div>
            <div className="space-y-1">
              {sorted.map((t, i) => {
                const isReached = i === gReached
                const isNext = i === gNext
                return (
                  <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 ${
                    isReached ? 'bg-emerald-50 text-emerald-800 font-semibold' : isNext ? 'bg-amber-50 text-amber-900' : 'text-slate-500'
                  }`}>
                    <span>{isReached && '✓ '}{isNext && '→ '}≥ {fmt(t.min)}</span>
                    <span className="font-mono">{fmtPct(t.rate)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Rfa26ProjectionBlock({ proj, fmt, fmtPct, title = 'Projection fin 2026', hint = null }) {
  if (!proj || (proj.value == null && !proj.ca && !proj.rate)) return null
  const caProj = proj.ca || 0
  return (
    <div className="mt-3 rounded-xl border-2 border-cyan-300 bg-cyan-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-800">{title}</span>
        {hint && <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded">{hint}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white px-1.5 py-1.5 border border-cyan-200">
          <div className="text-[9px] font-bold uppercase tracking-wide text-cyan-600">CA</div>
          <div className="text-[12px] font-black text-slate-900 font-mono leading-tight mt-0.5">{fmt(caProj)}</div>
        </div>
        <div className="rounded-lg bg-white px-1.5 py-1.5 border border-cyan-200">
          <div className="text-[9px] font-bold uppercase tracking-wide text-cyan-600">Taux</div>
          <div className="text-[12px] font-black text-slate-900 font-mono leading-tight mt-0.5">{fmtPct(proj.rate || 0)}</div>
        </div>
        <div className="rounded-lg bg-cyan-100 px-1.5 py-1.5 border border-cyan-300">
          <div className="text-[9px] font-bold uppercase tracking-wide text-cyan-800">RFA</div>
          <div className="text-[13px] font-black text-cyan-900 font-mono leading-tight mt-0.5">{fmt(proj.value || 0)}</div>
        </div>
      </div>
    </div>
  )
}

function Rfa26Readme({ isLevelBased, contractName, fmt, SILVER_MIN, GOLD_MIN }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="text-sm font-bold text-indigo-900">Lisez-moi — comment lire cette page</span>
        <svg className={`w-4 h-4 text-indigo-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 text-[13px] text-indigo-950/90 space-y-3 border-t border-indigo-100 pt-3">
          <p>
            Contrat : <strong>{contractName}</strong>. Les montants sont estimés à partir du Pure Data cumulé.
          </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
            <div className="rounded-lg bg-white border border-emerald-200 px-2.5 py-2">
              <div className="font-bold text-emerald-700">Vert</div>
              <div className="text-slate-600">RFA / CA <strong>à date</strong>, ou projection <strong>en hausse</strong> vs N-1</div>
            </div>
            <div className="rounded-lg bg-white border border-cyan-300 px-2.5 py-2">
              <div className="font-bold text-cyan-700">Cyan</div>
              <div className="text-slate-600">Projection <strong>fin d&apos;année</strong> si le rythme se maintient</div>
            </div>
            <div className="rounded-lg bg-white border border-amber-300 px-2.5 py-2">
              <div className="font-bold text-amber-700">Ambre / Rose</div>
              <div className="text-slate-600">Action à faire, ou projection <strong>en baisse</strong> vs N-1</div>
            </div>
          </div>
          {isLevelBased ? (
            <div className="space-y-1.5">
              <p className="font-semibold text-indigo-900">Logique Adhérents 2026 (CA global ACR+Alliance+DCA+Exadis)</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                <li><strong>Classique</strong> (≥ 25 k€) : RFA + Bonus plateformes. Pas de tripartites.</li>
                <li><strong>Silver</strong> (≥ {fmt(SILVER_MIN)}) : meilleurs taux + <strong>tripartites débloquées</strong>.</li>
                <li><strong>Gold</strong> (≥ {fmt(GOLD_MIN)}) : bonus Union supérieur.</li>
              </ul>
              <p className="text-slate-600">
                Si votre projection dépasse le seuil Silver/Gold, la page affiche déjà le niveau et les tripartites <strong>comme en fin d&apos;année</strong> (bloc cyan), même si à date vous n&apos;y êtes pas encore.
              </p>
            </div>
          ) : (
            <p className="text-slate-700">
              Contrat spécifique : les paliers affichés sont ceux de <strong>{contractName}</strong> (pas Classique/Silver/Gold).
              Tripartites et plateformes suivent ce contrat uniquement.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Rfa26ProgressCard({
  logoPlatform,
  logos,
  label,
  ca,
  prog,
  hasTiers = true,
  tierGroups = [],
  proj = null,
  fmt,
  fmtPct,
  locked = false,
  projectedUnlock = false,
  lockHint = null,
  levelLabel = null,
  projTierGroups = null,
  projLevelLabel = null,
}) {
  const [open, setOpen] = useState(false)
  const achieved = prog.achieved
  const hasLadder = tierGroups.some((g) => g.tiers?.length > 0)
  const hasProjLadder = projTierGroups && projTierGroups.some((g) => g.tiers?.length > 0)
  const near = !achieved && prog.nextMin != null && prog.progress >= 80

  if (!hasTiers) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          {logoPlatform && <CmsPlatformLogo platform={logoPlatform} logos={logos} size={24} />}
          <span className="font-bold text-rose-900 text-sm flex-1 truncate">{label}</span>
          <span className="font-mono text-sm text-rose-800">{fmt(ca)}</span>
        </div>
        <span className="inline-flex text-[11px] font-bold px-2 py-1 rounded-md bg-rose-200 text-rose-800">
          Non éligible — aucun palier sur ce contrat
        </span>
      </div>
    )
  }

  // Verrouillé à date MAIS débloqué en projection → lecture positive (cyan), pas ambre
  if (projectedUnlock) {
    const tiers = tierGroups.flatMap((g) => g.tiers || [])
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    let rate = 0
    for (const t of sorted) {
      if (t.min <= ca) rate = t.rate
      else break
    }
    if (rate === 0 && sorted[0]) rate = sorted[0].rate
    return (
      <div
        className={`rounded-xl border-2 border-cyan-300 bg-white p-4 ${hasLadder ? 'cursor-pointer hover:border-cyan-400' : ''}`}
        onClick={() => hasLadder && setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 mb-2">
          {logoPlatform && <CmsPlatformLogo platform={logoPlatform} logos={logos} size={24} />}
          <span className="font-bold text-slate-800 text-sm flex-1 truncate">{label}</span>
          <span className="font-mono text-sm text-slate-700">{fmt(ca)}</span>
          {hasLadder && (
            <svg className={`w-4 h-4 text-cyan-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">À date : verrouillé</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-900 border border-cyan-300">Fin 2026 : débloqué</span>
        </div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-500">Taux marque {fmtPct(rate || prog.rate)}</span>
          <span className="text-amber-700 font-semibold">0 € RFA à date</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(prog.progress || 0, 100)}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          {prog.nextMin != null
            ? <>Palier marque : encore <strong>{fmt(prog.missing)}</strong> sur cette ligne</>
            : <>Palier marque atteint — encaissement dès Silver</>}
        </p>
        <Rfa26ProjectionBlock
          proj={proj}
          fmt={fmt}
          fmtPct={fmtPct}
          title="RFA projetée (Silver atteint)"
          hint={projLevelLabel || 'Silver+'}
        />
        {open && hasLadder && <Rfa26TierLadder tierGroups={tierGroups} ca={ca} fmt={fmt} fmtPct={fmtPct} levelLabel={levelLabel} />}
      </div>
    )
  }

  if (locked) {
    const tiers = tierGroups.flatMap((g) => g.tiers || [])
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    let rate = 0
    for (const t of sorted) {
      if (t.min <= ca) rate = t.rate
      else break
    }
    if (rate === 0 && sorted[0]) rate = sorted[0].rate
    const potentialValue = rate * ca
    return (
      <div
        className={`rounded-xl border border-amber-300 bg-amber-50/70 p-4 ${hasLadder ? 'cursor-pointer hover:border-amber-400' : ''}`}
        onClick={() => hasLadder && setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 mb-2">
          {logoPlatform && <CmsPlatformLogo platform={logoPlatform} logos={logos} size={24} />}
          <span className="font-bold text-amber-950 text-sm flex-1 truncate">{label}</span>
          <span className="font-mono text-sm text-amber-900">{fmt(ca)}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">🔒</span>
          {hasLadder && (
            <svg className={`w-4 h-4 text-amber-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          )}
        </div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-amber-800 font-semibold">Réservé Silver &amp; Gold</span>
          {potentialValue > 0 && (
            <span className="text-amber-900">Potentiel <strong>{fmt(potentialValue)}</strong> · {fmtPct(rate)}</span>
          )}
        </div>
        {lockHint && <p className="text-[11px] text-amber-800/90 leading-snug mb-2">{lockHint}</p>}
        <div className="h-2.5 rounded-full bg-amber-100 overflow-hidden opacity-70">
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(prog.progress || 0, 100)}%` }} />
        </div>
        <Rfa26ProjectionBlock proj={proj} fmt={fmt} fmtPct={fmtPct} title="Projection fin 2026" />
        {open && hasLadder && <Rfa26TierLadder tierGroups={tierGroups} ca={ca} fmt={fmt} fmtPct={fmtPct} levelLabel={levelLabel} />}
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border bg-white p-4 ${hasLadder ? 'cursor-pointer hover:border-indigo-300' : ''} ${
        achieved ? 'border-emerald-300 bg-emerald-50/40' : near ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
      }`}
      onClick={() => hasLadder && setOpen((o) => !o)}
    >
      <div className="flex items-center gap-2 mb-2">
        {logoPlatform && <CmsPlatformLogo platform={logoPlatform} logos={logos} size={24} />}
        <span className="font-bold text-gray-800 text-sm flex-1 truncate">{label}</span>
        <span className="font-mono text-sm text-gray-900">{fmt(ca)}</span>
        {hasLadder && (
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-gray-500">
          Taux {fmtPct(prog.rate)}
          {!achieved && prog.nextRate != null && <span className="text-amber-600 font-semibold"> → {fmtPct(prog.nextRate)}</span>}
        </span>
        <span className="font-bold text-emerald-600">{fmt(prog.currentValue)} RFA</span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${achieved ? 'bg-emerald-500' : near ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${prog.progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] mt-1.5">
        {achieved ? (
          <span className="text-emerald-600 font-semibold">✓ Palier maximal atteint</span>
        ) : prog.nextMin != null ? (
          <span className="text-gray-500">Encore <strong className="text-gray-800">{fmt(prog.missing)}</strong> pour <strong className="text-emerald-600">+{fmt(prog.projectedGain)}</strong> de RFA</span>
        ) : (
          <span className="text-gray-400">Palier atteint</span>
        )}
        <span className="text-gray-400">{Math.round(prog.progress)}%</span>
      </div>

      <Rfa26ProjectionBlock
        proj={proj}
        fmt={fmt}
        fmtPct={fmtPct}
        title="Projection fin 2026"
        hint={projLevelLabel || null}
      />

      {open && hasLadder && (
        <>
          <Rfa26TierLadder tierGroups={tierGroups} ca={ca} fmt={fmt} fmtPct={fmtPct} levelLabel={levelLabel || 'Barème à date'} />
          {hasProjLadder && proj && (
            <Rfa26TierLadder
              tierGroups={projTierGroups}
              ca={proj.ca || 0}
              fmt={fmt}
              fmtPct={fmtPct}
              levelLabel={projLevelLabel ? `Barème ${projLevelLabel}` : 'Barème projection'}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ── Onglet RFA 2026 (depuis Pure Data, moteur RFA réutilisé) ── */
function ClientRfa2026Section({ codeUnion, groupeClient, caN1Rfa = null, caN1Label = 'CA N-1 (Vue RFA)' }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [logos, setLogos] = useState({})

  const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmtPct = (r) => new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(r || 0)

  useEffect(() => {
    getSupplierLogos().then((list) => {
      const map = {}
      for (const l of list || []) if (l.supplier_key) map[l.supplier_key.toUpperCase()] = l.image_url
      setLogos(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!codeUnion && !groupeClient) { setData(null); return }
    setLoading(true)
    setData(null)
    getClientRfa2026({ codeUnion, groupeClient, year: 2026 })
      .then(setData)
      .catch(() => setData({ available: false }))
      .finally(() => setLoading(false))
  }, [codeUnion, groupeClient])

  if (loading) return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 text-indigo-500 text-sm">
        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        Calcul de la RFA 2026…
      </div>
    </div>
  )

  if (!data?.available) return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
      <h3 className="text-indigo-900 font-bold">RFA 2026</h3>
      <p className="text-sm text-slate-500 mt-2">{data?.message || 'Aucune donnée Pure Data 2026 disponible pour le moment.'}</p>
    </div>
  )

  const rfa = data.rfa || {}
  const totals = rfa.totals || {}
  const caGlobal = data.ca?.totals?.global_total || 0
  const grand = totals.grand_total || 0
  const globalItems = Object.entries(rfa.global || {})
  const contractLevel = data.contract_level || null
  const isLevelBased = Boolean(data.level_based || contractLevel?.id)
  const levelId = isLevelBased ? (contractLevel?.id || null) : null
  const triEnabled = isLevelBased ? contractLevel?.tripartites_enabled === true : true
  const SILVER_MIN = 100001
  const GOLD_MIN = 300001
  const gapToSilver = Math.max(SILVER_MIN - caGlobal, 0)
  const gapToGold = Math.max(GOLD_MIN - caGlobal, 0)
  const triItems = Object.entries(rfa.tri || {})
    .filter(([, v]) => (v.ca || 0) > 0)
    .filter(([, v]) => rfa26ParseTiers(v.tiers).length > 0)
  const projected = data.rfa_projected || null
  const projGrand = projected?.totals?.grand_total || null
  const projectedLevel = data.projected_level || null
  const projLevelId = projectedLevel?.id || null
  const projTriEnabled = projectedLevel?.tripartites_enabled === true
  const levelWillUpgrade = Boolean(isLevelBased && levelId && projLevelId && levelId !== projLevelId)
  const projCaGlobal = (() => {
    if (!projected?.global) return null
    return Object.values(projected.global).reduce((s, it) => s + (it.ca || 0), 0)
  })()
  const MONTHS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const monthName = data.reporting_month ? (MONTHS_FR[data.reporting_month] || `M${data.reporting_month}`) : null
  const projLabel = monthName ? `Au rythme de ${monthName}` : null
  // N-1 = CA complet Vue RFA 2025 (import Excel), PAS le Pure Data YTD 2025
  const caProjectedForCmp = projCaGlobal != null
    ? projCaGlobal
    : (data.reporting_month === 12 ? caGlobal : null)
  const caN1 = (caN1Rfa != null && Number(caN1Rfa) > 0) ? Number(caN1Rfa) : null
  const cmpDelta = (caN1 != null && caProjectedForCmp != null)
    ? caProjectedForCmp - caN1
    : null
  const cmpDeltaPct = (cmpDelta != null && caN1 > 0) ? (cmpDelta / caN1) * 100 : null
  const trend = cmpDelta == null
    ? null
    : (cmpDelta > 50 ? 'up' : cmpDelta < -50 ? 'down' : 'flat')
  const lockHintBase = gapToSilver > 0
    ? `Encore ${fmt(gapToSilver)} de CA global pour passer Silver et encaisser ces tripartites.`
    : `Passez Silver ou Gold pour encaisser ces tripartites.`
  const showLevelLock = isLevelBased && !triEnabled
  // Projection ≥ Silver : ne plus afficher les cartes en "jaune verrouillé"
  const triProjectedUnlock = showLevelLock && projTriEnabled
  const triFullyLocked = showLevelLock && !projTriEnabled
  const contractName = data.contract_applied?.name || 'Défaut'

  const platformOpps = globalItems
    .filter(([, it]) => (it.ca || 0) > 0)
    .map(([key, it]) => {
      const tRfa = rfa26ParseTiers(it.tiers_rfa)
      const tBonus = rfa26ParseTiers(it.tiers_bonus)
      const prog = rfa26GlobalProgress(it.ca || 0, tRfa, tBonus)
      return { key, label: it.label, prog }
    })
    .filter((x) => x.prog.nextMin != null && x.prog.projectedGain > 0)
    .sort((a, b) => b.prog.projectedGain - a.prog.projectedGain)
  const bestOpp = platformOpps[0] || null

  let nextObjective = null
  if (isLevelBased && levelId === 'CLASSIQUE' && gapToSilver > 0) {
    nextObjective = {
      title: 'Objectif : Silver',
      body: `Encore ${fmt(gapToSilver)} de CA global pour débloquer les tripartites.`,
      progress: Math.min((caGlobal / SILVER_MIN) * 100, 100),
    }
  } else if (isLevelBased && levelId === 'SILVER' && gapToGold > 0) {
    nextObjective = {
      title: 'Objectif : Gold',
      body: `Encore ${fmt(gapToGold)} de CA global pour le bonus Union supérieur.`,
      progress: Math.min((caGlobal / GOLD_MIN) * 100, 100),
    }
  } else if (bestOpp) {
    nextObjective = {
      title: `Prochain palier · ${bestOpp.label}`,
      body: `Encore ${fmt(bestOpp.prog.missing)} pour +${fmt(bestOpp.prog.projectedGain)} de RFA.`,
      progress: bestOpp.prog.progress,
    }
  } else {
    nextObjective = {
      title: 'Objectifs atteints',
      body: 'Paliers maximaux atteints sur les plateformes suivies.',
      progress: 100,
      done: true,
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-white font-black text-lg tracking-tight">RFA 2026</h3>
            <p className="text-indigo-100 text-sm mt-0.5 truncate">
              {contractName}
              <span className="text-indigo-200/80"> · Pure Data {data.year}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isLevelBased ? (
              <>
                <Rfa26LevelBadge level={levelId} size="lg" />
                {levelWillUpgrade && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-50 bg-cyan-400/25 border border-cyan-200/30 px-2.5 py-1.5 rounded-lg">
                    → {projLevelId}
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-indigo-300/40 bg-white/10 text-white text-xs font-bold">
                Contrat spécifique
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12px] text-amber-900">
          Chiffres estimatifs — module en validation. Ne pas communiquer tels quels aux adhérents.
        </div>

        {(rfa.fixed_bonuses || []).filter((b) => b?.key === 'WARNING_TRI_PRIME').map((prime) => {
          const triggered = !!prime.triggered
          const conditions = Array.isArray(prime.conditions) ? prime.conditions : []
          return (
            <div
              key={prime.key}
              className={`rounded-xl border-2 px-4 py-3 flex flex-wrap items-start justify-between gap-3 ${
                triggered
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">
                  {triggered ? 'Prime Warning 2026 débloquée' : 'Prime Warning 2026 — objectifs'}
                </div>
                <div className="text-lg font-black">
                  {triggered ? '+' : ''}{fmt(prime.amount_ttc || 0)} TTC
                </div>
                <p className="text-sm mt-1">
                  {triggered
                    ? 'Les 3 objectifs tripartites Alliance sont atteints — prime ajoutée à votre RFA 2026.'
                    : 'Atteignez les 3 objectifs ci-dessous pour débloquer la prime de 3 000 € TTC (RFA 2026 uniquement).'}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {conditions.map((c) => (
                    <li key={c.key} className="flex flex-wrap items-baseline gap-x-2">
                      <span className={c.met ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                        {c.met ? '✓' : '○'} {c.label}
                      </span>
                      <span className="opacity-80">
                        {fmt(c.ca || 0)} / {fmt(c.required || 0)}
                        {!c.met && c.missing > 0 ? ` — reste ${fmt(c.missing)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <span
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold ${
                  triggered ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {triggered ? 'Débloquée' : 'En cours'}
              </span>
            </div>
          )
        })}

        <Rfa26Readme
          isLevelBased={isLevelBased}
          contractName={contractName}
          fmt={fmt}
          SILVER_MIN={SILVER_MIN}
          GOLD_MIN={GOLD_MIN}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-3">
              À date{monthName ? ` · ${monthName}` : ''} · réalisé
            </div>
            <div className="text-[11px] font-semibold text-slate-500">RFA estimée</div>
            <div className="text-3xl font-black text-emerald-600 leading-none mt-0.5">{fmt(grand)}</div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-slate-500">CA cumulé</div>
                <div className="text-lg font-bold text-slate-800 font-mono">{fmt(caGlobal)}</div>
              </div>
              {isLevelBased && levelId && (
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 mb-1">Niveau</div>
                  <Rfa26LevelBadge level={levelId} />
                </div>
              )}
            </div>
            {caGlobal > 0 && (
              <div className="mt-3 text-[11px] text-slate-400">
                Taux moyen {fmtPct(grand / caGlobal)}
              </div>
            )}
          </div>

          <div className="rounded-2xl border-2 border-cyan-300 bg-gradient-to-br from-cyan-50 to-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 mb-3">
              Projection fin 2026 · si rythme maintenu
            </div>
            <div className="text-[11px] font-semibold text-slate-500">RFA projetée</div>
            <div className="text-3xl font-black text-cyan-700 leading-none mt-0.5">
              {projGrand != null ? fmt(projGrand) : '—'}
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-slate-500">CA projeté (plateformes)</div>
                <div className="text-lg font-bold text-slate-800 font-mono">
                  {caProjectedForCmp != null ? fmt(caProjectedForCmp) : '—'}
                </div>
              </div>
              {isLevelBased && (projLevelId || levelId) && (
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 mb-1">Niveau projeté</div>
                  <Rfa26LevelBadge level={projLevelId || levelId} />
                </div>
              )}
            </div>
            {projLabel && (
              <div className="mt-3 text-[11px] text-cyan-700/80 font-medium">{projLabel}</div>
            )}
            {levelWillUpgrade && (
              <div className="mt-1 text-[11px] text-cyan-800 font-semibold">
                Inclut le passage {levelId} → {projLevelId}
              </div>
            )}

            {/* CA N-1 Vue RFA 2025 vs projection plateformes 2026 */}
            {caN1 != null && (
              <div className={`mt-4 rounded-xl border-2 px-3 py-3 ${
                trend === 'up'
                  ? 'border-emerald-300 bg-emerald-50'
                  : trend === 'down'
                    ? 'border-rose-300 bg-rose-50'
                    : 'border-slate-200 bg-slate-50'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    vs {caN1Label}
                  </span>
                  {trend === 'up' && (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      ▲ En hausse
                    </span>
                  )}
                  {trend === 'down' && (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-lg">
                      ▼ En baisse
                    </span>
                  )}
                  {trend === 'flat' && caProjectedForCmp != null && (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                      → Stable
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-white/80 border border-slate-200 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase text-slate-500">{caN1Label}</div>
                    <div className="text-sm font-black text-slate-800 font-mono mt-0.5">{fmt(caN1)}</div>
                  </div>
                  <div className="rounded-lg bg-white/80 border border-cyan-200 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase text-cyan-700">CA projeté 2026</div>
                    <div className="text-sm font-black text-cyan-900 font-mono mt-0.5">
                      {caProjectedForCmp != null ? fmt(caProjectedForCmp) : '—'}
                    </div>
                  </div>
                </div>
                {cmpDelta != null && (
                  <div className={`mt-2 text-center text-sm font-bold ${
                    trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-rose-700' : 'text-slate-600'
                  }`}>
                    {cmpDelta >= 0 ? '+' : ''}{fmt(cmpDelta)}
                    {cmpDeltaPct != null && (
                      <span className="ml-1.5 text-[12px] font-semibold opacity-80">
                        ({cmpDeltaPct >= 0 ? '+' : ''}{cmpDeltaPct.toFixed(1).replace('.', ',')} %)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {caN1 == null && (
              <div className="mt-3 text-[11px] text-slate-400">
                Ouvrez d&apos;abord la Vue RFA 2025 (ou chargez l&apos;import) pour comparer au CA 2025 complet.
              </div>
            )}
          </div>
        </div>

        {nextObjective && (
          <div className={`rounded-2xl border px-4 py-3.5 ${nextObjective.done ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/50'}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${nextObjective.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                {nextObjective.done ? '✓' : '🎯'}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold ${nextObjective.done ? 'text-emerald-900' : 'text-amber-950'}`}>{nextObjective.title}</div>
                <p className={`text-[13px] mt-0.5 ${nextObjective.done ? 'text-emerald-800' : 'text-amber-900/90'}`}>{nextObjective.body}</p>
                <div className="mt-2.5 h-2.5 rounded-full bg-white/70 border border-black/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${nextObjective.done ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(nextObjective.progress || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {globalItems.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Plateformes</h4>
            <p className="text-[12px] text-gray-400 mb-3">
              À date + projection fin d&apos;année (CA · taux · RFA). Cliquez pour le barème.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {globalItems
                .filter(([, it]) => (it.ca || 0) > 0)
                .map(([key, it]) => {
                  const tRfa = rfa26ParseTiers(it.tiers_rfa)
                  const tBonus = rfa26ParseTiers(it.tiers_bonus)
                  const prog = rfa26GlobalProgress(it.ca || 0, tRfa, tBonus)
                  const pj = projected?.global?.[key]
                  const proj = pj ? { ca: pj.ca || 0, rate: pj.total?.rate || 0, value: pj.total?.value || 0 } : null
                  const pjRfa = pj ? rfa26ParseTiers(pj.tiers_rfa) : []
                  const pjBonus = pj ? rfa26ParseTiers(pj.tiers_bonus) : []
                  const projTierGroups = levelWillUpgrade && (pjRfa.length > 0 || pjBonus.length > 0)
                    ? [{ label: 'Paliers RFA', tiers: pjRfa }, { label: 'Paliers Bonus', tiers: pjBonus }]
                    : null
                  return (
                    <Rfa26ProgressCard
                      key={key}
                      logoPlatform={key.replace('GLOBAL_', '')}
                      logos={logos}
                      label={it.label}
                      ca={it.ca || 0}
                      prog={prog}
                      hasTiers={tRfa.length > 0 || tBonus.length > 0}
                      tierGroups={[{ label: 'Paliers RFA', tiers: tRfa }, { label: 'Paliers Bonus', tiers: tBonus }]}
                      proj={proj}
                      fmt={fmt}
                      fmtPct={fmtPct}
                      levelLabel={levelId ? `Barème ${levelId}` : null}
                      projTierGroups={projTierGroups}
                      projLevelLabel={projLevelId || null}
                    />
                  )
                })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tripartites</h4>
          <p className="text-[12px] text-gray-400 mb-3">
            {triProjectedUnlock
              ? 'À date encore Classique — mais la projection Silver les débloque (cartes cyan)'
              : triFullyLocked
                ? 'Débloquées à partir de Silver (CA global ≥ 100 001 €)'
                : isLevelBased
                  ? 'À date + projection fin d\'année par marque'
                  : 'À date + projection fin d\'année selon votre contrat'}
          </p>
          {triProjectedUnlock && (
            <div className="rounded-xl border-2 border-cyan-300 bg-cyan-50 px-3.5 py-3 mb-3">
              <p className="text-sm text-cyan-950 font-semibold">
                Projection ≥ Silver — tripartites débloquées fin 2026
              </p>
              <p className="text-[13px] text-cyan-900 mt-1 leading-snug">
                À date vous êtes encore {levelId || 'Classique'}
                {gapToSilver > 0 && <> (il reste <strong>{fmt(gapToSilver)}</strong>)</>}.
                Au rythme actuel (~{fmt(projCaGlobal)} fin 2026), le niveau {projLevelId || 'Silver'} active ces lignes.
              </p>
            </div>
          )}
          {triFullyLocked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 mb-3">
              <p className="text-sm text-amber-950 font-semibold">
                Niveau {levelId || 'Classique'} — tripartites verrouillées
              </p>
              <p className="text-[13px] text-amber-900 mt-1 leading-snug">
                Réservées aux clients Silver &amp; Gold (CA global ≥ {fmt(SILVER_MIN)}).
                {gapToSilver > 0 && <> Il reste <strong>{fmt(gapToSilver)}</strong>.</>}
              </p>
            </div>
          )}
          {triItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {triItems.map(([key, it]) => {
                const tiers = rfa26ParseTiers(it.tiers)
                const prog = rfa26TriProgress(it.ca || 0, tiers)
                const pjt = projected?.tri?.[key]
                const proj = pjt ? { ca: pjt.ca || 0, rate: pjt.rate || 0, value: pjt.value || 0 } : null
                return (
                  <Rfa26ProgressCard
                    key={key}
                    logoPlatform={null}
                    logos={logos}
                    label={it.label}
                    ca={it.ca || 0}
                    prog={prog}
                    hasTiers={tiers.length > 0}
                    tierGroups={[{ label: 'Paliers', tiers }]}
                    proj={proj}
                    fmt={fmt}
                    fmtPct={fmtPct}
                    locked={triFullyLocked}
                    projectedUnlock={triProjectedUnlock}
                    lockHint={triFullyLocked ? lockHintBase : null}
                    projLevelLabel={projLevelId || null}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {isLevelBased
                ? 'Aucune tripartite avec CA sur les marques éligibles pour le moment.'
                : 'Aucune tripartite avec CA sur les marques éligibles de ce contrat pour le moment.'}
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          Calculé depuis le Pure Data cumulé et le contrat en vigueur. Estimations susceptibles d&apos;évoluer.
        </p>
      </div>
    </div>
  )
}

export default ClientSpacePage
