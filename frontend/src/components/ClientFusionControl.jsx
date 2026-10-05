import { useEffect, useState } from 'react'
import {
  getContracts,
  getRfaFusions,
  nathalieGetClients,
  createRfaFusion,
  updateRfaFusion,
  deleteRfaFusion,
} from '../api/client'

function norm(code) {
  return (code || '').trim().toUpperCase()
}

export default function ClientFusionControl({ codeUnion, nomMagasin, onChanged }) {
  const current = norm(codeUnion)
  const [open, setOpen] = useState(false)
  const [fusion, setFusion] = useState(null)
  const [contracts, setContracts] = useState([])
  const [directory, setDirectory] = useState([])
  const [selected, setSelected] = useState([])
  const [label, setLabel] = useState('')
  const [contractId, setContractId] = useState('')
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      const rows = await getRfaFusions()
      const mine = (rows || []).find((row) => (row.codes || []).map(norm).includes(current)) || null
      setFusion(mine)
      return mine
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de lire les fusions')
      return null
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    if (!current) return
    setReady(false)
    load()
    nathalieGetClients().then((data) => setDirectory(data?.clients || [])).catch(() => {})
    getContracts().then((rows) => setContracts((rows || []).filter((c) => c.is_active))).catch(() => {})
  }, [current])

  const byCode = {}
  for (const client of directory) {
    const code = norm(client.code_union)
    if (code) byCode[code] = client.nom_client || ''
  }

  const start = async () => {
    const mine = fusion || await load()
    const codes = mine?.codes?.length ? mine.codes.map(norm) : [current]
    if (!codes.includes(current)) codes.unshift(current)
    setSelected(codes.map((code) => ({
      code,
      name: code === current ? (nomMagasin || byCode[code] || '') : (byCode[code] || ''),
      locked: code === current,
    })))
    setLabel(mine?.label || nomMagasin || '')
    setContractId(mine?.contract_id ? String(mine.contract_id) : '')
    setQuery('')
    setError(null)
    setOpen(true)
  }

  const addAccount = (account) => {
    const code = norm(account.code)
    if (!code || selected.some((a) => a.code === code)) return
    setSelected([...selected, { code, name: account.name || byCode[code] || '', locked: false }])
    setQuery('')
    setListOpen(false)
  }

  const needle = query.trim().toLowerCase()
  const suggestions = needle.length < 1 ? [] : directory.filter((client) => {
    const code = norm(client.code_union)
    if (!code || selected.some((a) => a.code === code)) return false
    const nom = (client.nom_client || '').toLowerCase()
    const ville = (client.ville || '').toLowerCase()
    return code.toLowerCase().includes(needle) || nom.includes(needle) || ville.includes(needle)
  }).slice(0, 8)
  const typedCode = query.trim().toUpperCase()
  const canAddTyped = typedCode.length >= 2
    && !selected.some((a) => a.code === typedCode)
    && !suggestions.some((c) => norm(c.code_union) === typedCode)

  const save = async (e) => {
    e.preventDefault()
    if (selected.length < 2) {
      setError('Ajoutez au moins un autre magasin.')
      return
    }
    if (!contractId) {
      setError('Choisissez le contrat.')
      return
    }
    const payload = {
      label: label.trim() || nomMagasin || current,
      contract_id: parseInt(contractId, 10),
      codes: selected.map((a) => a.code),
    }
    setBusy(true)
    try {
      if (fusion?.id) await updateRfaFusion(fusion.id, payload)
      else await createRfaFusion(payload)
      setOpen(false)
      setError(null)
      await load()
      if (onChanged) onChanged()
    } catch (err) {
      setError(err.response?.data?.detail || 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!fusion?.id) return
    if (!window.confirm('Séparer ces comptes ? Chacun reprend son propre calcul de RFA.')) return
    try {
      await deleteRfaFusion(fusion.id)
      setOpen(false)
      setError(null)
      await load()
      if (onChanged) onChanged()
    } catch (err) {
      setError(err.response?.data?.detail || 'Suppression impossible')
    }
  }

  if (!current) return null

  return (
    <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-sky-950">Fusion de comptes</p>
          {fusion?.codes?.length > 1 ? (
            <p className="text-xs text-sky-900 mt-0.5">
              {(fusion.codes || []).map((code) => {
                const name = norm(code) === current ? nomMagasin : byCode[norm(code)]
                return name ? `${code} ${name}` : code
              }).join(' + ')}
              {fusion.contract_name ? ` · ${fusion.contract_name}` : ''}
            </p>
          ) : (
            <p className="text-xs text-sky-900 mt-0.5">
              Changement de Kbis : additionnez le chiffre d’affaires d’un autre compte et appliquez un seul contrat.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : start())}
          disabled={!ready}
          className="px-3 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 disabled:opacity-50"
        >
          {fusion ? 'Modifier la fusion' : 'Fusionner avec un autre compte'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {open && (
        <form onSubmit={save} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {selected.map((account) => (
              <span key={account.code} className="inline-flex items-center gap-2 rounded-full bg-white border border-sky-200 px-3 py-1 text-sm text-slate-800">
                <strong>{account.code}</strong>
                {account.name && <span className="text-slate-500">{account.name}</span>}
                {!account.locked && (
                  <button type="button" onClick={() => setSelected(selected.filter((a) => a.code !== account.code))} className="text-slate-400 hover:text-slate-700" aria-label={`Retirer ${account.code}`}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setListOpen(true) }}
              onFocus={() => setListOpen(true)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (suggestions[0]) addAccount({ code: suggestions[0].code_union, name: suggestions[0].nom_client || '' })
                else if (canAddTyped) addAccount({ code: typedCode, name: byCode[typedCode] || '' })
              }}
              placeholder="Rechercher l’autre magasin, sa ville ou son code"
              className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
            />
            {listOpen && (suggestions.length > 0 || canAddTyped) && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {suggestions.map((client) => {
                  const code = norm(client.code_union)
                  return (
                    <button
                      key={code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addAccount({ code, name: client.nom_client || '' })}
                      className="w-full text-left px-3 py-2 hover:bg-sky-50 text-sm"
                    >
                      <strong className="mr-2">{code}</strong>
                      <span className="text-slate-600">{client.nom_client || 'Sans nom'}{client.ville ? ` · ${client.ville}` : ''}</span>
                    </button>
                  )
                })}
                {canAddTyped && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addAccount({ code: typedCode, name: '' })} className="w-full text-left px-3 py-2 hover:bg-sky-50 text-sm text-sky-800">
                    Ajouter le code {typedCode}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nom de la fusion"
              className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
            />
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              required
              className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Contrat appliqué à la somme</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy || selected.length < 2} className="px-3 py-2 rounded-xl bg-sky-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {fusion && (
              <button type="button" onClick={remove} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50">
                Séparer les comptes
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
