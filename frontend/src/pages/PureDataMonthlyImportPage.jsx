import { useEffect, useState } from 'react'
import { Upload, Trash2, RefreshCw, FolderDown, CheckCircle2 } from 'lucide-react'
import {
  deletePureDataMonthlyRows,
  getPureDataMonthlyPeriods,
  importPureDataMonthlyExcel,
} from '../api/client'

const MONTH_LABELS = ['', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const periodKey = (p) => `${p.annee || 'x'}-${p.mois || 'x'}-${p.fournisseur || 'x'}`

export default function PureDataMonthlyImportPage() {
  const [file, setFile] = useState(null)
  const [importMode, setImportMode] = useState('append')
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const [periods, setPeriods] = useState([])
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [selected, setSelected] = useState({})
  const [deleting, setDeleting] = useState(false)

  const refreshPeriods = async () => {
    setPeriodsLoading(true)
    try {
      const data = await getPureDataMonthlyPeriods()
      setPeriods(data?.items || [])
    } catch {
      setPeriods([])
    } finally {
      setPeriodsLoading(false)
    }
  }

  useEffect(() => { refreshPeriods() }, [])

  const handleImport = async () => {
    if (!file) { setError('Sélectionne un fichier Excel.'); return }
    setImporting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await importPureDataMonthlyExcel({ file, mode: importMode })
      setMessage(`✓ ${res.rows_inserted} lignes importées${res.rows_deleted ? ` (${res.rows_deleted} remplacées)` : ''}.`)
      setFile(null)
      await refreshPeriods()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  const selectedList = periods.filter((p) => selected[periodKey(p)])
  const togglePeriod = (p) => {
    const key = periodKey(p)
    setSelected((s) => ({ ...s, [key]: !s[key] }))
  }
  const toggleAll = () => {
    if (selectedList.length === periods.length) {
      setSelected({})
    } else {
      const all = {}
      periods.forEach((p) => { all[periodKey(p)] = true })
      setSelected(all)
    }
  }

  const handleDelete = async () => {
    if (!selectedList.length) { setError('Sélectionne au moins une période.'); return }
    if (!window.confirm(`Supprimer ${selectedList.length} période(s) ?`)) return
    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      let total = 0
      for (const p of selectedList) {
        const res = await deletePureDataMonthlyRows({
          years: p.annee ? [p.annee] : undefined,
          months: p.mois ? [p.mois] : undefined,
          fournisseurs: p.fournisseur ? [p.fournisseur] : undefined,
        })
        total += Number(res?.deleted_rows || 0)
      }
      setMessage(`✓ ${total} lignes supprimées.`)
      setSelected({})
      await refreshPeriods()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Erreur suppression')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">

      <div className="glass-card overflow-hidden">
        <div className="bg-gradient-to-r from-teal-700 to-emerald-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <FolderDown className="w-6 h-6 text-white" />
            <div>
              <h1 className="text-xl font-black text-white">Import mensuel 2025 / 2026</h1>
              <p className="text-white/60 text-xs">Table isolée — aucun impact sur l'historique Pure Data 2024/2025</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Import ── */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-glass-primary font-semibold">Ajouter / remplacer des données</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-glass-secondary text-xs font-semibold">Fichier Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Mode</label>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
              className="glass-input w-full mt-2"
            >
              <option value="append">Ajouter (conserver l'existant)</option>
              <option value="replace_scope">Remplacer la période du fichier</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={importing || !file}
            className="glass-btn-primary px-4 py-2 text-sm flex items-center gap-2"
          >
            {importing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Import en cours…</> : <><Upload className="w-4 h-4" /> Importer</>}
          </button>
        </div>

        {message && <p className="text-emerald-300 text-sm">{message}</p>}
        {error && <p className="text-rose-300 text-sm">{error}</p>}
      </div>

      {/* ── Périodes en base ── */}
      <div className="glass-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-glass-primary font-semibold">
            Périodes en base ({periods.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={refreshPeriods}
              disabled={periodsLoading}
              className="glass-btn-secondary text-xs px-3 py-2 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${periodsLoading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || selectedList.length === 0}
              className="glass-btn-secondary text-xs px-3 py-2 flex items-center gap-1 !text-rose-300 !border-rose-500/30"
            >
              <Trash2 className="w-3 h-3" />
              Supprimer ({selectedList.length})
            </button>
          </div>
        </div>

        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="glass-table text-xs w-full">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selectedList.length === periods.length && periods.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left px-3 py-2">Période</th>
                <th className="text-left px-3 py-2">Fournisseur</th>
                <th className="text-right px-3 py-2">Lignes</th>
                <th className="text-right px-3 py-2">CA</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const key = periodKey(p)
                return (
                  <tr key={key} className={selected[key] ? 'bg-white/5' : ''}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={Boolean(selected[key])} onChange={() => togglePeriod(p)} />
                    </td>
                    <td className="px-3 py-2 font-medium">{MONTH_LABELS[p.mois] || '?'} {p.annee || '-'}</td>
                    <td className="px-3 py-2">{p.fournisseur || '-'}</td>
                    <td className="px-3 py-2 text-right">{Number(p.row_count || 0).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.total_ca || 0)}</td>
                  </tr>
                )
              })}
              {!periods.length && !periodsLoading && (
                <tr><td className="px-3 py-4 text-center text-glass-secondary" colSpan={5}>Aucune période disponible.</td></tr>
              )}
              {periodsLoading && (
                <tr><td className="px-3 py-4 text-center text-glass-secondary" colSpan={5}>Chargement…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
