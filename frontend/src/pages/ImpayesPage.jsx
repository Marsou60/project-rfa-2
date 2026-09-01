import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Search,
  X,
  Landmark,
} from 'lucide-react'
import {
  addImpayeNote,
  changeImpayeStatut,
  createImpaye,
  getImpaye,
  getImpayes,
  getImpayesSummary,
} from '../api/client'

export const STATUT_META = {
  en_attente: {
    label: 'En attente',
    short: 'Attente',
    className: 'bg-violet-500/20 text-violet-200 border-violet-400/30',
    dot: 'bg-violet-400',
    emoji: '🟣',
  },
  en_cours: {
    label: 'En cours de paiement',
    short: 'En cours',
    className: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    dot: 'bg-amber-400',
    emoji: '🟡',
  },
  echeancier: {
    label: 'Échéancier',
    short: 'Échéancier',
    className: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
    dot: 'bg-sky-400',
    emoji: '🔵',
  },
  contentieux: {
    label: 'Contentieux',
    short: 'Contentieux',
    className: 'bg-rose-500/20 text-rose-200 border-rose-400/30',
    dot: 'bg-rose-400',
    emoji: '⚫',
  },
  regularise: {
    label: 'Régularisé',
    short: 'Régularisé',
    className: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
    dot: 'bg-emerald-400',
    emoji: '🟢',
  },
  abandonne: {
    label: 'Abandonné',
    short: 'Abandonné',
    className: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
    dot: 'bg-slate-400',
    emoji: '⚪',
  },
}

export const fmtEur = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(Number(v || 0))

const STATUT_LIGHT = {
  en_attente: 'bg-violet-100 text-violet-800 border-violet-300',
  en_cours: 'bg-amber-100 text-amber-900 border-amber-300',
  echeancier: 'bg-sky-100 text-sky-900 border-sky-300',
  contentieux: 'bg-rose-100 text-rose-900 border-rose-300',
  regularise: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  abandonne: 'bg-slate-100 text-slate-700 border-slate-300',
}

export function StatutBadge({ statut, compact = false, variant = 'dark' }) {
  const meta = STATUT_META[statut] || STATUT_META.en_attente
  const cls = variant === 'light' ? (STATUT_LIGHT[statut] || STATUT_LIGHT.en_attente) : meta.className
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {compact ? meta.short : meta.label}
    </span>
  )
}

const EMPTY_FORM = {
  code_union: '',
  nom_magasin: '',
  commercial: '',
  plateforme: '',
  motif: '',
  date_facture: '',
  montant: '',
  date_notif_dette: '',
  statut: 'en_attente',
  commentaires: '',
}

export default function ImpayesPage({ initialCodeUnion = null, canWrite = true }) {
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState(initialCodeUnion || '')
  const [statut, setStatut] = useState('')
  const [plateforme, setPlateforme] = useState('')
  const [actifsOnly, setActifsOnly] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createPrefill, setCreatePrefill] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters = {
        q: q || undefined,
        statut: statut || undefined,
        plateforme: plateforme || undefined,
        actifs_only: actifsOnly,
      }
      const [s, list] = await Promise.all([
        getImpayesSummary(),
        getImpayes(filters),
      ])
      setSummary(s)
      setItems(list.items || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de charger les impayés.')
    } finally {
      setLoading(false)
    }
  }, [q, statut, plateforme, actifsOnly])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let prefill = {}
    try {
      const raw = sessionStorage.getItem('impayes_prefill')
      if (raw) {
        prefill = JSON.parse(raw)
        sessionStorage.removeItem('impayes_prefill')
        setCreatePrefill(prefill)
        setShowCreate(true)
      }
    } catch {
      /* ignore */
    }
    if (initialCodeUnion && !prefill.code_union) {
      setCreatePrefill({ code_union: initialCodeUnion })
    }
  }, [initialCodeUnion])

  const plateformes = useMemo(() => {
    const fromSummary = (summary?.by_plateforme || []).map((p) => p.plateforme)
    const extra = [...new Set(items.map((i) => i.plateforme).filter(Boolean))]
    return [...new Set([...fromSummary, ...extra])].sort()
  }, [summary, items])

  return (
    <div className="space-y-6 pb-16">
      <div className="glass-card overflow-hidden">
        <div className="bg-gradient-to-r from-rose-700 via-orange-600 to-amber-600 px-6 py-5 relative">
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-3xl">
                ⚠️
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-black text-white">Impayés adhérents</h1>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/15 text-white/80 border border-white/10 uppercase tracking-wider">
                    Plateformes & partenaires
                  </span>
                </div>
                <p className="text-white/70 text-sm">
                  Déclarez un incident, suivez les dossiers et changez les statuts.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="glass-btn-icon" title="Actualiser" disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {canWrite && (
                <button
                  onClick={() => { setCreatePrefill({}); setShowCreate(true) }}
                  className="px-3 py-2 rounded-xl bg-white text-rose-800 text-sm font-bold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nouveau dossier
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card bg-red-500/10 border border-red-500/30 px-5 py-4 text-red-200 text-sm flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Encours actif" value={fmtEur(summary?.actifs_montant)} sub={`${summary?.actifs_nb || 0} dossier(s)`} icon={<AlertTriangle className="w-4 h-4" />} tone="rose" />
        <KpiCard label="Contentieux" value={fmtEur(summary?.by_statut?.find((s) => s.statut === 'contentieux')?.montant)} sub={`${summary?.by_statut?.find((s) => s.statut === 'contentieux')?.nb || 0} dossier(s)`} icon={<Scale className="w-4 h-4" />} tone="slate" />
        <KpiCard label="En attente / cours" value={fmtEur(
          (summary?.by_statut || [])
            .filter((s) => ['en_attente', 'en_cours', 'echeancier'].includes(s.statut))
            .reduce((acc, s) => acc + (s.montant || 0), 0)
        )} sub="Hors contentieux" icon={<Clock className="w-4 h-4" />} tone="amber" />
        <KpiCard label="Régularisé" value={fmtEur(summary?.by_statut?.find((s) => s.statut === 'regularise')?.montant)} sub={`${summary?.by_statut?.find((s) => s.statut === 'regularise')?.nb || 0} dossier(s)`} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
      </div>

      {summary?.by_plateforme?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.by_plateforme.map((p) => (
            <button
              key={p.plateforme}
              onClick={() => setPlateforme(plateforme === p.plateforme ? '' : p.plateforme)}
              className={`glass-card px-3 py-2 text-left transition ${
                plateforme === p.plateforme ? 'ring-2 ring-amber-400/70' : 'hover:bg-white/10'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold flex items-center gap-1">
                <Landmark className="w-3 h-3" />
                {p.plateforme}
                <span className="text-white/30">· {p.partenaire_type}</span>
              </div>
              <div className="text-sm font-bold text-white">{fmtEur(p.actifs_montant)}</div>
              <div className="text-[10px] text-white/45">{p.actifs_nb} actif(s)</div>
            </button>
          ))}
        </div>
      )}

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Code Union, magasin, commentaire…"
              className="w-full bg-white/10 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/35"
            />
          </div>
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-sm text-white"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUT_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={plateforme}
            onChange={(e) => setPlateforme(e.target.value)}
            className="bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-sm text-white"
          >
            <option value="">Toutes plateformes</option>
            {plateformes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
            <input type="checkbox" checked={actifsOnly} onChange={(e) => setActifsOnly(e.target.checked)} />
            Actifs seulement
          </label>
          <span className="text-xs text-white/40 flex items-center gap-1 ml-auto">
            <Filter className="w-3 h-3" />
            {items.length} résultat(s)
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-white/40 text-left bg-white/5">
                <th className="px-3 py-2 font-semibold">Adhérent</th>
                <th className="px-3 py-2 font-semibold">Plateforme</th>
                <th className="px-3 py-2 font-semibold">Montant</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                <th className="px-3 py-2 font-semibold">Commercial</th>
                <th className="px-3 py-2 font-semibold">Échéance</th>
                <th className="px-3 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-white/50">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-white/45">
                    Aucun dossier. Cliquez sur « Nouveau dossier » pour déclarer un incident.
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-white/8 hover:bg-white/5 cursor-pointer"
                  onClick={() => setSelected(row.id)}
                >
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{row.nom_magasin || '—'}</div>
                    <div className="text-[11px] text-white/40">{row.code_union || 'Code Union inconnu'}</div>
                  </td>
                  <td className="px-3 py-3 text-white/80">
                    {row.plateforme}
                    <div className="text-[10px] text-white/35">{row.partenaire_type}</div>
                  </td>
                  <td className="px-3 py-3 font-bold text-white whitespace-nowrap">{fmtEur(row.montant)}</td>
                  <td className="px-3 py-3"><StatutBadge statut={row.statut} compact /></td>
                  <td className="px-3 py-3 text-white/70">{row.commercial || '—'}</td>
                  <td className="px-3 py-3 text-white/60 text-xs">{row.date_facture_label || row.date_facture || '—'}</td>
                  <td className="px-3 py-3 text-right text-white/30"><ChevronRight className="w-4 h-4 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ImpayeDrawer
          id={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onChanged={async () => {
            await load()
            const fresh = await getImpaye(selected)
            return fresh
          }}
        />
      )}
      {showCreate && (
        <CreateModal
          prefill={createPrefill}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, icon, tone }) {
  const tones = {
    rose: 'from-rose-500/20 to-orange-500/10 text-rose-200',
    slate: 'from-slate-500/20 to-slate-700/10 text-slate-200',
    amber: 'from-amber-500/20 to-yellow-500/10 text-amber-200',
    emerald: 'from-emerald-500/20 to-teal-500/10 text-emerald-200',
  }
  return (
    <div className={`glass-card p-4 bg-gradient-to-br ${tones[tone] || tones.rose}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-wider opacity-70 mb-1">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-xl font-black text-white">{loadingSafe(value)}</div>
      <div className="text-[11px] text-white/50 mt-0.5">{sub}</div>
    </div>
  )
}

function loadingSafe(v) {
  return v ?? '—'
}

function ImpayeDrawer({ id, canWrite, onClose, onChanged }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItem(await getImpaye(id))
    } catch (e) {
      setError(e?.response?.data?.detail || 'Dossier introuvable')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  const applyStatut = async (statut) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await changeImpayeStatut(id, statut, note || null)
      setNote('')
      setItem(await getImpaye(id))
      await onChanged?.(updated)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Statut non enregistré')
    } finally {
      setSaving(false)
    }
  }

  const saveNote = async () => {
    if (!note.trim()) return
    setSaving(true)
    try {
      await addImpayeNote(id, note.trim())
      setNote('')
      setItem(await getImpaye(id))
      await onChanged?.()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Note non enregistrée')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="w-full max-w-lg h-full bg-slate-950/95 border-l border-white/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-white/40 uppercase tracking-wider">Dossier impayé</div>
            <div className="text-lg font-black text-white">{item?.nom_magasin || '…'}</div>
          </div>
          <button onClick={onClose} className="glass-btn-icon"><X className="w-4 h-4" /></button>
        </div>
        {loading && <div className="p-8 text-white/50 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
        {item && (
          <div className="p-5 space-y-5">
            {error && <div className="text-sm text-rose-300">{error}</div>}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-black text-white">{fmtEur(item.montant)}</div>
                <div className="text-sm text-white/50">{item.code_union || 'Sans code Union'} · {item.plateforme}</div>
              </div>
              <StatutBadge statut={item.statut} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Commercial" value={item.commercial} />
              <Info label="Motif" value={item.motif} />
              <Info label="Échéance" value={item.date_facture_label || item.date_facture} />
              <Info label="Notif. dette" value={item.date_notif_dette} />
              <Info label="Source" value={item.source} />
              <Info label="Type" value={item.partenaire_type} />
            </dl>
            {item.commentaires && (
              <div className="glass-card-dark p-3 text-sm text-white/80 whitespace-pre-wrap">{item.commentaires}</div>
            )}
            {item.suivi && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Suivi</div>
                <div className="glass-card-dark p-3 text-sm text-white/80 whitespace-pre-wrap">{item.suivi}</div>
              </div>
            )}
            {canWrite && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Changer le statut</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUT_META).map(([k, v]) => (
                    <button
                      key={k}
                      disabled={saving || item.statut === k}
                      onClick={() => applyStatut(k)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border ${v.className} disabled:opacity-40`}
                    >
                      {v.emoji} {v.short}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note de suivi (optionnelle, jointe au changement de statut)"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/35 min-h-[80px]"
                />
                <button
                  onClick={saveNote}
                  disabled={saving || !note.trim()}
                  className="glass-btn-primary text-sm disabled:opacity-40"
                >
                  Ajouter une note sans changer le statut
                </button>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Historique</div>
              <div className="space-y-2">
                {(item.events || []).length === 0 && (
                  <div className="text-xs text-white/35">Aucun événement.</div>
                )}
                {(item.events || []).map((ev) => (
                  <div key={ev.id} className="text-xs text-white/70 border-l-2 border-white/15 pl-3 py-1">
                    <div className="font-semibold text-white/90">
                      {ev.event_type === 'statut_changed'
                        ? `${STATUT_META[ev.old_statut]?.label || ev.old_statut} → ${STATUT_META[ev.new_statut]?.label || ev.new_statut}`
                        : ev.event_type}
                    </div>
                    {ev.commentaire && <div className="text-white/60">{ev.commentaire}</div>}
                    <div className="text-white/35">
                      {(ev.actor || 'système')} · {ev.created_at ? String(ev.created_at).slice(0, 16).replace('T', ' ') : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="glass-card-dark p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="text-white/90 mt-0.5">{value || '—'}</div>
    </div>
  )
}

function CreateModal({ onClose, onCreated, prefill = {} }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...prefill })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.nom_magasin.trim() || !form.plateforme.trim()) {
      setError('Magasin et plateforme sont requis.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createImpaye({
        ...form,
        montant: form.montant,
        source: 'manuel',
      })
      await onCreated()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-card p-5 space-y-4 bg-slate-950/90"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Nouveau dossier</h2>
          <button type="button" onClick={onClose} className="glass-btn-icon"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="text-sm text-rose-300">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code Union" value={form.code_union} onChange={(v) => set('code_union', v)} placeholder="M0160" />
          <Field label="Magasin" value={form.nom_magasin} onChange={(v) => set('nom_magasin', v)} required />
          <label className="block text-xs text-white/50">
            Plateforme / partenaire *
            <input
              list="impayes-plateformes"
              value={form.plateforme}
              required
              placeholder="ACR, DCA, TOTAL…"
              onChange={(e) => set('plateforme', e.target.value)}
              className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
            <datalist id="impayes-plateformes">
              {['ACR', 'DCA', 'EXADIS', 'ALLIANCE', "OTTO'GO", 'DASIR', 'TOTAL', 'FUCHS', 'PARALINE', 'BANNER', 'NPS', 'AUTOPUZZ'].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <Field label="Commercial" value={form.commercial} onChange={(v) => set('commercial', v)} />
          <Field label="Montant €" value={form.montant} onChange={(v) => set('montant', v)} placeholder="0,00" />
          <Field label="Motif" value={form.motif} onChange={(v) => set('motif', v)} placeholder="Rejet LCR…" />
          <Field label="Date facture" value={form.date_facture} onChange={(v) => set('date_facture', v)} type="date" />
          <Field label="Date notif. dette" value={form.date_notif_dette} onChange={(v) => set('date_notif_dette', v)} type="date" />
          <label className="block text-xs text-white/50 col-span-2">
            Statut
            <select
              value={form.statut}
              onChange={(e) => set('statut', e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-sm text-white"
            >
              {Object.entries(STATUT_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-white/50">
          Commentaires
          <textarea
            value={form.commentaires}
            onChange={(e) => set('commentaires', e.target.value)}
            className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white min-h-[70px]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-white/60">Annuler</button>
          <button type="submit" disabled={saving} className="glass-btn-primary text-sm">
            {saving ? 'Enregistrement…' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <label className="block text-xs text-white/50">
      {label}{required ? ' *' : ''}
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
      />
    </label>
  )
}
