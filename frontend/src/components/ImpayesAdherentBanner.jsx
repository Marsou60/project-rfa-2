import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Scale } from 'lucide-react'
import { getImpayesByAdherent } from '../api/client'
import { fmtEur, StatutBadge } from '../pages/ImpayesPage'

/**
 * Bandeau fiche adhérent : signale la présence d'impayés (actifs en priorité).
 */
export default function ImpayesAdherentBanner({ codeUnion, nomMagasin = '', onOpenModule, canWrite = false }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)

  const declareIncident = (e) => {
    e?.stopPropagation?.()
    try {
      sessionStorage.setItem('impayes_prefill', JSON.stringify({
        code_union: codeUnion || '',
        nom_magasin: nomMagasin || '',
      }))
    } catch {
      /* ignore */
    }
    onOpenModule?.()
  }

  useEffect(() => {
    if (!codeUnion) {
      setData(null)
      return
    }
    let cancelled = false
    getImpayesByAdherent(codeUnion)
      .then((res) => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true }
  }, [codeUnion])

  if (!codeUnion || !data) return null
  const items = data.items || []
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3 text-emerald-900">
        <span className="text-lg">✅</span>
        <div className="text-sm flex-1">
          <span className="font-bold">Aucun impayé recensé</span>
          <span className="text-emerald-800/70"> — pas de dossier ouvert pour cet adhérent.</span>
        </div>
        {canWrite && onOpenModule && (
          <button
            type="button"
            onClick={declareIncident}
            className="shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
          >
            Déclarer un incident
          </button>
        )}
      </div>
    )
  }

  const actifs = items.filter((i) => i.actif)
  const worst = actifs.find((i) => i.statut === 'contentieux')
    || actifs.find((i) => i.statut === 'echeancier')
    || actifs[0]
    || items[0]
  const amount = data.summary?.actifs_montant || 0
  const alert = actifs.length > 0
  const tone = !alert
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : worst?.statut === 'contentieux'
      ? 'border-rose-300 bg-rose-50 text-rose-950'
      : 'border-amber-300 bg-amber-50 text-amber-950'

  return (
    <div className={`rounded-xl border-2 px-4 py-3 ${tone}`}>
      <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        {alert ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <span className="text-lg">✅</span>}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide opacity-70">Impayés plateformes / partenaires</div>
          {alert ? (
            <div className="font-black text-lg leading-tight">
              {actifs.length} dossier{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} · {fmtEur(amount)}
            </div>
          ) : (
            <div className="font-black">Dossiers clôturés ({items.length}) — plus d&apos;encours</div>
          )}
          {worst && alert && (
            <div className="text-sm mt-0.5 opacity-80 truncate">
              Dont {worst.plateforme} · {fmtEur(worst.montant)}
            </div>
          )}
        </div>
        {worst && <StatutBadge statut={worst.statut} compact variant="light" />}
        <ChevronRight className={`w-4 h-4 opacity-50 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {items.map((row) => (
            <div key={row.id} className="bg-white/70 rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{row.plateforme} · {fmtEur(row.montant)}</div>
                <div className="text-xs opacity-70 truncate">{row.date_facture_label || row.motif || row.commentaires || '—'}</div>
              </div>
              <StatutBadge statut={row.statut} compact variant="light" />
            </div>
          ))}
          {onOpenModule && canWrite && (
            <button
              type="button"
              onClick={declareIncident}
              className="text-sm font-semibold underline underline-offset-2 inline-flex items-center gap-1 opacity-80 hover:opacity-100"
            >
              <Scale className="w-3.5 h-3.5" />
              Déclarer un nouvel incident
            </button>
          )}
        </div>
      )}
    </div>
  )
}
