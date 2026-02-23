import { useState, useRef, useEffect } from 'react'
import { Upload, FileSpreadsheet, Check, X, Loader2, FolderOpen } from 'lucide-react'
import { uploadExcel } from '../api/client'

function UploadPage({ onUploadSuccess }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const fileInputRef = useRef(null)

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass-card p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-glow-blue">
            <FileSpreadsheet className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Import Excel</h2>
            <p className="text-sm text-glass-secondary">Importez votre fichier Excel pour commencer</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Upload */}
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-3">
              Fichier Excel (.xlsx)
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
