import { useEffect, useState } from 'react'
import { addClientNote, getClientNotes, nathalieGetClientDetail, uploadClientDocument } from '../api/client'

const DOCS = [
  { kind: 'rib', label: 'RIB', missing: 'RIB' },
  { kind: 'kbis', label: 'Kbis', missing: 'Kbis' },
  { kind: 'piece_identite', label: "Pièce d'identité", missing: "Pièce d'identité" },
]

function mapsUrl(fiche) {
  const q = [fiche.adresse, fiche.code_postal, fiche.ville].filter(Boolean).join(', ')
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ClientFichePanel({ codeUnion, tone = 'light', showIdentity = true }) {
  const dark = tone === 'dark'
  const [fiche, setFiche] = useState(null)
  const [notes, setNotes] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState(null)
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    let cancel = false
    setFiche(null)
    setNotes([])
    setAlertOpen(false)
    setError(null)
    setLoading(true)
    Promise.all([
      nathalieGetClientDetail(codeUnion).catch((err) => {
        if (err?.response?.status === 404) return null
        throw err
      }),
      getClientNotes(codeUnion),
    ])
      .then(([detail, journal]) => {
        if (cancel) return
        const next = detail?.client || null
        setFiche(next)
        setNotes(journal?.notes || [])
        if (next?.missing_docs?.length) setAlertOpen(true)
      })
      .catch((err) => {
        if (!cancel) setError(err?.response?.data?.detail || 'Fiche indisponible.')
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => { cancel = true }
  }, [codeUnion])

  const missing = fiche?.missing_docs || []
  const address = [fiche?.adresse, fiche?.code_postal, fiche?.ville].filter(Boolean).join(', ')
  const map = fiche ? mapsUrl(fiche) : null

  const saveNote = async () => {
    const text = draft.trim()
    if (!text) return
    setSaving(true)
    setError(null)
    try {
      const created = await addClientNote(codeUnion, text)
      setNotes((prev) => [created, ...prev])
      setDraft('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Note non enregistrée.')
    } finally {
      setSaving(false)
    }
  }

  const sendDoc = async (kind, file) => {
    if (!file) return
    setUploading(kind)
    setError(null)
    try {
      const res = await uploadClientDocument(codeUnion, kind, file)
      if (res.client) {
        setFiche(res.client)
        if (!res.client.missing_docs?.length) setAlertOpen(false)
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Document non déposé.')
    } finally {
      setUploading('')
    }
  }

  const card = dark
    ? 'rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3'
    : 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 mb-4'
  const title = dark ? 'text-white font-bold' : 'text-gray-900 font-bold'
  const muted = dark ? 'text-white/50' : 'text-gray-500'
  const body = dark ? 'text-white/85' : 'text-gray-800'

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={title}>Fiche et notes</h3>
        {fiche?.agent_union ? <span className={`text-xs ${muted}`}>{fiche.agent_union}</span> : null}
      </div>

      {loading ? <p className={`text-sm ${muted}`}>Chargement de la fiche…</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {alertOpen && missing.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-slate-950/60" role="dialog" aria-modal="true">
          <div className={`w-full max-w-md rounded-2xl p-5 shadow-xl ${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
            <p className="text-xs uppercase tracking-wide text-red-500 font-bold">Document manquant</p>
            <p className="mt-2 text-lg font-bold">Il manque {missing.join(', ')} sur {fiche?.nom_client || codeUnion}.</p>
            <p className={`mt-1 text-sm ${dark ? 'text-white/60' : 'text-gray-500'}`}>Vous pouvez déposer la pièce depuis cette fiche.</p>
            <button type="button" onClick={() => setAlertOpen(false)} className="mt-4 w-full rounded-xl bg-red-600 text-white font-semibold py-2.5">
              Voir la fiche
            </button>
          </div>
        </div>
      )}

      {showIdentity && fiche && (
        <div className={`text-sm space-y-1 ${body}`}>
          {address ? (
            <p>
              {address}
              {map ? <> · <a className="underline" href={map} target="_blank" rel="noreferrer">Itinéraire</a></> : null}
            </p>
          ) : <p className={muted}>Adresse non renseignée.</p>}
          <p className={muted}>
            {[fiche.contact_magasin, fiche.telephone, fiche.mail].filter(Boolean).join(' · ') || 'Pas de contact magasin.'}
            {fiche.telephone ? <> · <a className="underline" href={`tel:${fiche.telephone}`}>Appeler</a></> : null}
          </p>
        </div>
      )}
      {!loading && !fiche ? <p className={`text-sm ${muted}`}>Aucune fiche Nathalie pour {codeUnion}. Les notes restent disponibles.</p> : null}

      {fiche && (
        <div className="flex flex-wrap gap-2">
          {DOCS.map((doc) => {
            const ok = !(fiche.missing_docs || []).includes(doc.missing)
            return (
              <label key={doc.kind} className={`text-xs px-3 py-2 rounded-xl border cursor-pointer ${ok ? (dark ? 'border-emerald-500/40 text-emerald-300' : 'border-emerald-300 text-emerald-700') : (dark ? 'border-red-500/40 text-red-300' : 'border-red-300 text-red-700')}`}>
                {uploading === doc.kind ? 'Envoi…' : ok ? `${doc.label} présent` : `Déposer ${doc.label}`}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  disabled={Boolean(uploading)}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    sendDoc(doc.kind, file)
                  }}
                />
              </label>
            )
          })}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Note de visite, rappel, ce qui s'est dit au magasin…"
          className={`w-full min-h-[88px] rounded-xl px-3 py-2 text-sm ${dark ? 'bg-slate-950 border border-white/15 text-white' : 'border border-gray-200'}`}
        />
        <button
          type="button"
          onClick={saveNote}
          disabled={saving || !draft.trim()}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la note'}
        </button>
      </div>

      <ul className="space-y-2 max-h-80 overflow-auto">
        {notes.map((note) => (
          <li key={note.id} className={`rounded-xl px-3 py-2 text-sm ${dark ? 'bg-black/20' : 'bg-gray-50'}`}>
            <p className={`text-[11px] ${muted}`}>{[note.auteur, formatWhen(note.created_at), note.type_note].filter(Boolean).join(' · ')}</p>
            <p className={`whitespace-pre-wrap mt-1 ${body}`}>{note.note_simple}</p>
          </li>
        ))}
        {!loading && notes.length === 0 ? <li className={`text-sm ${muted}`}>Aucune note pour l'instant.</li> : null}
      </ul>
    </section>
  )
}
