import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'

function ContractAssignmentModal({ entity, mode, contracts, currentContract, existingAssignment, onClose, onSave }) {
  const [selectedContractId, setSelectedContractId] = useState(
    currentContract?.id?.toString() || ''
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    const contractId = selectedContractId ? parseInt(selectedContractId) : null

    const defaultContract = contracts.find(c => c.is_default)
    if (contractId === defaultContract?.id) {
      onSave(null)
    } else {
      onSave(contractId)
    }
  }

  const handleDelete = () => {
    if (window.confirm('Supprimer l\'affectation ? Le contrat par défaut sera utilisé.')) {
      onSave(null)
    }
  }

  const targetLabel = mode === 'client'
    ? `Code Union: ${entity.id}${entity.label && entity.label !== entity.id ? ` (${entity.label})` : ''}`
    : `Groupe Client: ${entity.label || entity.id}`

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 glass-modal-overlay z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="glass-modal max-w-md w-full p-6 animate-slide-in-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">
              {existingAssignment ? 'Modifier l\'affectation' : 'Assigner un contrat'}
            </h2>
            <button
              onClick={onClose}
              className="glass-btn-icon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="glass-card-dark p-4 mb-6">
            <p className="text-sm text-white">{targetLabel}</p>
            {mode === 'client' && entity.groupe_client && (
              <p className="text-xs text-glass-muted mt-1">Groupe: {entity.groupe_client}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-glass-secondary mb-2">
                Contrat à assigner
              </label>
              <select
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="glass-select w-full"
              >
                <option value="">Contrat par défaut (supprimer l'affectation)</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.name} {contract.is_default && '(Défaut)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-glass-muted mt-2">
                Priorité: {mode === 'client' ? 'Code Union (100)' : 'Groupe Client (50)'}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              {existingAssignment && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="glass-btn-danger text-sm flex items-center gap-2 mr-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="glass-btn-secondary"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="glass-btn-primary"
              >
                {existingAssignment ? 'Modifier' : 'Assigner'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default ContractAssignmentModal
