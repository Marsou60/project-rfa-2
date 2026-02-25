import { useState, useEffect } from 'react'
import { X, Pencil, Plus, Trash2 } from 'lucide-react'
import { getContractRules, updateContractRule, getAvailableTriFields, createContractRule, updateContract } from '../api/client'

function ContractEditor({ contract, onClose, onSave }) {
  const [rules, setRules] = useState([])
  const [availableTriFields, setAvailableTriFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('global')
  const [editingRule, setEditingRule] = useState(null)
  const [scope, setScope] = useState(contract?.scope || 'ADHERENT')
  const [savingScope, setSavingScope] = useState(false)

  useEffect(() => {
    loadRules()
  }, [contract.id])

  useEffect(() => {
    setScope(contract?.scope || 'ADHERENT')
  }, [contract?.id, contract?.scope])

  useEffect(() => {
    getAvailableTriFields().then(setAvailableTriFields).catch(() => setAvailableTriFields([]))
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await getContractRules(contract.id)
      setRules(data)
    } catch (err) {
      console.error('Erreur chargement règles:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRule = async (ruleId, updatedRule) => {
    try {
      await updateContractRule(contract.id, ruleId, updatedRule)
      await loadRules()
      setEditingRule(null)
    } catch (err) {
      console.error('Erreur sauvegarde règle:', err)
      throw err
    }
  }

  const handleCreateTriRule = async (field) => {
    try {
      await createContractRule(contract.id, {
        key: field.key,
        scope: 'TRI',
        label: field.label,
        tiers: [{ min: 0, rate: 0.02 }]
      })
      await loadRules()
    } catch (err) {
      console.error('Erreur création règle:', err)
      throw err
    }
  }

  const globalRules = rules.filter(r => r.scope === 'GLOBAL')
  const triRules = rules.filter(r => r.scope === 'TRI')

  if (loading) {
    return (
      <div className="fixed inset-0 glass-modal-overlay z-50 flex items-center justify-center">
        <div className="glass-card p-6 text-white">Chargement...</div>
      </div>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 glass-modal-overlay z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="glass-modal max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slide-in-up">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-white">
                Édition : {contract.name}
              </h2>
              <label className="flex items-center gap-2 text-sm text-glass-secondary">
                Type :
                <select
                  value={scope}
                  disabled={savingScope}
                  onChange={async (e) => {
                    const newScope = e.target.value
                    setSavingScope(true)
                    try {
                      await updateContract(contract.id, { ...contract, scope: newScope })
                      setScope(newScope)
                      if (onSave) onSave()
                    } catch (err) {
                      console.error('Erreur mise à jour type contrat:', err)
                    } finally {
                      setSavingScope(false)
                    }
                  }}
                  className="glass-input py-1 px-2 text-white border border-white/20 rounded"
                >
                  <option value="ADHERENT">Adhérent</option>
                  <option value="UNION">Union (DAF)</option>
                </select>
                {savingScope && <span className="text-xs">Enregistrement…</span>}
              </label>
            </div>
            <button
              onClick={onClose}
              className="glass-btn-icon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('global')}
              className={`px-6 py-3 font-medium transition-all ${
                activeTab === 'global'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                  : 'text-glass-secondary hover:text-white'
              }`}
            >
              Plateformes Globales
            </button>
            <button
              onClick={() => setActiveTab('tri')}
              className={`px-6 py-3 font-medium transition-all ${
                activeTab === 'tri'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                  : 'text-glass-secondary hover:text-white'
              }`}
            >
              Tri-partites
            </button>
            <button
              onClick={() => setActiveTab('marketing')}
              className={`px-6 py-3 font-medium transition-all ${
                activeTab === 'marketing'
                  ? 'text-pink-400 border-b-2 border-pink-400 bg-pink-500/10'
                  : 'text-glass-secondary hover:text-white'
              }`}
            >
              Marketing & Événement
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
            {activeTab === 'global' ? (
              <GlobalRulesEditor
                rules={globalRules}
                editingRule={editingRule}
                onEdit={setEditingRule}
                onSave={handleSaveRule}
              />
            ) : activeTab === 'tri' ? (
              <TriRulesEditor
                rules={triRules}
                availableTriFields={availableTriFields}
                editingRule={editingRule}
                onEdit={setEditingRule}
                onSave={handleSaveRule}
                onCreateRule={handleCreateTriRule}
              />
            ) : (
              <MarketingRulesEditor
                contract={contract}
                onUpdate={(updatedContract) => {
                   if (onSave) onSave()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function MarketingRulesEditor({ contract, onUpdate }) {
  const [marketingRules, setMarketingRules] = useState({})
  const [saving, setSaving] = useState(false)
  const platforms = ['GLOBAL_ACR', 'GLOBAL_DCA', 'GLOBAL_EXADIS', 'GLOBAL_ALLIANCE']
  const platformLabels = {
    'GLOBAL_ACR': 'ACR',
    'GLOBAL_DCA': 'DCA',
    'GLOBAL_EXADIS': 'EXADIS',
    'GLOBAL_ALLIANCE': 'Alliance'
  }

  useEffect(() => {
    try {
      if (contract.marketing_rules) {
        setMarketingRules(JSON.parse(contract.marketing_rules))
      } else {
        setMarketingRules({})
      }
    } catch (e) {
      setMarketingRules({})
    }
  }, [contract.marketing_rules])

  const handleChange = (key, field, value) => {
    setMarketingRules(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Nettoyer les règles vides
      const cleanRules = {}
      Object.entries(marketingRules).forEach(([key, rule]) => {
        if (rule.type && (rule.amount > 0 || rule.rate > 0)) {
          cleanRules[key] = {
            type: rule.type,
            amount: rule.type === 'fixed' ? parseFloat(rule.amount) : 0,
            rate: rule.type === 'rate' ? parseFloat(rule.rate) : 0
          }
        }
      })

      const updated = {
        ...contract,
        marketing_rules: JSON.stringify(cleanRules)
      }
      
      await updateContract(contract.id, updated)
      onUpdate(updated)
      alert('Règles marketing enregistrées !')
    } catch (err) {
      console.error(err)
      alert('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 bg-pink-500/5 border border-pink-500/20">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🎉</span> Rémunération Marketing & Événement
        </h3>
        <p className="text-sm text-glass-secondary mb-6">
          Définissez ici les montants fixes ou les pourcentages reversés par les fournisseurs pour le marketing (hors RFA).
        </p>

        <div className="space-y-4">
          {platforms.map(key => {
            const rule = marketingRules[key] || { type: 'none', amount: 0, rate: 0 }
            
            return (
              <div key={key} className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="w-32 font-medium text-white">{platformLabels[key]}</div>
                
                <select
                  value={rule.type || 'none'}
                  onChange={(e) => handleChange(key, 'type', e.target.value)}
                  className="glass-input w-40"
                >
                  <option value="none">Aucun</option>
                  <option value="fixed">Montant Fixe</option>
                  <option value="rate">Pourcentage</option>
                </select>

                {rule.type === 'fixed' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={rule.amount || 0}
                      onChange={(e) => handleChange(key, 'amount', e.target.value)}
                      className="glass-input w-32 text-right"
                      placeholder="Montant"
                    />
                    <span className="text-white">€</span>
                  </div>
                )}

                {rule.type === 'rate' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      value={rule.rate || 0}
                      onChange={(e) => handleChange(key, 'rate', e.target.value)}
                      className="glass-input w-32 text-right"
                      placeholder="Taux"
                    />
                    <span className="text-white">% (ex: 0.007 pour 0.7%)</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="glass-btn-primary flex items-center gap-2"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les règles marketing'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GlobalRulesEditor({ rules, editingRule, onEdit, onSave }) {
  return (
    <div className="space-y-6">
      {rules.map((rule) => (
        <div key={rule.id} className="glass-card p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">{rule.label}</h3>
            {editingRule?.id !== rule.id && (
              <button
                onClick={() => onEdit(rule)}
                className="glass-btn-primary text-sm flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Éditer
              </button>
            )}
          </div>

          {editingRule?.id === rule.id ? (
            <TierEditor
              rule={rule}
              onSave={(updated) => onSave(rule.id, updated)}
              onCancel={() => onEdit(null)}
              hasRfa={true}
              hasBonus={true}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-glass-secondary mb-2">Paliers RFA</h4>
                <TierDisplay tiers={rule.tiers_rfa ? JSON.parse(rule.tiers_rfa) : []} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-glass-secondary mb-2">Paliers Bonus</h4>
                <TierDisplay tiers={rule.tiers_bonus ? JSON.parse(rule.tiers_bonus) : []} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TriRulesEditor({ rules, availableTriFields, editingRule, onEdit, onSave, onCreateRule }) {
  const rulesByKey = Object.fromEntries((rules || []).map(r => [r.key, r]))
  const fields = (availableTriFields && availableTriFields.length) > 0
    ? availableTriFields
    : (rules || []).map(r => ({ key: r.key, label: r.label }))

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const rule = rulesByKey[field.key]
        if (rule) {
          return (
            <div key={rule.id} className="glass-card p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">{rule.label}</h3>
                {editingRule?.id !== rule.id && (
                  <button
                    onClick={() => onEdit(rule)}
                    className="glass-btn-primary text-sm flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Éditer
                  </button>
                )}
              </div>

              {editingRule?.id === rule.id ? (
                <TierEditor
                  rule={rule}
                  onSave={(updated) => onSave(rule.id, updated)}
                  onCancel={() => onEdit(null)}
                  hasRfa={false}
                  hasBonus={false}
                />
              ) : (
                <TierDisplay tiers={rule.tiers ? JSON.parse(rule.tiers) : []} />
              )}
            </div>
          )
        }
        return (
          <div key={field.key} className="glass-card p-5 border border-dashed border-white/30 bg-white/5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white/80">{field.label}</h3>
              <button
                type="button"
                onClick={() => onCreateRule(field)}
                className="glass-btn-primary text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter cette règle
              </button>
            </div>
            <p className="text-sm text-glass-secondary mt-2">Règle non configurée (2 % inconditionnel par défaut si vous ajoutez)</p>
          </div>
        )
      })}
    </div>
  )
}

function TierEditor({ rule, onSave, onCancel, hasRfa, hasBonus }) {
  const [tiersRfa, setTiersRfa] = useState(
    rule.tiers_rfa ? JSON.parse(rule.tiers_rfa) : []
  )
  const [tiersBonus, setTiersBonus] = useState(
    rule.tiers_bonus ? JSON.parse(rule.tiers_bonus) : []
  )
  const [tiers, setTiers] = useState(
    rule.tiers ? JSON.parse(rule.tiers) : []
  )

  const handleSave = () => {
    const updated = {
      ...rule,
      tiers_rfa: hasRfa ? JSON.stringify(tiersRfa) : rule.tiers_rfa,
      tiers_bonus: hasBonus ? JSON.stringify(tiersBonus) : rule.tiers_bonus,
      tiers: !hasRfa && !hasBonus ? JSON.stringify(tiers) : rule.tiers
    }
    onSave(updated)
  }

  const addTier = (type) => {
    const newTier = { min: 0, rate: 0 }
    if (type === 'rfa') {
      setTiersRfa([...tiersRfa, newTier].sort((a, b) => a.min - b.min))
    } else if (type === 'bonus') {
      setTiersBonus([...tiersBonus, newTier].sort((a, b) => a.min - b.min))
    } else {
      setTiers([...tiers, newTier].sort((a, b) => a.min - b.min))
    }
  }

  const removeTier = (index, type) => {
    if (type === 'rfa') {
      setTiersRfa(tiersRfa.filter((_, i) => i !== index))
    } else if (type === 'bonus') {
      setTiersBonus(tiersBonus.filter((_, i) => i !== index))
    } else {
      setTiers(tiers.filter((_, i) => i !== index))
    }
  }

  const updateTier = (index, field, value, type) => {
    const numValue = parseFloat(value) || 0
    if (type === 'rfa') {
      const updated = [...tiersRfa]
      updated[index] = { ...updated[index], [field]: numValue }
      setTiersRfa(updated.sort((a, b) => a.min - b.min))
    } else if (type === 'bonus') {
      const updated = [...tiersBonus]
      updated[index] = { ...updated[index], [field]: numValue }
      setTiersBonus(updated.sort((a, b) => a.min - b.min))
    } else {
      const updated = [...tiers]
      updated[index] = { ...updated[index], [field]: numValue }
      setTiers(updated.sort((a, b) => a.min - b.min))
    }
  }

  const renderTierTable = (tiersList, type) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-glass-secondary">
          {type === 'rfa' ? 'Paliers RFA' : type === 'bonus' ? 'Paliers Bonus' : 'Paliers'}
        </h4>
        <button
          onClick={() => addTier(type)}
          className="glass-btn-success text-xs flex items-center gap-1 py-1.5 px-3"
        >
          <Plus className="w-3 h-3" />
          Ajouter
        </button>
      </div>
      <table className="glass-table">
        <thead>
          <tr>
            <th className="text-left">Seuil min (€)</th>
            <th className="text-left">Taux (%)</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tiersList.map((tier, index) => (
            <tr key={index}>
              <td>
                <input
                  type="number"
                  value={tier.min}
                  onChange={(e) => updateTier(index, 'min', e.target.value, type)}
                  className="glass-input py-1.5 text-sm"
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.001"
                  value={tier.rate}
                  onChange={(e) => updateTier(index, 'rate', e.target.value, type)}
                  className="glass-input py-1.5 text-sm"
                />
              </td>
              <td className="text-right">
                <button
                  onClick={() => removeTier(index, type)}
                  className="glass-btn-icon text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      {hasRfa && renderTierTable(tiersRfa, 'rfa')}
      {hasBonus && renderTierTable(tiersBonus, 'bonus')}
      {!hasRfa && !hasBonus && renderTierTable(tiers, 'tri')}

      <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
        <button
          onClick={onCancel}
          className="glass-btn-secondary"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          className="glass-btn-primary"
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}

function TierDisplay({ tiers }) {
  if (!tiers || tiers.length === 0) {
    return <div className="text-sm text-glass-muted">Aucun palier défini</div>
  }

  return (
    <div className="space-y-1">
      {tiers.map((tier, index) => (
        <div key={index} className="text-sm text-glass-primary">
          ≥ {tier.min.toLocaleString('fr-FR')} € → {((tier.rate || 0) * 100).toFixed(2)}%
        </div>
      ))}
    </div>
  )
}

export default ContractEditor
