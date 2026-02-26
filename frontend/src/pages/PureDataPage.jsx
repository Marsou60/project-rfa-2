import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Upload, Users, X, ChevronDown, RefreshCw, CheckCircle2, Database } from 'lucide-react'
import { comparePureData, getPureDataComparison, getPureDataClientDetail, getPureDataPlatformDetail, getPureDataMarqueDetail, getPureDataCommercialDetail, getPureDataSheetsStatus, syncPureDataFromSheets } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0)

const formatDelta = (value) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCurrency(value)}`
}

const formatPercent = (value) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

const getDeltaClass = (value) => {
  const num = Number(value)
  if (Number.isNaN(num)) return 'text-glass-muted'
  return num >= 0 ? '!text-emerald-300' : '!text-rose-300'
}

const getDeltaPctClass = (value) => {
  const num = Number(value)
  if (Number.isNaN(num)) return 'text-glass-muted'
  return num >= 0 ? '!text-emerald-200' : '!text-rose-200'
}

function PureDataPage() {
  const { supplierFilter } = useSupplierFilter()
  const [file, setFile] = useState(null)
  const [yearCurrent, setYearCurrent] = useState(2025)
  const [yearPrevious, setYearPrevious] = useState(2024)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [commercialFilter, setCommercialFilter] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [lastRunMeta, setLastRunMeta] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [expandedFournisseurs, setExpandedFournisseurs] = useState({})
  const [expandedMarques, setExpandedMarques] = useState({})
  const [selectedPlatform, setSelectedPlatform] = useState(null)
  const [platformDetail, setPlatformDetail] = useState(null)
  const [platformLoading, setPlatformLoading] = useState(false)
  const [platformError, setPlatformError] = useState(null)
  const [selectedMarqueInPlatform, setSelectedMarqueInPlatform] = useState(null)
  const [marqueDetail, setMarqueDetail] = useState(null)
  const [marqueDetailLoading, setMarqueDetailLoading] = useState(false)
  const [marqueDetailError, setMarqueDetailError] = useState(null)
  const magasinsBlockRef = useRef(null)
  const [selectedCommercial, setSelectedCommercial] = useState(null)
  const [commercialDetail, setCommercialDetail] = useState(null)
  const [commercialLoading, setCommercialLoading] = useState(false)
  const [commercialError, setCommercialError] = useState(null)
  const [filteredComparison, setFilteredComparison] = useState(null)
  const [filteredComparisonLoading, setFilteredComparisonLoading] = useState(false)
  const [pureDataExpiredMessage, setPureDataExpiredMessage] = useState(null)
  const [sheetsStatus, setSheetsStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)

  // Vérifier si des données Sheets sont disponibles dans Supabase
  useEffect(() => {
    getPureDataSheetsStatus()
      .then((status) => {
        setSheetsStatus(status)
        // Auto-charger si données Supabase disponibles et pas encore de résultat
        if (status?.has_data && !result) {
          handleCompareSheets()
        }
      })
      .catch(() => {})
  }, [])

  const handleCompareSheets = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await comparePureData({ yearCurrent, yearPrevious, month: month === '' ? null : Number(month) })
      setResult(data)
      setPureDataExpiredMessage(null)
      const meta = { yearCurrent, yearPrevious, month: month === '' ? null : Number(month), pureDataId: data.pure_data_id, savedAt: new Date().toISOString(), source: 'sheets' }
      setLastRunMeta(meta)
      localStorage.setItem('pure_data_last', JSON.stringify({ meta, result: data }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }

  const handleSyncSheets = async () => {
    setSyncing(true)
    setSyncSuccess(false)
    setError(null)
    try {
      const res = await syncPureDataFromSheets()
      setSyncSuccess(true)
      setSheetsStatus(s => ({ ...s, has_data: true, row_count: res.rows_imported }))
      setTimeout(() => setSyncSuccess(false), 4000)
      // Recharger la comparaison avec les nouvelles données
      await handleCompareSheets()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur synchronisation")
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem('pure_data_last')
    if (!cached) return
    try {
      const parsed = JSON.parse(cached)
      if (parsed?.result) {
        setResult(parsed.result)
        setLastRunMeta(parsed.meta || null)
        setYearCurrent(parsed.meta?.yearCurrent ?? yearCurrent)
        setYearPrevious(parsed.meta?.yearPrevious ?? yearPrevious)
        setMonth(parsed.meta?.month ?? '')
      }
    } catch (e) {
      console.warn('Impossible de charger le cache pure data:', e)
    }
  }, [])

  const handleCompare = async () => {
    if (!file) {
      setError("Sélectionne un fichier Excel.")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await comparePureData({ file, yearCurrent, yearPrevious, month: month === '' ? null : Number(month) })
      setResult(data)
      setPureDataExpiredMessage(null)
      const meta = { fileName: file?.name || null, yearCurrent, yearPrevious, month: month === '' ? null : Number(month), pureDataId: data.pure_data_id, savedAt: new Date().toISOString() }
      setLastRunMeta(meta)
      localStorage.setItem('pure_data_last', JSON.stringify({ meta, result: data }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de l'analyse")
    } finally {
      setLoading(false)
    }
  }

  const clearCache = () => {
    localStorage.removeItem('pure_data_last')
    setResult(null)
    setLastRunMeta(null)
    setFilteredComparison(null)
    setPureDataExpiredMessage(null)
  }

  const pureDataId = result?.pure_data_id || lastRunMeta?.pureDataId

  const clearPureDataCache = () => {
    localStorage.removeItem('pure_data_last')
    setResult(null)
    setLastRunMeta(null)
    setFilteredComparison(null)
    setPureDataExpiredMessage('Les données Pure Data ont expiré (serveur redémarré ou session perdue). Relancez l’analyse ci-dessous. Si vous venez de mettre à jour le code, redémarrez le serveur backend (port 8001) puis relancez l’analyse.')
  }

  useEffect(() => {
    if (!supplierFilter || !pureDataId) {
      setFilteredComparison(null)
      return
    }
    setFilteredComparisonLoading(true)
    getPureDataComparison({
      pureDataId,
      yearCurrent,
      yearPrevious,
      month: month === '' ? null : Number(month),
      fournisseur: supplierFilter,
    })
      .then((data) => setFilteredComparison(data))
      .catch((err) => {
        setFilteredComparison(null)
        if (err.response?.status === 404) {
          clearPureDataCache()
        }
      })
      .finally(() => setFilteredComparisonLoading(false))
  }, [supplierFilter, pureDataId, yearCurrent, yearPrevious, month])

  const openClientDetail = async (client) => {
    if (!pureDataId) {
      setDetailError("Relance l'analyse pour activer le détail client.")
      setSelectedClient(client)
      return
    }
    setSelectedClient(client)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const data = await getPureDataClientDetail({
        pureDataId,
        codeUnion: client.code_union,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
        fournisseur: supplierFilter || undefined,
      })
      setDetail(data)
    } catch (err) {
      setDetailError(err.response?.data?.detail || err.message || "Erreur lors du détail client")
    } finally {
      setDetailLoading(false)
    }
  }

  const openPlatformDetail = async (platform) => {
    if (!pureDataId) {
      setPlatformError("Relance l'analyse pour activer le détail plateforme.")
      setSelectedPlatform(platform)
      return
    }
    setSelectedPlatform(platform)
    setPlatformDetail(null)
    setPlatformError(null)
    setSelectedMarqueInPlatform(null)
    setMarqueDetail(null)
    setMarqueDetailError(null)
    setPlatformLoading(true)
    try {
      const data = await getPureDataPlatformDetail({
        pureDataId,
        platform: platform.platform,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setPlatformDetail(data)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Erreur lors du détail plateforme"
      setPlatformError(msg)
      if (err.response?.status === 404) clearPureDataCache()
    } finally {
      setPlatformLoading(false)
    }
  }

  const openMarqueDetail = async (marqueRow) => {
    if (!pureDataId || !selectedPlatform) return
    setSelectedMarqueInPlatform(marqueRow)
    setMarqueDetail(null)
    setMarqueDetailError(null)
    setMarqueDetailLoading(true)
    try {
      const data = await getPureDataMarqueDetail({
        pureDataId,
        platform: selectedPlatform.platform,
        marque: marqueRow.marque,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
      })
      setMarqueDetail(data)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Erreur lors du chargement des magasins"
      setMarqueDetailError(msg)
      if (err.response?.status === 404) clearPureDataCache()
    } finally {
      setMarqueDetailLoading(false)
    }
  }

  useEffect(() => {
    if (marqueDetail !== null || marqueDetailError) {
      magasinsBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [marqueDetail, marqueDetailError])

  const openCommercialDetail = async (commercialRow) => {
    if (!pureDataId) {
      setCommercialError("Relance l'analyse pour activer le détail commercial.")
      setSelectedCommercial(commercialRow)
      return
    }
    setSelectedCommercial(commercialRow)
    setCommercialDetail(null)
    setCommercialError(null)
    setCommercialLoading(true)
    try {
      const data = await getPureDataCommercialDetail({
        pureDataId,
        commercial: commercialRow.commercial,
        yearCurrent,
        yearPrevious,
        month: month === '' ? null : Number(month),
        fournisseur: supplierFilter || undefined,
      })
      setCommercialDetail(data)
    } catch (err) {
      setCommercialError(err.response?.data?.detail || err.message || "Erreur lors du détail commercial")
    } finally {
      setCommercialLoading(false)
    }
  }

  const toggleFournisseur = (key) => {
    setExpandedFournisseurs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleMarque = (key) => {
    setExpandedMarques((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  /** Comparaison affichée : filtrée par fournisseur si filtre actif, sinon globale. */
  const comparisonToShow = supplierFilter && filteredComparison
    ? filteredComparison.comparison
    : result?.comparison

  const displayTotals = comparisonToShow?.total ?? null
  const displayPlatforms = comparisonToShow?.platforms ?? []

  const commercialRows = useMemo(() => {
    const rows = comparisonToShow?.commercials || []
    if (!commercialFilter) return rows
    const q = commercialFilter.toLowerCase()
    return rows.filter((row) => (row.commercial || '').toLowerCase().includes(q))
  }, [comparisonToShow, commercialFilter])

  const clientRows = useMemo(() => {
    const rows = comparisonToShow?.clients || []
    if (!clientQuery) return rows
    const q = clientQuery.toLowerCase()
    return rows.filter((row) =>
      (row.code_union || '').toLowerCase().includes(q) ||
      (row.raison_sociale || '').toLowerCase().includes(q)
    )
  }, [comparisonToShow, clientQuery])

  return (
    <div className="space-y-6">

      {/* ── Bannière Google Sheets (source principale) ── */}
      <div className={`glass-card p-4 border ${sheetsStatus?.has_data ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Database className={`w-5 h-5 ${sheetsStatus?.has_data ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div>
              <div className="text-white font-semibold text-sm flex items-center gap-2">
                Google Sheets — <span className="font-mono text-xs text-white/60">global New</span>
                {sheetsStatus?.has_data && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    ✓ {sheetsStatus.row_count?.toLocaleString('fr-FR')} lignes en base
                  </span>
                )}
              </div>
              <p className="text-white/40 text-xs">
                {sheetsStatus?.has_data
                  ? 'Données chargées automatiquement depuis Supabase'
                  : 'Aucune donnée — synchronisez depuis Google Sheets'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncSheets}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              syncSuccess
                ? 'bg-emerald-500 text-white'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            }`}
          >
            {syncing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Synchronisation…</>
            ) : syncSuccess ? (
              <><CheckCircle2 className="w-4 h-4" /> Synchronisé !</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Synchroniser depuis Sheets</>
            )}
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-glass-primary text-xl font-bold">Pure Data • Comparatif N-1</h1>
              {supplierFilter && (
                <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold border border-white/30">
                  Vue {supplierFilter} uniquement
                </span>
              )}
            </div>
            <p className="text-glass-secondary text-sm">
              Analyse mensuelle par adhérent et commercial (N vs N-1){supplierFilter ? ` — vue limitée à ${supplierFilter} (commerciaux et adhérents inclus)` : ''}.
            </p>
            {supplierFilter && filteredComparisonLoading && (
              <p className="text-amber-300 text-xs mt-1">Chargement des données {supplierFilter}…</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card-dark p-4 md:col-span-2">
            <label className="text-glass-secondary text-xs font-semibold">Fichier unique (N + N-1)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files[0])}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Année N</label>
            <input
              type="number"
              value={yearCurrent}
              onChange={(e) => setYearCurrent(Number(e.target.value))}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Année N-1</label>
            <input
              type="number"
              value={yearPrevious}
              onChange={(e) => setYearPrevious(Number(e.target.value))}
              className="glass-input w-full mt-2"
            />
          </div>
          <div>
            <label className="text-glass-secondary text-xs font-semibold">Mois (optionnel)</label>
            <input
              type="number"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="1-12"
              className="glass-input w-full mt-2"
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <button
              onClick={handleCompare}
              className="glass-btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              <Upload className="w-4 h-4" />
              {loading ? 'Analyse...' : 'Comparer'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-rose-300">{error}</div>
        )}
        {pureDataExpiredMessage && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm">
            {pureDataExpiredMessage}
          </div>
        )}
        {lastRunMeta && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-glass-muted">
            <span>Données en cache</span>
            {lastRunMeta.fileName && <span>• {lastRunMeta.fileName}</span>}
            {lastRunMeta.yearCurrent && lastRunMeta.yearPrevious && (
              <span>• {lastRunMeta.yearCurrent} vs {lastRunMeta.yearPrevious}</span>
            )}
            {lastRunMeta.month && <span>• Mois {lastRunMeta.month}</span>}
            <button onClick={clearCache} className="glass-btn-secondary text-xs px-3 py-1">
              Effacer le cache
            </button>
          </div>
        )}
      </div>

      {result && displayTotals && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">CA total N{supplierFilter ? ` (${supplierFilter})` : ''}</div>
              <div className="text-lg font-bold text-glass-primary">
                {formatCurrency(displayTotals.current)}
              </div>
            </div>
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">CA total N-1{supplierFilter ? ` (${supplierFilter})` : ''}</div>
              <div className="text-lg font-bold text-glass-primary">
                {formatCurrency(displayTotals.previous)}
              </div>
            </div>
            <div className="glass-card-dark p-4">
              <div className="text-glass-secondary text-xs">Delta</div>
              <div className={`text-lg font-bold ${displayTotals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatDelta(displayTotals.delta)} • {formatPercent(displayTotals.delta_pct)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-glass-primary font-semibold">Par plateforme</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="glass-table text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2">Plateforme</th>
                      <th className="text-right px-3 py-2">CA N</th>
                      <th className="text-right px-3 py-2">CA N-1</th>
                      <th className="text-right px-3 py-2">Delta</th>
                      <th className="text-right px-3 py-2">Delta %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPlatforms.map((row) => (
                      <tr key={row.platform} className="cursor-pointer hover:bg-white/10" onClick={() => openPlatformDetail(row)}>
                        <td className="px-3 py-2 font-medium">{row.platform}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {supplierFilter && displayPlatforms.length === 0 && !filteredComparisonLoading && (
                <p className="text-sm text-amber-300 mt-3">Aucune donnée pour la plateforme {supplierFilter} dans ce comparatif.</p>
              )}
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-300" />
                  <h2 className="text-glass-primary font-semibold">Par commercial</h2>
                </div>
                <input
                  value={commercialFilter}
                  onChange={(e) => setCommercialFilter(e.target.value)}
                  placeholder="Filtrer un commercial..."
                  className="glass-input w-64"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="glass-table text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2">Commercial</th>
                      <th className="text-right px-3 py-2">CA N</th>
                      <th className="text-right px-3 py-2">CA N-1</th>
                      <th className="text-right px-3 py-2">Delta</th>
                      <th className="text-right px-3 py-2">Delta %</th>
                      <th className="text-right px-3 py-2">Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialRows.map((row) => (
                      <tr key={row.commercial} className="cursor-pointer hover:bg-white/10" onClick={() => openCommercialDetail(row)}>
                        <td className="px-3 py-2 font-medium">{row.commercial}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{row.clients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-glass-primary font-semibold">Par adhérent</h2>
              <input
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Code Union ou raison sociale..."
                className="glass-input w-64"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="glass-table text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2">Code Union</th>
                    <th className="text-left px-3 py-2">Raison sociale</th>
                    <th className="text-left px-3 py-2">Commercial</th>
                    <th className="text-right px-3 py-2">CA N</th>
                    <th className="text-right px-3 py-2">CA N-1</th>
                    <th className="text-right px-3 py-2">Delta</th>
                    <th className="text-right px-3 py-2">Delta %</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((row) => (
                    <tr key={row.code_union} className="cursor-pointer hover:bg-white/10" onClick={() => openClientDetail(row)}>
                      <td className="px-3 py-2 font-medium">{row.code_union}</td>
                      <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                      <td className="px-3 py-2">{row.commercial || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedPlatform && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlatform(null)}>
          <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  Plateforme {selectedPlatform.platform}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedPlatform(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {platformLoading && <div className="text-glass-secondary">Chargement...</div>}
              {platformError && <div className="text-rose-300 text-sm">{platformError}</div>}
              {platformDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(platformDetail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(platformDetail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${platformDetail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(platformDetail.totals.delta)} • {formatPercent(platformDetail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">
                        Marques (global plateforme)
                        <span className="ml-2 text-xs text-glass-secondary">
                          {platformDetail.marques?.length || 0} — cliquez sur une marque pour voir les magasins
                        </span>
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Marque</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {platformDetail.marques?.length ? (
                            platformDetail.marques.map((row) => (
                              <tr
                                key={row.marque}
                                role="button"
                                tabIndex={0}
                                className={`cursor-pointer hover:bg-white/10 ${selectedMarqueInPlatform?.marque === row.marque ? 'bg-white/15 ring-1 ring-inset ring-white/30' : ''}`}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openMarqueDetail(row); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMarqueDetail(row); } }}
                              >
                                <td className="px-3 py-2 font-medium">{row.marque}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-3 text-center text-glass-secondary" colSpan={5}>
                                Aucune marque trouvée pour cette plateforme.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {selectedMarqueInPlatform && (
                      <div ref={magasinsBlockRef} className="p-4 border-t border-white/10 bg-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-glass-primary font-semibold">
                            Magasins qui contribuent à la marque « {selectedMarqueInPlatform.marque} »
                          </h4>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedMarqueInPlatform(null); setMarqueDetail(null); setMarqueDetailError(null); }}
                            className="text-xs text-glass-secondary hover:text-white px-2 py-1 rounded border border-white/20"
                          >
                            Fermer
                          </button>
                        </div>
                        {marqueDetailLoading && <p className="text-glass-secondary text-sm py-4">Chargement des magasins…</p>}
                        {marqueDetailError && <p className="text-rose-300 text-sm py-2">{marqueDetailError}</p>}
                        {!marqueDetailLoading && !marqueDetailError && marqueDetail && marqueDetail.magasins?.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="glass-table text-sm">
                              <thead>
                                <tr>
                                  <th className="text-left px-3 py-2">Code Union</th>
                                  <th className="text-left px-3 py-2">Raison sociale</th>
                                  <th className="text-left px-3 py-2">Commercial</th>
                                  <th className="text-right px-3 py-2">CA N</th>
                                  <th className="text-right px-3 py-2">CA N-1</th>
                                  <th className="text-right px-3 py-2">Delta</th>
                                  <th className="text-right px-3 py-2">Delta %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {marqueDetail.magasins.map((mag) => (
                                  <tr key={mag.code_union}>
                                    <td className="px-3 py-2 font-medium">{mag.code_union}</td>
                                    <td className="px-3 py-2 text-glass-secondary">{mag.raison_sociale || '-'}</td>
                                    <td className="px-3 py-2">{mag.commercial || '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(mag.ca)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(mag.ca_previous)}</td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                      <span className={getDeltaClass(mag.delta)}>{formatDelta(mag.delta)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={getDeltaPctClass(mag.delta_pct)}>{formatPercent(mag.delta_pct)}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!marqueDetailLoading && !marqueDetailError && marqueDetail && (!marqueDetail.magasins || marqueDetail.magasins.length === 0) && (
                          <p className="text-glass-secondary text-sm py-2">Aucun magasin trouvé pour cette marque (vérifiez les années N/N-1).</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Clients de la plateforme</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Code Union</th>
                            <th className="text-left px-3 py-2">Raison sociale</th>
                            <th className="text-left px-3 py-2">Commercial</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {platformDetail.clients.map((row) => (
                            <tr key={row.code_union}>
                              <td className="px-3 py-2 font-medium">{row.code_union}</td>
                              <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                              <td className="px-3 py-2">{row.commercial || '-'}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCommercial && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedCommercial(null)}>
          <div className="glass-modal max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  Commercial {selectedCommercial.commercial}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedCommercial(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {commercialLoading && <div className="text-glass-secondary">Chargement...</div>}
              {commercialError && <div className="text-rose-300 text-sm">{commercialError}</div>}
              {commercialDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(commercialDetail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(commercialDetail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${commercialDetail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(commercialDetail.totals.delta)} • {formatPercent(commercialDetail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Plateformes</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Plateforme</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercialDetail.platforms.map((row) => (
                            <tr key={row.platform}>
                              <td className="px-3 py-2 font-medium">{row.platform}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Clients</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Code Union</th>
                            <th className="text-left px-3 py-2">Raison sociale</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercialDetail.clients.map((row) => (
                            <tr key={row.code_union}>
                              <td className="px-3 py-2 font-medium">{row.code_union}</td>
                              <td className="px-3 py-2 text-glass-secondary">{row.raison_sociale || '-'}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.ca_previous)}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <span className={getDeltaClass(row.delta)}>{formatDelta(row.delta)}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={getDeltaPctClass(row.delta_pct)}>{formatPercent(row.delta_pct)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4" onClick={() => setSelectedClient(null)}>
          <div className="glass-modal max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {selectedClient.code_union} • {selectedClient.raison_sociale || 'Client'}
                </h3>
                <p className="text-sm text-glass-secondary">
                  {yearCurrent} vs {yearPrevious} {month ? `• Mois ${month}` : ''}
                </p>
              </div>
              <button className="glass-btn-icon" onClick={() => setSelectedClient(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 glass-scrollbar">
              {detailLoading && <div className="text-glass-secondary">Chargement...</div>}
              {detailError && <div className="text-rose-300 text-sm">{detailError}</div>}
              {detail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(detail.totals.current)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">CA N-1</div>
                      <div className="text-lg font-bold text-glass-primary">{formatCurrency(detail.totals.previous)}</div>
                    </div>
                    <div className="glass-card-dark p-4">
                      <div className="text-glass-secondary text-xs">Delta</div>
                      <div className={`text-lg font-bold ${detail.totals.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatDelta(detail.totals.delta)} • {formatPercent(detail.totals.delta_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h4 className="text-glass-primary font-semibold">Détail par fournisseur</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="glass-table text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-2">Fournisseur</th>
                            <th className="text-right px-3 py-2">CA N</th>
                            <th className="text-right px-3 py-2">CA N-1</th>
                            <th className="text-right px-3 py-2">Delta</th>
                            <th className="text-right px-3 py-2">Delta %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.breakdown.map((item) => {
                            const key = item.fournisseur
                            const expanded = expandedFournisseurs[key]
                            return (
                              <Fragment key={key}>
                                <tr key={key} className="cursor-pointer hover:bg-white/10" onClick={() => toggleFournisseur(key)}>
                                  <td className="px-3 py-2 font-medium flex items-center gap-2">
                                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    {item.fournisseur}
                                  </td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.ca)}</td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.ca_previous)}</td>
                                  <td className="px-3 py-2 text-right font-semibold">
                                    <span className={getDeltaClass(item.delta)}>{formatDelta(item.delta)}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={getDeltaPctClass(item.delta_pct)}>{formatPercent(item.delta_pct)}</span>
                                  </td>
                                </tr>
                                {expanded && item.children?.map((marque) => {
                                  const marqueKey = `${key}::${marque.marque}`
                                  const marqueExpanded = expandedMarques[marqueKey]
                                  return (
                                    <Fragment key={marqueKey}>
                                      <tr className="bg-white/5 cursor-pointer" onClick={() => toggleMarque(marqueKey)}>
                                        <td className="px-6 py-2 font-medium flex items-center gap-2">
                                          <ChevronDown className={`w-3 h-3 transition-transform ${marqueExpanded ? 'rotate-180' : ''}`} />
                                          {marque.marque}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(marque.ca)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(marque.ca_previous)}</td>
                                        <td className="px-3 py-2 text-right font-semibold">
                                          <span className={getDeltaClass(marque.delta)}>{formatDelta(marque.delta)}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <span className={getDeltaPctClass(marque.delta_pct)}>{formatPercent(marque.delta_pct)}</span>
                                        </td>
                                      </tr>
                                      {marqueExpanded && marque.children?.map((famille) => (
                                        <tr key={`${marqueKey}::${famille.famille}`} className="bg-white/5">
                                          <td className="px-10 py-2 text-glass-secondary">{famille.famille}</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(famille.ca)}</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(famille.ca_previous)}</td>
                                          <td className="px-3 py-2 text-right font-semibold">
                                            <span className={getDeltaClass(famille.delta)}>{formatDelta(famille.delta)}</span>
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <span className={getDeltaPctClass(famille.delta_pct)}>{formatPercent(famille.delta_pct)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </Fragment>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PureDataPage
