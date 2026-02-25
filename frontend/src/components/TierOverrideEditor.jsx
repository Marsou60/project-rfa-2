import { useState, useEffect } from 'react'
import { getEntityOverrides, createOverride, updateOverride, deleteOverride } from '../api/client'

/**
 * Editeur de taux personnalises (overrides) pour un client ou groupe.
 * Permet de modifier les paliers RFA/Bonus pour un champ specifique.
 */
function TierOverrideEditor({
  targetType, // 'CODE_UNION' ou 'GROUPE_CLIENT'
  targetValue, // code_union ou groupe_client
  fieldKey,
  fieldLabel,
  tierType, // 'rfa', 'bonus', ou 'tri'
  currentTiers, // Paliers actuels du contrat
  currentRate, // Taux actuel calcule
  currentValue, // Valeur RFA actuelle
  ca, // CA pour recalcul
  onSave,
  onClose
}) {
  const [tiers, setTiers] = useState([])
  const [existingOverride, setExistingOverride] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    loadExistingOverride()
  }, [targetType, targetValue, fieldKey, tierType])

  const loadExistingOverride = async () => {
    try {
      setLoading(true)
      const overrides = await getEntityOverrides(targetType, targetValue)
      const existing = overrides.find(
        o => o.field_key === fieldKey && o.tier_type === tierType
      )
      
      if (existing) {
        setExistingOverride(existing)
        setTiers(JSON.parse(existing.custom_tiers))
      } else {
        // Copier les tiers du contrat comme point de depart
        setTiers(currentTiers ? [...currentTiers] : [])
      }
    } catch (err) {
      console.error('Erreur chargement override:', err)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const addTier = () => {
    const newTier = { min: 0, rate: 0 }
    const newTiers = [...tiers, newTier].sort((a, b) => a.min - b.min)
    setTiers(newTiers)
  }

  const removeTier = (index) => {
    setTiers(tiers.filter((_, i) => i !== index))
  }

  const updateTier = (index, field, value) => {
    const newTiers = [...tiers]
    newTiers[index] = {
      ...newTiers[index],
      [field]: parseFloat(value) || 0
    }
    // Re-trier par min
    newTiers.sort((a, b) => a.min - b.min)
    setTiers(newTiers)
  }

  // Calculer la valeur simulee avec les nouveaux tiers
  const calculateSimulatedValue = () => {
    if (!ca || ca <= 0 || tiers.length === 0) return 0
    
    // Trouver le palier applicable
    let selectedTier = null
    for (const tier of [...tiers].sort((a, b) => b.min - a.min)) {
      if (ca >= tier.min) {
        selectedTier = tier
        break
      }
    }
    
    if (!selectedTier) return 0
    return ca * selectedTier.rate
  }

  const simulatedValue = calculateSimulatedValue()
  const difference = simulatedValue - currentValue

  const handleSave = async () => {
    if (tiers.length === 0) {
      setError('Ajoutez au moins un palier')
      return
    }

    // Verifier que les paliers sont valides
    for (const tier of tiers) {
      if (tier.min < 0 || tier.rate < 0) {
        setError('Les valeurs doivent etre positives')
        return
      }
    }

    setShowConfirmation(true)
  }

  const confirmSave = async () => {
    try {
      setSaving(true)
      setError(null)

      const overrideData = {
        target_type: targetType,
        target_value: targetValue,
        field_key: fieldKey,
        tier_type: tierType,
        custom_tiers: JSON.stringify(tiers),
        is_active: true
      }

      if (existingOverride) {
        await updateOverride(existingOverride.id, overrideData)
      } else {
        await createOverride(overrideData)
      }

      if (onSave) onSave()
      onClose()
    } catch (err) {
      console.error('Erreur sauvegarde override:', err)
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
      setShowConfirmation(false)
    }
  }

  const handleDelete = async () => {
    if (!existingOverride) return

    if (!window.confirm('Supprimer cet override et revenir aux taux du contrat ?')) {
      return
    }

    try {
      setSaving(true)
      await deleteOverride(existingOverride.id)
      if (onSave) onSave()
      onClose()
    } catch (err) {
      console.error('Erreur suppression override:', err)
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    } finally {
      setSaving(false)
    }
  }

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
      maximumFractionDigits: 3,
    }).format(rate || 0)
  }

  const tierTypeLabel = {
    rfa: 'RFA',
    bonus: 'Bonus',
    tri: 'Tri-partite'
  }[tierType] || tierType

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg">Chargement...</div>
      </div>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Personnaliser les taux - {tierTypeLabel}
                </h2>
                <p className="text-purple-100 text-sm mt-1">
                  {fieldLabel} • {targetType === 'CODE_UNION' ? 'Client' : 'Groupe'}: {targetValue}
                </p>
              </div>
              {existingOverride && (
                <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold">
                  Override actif
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* Info actuelle */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Valeurs actuelles (contrat)</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">CA:</span>
                  <span className="ml-2 font-semibold">{formatAmount(ca)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Taux:</span>
                  <span className="ml-2 font-semibold">{formatPercent(currentRate)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{tierTypeLabel}:</span>
                  <span className="ml-2 font-semibold">{formatAmount(currentValue)}</span>
                </div>
              </div>
            </div>

            {/* Editeur de paliers */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Paliers personnalises</h3>
                <button
                  onClick={addTier}
                  className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 transition-colors"
                >
                  + Ajouter palier
                </button>
              </div>

              {tiers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                  Aucun palier. Cliquez sur "Ajouter palier" pour commencer.
                </div>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Seuil min (€)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Taux (%)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tiers.map((tier, index) => (
                      <tr key={index} className={ca >= tier.min ? 'bg-green-50' : ''}>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={tier.min}
                            onChange={(e) => updateTier(index, 'min', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            min="0"
                            step="1000"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={tier.rate * 100}
                            onChange={(e) => updateTier(index, 'rate', parseFloat(e.target.value) / 100)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            min="0"
                            step="0.1"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => removeTier(index)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Simulation */}
            {tiers.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-medium text-blue-800 mb-2">Simulation avec nouveaux taux</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600">Nouvelle valeur:</span>
                    <span className="ml-2 font-bold text-blue-800">{formatAmount(simulatedValue)}</span>
                  </div>
                  <div>
                    <span className="text-blue-600">Difference:</span>
                    <span className={`ml-2 font-bold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {difference >= 0 ? '+' : ''}{formatAmount(difference)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between">
            <div>
              {existingOverride && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Supprimer l'override
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || tiers.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmation */}
      {showConfirmation && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-70 z-[60]" />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Confirmer la modification
              </h3>
              
              <div className="mb-6 space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{targetType === 'CODE_UNION' ? 'Client' : 'Groupe'}: <span className="font-semibold">{targetValue}</span></p>
                  <p className="text-sm text-gray-600">Champ: <span className="font-semibold">{fieldLabel}</span></p>
                  <p className="text-sm text-gray-600">Type: <span className="font-semibold">{tierTypeLabel}</span></p>
                </div>
                
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Avant:</span> {formatAmount(currentValue)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Apres:</span> {formatAmount(simulatedValue)}
                    <span className={`ml-2 ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({difference >= 0 ? '+' : ''}{formatAmount(difference)})
                    </span>
                  </p>
                </div>
                
                <p className="text-sm text-gray-600">
                  {targetType === 'CODE_UNION' ? 'Ce client' : 'Ce groupe'} aura desormais ces taux personnalises au lieu des taux du contrat.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmSave}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {saving ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default TierOverrideEditor
