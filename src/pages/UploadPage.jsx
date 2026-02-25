import { useState, useRef, useEffect } from 'react'
import { Upload, FileSpreadsheet, Check, X, Loader2, FolderOpen, RefreshCw, Link2 } from 'lucide-react'
import { uploadExcel, getRfaSheetsConfig, setRfaSheetsConfig, refreshRfaSheets } from '../api/client'

function UploadPage({ onUploadSuccess }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const fileInputRef = useRef(null)

  const [sheetsConfig, setSheetsConfig] = useState({ spreadsheet_id: '', sheet_name: '', configured: false })
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState('')
  const [sheetsSheetName, setSheetsSheetName] = useState('')
  const [sheetsSaving, setSheetsSaving] = useState(false)
  const [sheetsRefreshing, setSheetsRefreshing] = useState(false)
  const [sheetsError, setSheetsError] = useState(null)

  useEffect(() => {
    getRfaSheetsConfig()
      .then((c) => {
        setSheetsConfig(c)
        setSheetsSpreadsheetId(c.spreadsheet_id || '')
        setSheetsSheetName(c.sheet_name || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    console.log('State file a changé:', file ? file.name : 'null')
  }, [file])

  const handleFileChange = (e) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      setFile(null)
      setError('Aucun fichier sélectionné')
      return
    }

    const selectedFile = files[0]
    const fileName = selectedFile.name.toLowerCase()
    const isValidExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    if (!isValidExtension) {
      setError('Le fichier doit être un .xlsx ou .xls')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setFile(selectedFile)
    setError(null)
    setUploadResult(null)
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier')
      return
    }

    setUploading(true)
    setError(null)
    setUploadResult(null)

    try {
      const result = await uploadExcel(file)

      if (!result || !result.import_id) {
        throw new Error('Réponse invalide du serveur: import_id manquant')
      }

      setUploadResult(result)

      if (onUploadSuccess) {
        onUploadSuccess(result.import_id)
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erreur lors de l\'upload'
      setError(errorMsg)
      setUploadResult(null)
    } finally {
      setUploading(false)
    }
  }

  const handleSheetsSaveConfig = async () => {
    setSheetsSaving(true)
    setSheetsError(null)
    try {
      await setRfaSheetsConfig(sheetsSpreadsheetId.trim(), sheetsSheetName.trim())
      setSheetsConfig({ ...sheetsConfig, spreadsheet_id: sheetsSpreadsheetId.trim(), sheet_name: sheetsSheetName.trim(), configured: true })
    } catch (e) {
      setSheetsError(e?.response?.data?.detail || e.message || 'Erreur')
    } finally {
      setSheetsSaving(false)
    }
  }

  const handleSheetsRefresh = async () => {
    const id = sheetsSpreadsheetId.trim()
    if (!id) {
      setSheetsError('Saisissez l’ID du tableur Google.')
      return
    }
    setSheetsRefreshing(true)
    setSheetsError(null)
    try {
      const result = await refreshRfaSheets(id, sheetsSheetName.trim() || null)
      if (onUploadSuccess) onUploadSuccess('sheets_live')
      setSheetsConfig({ ...sheetsConfig, spreadsheet_id: id, sheet_name: sheetsSheetName.trim(), configured: true })
      setUploadResult(result)
    } catch (e) {
      setSheetsError(e?.response?.data?.detail || e.message || 'Erreur lors de la mise à jour')
    } finally {
      setSheetsRefreshing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass-card p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-glow-blue">
            <FileSpreadsheet className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Import & source RFA</h2>
            <p className="text-sm text-glass-secondary">Feuille Google Sheets connectée ou import Excel</p>
          </div>
        </div>

        {/* Feuille RFA connectée (source pour tous) */}
        <div className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-400" />
            Feuille RFA connectée
          </h3>
          <p className="text-sm text-glass-secondary">
            Une fois configurée, les données sont disponibles pour tous sans import. Mettez à jour quand la feuille a changé (ex. une fois par mois).
          </p>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-medium text-glass-secondary mb-1">ID du tableur Google</label>
              <input
                type="text"
                value={sheetsSpreadsheetId}
                onChange={(e) => setSheetsSpreadsheetId(e.target.value)}
                placeholder="ex: 16Hog9Dc43vwj_JmjRBLlIPaYoHoxLKVB7eSrBVXOLM0"
                className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-400/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-glass-secondary mb-1">Nom de la feuille (optionnel)</label>
              <input
                type="text"
                value={sheetsSheetName}
                onChange={(e) => setSheetsSheetName(e.target.value)}
                placeholder="ex: RFA - Format Large V48"
                className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-emerald-400/50"
              />
            </div>
          </div>
          {sheetsError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{sheetsError}</div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSheetsSaveConfig}
              disabled={sheetsSaving || !sheetsSpreadsheetId.trim()}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium disabled:opacity-50"
            >
              {sheetsSaving ? 'Enregistrement…' : 'Enregistrer la config'}
            </button>
            <button
              type="button"
              onClick={handleSheetsRefresh}
              disabled={sheetsRefreshing || !sheetsSpreadsheetId.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sheetsRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Mettre à jour les données depuis le Sheet
            </button>
          </div>
          <p className="text-white/50 text-xs">
            Saisissez l’ID du tableur et le nom de la feuille (optionnel), puis cliquez sur « Mettre à jour ». La config est enregistrée automatiquement.
          </p>
        </div>

        <div className="space-y-6">
          {/* Upload Excel (optionnel) */}
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-3">
              Ou importer un fichier Excel (.xlsx)
            </label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                id="file-input"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="glass-card-dark flex items-center justify-center w-full px-6 py-8 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-blue-400/50 hover:bg-white/5 transition-all"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <FolderOpen className="w-8 h-8 text-blue-400" />
                  </div>
                  <span className="text-base font-medium text-white">
                    {file ? file.name : 'Cliquez pour sélectionner un fichier'}
                  </span>
                  <span className="text-xs text-glass-muted">Format accepté: .xlsx, .xls</span>
                </div>
              </div>
              {file && (
                <div className="mt-4 p-4 glass-card-dark border-emerald-500/30 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-white font-medium">{file.name}</span>
                    <span className="text-xs text-glass-muted ml-2">({(file.size / 1024).toFixed(2)} KB)</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ''
                      }
                    }}
                    className="glass-btn-icon text-red-400 hover:text-red-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="glass-card-dark p-4 border-red-500/30 text-red-300 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <X className="w-4 h-4 text-red-400" />
              </div>
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`w-full glass-btn-primary py-4 text-base flex items-center justify-center gap-3 ${
              !file || uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Import en cours...</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>Importer</span>
              </>
            )}
          </button>

          {/* Résultat */}
          {uploadResult && (
            <div className="mt-6 space-y-4 animate-slide-in-up">
              <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-500/30 to-teal-500/30 border border-emerald-400/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-glow-emerald">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-xl text-white">Import réussi !</p>
                    <p className="text-sm text-emerald-200 mt-1">
                      {uploadResult.nb_lignes} ligne(s) importée(s)
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                  Colonnes reconnues ({Object.keys(uploadResult.colonnes_reconnues).length})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(uploadResult.colonnes_reconnues).map(([key, col]) => (
                    <div key={key} className="flex items-center gap-2 p-3 glass-card-dark rounded-lg">
                      <span className="text-xs font-bold text-blue-400">{key}:</span>
                      <span className="text-xs text-glass-secondary truncate">{col}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UploadPage
