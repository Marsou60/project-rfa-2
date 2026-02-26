import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Eye, X, AlertTriangle } from 'lucide-react'
import { getGlobalRecap, getUnionEntity } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'
import { SUPPLIER_KEYS, getKeysForSupplier } from '../constants/suppliers'

const FIELD_LABELS = {
  'GLOBAL_ACR': 'ACR (global)',
  'GLOBAL_ALLIANCE': 'ALLIANCE (global)',
  'GLOBAL_DCA': 'DCA (global)',
  'GLOBAL_EXADIS': 'EXADIS (global)',
}

const getFieldLabel = (key) => {
  return FIELD_LABELS[key] || key
}

function PlatformDetailModal({ platform, details, totalRfa, onClose }) {
  if (!platform || !details) return null

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount || 0)
  }

  const formatPercent = (rate) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rate || 0)
  }

  const sortedDetails = [...details].sort((a, b) => b.rfa_value - a.rfa_value)

  return (
    <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slide-in-up" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">{getFieldLabel(platform)}</h3>
              <p className="text-sm text-glass-secondary mt-1">
                Total RFA + Bonus: {formatAmount(totalRfa)} • {details.length} {details.length > 1 ? 'entités' : 'entité'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="glass-btn-icon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 glass-scrollbar">
          <table className="glass-table text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2">
                  {details[0]?.entity_type === 'client' ? 'Code Union' : 'Groupe Client'}
                </th>
                <th className="text-left px-3 py-2">Libellé</th>
                <th className="text-right px-3 py-2">CA (€)</th>
                <th className="text-right px-3 py-2">Taux reversé (%)</th>
                <th className="text-right px-3 py-2">RFA versée (€)</th>
                <th className="text-right px-3 py-2">Part de la plateforme</th>
              </tr>
            </thead>
            <tbody>
              {sortedDetails.map((detail, index) => {
                const percentOfTotal = totalRfa > 0 ? (detail.rfa_value / totalRfa) * 100 : 0
                return (
                  <tr key={`${detail.entity_id}-${index}`}>
                    <td className="font-medium px-3 py-2">
                      {detail.entity_id}
                    </td>
                    <td className="text-glass-secondary px-3 py-2">
                      {detail.entity_label}
                      {detail.entity_type === 'group' && (
                        <span className="ml-2 glass-badge-blue text-xs">Groupe</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2">
                      {formatAmount(detail.ca_value)}
                    </td>
                    <td className="text-right px-3 py-2" title="Taux reversé par Groupement Union selon le contrat de l'adhérent">
                      <span className="font-semibold text-blue-400">{formatPercent(detail.rfa_rate)}</span>
                    </td>
                    <td className="text-right font-semibold text-blue-400 px-3 py-2">
                      {formatAmount(detail.rfa_value)}
                    </td>
                    <td className="text-right font-medium text-purple-400 px-3 py-2" title={`${detail.rfa_value.toFixed(2)}€ sur ${totalRfa.toFixed(2)}€ de RFA ${getFieldLabel(platform)}`}>
                      {formatPercent(percentOfTotal / 100)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10">
                <td colSpan="4" className="text-right font-semibold px-3 py-2">
                  Total:
                </td>
                <td className="text-right font-bold text-blue-400 px-3 py-2">
                  {formatAmount(totalRfa)}
                </td>
                <td className="text-right font-bold text-purple-400 px-3 py-2">
                  100%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function RecapPage({ importId }) {
  const { supplierFilter, getKeysForCurrentSupplier } = useSupplierFilter()
  const supplierKeys = useMemo(() => getKeysForCurrentSupplier(), [getKeysForCurrentSupplier])

  const [recap, setRecap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPlatform, setSelectedPlatform] = useState(null)
  const [dissolvedGroups, setDissolvedGroups] = useState([])
  const [rfaRatesReceived, setRfaRatesReceived] = useState({
    'GLOBAL_ACR': '',
    'GLOBAL_ALLIANCE': '',
    'GLOBAL_DCA': '',
    'GLOBAL_EXADIS': ''
  })
  const [ratesAutoLoaded, setRatesAutoLoaded] = useState(false)

  // Calcule les taux effectifs depuis l'entité Union (même formule que le Récapitulatif par Fournisseur)
  const computeUnionRates = (unionEntity) => {
    const globalItems = unionEntity?.rfa?.global || {}
    const triItems    = unionEntity?.rfa?.tri   || {}
    const GLOBAL_KEY_MAP = {
      ACR: 'GLOBAL_ACR', DCA: 'GLOBAL_DCA',
      EXADIS: 'GLOBAL_EXADIS', ALLIANCE: 'GLOBAL_ALLIANCE',
    }
    const rates = {}
    SUPPLIER_KEYS.forEach((supplier) => {
      const globalKey  = `GLOBAL_${supplier}`
      const globalItem = globalItems[globalKey]
      const totalCa    = globalItem?.ca || 0
      if (totalCa === 0) return

      let totalRfa = globalItem
        ? (globalItem.total?.value ?? ((globalItem.rfa?.value || 0) + (globalItem.bonus?.value || 0)))
        : 0

      getKeysForSupplier(supplier)
        .filter(k => k.startsWith('TRI_'))
        .forEach((key) => {
          const triItem = triItems[key]
          if (!triItem) return
          totalRfa += triItem.value ?? triItem.rfa?.value ?? 0
        })

      if (totalRfa > 0) {
        const mappedKey = GLOBAL_KEY_MAP[supplier]
        if (mappedKey) rates[mappedKey] = parseFloat(((totalRfa / totalCa) * 100).toFixed(2))
      }
    })
    return rates
  }

  useEffect(() => {
    if (!importId) {
      setError('ID d\'import manquant')
      setLoading(false)
      return
    }

    // Charge les taux effectifs Union automatiquement
    setRatesAutoLoaded(false)
    getUnionEntity(importId)
      .then((unionEntity) => {
        const computed = computeUnionRates(unionEntity)
        if (Object.keys(computed).length > 0) {
          setRfaRatesReceived(prev => {
            const merged = { ...prev }
            Object.entries(computed).forEach(([k, v]) => {
              // N'écrase que si la valeur calculée est > 0 (garde les surcharges manuelles vides)
              merged[k] = String(v)
            })
            // Sauvegarder pour que EntityDetailDrawer puisse les lire aussi
            localStorage.setItem(`rfa_rates_received_${importId}`, JSON.stringify(merged))
            return merged
          })
        }
        setRatesAutoLoaded(true)
      })
      .catch(() => {
        // Fallback : valeurs localStorage
        const stored = localStorage.getItem(`rfa_rates_received_${importId}`)
        if (stored) {
          try { setRfaRatesReceived(JSON.parse(stored)) } catch {}
        }
        setRatesAutoLoaded(true)
      })

    loadRecap()
  }, [importId])

  useEffect(() => {
    if (!importId) return

    const handleStorageChange = () => {
      loadRecap()
    }

    window.addEventListener('storage', handleStorageChange)

    const interval = setInterval(() => {
      const key = `dissolved_groups_${importId}`
      const stored = localStorage.getItem(key)
      const newDissolved = stored ? JSON.parse(stored) : []
      if (JSON.stringify(newDissolved) !== JSON.stringify(dissolvedGroups)) {
        setDissolvedGroups(newDissolved)
        loadRecap()
      }
    }, 1000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [importId, dissolvedGroups])

  const loadRecap = async () => {
    if (!importId) return

    setLoading(true)
    setError(null)
    try {
      const key = `dissolved_groups_${importId}`
      const stored = localStorage.getItem(key)
      const groups = stored ? JSON.parse(stored) : []
      setDissolvedGroups(groups)

      const data = await getGlobalRecap(importId, groups)
      setRecap(data)
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.statusText || err.message || 'Erreur lors du chargement'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount || 0)
  }

  const handleRfaRateChange = (platformKey, value) => {
    const newRates = { ...rfaRatesReceived, [platformKey]: value }
    setRfaRatesReceived(newRates)
    if (importId) {
      const key = `rfa_rates_received_${importId}`
      localStorage.setItem(key, JSON.stringify(newRates))
    }
  }

  const calculateMargin = (ca, rfaPaid, rateReceived) => {
    if (!rateReceived || rateReceived === '') return null
    const rate = parseFloat(rateReceived) / 100
    if (isNaN(rate)) return null
    const rfaReceived = ca * rate
    const margin = rfaReceived - rfaPaid
    return { rfaReceived, margin }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-glass-secondary">Chargement du récapitulatif...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card p-6 border-red-500/30">
        <p className="font-semibold text-red-400">Erreur</p>
        <p className="text-red-300">{error}</p>
      </div>
    )
  }

  if (!recap) {
    return (
      <div className="text-center py-12">
        <p className="text-glass-secondary">Aucun récapitulatif disponible</p>
      </div>
    )
  }

  return (
    <div>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-glow-purple">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-white">Récapitulatif Global RFA</h2>
                  {supplierFilter && (
                    <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30">
                      Vue {supplierFilter} uniquement
                    </span>
                  )}
                </div>
                <p className="text-sm text-glass-secondary">RFA calculée sans double comptage{supplierFilter ? ` (données ${supplierFilter})` : ''}</p>
                {dissolvedGroups.length > 0 && (
                  <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {dissolvedGroups.length} groupe(s) dissous - clients traités individuellement
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-glass-secondary">Taux RFA perçu (%):</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ratesAutoLoaded ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/30'}`}>
                    {ratesAutoLoaded ? '✓ Calculés depuis Union' : 'Calcul…'}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-xs text-glass-muted whitespace-nowrap">{label.split(' ')[0]}:</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={rfaRatesReceived[key] || ''}
                        onChange={(e) => handleRfaRateChange(key, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="—"
                        className="glass-input w-20 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* RFA par plateforme globale */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">RFA par Plateforme Globale</h3>
            <div className="overflow-x-auto">
              <table className="glass-table text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2">Plateforme</th>
                    <th className="text-right px-3 py-2">CA Total (€)</th>
                    <th className="text-right px-3 py-2">RFA + Bonus (€)</th>
                    <th className="text-right px-3 py-2">Part du total</th>
                    {Object.values(rfaRatesReceived).some(rate => rate !== '') && (
                      <>
                        <th className="text-right px-3 py-2">RFA perçue Union (€)</th>
                        <th className="text-right px-3 py-2">% marge Union</th>
                        <th className="text-right px-3 py-2">Marge restante (€)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(recap.global_rfa_by_platform || {}).filter(([key]) => !supplierFilter || supplierKeys.includes(key))).map(([key, value]) => {
                    const label = getFieldLabel(key)
                    const percentOfTotal = recap.total_global > 0
                      ? (value / recap.total_global) * 100
                      : 0
                    const details = recap.platform_details?.[key] || []
                    const hasDetails = details.length > 0
                    const totalCa = details.reduce((sum, d) => sum + d.ca_value, 0)
                    const rateForPlatform = rfaRatesReceived[key] || ''
                    const marginData = rateForPlatform !== ''
                      ? calculateMargin(totalCa, value, rateForPlatform)
                      : null

                    return (
                      <tr
                        key={key}
                        className={hasDetails ? 'cursor-pointer' : ''}
                        onClick={() => hasDetails && setSelectedPlatform({ key, label, value, details })}
                      >
                        <td className="font-medium px-3 py-2">
                          <div className="flex items-center gap-2">
                            {label}
                            {hasDetails && (
                              <span className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                Voir détails
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-right font-semibold text-glass-secondary px-3 py-2">
                          {formatAmount(totalCa)}
                        </td>
                        <td className="text-right font-semibold px-3 py-2">
                          {formatAmount(value)}
                        </td>
                        <td className="text-right px-3 py-2">
                          <span className="text-purple-400 font-medium" title={`${value.toFixed(2)}€ sur ${recap.total_global.toFixed(2)}€ de RFA + Bonus totale`}>
                            {percentOfTotal.toFixed(2)}%
                          </span>
                        </td>
                        {Object.values(rfaRatesReceived).some(rate => rate !== '') && (
                          <>
                            <td className="text-right px-3 py-2">
                              {marginData ? (
                                <span className="text-blue-400 font-semibold" title={`Taux perçu: ${rateForPlatform}%`}>
                                  {formatAmount(marginData.rfaReceived)}
                                </span>
                              ) : (
                                <span className="text-glass-muted">-</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-2">
                              {marginData && marginData.rfaReceived > 0 ? (() => {
                                const marginRate = (marginData.margin / marginData.rfaReceived) * 100
                                return (
                                  <span className="text-indigo-400 font-semibold" title="(RFA perçue - RFA reversée) / RFA perçue">
                                    {marginRate.toFixed(1)}%
                                  </span>
                                )
                              })() : (
                                <span className="text-glass-muted">-</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-2">
                              {marginData ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-emerald-400 font-semibold" title={`RFA perçue: ${formatAmount(marginData.rfaReceived)}, RFA versée: ${formatAmount(value)}`}>
                                    {formatAmount(marginData.margin)}
                                  </span>
                                  <span className="text-xs text-glass-muted">
                                    Marge
                                  </span>
                                </div>
                              ) : (
                                <span className="text-glass-muted">-</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totaux : si filtre fournisseur = uniquement la plateforme sélectionnée */}
          <div className="border-t border-white/10 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Totaux{supplierFilter ? ` (${supplierFilter})` : ''}
            </h3>
            <div className="space-y-3">
              {(() => {
                const platformKeys = supplierFilter && supplierKeys.length
                  ? supplierKeys.filter(k => k.startsWith('GLOBAL_'))
                  : Object.keys(recap.platform_details || {})
                const totalCaAllPlatforms = (platformKeys || []).reduce((sum, key) => {
                  const details = (recap.platform_details || {})[key] || []
                  return sum + details.reduce((s, d) => s + d.ca_value, 0)
                }, 0)
                const totalRfaFiltered = (platformKeys || []).reduce((sum, key) => {
                  return sum + ((recap.global_rfa_by_platform || {})[key] || 0)
                }, 0)
                return (
                  <>
                    <div className="glass-stat-card">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-glass-secondary">CA Total{supplierFilter ? ` ${supplierFilter}` : ' Plateformes'}</span>
                        <span className="text-xl font-semibold text-white">
                          {formatAmount(totalCaAllPlatforms)}
                        </span>
                      </div>
                    </div>
                    <div className="glass-stat-card purple">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-glass-secondary">RFA{supplierFilter ? ` ${supplierFilter}` : ' Plateformes'} (RFA + Bonus)</span>
                        <span className="text-xl font-semibold text-purple-400">
                          {formatAmount(supplierFilter ? totalRfaFiltered : recap.total_global)}
                        </span>
                      </div>
                    </div>
                  </>
                )
              })()}
              {!supplierFilter && (
                <>
                  <div className="glass-stat-card orange">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-glass-secondary">Total Tri-partites</span>
                      <span className="text-xl font-semibold text-orange-400">
                        {formatAmount(recap.total_tri)}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-500/30 to-purple-500/30 border border-blue-400/30 shadow-glow-blue">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white">Total Final RFA</span>
                      <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">
                        {formatAmount(recap.grand_total)}
                      </span>
                    </div>
                  </div>
                </>
              )}
              {supplierFilter && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs text-glass-secondary">Vue limitée à la plateforme {supplierFilter}. Tri-partites et total global visibles sans filtre.</div>
                </div>
              )}
              {Object.values(rfaRatesReceived).some(rate => rate !== '') && (() => {
                let totalMargin = 0
                let totalRfaReceived = 0
                const platformKeysForMargin = supplierFilter && supplierKeys.length
                  ? supplierKeys.filter(k => k.startsWith('GLOBAL_'))
                  : Object.keys(recap.platform_details || {})

                platformKeysForMargin.forEach((key) => {
                  const details = (recap.platform_details || {})[key] || []
                  const totalCa = details.reduce((sum, d) => sum + d.ca_value, 0)
                  const rfaPaid = (recap.global_rfa_by_platform || {})[key] || 0
                  const rateForPlatform = rfaRatesReceived[key] || ''

                  if (rateForPlatform !== '') {
                    const marginData = calculateMargin(totalCa, rfaPaid, rateForPlatform)
                    if (marginData) {
                      totalMargin += marginData.margin
                      totalRfaReceived += marginData.rfaReceived
                    }
                  }
                })

                return totalMargin !== 0 && (
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-500/30 to-teal-500/30 border border-emerald-400/30 shadow-glow-emerald">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white">Marge restante Groupement Union</span>
                      <div className="flex flex-col items-end">
                        <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">
                          {formatAmount(totalMargin)}
                        </span>
                        <span className="text-xs text-glass-secondary mt-1">
                          RFA perçue: {formatAmount(totalRfaReceived)} - RFA versée: {formatAmount(supplierFilter && supplierKeys.length ? supplierKeys.filter(k => k.startsWith('GLOBAL_')).reduce((s, k) => s + ((recap.global_rfa_by_platform || {})[k] || 0), 0) : recap.total_global)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Modal détails plateforme */}
      {selectedPlatform && (
        <PlatformDetailModal
          platform={selectedPlatform.key}
          details={selectedPlatform.details}
          totalRfa={selectedPlatform.value}
          onClose={() => setSelectedPlatform(null)}
        />
      )}
    </div>
  )
}

export default RecapPage
