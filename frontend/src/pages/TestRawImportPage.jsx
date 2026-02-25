import { useState } from 'react'
import { uploadRawTest } from '../api/client'

function TestRawImportPage() {
  const [file, setFile] = useState(null)
  const [yearFilter, setYearFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  
  const handleTest = async () => {
    if (!file) {
      setError("Veuillez sélectionner un fichier")
      return
    }
    
    setLoading(true)
    setError(null)
    setReport(null)
    
    try {
      const data = await uploadRawTest(
        file,
        yearFilter === '' ? null : Number(yearFilter)
      )
      
      if (data.error) {
        setError(data.error)
        if (data.traceback) {
          console.error("Traceback:", data.traceback)
        }
      } else {
        setReport(data)
      }
    } catch (err) {
      setError(err.message || "Erreur lors de l'analyse du fichier")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-6 space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h1 className="text-2xl font-bold text-blue-900 mb-2">🧪 Test Import Fichier Brut</h1>
        <p className="text-blue-800">
          Cette page permet de tester l'import d'un fichier brut <strong>SANS modifier les données existantes</strong>.
          <br />
          Le test vérifie que chaque plateforme et chaque tri-partite sont bien reconnues.
        </p>
      </div>
      
      <div className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Fichier Excel brut</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">
            Le fichier doit contenir: Année, Code Union, Nom Client, Groupe Client, Fournisseur, Marque, Groupe FRS, Famille, Sous-famille, CA
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Année à filtrer</label>
          <input
            type="number"
            value={yearFilter}
            onChange={(e) => {
              const value = e.target.value
              setYearFilter(value === '' ? '' : Number(value))
            }}
            className="border rounded px-3 py-2 w-32"
            min="2020"
            max="2030"
          />
          <p className="text-xs text-gray-500 mt-1">
            Laisser vide pour détecter automatiquement l'année du fichier
          </p>
        </div>
        
        <button
          onClick={handleTest}
          disabled={!file || loading}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "⏳ Analyse en cours..." : "🔍 Analyser le fichier"}
        </button>
      </div>
      
      {error && (
        <div className="card p-4 bg-red-50 border-red-200">
          <h3 className="font-bold text-red-800 mb-2">❌ Erreur</h3>
          <pre className="text-sm text-red-600 whitespace-pre-wrap">{error}</pre>
        </div>
      )}
      
      {report && (
        <>
          {report.file_format === "large" && (
            <div className="card p-6 bg-blue-50 border-blue-200">
              <h2 className="text-xl font-bold mb-4 text-blue-900">ℹ️ Fichier Format Large détecté</h2>
              <div className="space-y-3">
                <p className="text-blue-800">
                  <strong>Ce fichier est au format LARGE</strong> - il a déjà été calculé par le script AppScript.
                  Il contient les colonnes calculées comme "CA RFA GLOBALE ACR", "CA RFA NK", etc.
                </p>
                <div className="bg-white p-4 rounded border border-blue-300">
                  <p className="font-semibold mb-2">Pour tester le calcul depuis le fichier BRUT :</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Ouvre ton Google Sheets avec le script AppScript</li>
                    <li>Va sur la feuille <strong>"global New"</strong> (le fichier brut d'entrée)</li>
                    <li>Exporte cette feuille en Excel</li>
                    <li>Upload ce fichier brut ici</li>
                  </ol>
                  <p className="text-xs text-gray-600 mt-3">
                    Le fichier brut doit contenir : Année, Code Union, Nom Client, Groupe Client, Fournisseur, Marque, Groupe FRS, Famille, Sous-famille, CA
                  </p>
                </div>
              </div>
            </div>
          )}
          <ValidationReport report={report} />
        </>
      )}
    </div>
  )
}

function ValidationReport({ report }) {
  const [expandedSection, setExpandedSection] = useState(null)
  
  return (
    <div className="space-y-6">
      {/* Méthode de mapping */}
      {report.mapping_method && (
        <div className={`card p-4 ${
          report.mapping_method === 'position' ? 'bg-blue-50 border-blue-200' : 
          report.mapping_method === 'mixed' ? 'bg-yellow-50 border-yellow-200' : 
          'bg-green-50 border-green-200'
        }`}>
          <h3 className="font-bold mb-2">
            {report.mapping_method === 'position' ? '📍' : 
             report.mapping_method === 'mixed' ? '🔀' : '✅'} 
            Méthode de mapping utilisée
          </h3>
          <p className="text-sm">
            <strong>{report.mapping_method_description}</strong>
            {report.mapping_method === 'position' && (
              <span className="block mt-1 text-xs">
                Les colonnes ont été lues par position (comme dans AppScript) : 
                Colonne 1=Année, 2=Code Union, 3=Nom Client, 4=Groupe Client, 6=Fournisseur, 7=Marque, 8=Groupe FRS, 9=Famille, 10=Sous-famille, 11=CA
              </span>
            )}
          </p>
        </div>
      )}
      
      {/* Colonnes brutes trouvées */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">📄 Colonnes trouvées dans le fichier</h2>
        <p className="text-sm text-gray-600 mb-4">
          Liste de toutes les colonnes présentes dans votre fichier Excel.
        </p>
        <div className="bg-gray-50 p-4 rounded border">
          <div className="flex flex-wrap gap-2">
            {report.columns_validation?.all_raw_columns?.map((col, idx) => (
              <span
                key={idx}
                className={`px-3 py-1 rounded text-sm font-mono ${
                  report.columns_validation?.mapped_columns &&
                  Object.values(report.columns_validation.mapped_columns).includes(col)
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : "bg-yellow-100 text-yellow-800 border border-yellow-300"
                }`}
                title={
                  report.columns_validation?.mapped_columns &&
                  Object.values(report.columns_validation.mapped_columns).includes(col)
                    ? "Colonne reconnue"
                    : "Colonne non reconnue"
                }
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>
      
      {/* Diagnostic des colonnes */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">📋 Diagnostic des Colonnes</h2>
        <p className="text-sm text-gray-600 mb-4">
          Vérification que toutes les colonnes nécessaires sont bien reconnues dans le fichier.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Champ attendu</th>
                <th className="px-4 py-2 text-left">Colonne Excel trouvée</th>
                <th className="px-4 py-2 text-center">Statut</th>
                <th className="px-4 py-2 text-left">Aliases attendus</th>
              </tr>
            </thead>
            <tbody>
              {report.columns_validation?.columns_diagnostic?.map((col) => (
                <tr key={col.field} className="border-b">
                  <td className="px-4 py-2 font-medium">{col.label}</td>
                  <td className="px-4 py-2">
                    {col.excel_column ? (
                      <span className="text-green-700 font-mono">{col.excel_column}</span>
                    ) : (
                      <span className="text-red-600 italic">Non trouvée</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      col.found ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {col.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {col.expected_aliases?.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {report.columns_validation?.unmapped_columns?.length > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <h3 className="font-bold text-yellow-800 mb-2">⚠️ Colonnes non reconnues</h3>
            <ul className="space-y-1">
              {report.columns_validation.unmapped_columns.map((col, idx) => (
                <li key={idx} className="text-sm text-yellow-700">
                  <span className="font-mono">{col.column_name}</span>
                  {col.suggestion && (
                    <span className="ml-2 text-gray-600">→ Suggestion: {col.suggestion}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Diagnostic du filtrage */}
      {report.load_statistics && (
        <div className="card p-6 bg-red-50 border-red-200">
          <h2 className="text-xl font-bold mb-4 text-red-800">🔍 Diagnostic du Filtrage des Lignes</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded">
                <div className="text-sm text-gray-600">Total lignes dans fichier</div>
                <div className="text-2xl font-bold">{report.load_statistics.total_lignes || 0}</div>
              </div>
              <div className="bg-white p-3 rounded">
                <div className="text-sm text-gray-600">Lignes sans Code Union</div>
                <div className="text-2xl font-bold text-red-600">{report.load_statistics.lignes_sans_code_union || 0}</div>
              </div>
              <div className="bg-white p-3 rounded">
                <div className="text-sm text-gray-600">Lignes avec CA = 0</div>
                <div className="text-2xl font-bold text-orange-600">{report.load_statistics.lignes_ca_zero || 0}</div>
              </div>
              <div className="bg-white p-3 rounded">
                <div className="text-sm text-gray-600">Lignes valides</div>
                <div className="text-2xl font-bold text-green-600">{report.load_statistics.lignes_valides || 0}</div>
              </div>
            </div>
            
            {report.years_in_file && report.years_in_file.length > 0 && (
              <div className="bg-white p-3 rounded">
                <div className="text-sm font-medium mb-2">Années trouvées dans le fichier :</div>
                <div className="flex flex-wrap gap-2">
                  {report.years_in_file.map((year, idx) => (
                    <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                      {year}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  Année filtrée : <strong>{report.summary?.annee_filtree || 'Non spécifiée'}</strong>
                </div>
              </div>
            )}
            
            {report.load_statistics.exemples_lignes_rejetees && report.load_statistics.exemples_lignes_rejetees.length > 0 && (
              <div className="bg-white p-3 rounded">
                <div className="text-sm font-medium mb-2">Exemples de lignes rejetées :</div>
                <div className="space-y-2">
                  {report.load_statistics.exemples_lignes_rejetees.map((ex, idx) => (
                    <div key={idx} className="text-xs bg-gray-50 p-2 rounded">
                      <span className="font-bold text-red-600">{ex.reason}</span> - 
                      Code Union: "{ex.code_union || '(vide)'}", 
                      CA: {ex.ca}, 
                      Année: "{ex.annee || '(vide)'}", 
                      Fournisseur: "{ex.fournisseur || '(vide)'}"
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {report.load_statistics.exemples_ca && report.load_statistics.exemples_ca.length > 0 && (
              <div className="bg-white p-3 rounded">
                <div className="text-sm font-medium mb-2">Exemples de valeurs CA trouvées :</div>
                <div className="space-y-1">
                  {report.load_statistics.exemples_ca.map((ca, idx) => (
                    <div key={idx} className="text-xs">
                      Valeur brute: <span className="font-mono">{String(ca.raw)}</span> → 
                      Nettoyée: <span className="font-mono font-bold">{ca.cleaned}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {report.load_statistics.exemples_lignes_brutes && report.load_statistics.exemples_lignes_brutes.length > 0 && (
              <div className="bg-white p-3 rounded">
                <div className="text-sm font-medium mb-2">Exemples de lignes brutes (premières lignes du fichier) :</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1 text-left">Année</th>
                        <th className="px-2 py-1 text-left">Code Union</th>
                        <th className="px-2 py-1 text-left">Nom Client</th>
                        <th className="px-2 py-1 text-left">Fournisseur</th>
                        <th className="px-2 py-1 text-left">CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.load_statistics.exemples_lignes_brutes.map((ligne, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="px-2 py-1 font-mono">{ligne.annee || '(vide)'}</td>
                          <td className="px-2 py-1 font-mono">{ligne.code_union || '(vide)'}</td>
                          <td className="px-2 py-1">{ligne.nom_client || '(vide)'}</td>
                          <td className="px-2 py-1">{ligne.fournisseur || '(vide)'}</td>
                          <td className="px-2 py-1 font-mono">{ligne.ca || '(vide)'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Résumé */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">📊 Résumé de l'analyse</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Lignes brutes</div>
            <div className="text-2xl font-bold text-blue-700">{report.summary?.total_lignes_brutes || 0}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Lignes traitées</div>
            <div className="text-2xl font-bold text-green-700">{report.summary?.total_lignes_traitees || 0}</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Clients trouvés</div>
            <div className="text-2xl font-bold text-purple-700">{report.summary?.total_clients_trouves || 0}</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Colonnes reconnues</div>
            <div className="text-2xl font-bold text-orange-700">{report.summary?.colonnes_reconnues || 0}/{report.summary?.colonnes_totales || 0}</div>
          </div>
        </div>
        
        {report.summary?.fournisseurs_detectes && report.summary.fournisseurs_detectes.length > 0 && (
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
            <div className="text-sm font-semibold text-indigo-800 mb-2">
              🔍 Fournisseurs détectés automatiquement ({report.summary.fournisseurs_detectes.length})
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {report.summary.fournisseurs_detectes.map((frs, idx) => (
                <span key={idx} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded text-sm font-medium">
                  {frs} → GLOBAL_{frs}
                </span>
              ))}
            </div>
            <div className="text-xs text-indigo-700 mb-2">
              ✅ {report.summary.regles_globales_creees || 0} règles GLOBALES créées automatiquement à partir de la colonne "Fournisseur"
            </div>
            
            {/* Tableau des CA par fournisseur */}
            {report.suppliers_totals && Object.keys(report.suppliers_totals).length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-indigo-200 text-indigo-900">
                      <th className="px-2 py-1 text-left">Fournisseur</th>
                      <th className="px-2 py-1 text-right">CA Total</th>
                      <th className="px-2 py-1 text-right">Lignes</th>
                      <th className="px-2 py-1 text-right">Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.suppliers_totals)
                      .sort((a, b) => b[1].ca - a[1].ca)
                      .slice(0, 15)
                      .map(([frs, data]) => (
                        <tr key={frs} className="border-b border-indigo-100">
                          <td className="px-2 py-1 font-medium">{frs}</td>
                          <td className="px-2 py-1 text-right">{formatAmount(data.ca)}</td>
                          <td className="px-2 py-1 text-right">{data.lignes}</td>
                          <td className="px-2 py-1 text-right">{data.clients}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
                {Object.keys(report.suppliers_totals).length > 15 && (
                  <div className="text-xs text-indigo-600 mt-1">
                    ... et {Object.keys(report.suppliers_totals).length - 15} autres fournisseurs
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Validation des plateformes globales - seulement pour format brut */}
      {report.file_format !== "large" && (
        <>
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">🌐 Validation des Plateformes Globales</h2>
        <p className="text-sm text-gray-600 mb-4">
          Les règles GLOBALES sont créées automatiquement à partir des fournisseurs détectés dans la colonne "Fournisseur".
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Plateforme</th>
                <th className="px-4 py-2 text-right">CA Total</th>
                <th className="px-4 py-2 text-right">Lignes matchées</th>
                <th className="px-4 py-2 text-right">Clients avec CA</th>
                <th className="px-4 py-2 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.platforms_validation || {}).map(([platform, data]) => (
                <tr key={platform} className="border-b">
                  <td className="px-4 py-2 font-medium">{platform}</td>
                  <td className="px-4 py-2 text-right">{formatAmount(data.total_ca)}</td>
                  <td className="px-4 py-2 text-right">{data.lignes_matchées || 0}</td>
                  <td className="px-4 py-2 text-right">{data.clients_with_ca}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-sm ${
                      data.status.includes("✅") ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {data.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Validation des tri-partites */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">🔗 Validation des Tri-partites</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Tri-partite</th>
                <th className="px-4 py-2 text-right">CA Total</th>
                <th className="px-4 py-2 text-right">Lignes matchées</th>
                <th className="px-4 py-2 text-right">Clients avec CA</th>
                <th className="px-4 py-2 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.tripartites_validation || {}).map(([tri, data]) => (
                <tr key={tri} className="border-b">
                  <td className="px-4 py-2 font-medium">{tri}</td>
                  <td className="px-4 py-2 text-right">{formatAmount(data.total_ca)}</td>
                  <td className="px-4 py-2 text-right">{data.lignes_matchées}</td>
                  <td className="px-4 py-2 text-right">{data.clients_with_ca}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      data.status.includes("✅") ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {data.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Statistiques des règles */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">📋 Statistiques détaillées des règles RFA</h2>
        <button
          onClick={() => setExpandedSection(expandedSection === 'rules' ? null : 'rules')}
          className="text-blue-600 hover:text-blue-800 mb-2"
        >
          {expandedSection === 'rules' ? '▼ Masquer' : '▶ Afficher'} les détails
        </button>
        {expandedSection === 'rules' && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">Règle</th>
                  <th className="px-4 py-2 text-right">Lignes matchées</th>
                  <th className="px-4 py-2 text-right">CA total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.rules_statistics || {}).map(([key, stats]) => (
                  <tr key={key} className="border-b">
                    <td className="px-4 py-2 font-medium">{key}</td>
                    <td className="px-4 py-2 text-right">{stats.matched}</td>
                    <td className="px-4 py-2 text-right">{formatAmount(stats.ca_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
      
      {/* Top clients */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">🏆 Top 10 Clients</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Code Union</th>
                <th className="px-4 py-2 text-left">Nom</th>
                <th className="px-4 py-2 text-left">Groupe</th>
                <th className="px-4 py-2 text-right">Total Global</th>
                <th className="px-4 py-2 text-right">Total Tri</th>
                <th className="px-4 py-2 text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {report.clients_summary?.map((client) => (
                <tr key={client.code_union} className="border-b">
                  <td className="px-4 py-2 font-medium">{client.code_union}</td>
                  <td className="px-4 py-2">{client.nom_client || '-'}</td>
                  <td className="px-4 py-2">{client.groupe_client || '-'}</td>
                  <td className="px-4 py-2 text-right">{formatAmount(client.global_total)}</td>
                  <td className="px-4 py-2 text-right">{formatAmount(client.tri_total)}</td>
                  <td className="px-4 py-2 text-right font-bold">{formatAmount(client.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Avertissements */}
      {report.warnings && report.warnings.length > 0 && (
        <div className="card p-4 bg-yellow-50 border-yellow-200">
          <h3 className="font-bold text-yellow-800 mb-2">⚠️ Avertissements</h3>
          <ul className="list-disc list-inside space-y-1">
            {report.warnings.map((warn, idx) => (
              <li key={idx} className="text-yellow-700">{warn}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Logs de debug (optionnel) */}
      {report.debug_log && report.debug_log.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xl font-bold mb-4">🔍 Logs de debug (100 premières lignes)</h2>
          <button
            onClick={() => setExpandedSection(expandedSection === 'debug' ? null : 'debug')}
            className="text-blue-600 hover:text-blue-800 mb-2"
          >
            {expandedSection === 'debug' ? '▼ Masquer' : '▶ Afficher'} les logs
          </button>
          {expandedSection === 'debug' && (
            <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-xs overflow-auto max-h-96">
              {report.debug_log.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatAmount(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount || 0)
}

export default TestRawImportPage
