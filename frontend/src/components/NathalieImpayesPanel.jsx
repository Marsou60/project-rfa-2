import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Scale } from 'lucide-react'
import { getImpayesByAdherent } from '../api/client'
import { CreateModal, fmtEur, ImpayeDrawer, StatutBadge } from '../pages/ImpayesPage'

export default function NathalieImpayesPanel({ codeUnion, nomMagasin = '', commercial = '' }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (!codeUnion) {
      setData(null)
      setLoading(false)
      return
    }
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    try {
      setData(await getImpayesByAdherent(codeUnion))
      loadedOnce.current = true
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impayés indisponibles.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [codeUnion])

  useEffect(() => {
    loadedOnce.current = false
  }, [codeUnion])

  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const actifs = items.filter((row) => row.actif)
  const amount = data?.summary?.actifs_montant || 0

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Scale className="w-4 h-4 text-rose-300" /> Impayés
        </h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-100 hover:bg-rose-500/30"
        >
          <Plus className="w-3.5 h-3.5" /> Déclarer un incident
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-blue-300/60 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement des dossiers…
        </div>
      )}
      {error && <div className="text-sm text-rose-300">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-emerald-300/80">Aucun impayé recensé pour cet adhérent.</p>
      )}

      {!loading && actifs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {actifs.length} dossier{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} · {fmtEur(amount)}
          </span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row.id)}
              className="w-full text-left rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {row.plateforme} · {fmtEur(row.montant)}
                </div>
                <div className="text-xs text-white/45 truncate">
                  {row.date_facture_label || row.motif || row.commentaires || 'Ouvrir pour modifier'}
                </div>
              </div>
              <StatutBadge statut={row.statut} compact />
            </button>
          ))}
          <p className="text-[11px] text-white/35">Cliquez un dossier pour changer le statut ou ajouter une note.</p>
        </div>
      )}

      {selected && (
        <ImpayeDrawer
          id={selected}
          canWrite
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
      {creating && (
        <CreateModal
          prefill={{
            code_union: codeUnion || '',
            nom_magasin: nomMagasin || '',
            commercial: commercial || '',
          }}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await load()
          }}
        />
      )}
    </div>
  )
}
