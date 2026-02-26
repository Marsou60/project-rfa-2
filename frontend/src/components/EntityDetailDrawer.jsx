import { useState, useEffect } from 'react'
import { X, FileText, User, Users, Pencil, Check, Link2, TrendingUp } from 'lucide-react'
import { getContracts, exportEntityPdf, getContractRules, getUnionEntity } from '../api/client'
import { SUPPLIER_KEYS, getKeysForSupplier } from '../constants/suppliers'
import TierOverrideEditor from './TierOverrideEditor'

// Taux fournisseurs par défaut (ce que les fournisseurs reversent à GU)
const DEFAULT_SUPPLIER_RATES = {
  GLOBAL_ACR:      { label: 'ACR',      rate: 18, emoji: '🔵', color: 'from-blue-500 to-blue-700',       badge: 'bg-blue-500/20 text-blue-300' },
  GLOBAL_DCA:      { label: 'DCA',      rate: 16, emoji: '🟣', color: 'from-purple-500 to-purple-700',   badge: 'bg-purple-500/20 text-purple-300' },
  GLOBAL_ALLIANCE: { label: 'ALLIANCE', rate: 14, emoji: '🟡', color: 'from-yellow-500 to-amber-600',    badge: 'bg-yellow-500/20 text-yellow-300' },
  GLOBAL_EXADIS:   { label: 'EXADIS',  rate: 13, emoji: '🟢', color: 'from-emerald-500 to-teal-600',    badge: 'bg-emerald-500/20 text-emerald-300' },
}

function EntityDetailDrawer({ entity, mode, loading, onClose, importId, onContractChange, onAssignContract, cotisationAmount = 0, onCotisationChange, onRefresh }) {
  const [editingOverride, setEditingOverride] = useState(null)
  const [contractRules, setContractRules] = useState({})
  const [marginRateReceived, setMarginRateReceived] = useState('')
  const defaultRates = Object.fromEntries(
    Object.entries(DEFAULT_SUPPLIER_RATES).map(([k, v]) => [k, v.rate])
  )
  const [supplierRates, setSupplierRates] = useState(defaultRates)
  const [unionRatesLoaded, setUnionRatesLoaded] = useState(false)

  // Charge les taux effectifs réels depuis l'entité Union (global + tri-partites inclus)
  useEffect(() => {
    if (!importId) return
    setUnionRatesLoaded(false)
    getUnionEntity(importId)
      .then((unionEntity) => {
        const globalItems = unionEntity?.rfa?.global || {}
        const triItems   = unionEntity?.rfa?.tri   || {}
        const computed   = { ...defaultRates }

        // Reproduction exacte du calcul de UnionSpacePage "Récapitulatif par Fournisseur" :
        //   totalCa  = CA du GLOBAL uniquement (ex: GLOBAL_ACR.ca)
        //   totalRfa = RFA global + RFA de tous les tri-partites du fournisseur
        //   taux effectif = totalRfa / totalCa
        const GLOBAL_KEY_MAP = {
          ACR: 'GLOBAL_ACR', DCA: 'GLOBAL_DCA',
          EXADIS: 'GLOBAL_EXADIS', ALLIANCE: 'GLOBAL_ALLIANCE',
        }

        SUPPLIER_KEYS.forEach((supplier) => {
          const globalKey = `GLOBAL_${supplier}`
          const globalItem = globalItems[globalKey]

          // CA = seulement le CA global (pas les CA tri-partites — identique à UnionSpacePage l.261)
          const totalCa = globalItem?.ca || 0
          if (totalCa === 0) return

          // RFA global
          let totalRfa = globalItem
            ? (globalItem.total?.value ?? ((globalItem.rfa?.value || 0) + (globalItem.bonus?.value || 0)))
            : 0

          // RFA tri-partites (valeur directe dans item.value pour les tri)
          getKeysForSupplier(supplier)
            .filter(k => k.startsWith('TRI_'))
            .forEach((key) => {
              const triItem = triItems[key]
              if (!triItem) return
              // Les items tri ont soit .value direct, soit .rfa.value
              totalRfa += triItem.value ?? triItem.rfa?.value ?? 0
            })

          if (totalRfa > 0) {
            const effectiveRate = (totalRfa / totalCa) * 100
            const mappedKey = GLOBAL_KEY_MAP[supplier]
            if (mappedKey) computed[mappedKey] = parseFloat(effectiveRate.toFixed(2))
          }
        })

        setSupplierRates(computed)
        setUnionRatesLoaded(true)
      })
      .catch(() => {
        // Fallback : config Paul/DAF ou défauts
        try {
          const paul = localStorage.getItem('gu_supplier_rates')
          if (paul) setSupplierRates({ ...defaultRates, ...JSON.parse(paul) })
        } catch {}
        setUnionRatesLoaded(true)
      })
  }, [importId])

  useEffect(() => {
    if (entity?.contract_applied?.id) {
      loadContractRules(entity.contract_applied.id)
    }
  }, [entity?.contract_applied?.id])

  const loadContractRules = async (contractId) => {
    try {
      const rules = await getContractRules(contractId)
      const rulesMap = {}
      for (const rule of rules) {
        rulesMap[rule.key] = rule
      }
      setContractRules(rulesMap)
    } catch (err) {
      console.error('Erreur chargement regles:', err)
    }
  }

  const openOverrideEditor = (fieldKey, fieldLabel, tierType, item) => {
    const rule = contractRules[fieldKey]
    let currentTiers = []
    if (rule) {
      if (tierType === 'rfa' && rule.tiers_rfa) {
        currentTiers = JSON.parse(rule.tiers_rfa)
      } else if (tierType === 'bonus' && rule.tiers_bonus) {
        currentTiers = JSON.parse(rule.tiers_bonus)
      } else if (tierType === 'tri' && rule.tiers) {
        currentTiers = JSON.parse(rule.tiers)
      }
    }

    setEditingOverride({
      fieldKey,
      fieldLabel,
      tierType,
      currentTiers,
      currentRate: tierType === 'tri' ? item.rate : item[tierType]?.rate || 0,
      currentValue: tierType === 'tri' ? item.value : item[tierType]?.value || 0,
      ca: item.ca
    })
  }

  const handleOverrideSaved = () => {
    setEditingOverride(null)
    if (onRefresh) onRefresh()
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatPercent = (rate) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 3,
    }).format(rate)
  }

  const rawGrandTotal = entity?.rfa?.totals?.grand_total || 0
  const adjustedGrandTotal = mode === 'client' && cotisationAmount > 0
    ? Math.max(rawGrandTotal - cotisationAmount, 0)
    : rawGrandTotal

  const totalCaGlobal = entity?.ca?.totals?.global_total || 0
  const totalCaTri = entity?.ca?.totals?.tri_total || 0
  const totalCa = totalCaGlobal + totalCaTri
  const parsedMarginRate = marginRateReceived === '' ? null : parseFloat(marginRateReceived) / 100
  const rfaReceived = parsedMarginRate !== null ? totalCa * parsedMarginRate : null
  const unionMargin = parsedMarginRate !== null ? (rfaReceived - adjustedGrandTotal) : null

  if (!entity && !loading) {
    return null
  }

  return (
    <>
      {/* Overlay */}
      {entity && (
        <div
          className="fixed inset-0 glass-modal-overlay z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-5xl glass-drawer z-50 transform transition-transform duration-300 ease-in-out overflow-hidden ${
          entity ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow-blue">
                {mode === 'client' ? (
                  <User className="w-6 h-6 text-white" />
                ) : (
                  <Users className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {loading ? 'Chargement...' : (
                    mode === 'client'
                      ? entity?.code_union
                      : entity?.groupe_client
                  )}
                </h2>
                {entity && mode === 'client' && entity.nom_client && (
                  <p className="text-sm text-glass-secondary">{entity.nom_client}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {entity && !loading && (
                <button
                  onClick={async () => {
                    try {
                      const entityId = mode === 'client' ? entity.code_union : entity.groupe_client
                      await exportEntityPdf(importId, mode, entityId, entity.contract_applied?.id)
                    } catch (err) {
                      console.error('Erreur export PDF:', err)
                      alert('Erreur lors de l\'export PDF: ' + (err.response?.data?.detail || err.message))
                    }
                  }}
                  className="glass-btn-danger flex items-center gap-2"
                  title="Exporter en PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span>Exporter PDF</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="glass-btn-icon"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-glass-secondary">Chargement du détail...</div>
              </div>
            ) : entity ? (
              <div className="space-y-6">

                {/* ── Analyse Marge Groupement Union ── */}
                {(() => {
                  // Calcul par plateforme
                  const globalItems = entity?.rfa?.global || {}
                  const platforms = Object.entries(globalItems)
                    .filter(([key]) => DEFAULT_SUPPLIER_RATES[key])
                    .map(([key, item]) => {
                      const meta = DEFAULT_SUPPLIER_RATES[key]
                      const tauxFournisseur = (supplierRates[key] ?? meta.rate) / 100
                      const ca = item.ca || 0
                      const recu = ca * tauxFournisseur
                      const reverse = item.total?.value ?? (item.rfa?.value || 0) + (item.bonus?.value || 0)
                      const delta = recu - reverse
                      const margePct = recu > 0 ? delta / recu : 0
                      return { key, meta, ca, recu, reverse, delta, margePct, item }
                    })

                  const totalRecu    = platforms.reduce((s, p) => s + p.recu, 0)
                  const totalReverse = adjustedGrandTotal   // RFA nette reversée adhérent (après cotisation)
                  const totalDelta   = totalRecu - totalReverse
                  const totalMarge   = totalRecu > 0 ? totalDelta / totalRecu : 0

                  return (
                    <div className="space-y-4">
                      {/* ── Résumé global ── */}
                      <div className="rounded-2xl bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 p-5 relative overflow-hidden shadow-xl border border-white/10">
                        <div className="absolute inset-0 bg-black/10" />
                        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 blur-2xl" />
                        <div className="relative space-y-4">
                          {/* CA total — bien visible */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-emerald-400" />
                              <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                                Analyse marge Groupement Union
                              </p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${unionRatesLoaded ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/30'}`}>
                                {unionRatesLoaded ? '✓ Taux Union réels' : 'Calcul…'}
                              </span>
                              <p className="text-white/40 text-[10px] uppercase tracking-wider">CA réalisé</p>
                              <p className="text-2xl font-black text-white">{formatAmount(totalCa)}</p>
                            </div>
                          </div>
                          {/* 3 métriques */}
                          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/10">
                            <div className="text-center">
                              <p className="text-blue-300/70 text-[10px] uppercase tracking-wider mb-1">Reçu fournisseurs</p>
                              <p className="text-xl font-black text-white">{formatAmount(totalRecu)}</p>
                            </div>
                            <div className="text-center border-x border-white/10">
                              <p className="text-orange-300/70 text-[10px] uppercase tracking-wider mb-1">Reversé adhérent</p>
                              <p className="text-xl font-black text-orange-300">{formatAmount(totalReverse)}</p>
                              {cotisationAmount > 0 && (
                                <p className="text-white/30 text-[10px] mt-0.5">cotis. -{formatAmount(cotisationAmount)}</p>
                              )}
                            </div>
                            <div className="text-center">
                              <p className="text-emerald-300/70 text-[10px] uppercase tracking-wider mb-1">Marge GU</p>
                              <p className="text-xl font-black text-emerald-400">{formatAmount(totalDelta)}</p>
                              <p className="text-emerald-300/60 text-xs font-semibold mt-0.5">
                                {(totalMarge * 100).toFixed(1)} %
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Détail par plateforme ── */}
                      {platforms.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest px-1">
                            Détail par plateforme — taux fournisseur modifiable
                          </p>
                          {platforms.map(({ key, meta, ca, recu, reverse, delta, margePct, item }) => (
                            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                              {/* Header plateforme */}
                              <div className={`bg-gradient-to-r ${meta.color} px-4 py-2.5 flex items-center justify-between`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{meta.emoji}</span>
                                  <span className="text-white font-bold text-sm">{meta.label}</span>
                                  <span className="text-white/60 text-xs">CA : {formatAmount(ca)}</span>
                                </div>
                                {/* Taux fournisseur éditable */}
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-white/60 text-xs">Taux four. :</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      inputMode="decimal"
                                      value={supplierRates[key] ?? meta.rate}
                                      onChange={(e) => setSupplierRates(r => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))}
                                      className="w-16 bg-white/20 text-white text-xs font-bold rounded px-1.5 py-0.5 text-center border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/40"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-white/60 text-xs">%</span>
                                  </div>
                                  {/* Taux client effectif (lecture seule) */}
                                  {item.ca > 0 && (
                                    <span className="text-white/40 text-[10px]">
                                      client : {((item.total?.value ?? 0) / item.ca * 100).toFixed(2)} %
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Métriques */}
                              <div className="grid grid-cols-3 divide-x divide-white/10 px-0">
                                <div className="px-4 py-3 text-center">
                                  <p className="text-blue-300/60 text-[10px] uppercase tracking-wider mb-0.5">Reçu GU</p>
                                  <p className="text-white font-bold text-sm">{formatAmount(recu)}</p>
                                </div>
                                <div className="px-4 py-3 text-center">
                                  <p className="text-orange-300/60 text-[10px] uppercase tracking-wider mb-0.5">Reversé adhérent</p>
                                  <p className="text-orange-300 font-bold text-sm">{formatAmount(reverse)}</p>
                                </div>
                                <div className="px-4 py-3 text-center">
                                  <p className="text-emerald-300/60 text-[10px] uppercase tracking-wider mb-0.5">Marge GU</p>
                                  <p className={`font-bold text-sm ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {formatAmount(delta)}
                                  </p>
                                  <p className="text-white/40 text-[10px]">{(margePct * 100).toFixed(1)} %</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Info entité */}
                <div className="glass-card p-5">
                  {mode === 'client' ? (
                    <>
                      <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mb-1">Code Union</h3>
                      <p className="text-lg font-semibold text-white">{entity.code_union}</p>
                      {entity.nom_client && (
                        <>
                          <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mt-4 mb-1">Nom Client</h3>
                          <p className="text-lg text-glass-primary">{entity.nom_client}</p>
                        </>
                      )}
                      {entity.groupe_client && (
                        <>
                          <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mt-4 mb-1">Groupe Client</h3>
                          <p className="text-lg text-glass-primary">{entity.groupe_client}</p>
                        </>
                      )}

                      {/* Cotisation Union */}
                      <div className="mt-5 p-4 glass-card-dark border-orange-500/20">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-medium text-white">Cotisation Union</h3>
                            <p className="text-xs text-glass-muted">Déduction de la RFA client</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!onCotisationChange) return
                              onCotisationChange(cotisationAmount > 0 ? 0 : (cotisationAmount || 1500))
                            }}
                            className={`text-xs px-3 py-2 rounded-full font-semibold transition-all ${
                              cotisationAmount > 0
                                ? 'glass-badge-emerald'
                                : 'glass-badge-gray'
                            }`}
                            title="Activer / désactiver la cotisation"
                          >
                            {cotisationAmount > 0 ? (
                              <span className="flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Cotisation activée
                              </span>
                            ) : (
                              'Activer cotisation'
                            )}
                          </button>
                        </div>
                        {cotisationAmount > 0 && (
                          <div className="mt-3">
                            <label className="block text-xs text-glass-muted mb-1">Montant (€)</label>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={cotisationAmount}
                              onChange={(e) => {
                                if (!onCotisationChange) return
                                onCotisationChange(Number(e.target.value || 0))
                              }}
                              className="glass-input"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mb-1">Groupe Client</h3>
                      <p className="text-lg font-semibold text-white">{entity.groupe_client}</p>
                      <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mt-4 mb-1">Nombre de comptes</h3>
                      <p className="text-lg text-glass-primary">{entity.nb_comptes}</p>
                      {entity.codes_union && entity.codes_union.length > 0 && (
                        <>
                          <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mt-4 mb-2">Codes Union</h3>
                          <div className="flex flex-wrap gap-2">
                            {entity.codes_union.map((code) => (
                              <span
                                key={code}
                                className="glass-badge-gray"
                              >
                                {code}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Contrat appliqué et assignation */}
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-medium text-glass-muted uppercase tracking-wider mb-1">Contrat appliqué</h3>
                      <p className="text-lg font-semibold text-white">
                        {entity.contract_applied?.name || 'Contrat par défaut'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ContractSelector
                        currentContractId={entity.contract_applied?.id}
                        onSelect={(contractId) => onContractChange(contractId)}
                      />
                      {onAssignContract && (
                        <button
                          onClick={() => {
                            const entityData = mode === 'client'
                              ? { id: entity.code_union, label: entity.label || entity.code_union, groupe_client: entity.groupe_client }
                              : { id: entity.groupe_client, label: entity.groupe_client }
                            onAssignContract(entityData, mode)
                          }}
                          className="glass-btn-primary text-sm flex items-center gap-2"
                          title="Modifier l'affectation de contrat"
                        >
                          <Pencil className="w-4 h-4" />
                          <span>Assigner</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* RFA Globales Plateformes */}
                {entity.rfa?.global && (
                  <div className="glass-card overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                      <h3 className="text-lg font-semibold text-white">RFA Globales (Plateformes)</h3>
                      <span className="text-xs text-purple-300 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        Cliquez sur un taux pour le personnaliser
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table">
                        <thead>
                          <tr>
                            <th className="text-left">Element</th>
                            <th className="text-right">CA</th>
                            <th className="text-right">Seuil RFA</th>
                            <th className="text-right">Taux RFA</th>
                            <th className="text-right">RFA €</th>
                            <th className="text-right">Seuil Bonus</th>
                            <th className="text-right">Taux Bonus</th>
                            <th className="text-right">Bonus €</th>
                            <th className="text-right">Total €</th>
                            <th className="text-center">Déclenché</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(entity.rfa.global || {}).map(([key, item]) => (
                            <tr key={key} className={item.has_override ? 'bg-purple-500/10' : ''}>
                              <td className="font-medium">
                                <div className="flex items-center gap-2">
                                  {item.label}
                                  {item.has_override && (
                                    <span className="glass-badge-purple text-xs">
                                      Override
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="text-right">{formatAmount(item.ca)}</td>
                              <td className="text-right text-glass-secondary">
                                {item.rfa.selected_min ? formatAmount(item.rfa.selected_min) : (item.rfa.min_threshold ? formatAmount(item.rfa.min_threshold) : '-')}
                              </td>
                              <td className="text-right">
                                <button
                                  onClick={() => openOverrideEditor(key, item.label, 'rfa', item)}
                                  className={`px-2 py-1 rounded transition-colors ${
                                    item.rfa.has_override
                                      ? 'bg-purple-500/30 text-purple-200 font-semibold'
                                      : 'hover:bg-purple-500/20 text-glass-primary hover:text-purple-200'
                                  }`}
                                  title="Cliquez pour personnaliser ce taux"
                                >
                                  {item.rfa.rate > 0 ? formatPercent(item.rfa.rate) : '-'}
                                  <Pencil className="w-3 h-3 ml-1 inline text-purple-400" />
                                </button>
                              </td>
                              <td className="text-right font-semibold">
                                {formatAmount(item.rfa.value)}
                              </td>
                              <td className="text-right text-glass-secondary">
                                {item.bonus.selected_min ? formatAmount(item.bonus.selected_min) : (item.bonus.min_threshold ? formatAmount(item.bonus.min_threshold) : '-')}
                              </td>
                              <td className="text-right">
                                <button
                                  onClick={() => openOverrideEditor(key, item.label, 'bonus', item)}
                                  className={`px-2 py-1 rounded transition-colors ${
                                    item.bonus.has_override
                                      ? 'bg-purple-500/30 text-purple-200 font-semibold'
                                      : 'hover:bg-purple-500/20 text-glass-primary hover:text-purple-200'
                                  }`}
                                  title="Cliquez pour personnaliser ce taux"
                                >
                                  {item.bonus.rate > 0 ? formatPercent(item.bonus.rate) : '-'}
                                  <Pencil className="w-3 h-3 ml-1 inline text-purple-400" />
                                </button>
                              </td>
                              <td className="text-right font-semibold">
                                {formatAmount(item.bonus.value)}
                              </td>
                              <td className="text-right font-bold text-blue-400">
                                {formatAmount(item.total.value)}
                              </td>
                              <td className="text-center">
                                {item.triggered ? (
                                  <span className="glass-badge-emerald">Oui</span>
                                ) : (
                                  <span className="glass-badge-gray">Non</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* RFA Tri-partites */}
                {entity.rfa?.tri && (
                  <div className="glass-card overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                          <Link2 className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white">Tri-partites</h3>
                      </div>
                      <span className="text-xs text-purple-300 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        Cliquez sur un taux pour le personnaliser
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table">
                        <thead>
                          <tr>
                            <th className="text-left">Element</th>
                            <th className="text-right">CA</th>
                            <th className="text-right">Seuil</th>
                            <th className="text-right">Taux</th>
                            <th className="text-right">RFA €</th>
                            <th className="text-center">Déclenché</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(entity.rfa.tri || {})
                            .filter(([_, item]) => item.ca > 0 || item.triggered)
                            .map(([key, item]) => (
                            <tr key={key} className={item.has_override ? 'bg-purple-500/10' : ''}>
                              <td className="font-medium">
                                <div className="flex items-center gap-2">
                                  {item.label}
                                  {item.has_override && (
                                    <span className="glass-badge-purple text-xs">
                                      Override
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="text-right">{formatAmount(item.ca)}</td>
                              <td className="text-right text-glass-secondary">
                                {item.selected_min ? formatAmount(item.selected_min) : (item.min_threshold ? formatAmount(item.min_threshold) : '-')}
                              </td>
                              <td className="text-right">
                                <button
                                  onClick={() => openOverrideEditor(key, item.label, 'tri', item)}
                                  className={`px-2 py-1 rounded transition-colors ${
                                    item.has_override
                                      ? 'bg-purple-500/30 text-purple-200 font-semibold'
                                      : 'hover:bg-purple-500/20 text-glass-primary hover:text-purple-200'
                                  }`}
                                  title="Cliquez pour personnaliser ce taux"
                                >
                                  {item.rate > 0 ? formatPercent(item.rate) : '-'}
                                  <Pencil className="w-3 h-3 ml-1 inline text-purple-400" />
                                </button>
                              </td>
                              <td className="text-right font-semibold">
                                {formatAmount(item.value)}
                              </td>
                              <td className="text-center">
                                {item.triggered ? (
                                  <span className="glass-badge-emerald">Oui</span>
                                ) : (
                                  <span className="glass-badge-gray">Non</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Totaux RFA */}
                {entity.rfa?.totals && (
                  <div className="glass-card p-5">
                    <h3 className="text-lg font-semibold text-white mb-4">Totaux RFA</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-glass-secondary">Total RFA Plateformes</span>
                        <span className="text-lg font-semibold text-white">
                          {formatAmount(entity.rfa.totals.global_rfa || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-glass-secondary">Total Bonus Plateformes</span>
                        <span className="text-lg font-semibold text-white">
                          {formatAmount(entity.rfa.totals.global_bonus || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-glass-secondary">Total Plateformes (RFA + Bonus)</span>
                        <span className="text-lg font-semibold text-blue-400">
                          {formatAmount(entity.rfa.totals.global_total || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-glass-secondary">Total Tri</span>
                        <span className="text-lg font-semibold text-white">
                          {formatAmount(entity.rfa.totals.tri_total || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <span className="text-base font-semibold text-white">Total Final RFA</span>
                        <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                          {formatAmount(adjustedGrandTotal)}
                        </span>
                      </div>
                      {mode === 'client' && cotisationAmount > 0 && (
                        <div className="flex items-center justify-between text-xs text-orange-400">
                          <span>Déduction cotisation</span>
                          <span>- {formatAmount(cotisationAmount)} (brut: {formatAmount(rawGrandTotal)})</span>
                        </div>
                      )}
                      <div className="pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm text-glass-secondary">Taux RFA perçu Union (%)</span>
                            <p className="text-xs text-glass-muted">Simulation marge sur ce client</p>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={marginRateReceived}
                            onChange={(e) => setMarginRateReceived(e.target.value)}
                            placeholder="15"
                            className="glass-input w-24 text-sm"
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-sm text-glass-secondary">Marge Union simulée</span>
                          <span className={`text-lg font-semibold ${unionMargin !== null && unionMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {unionMargin !== null ? formatAmount(unionMargin) : '—'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-glass-muted">
                          <span>RFA perçue estimée</span>
                          <span>{rfaReceived !== null ? formatAmount(rfaReceived) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modal d'edition des overrides */}
      {editingOverride && (
        <TierOverrideEditor
          targetType={mode === 'client' ? 'CODE_UNION' : 'GROUPE_CLIENT'}
          targetValue={mode === 'client' ? entity?.code_union : entity?.groupe_client}
          fieldKey={editingOverride.fieldKey}
          fieldLabel={editingOverride.fieldLabel}
          tierType={editingOverride.tierType}
          currentTiers={editingOverride.currentTiers}
          currentRate={editingOverride.currentRate}
          currentValue={editingOverride.currentValue}
          ca={editingOverride.ca}
          onSave={handleOverrideSaved}
          onClose={() => setEditingOverride(null)}
        />
      )}
    </>
  )
}

function ContractSelector({ currentContractId, onSelect }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadContracts()
  }, [])

  const loadContracts = async () => {
    try {
      setLoading(true)
      const data = await getContracts()
      setContracts(data.filter(c => c.is_active))
    } catch (err) {
      console.error('Erreur chargement contrats:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const contractId = e.target.value ? parseInt(e.target.value) : null
    onSelect(contractId)
  }

  if (loading) {
    return <span className="text-sm text-glass-muted">Chargement...</span>
  }

  return (
    <select
      onChange={handleChange}
      className="glass-select text-sm"
      defaultValue=""
    >
      <option value="">Tester un autre contrat...</option>
      {contracts
        .filter(c => c.id !== currentContractId)
        .map((contract) => (
          <option key={contract.id} value={contract.id}>
            {contract.name}
          </option>
        ))}
    </select>
  )
}

export default EntityDetailDrawer
