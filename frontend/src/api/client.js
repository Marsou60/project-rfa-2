import axios from 'axios'

// Détection de l'environnement :
// - Tauri : VITE_API_URL si défini (backend cloud), sinon localhost:8001 (backend local = meilleures perfs)
// - Dev web local : proxy Vite → localhost:8001
// - Production Vercel : Railway backend (VITE_API_URL)
const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  if (isTauri) return 'http://localhost:8001/api'
  return '/api'
}

const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor pour ajouter le token d'authentification
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor pour gérer les erreurs 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalide ou expiré
      localStorage.removeItem('authToken')
      localStorage.removeItem('authUser')
      // Ne pas rediriger automatiquement, laisser le composant gérer
    }
    return Promise.reject(error)
  }
)

export const uploadExcel = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  
  return response.data
}

// ── RFA Sheets (feuille connectée = source de données pour tous) ─────────────────
export const getRfaSheetsConfig = async () => {
  const response = await api.get('/rfa-sheets/config')
  return response.data
}

export const setRfaSheetsConfig = async (spreadsheetId, sheetName) => {
  const response = await api.put('/rfa-sheets/config', { spreadsheet_id: spreadsheetId, sheet_name: sheetName || '' })
  return response.data
}

export const refreshRfaSheets = async (spreadsheetId = null, sheetName = null) => {
  const body = spreadsheetId ? { spreadsheet_id: spreadsheetId, sheet_name: sheetName || '' } : {}
  const response = await api.post('/rfa-sheets/refresh', body)
  return response.data
}

export const getRfaSheetsCurrent = async () => {
  const response = await api.get('/rfa-sheets/current')
  return response.data
}

export const getEntities = async (importId, mode = 'client', withRfa = false) => {
  const response = await api.get(`/imports/${importId}/entities`, {
    params: { mode, with_rfa: withRfa }
  })
  return response.data
}

export const getEntityDetail = async (importId, mode, id, contractId = null) => {
  const params = { mode, id }
  if (contractId) {
    params.contract_id = contractId
  }
  const response = await api.get(`/imports/${importId}/entity`, { params })
  return response.data
}

/** Fiche complète en 1 requête : entity + rules + overrides (plus rapide que 3 appels). */
export const getEntityFull = async (importId, mode, id, contractId = null) => {
  const params = { mode, id }
  if (contractId) params.contract_id = contractId
  const response = await api.get(`/imports/${importId}/entity/full`, { params })
  return response.data
}

export const getUnionEntity = async (importId) => {
  const response = await api.get(`/imports/${importId}/union`)
  return response.data
}

// ==================== CONTRATS ====================

export const getContracts = async () => {
  const response = await api.get('/contracts')
  return response.data
}

export const getContract = async (contractId) => {
  const response = await api.get(`/contracts/${contractId}`)
  return response.data
}

export const getContractRules = async (contractId) => {
  const response = await api.get(`/contracts/${contractId}/rules`)
  return response.data
}

/** Liste de toutes les clés tri-partites connues (key, label) pour l’éditeur de contrat */
export const getAvailableTriFields = async () => {
  const response = await api.get('/contracts/available-tri-fields')
  return response.data
}

/** Crée une nouvelle règle sur un contrat (ex. tri-partite pas encore configurée) */
export const createContractRule = async (contractId, body) => {
  const response = await api.post(`/contracts/${contractId}/rules`, body)
  return response.data
}

export const createContract = async (contract) => {
  const response = await api.post('/contracts', contract)
  return response.data
}

export const updateContract = async (contractId, contract) => {
  const response = await api.put(`/contracts/${contractId}`, contract)
  return response.data
}

export const duplicateContract = async (contractId) => {
  const response = await api.post(`/contracts/${contractId}/duplicate`)
  return response.data
}

export const setDefaultContract = async (contractId) => {
  const response = await api.put(`/contracts/${contractId}/set-default`)
  return response.data
}

export const toggleActiveContract = async (contractId) => {
  const response = await api.put(`/contracts/${contractId}/toggle-active`)
  return response.data
}

export const deleteContract = async (contractId) => {
  const response = await api.delete(`/contracts/${contractId}`)
  return response.data
}

export const importContractJson = async (file, mode = 'merge') => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post(`/contracts/import-json?mode=${mode}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

// ==================== RÈGLES ====================

export const updateContractRule = async (contractId, ruleId, rule) => {
  const response = await api.put(`/contracts/${contractId}/rules/${ruleId}`, rule)
  return response.data
}

// ==================== AFFECTATIONS ====================

export const getAssignments = async () => {
  const response = await api.get('/assignments')
  return response.data
}

export const createAssignment = async (assignment) => {
  const response = await api.post('/assignments', assignment)
  return response.data
}

export const deleteAssignment = async (assignmentId) => {
  const response = await api.delete(`/assignments/${assignmentId}`)
  return response.data
}

// ==================== OVERRIDES (Taux personnalises par client ou groupe) ====================

export const getOverrides = async (targetType = null, targetValue = null) => {
  const params = {}
  if (targetType) params.target_type = targetType
  if (targetValue) params.target_value = targetValue
  const response = await api.get('/overrides', { params })
  return response.data
}

export const getEntityOverrides = async (targetType, targetValue) => {
  const response = await api.get(`/overrides/entity/${targetType}/${encodeURIComponent(targetValue)}`)
  return response.data
}

export const createOverride = async (override) => {
  const response = await api.post('/overrides', override)
  return response.data
}

export const updateOverride = async (overrideId, override) => {
  const response = await api.put(`/overrides/${overrideId}`, override)
  return response.data
}

export const deleteOverride = async (overrideId) => {
  const response = await api.delete(`/overrides/${overrideId}`)
  return response.data
}

export const deleteAllEntityOverrides = async (targetType, targetValue) => {
  const response = await api.delete(`/overrides/entity/${targetType}/${encodeURIComponent(targetValue)}`)
  return response.data
}

// ==================== PUBLICITES ====================

export const getAds = async ({ activeOnly = true } = {}) => {
  const response = await api.get('/ads', {
    params: { active_only: activeOnly }
  })
  return response.data
}

export const createAd = async (ad) => {
  const response = await api.post('/ads', ad)
  return response.data
}

export const updateAd = async (adId, ad) => {
  const response = await api.put(`/ads/${adId}`, ad)
  return response.data
}

export const deleteAd = async (adId) => {
  const response = await api.delete(`/ads/${adId}`)
  return response.data
}

// ==================== EXPORT PDF ====================

function uint8IsPdf(u8) {
  return (
    u8.byteLength >= 4 &&
    u8[0] === 0x25 &&
    u8[1] === 0x50 &&
    u8[2] === 0x44 &&
    u8[3] === 0x46
  )
}

/** Décode le corps JSON FastAPI { detail } depuis une réponse brute (Tauri / Axios). */
function parseFastApiErrorBodyText(text) {
  if (!text || !String(text).trim()) return null
  try {
    const j = JSON.parse(String(text).trim())
    if (j.detail == null) return null
    return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
  } catch {
    return null
  }
}

export const exportEntityPdf = async (importId, mode, entityId, contractId = null, cotisationOpts = undefined) => {
  const path = `/imports/${encodeURIComponent(String(importId))}/entity/pdf`
  const body = {
    mode: String(mode),
    entity_id: String(entityId),
  }
  if (contractId != null && contractId !== '') {
    const n = Number(contractId)
    if (Number.isFinite(n)) body.contract_id = n
  }
  if ((mode === 'client' || mode === 'group') && cotisationOpts && Number(cotisationOpts.amount) > 0) {
    const amt = Number(cotisationOpts.amount)
    if (Number.isFinite(amt) && amt > 0) {
      body.cotisation_amount = amt
      body.cotisation_facturee = Boolean(cotisationOpts.facturee)
      body.cotisation_deduite = Boolean(cotisationOpts.deduite)
      body.cotisation_mode = body.cotisation_facturee && body.cotisation_deduite ? 'facture' : 'offerte'
    }
  }
  let response
  try {
    // POST + JSON : les query GET étaient parfois tronquées / mal passées (Tauri, proxies) — cotisation absente du PDF
    console.debug('[exportEntityPdf] POST', path, body)
    response = await api.post(path, body, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
  } catch (err) {
    const res = err.response
    const msg = err.message || 'Réseau indisponible'
    if (res?.data instanceof ArrayBuffer) {
      const t = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(res.data))
      const d = parseFastApiErrorBodyText(t)
      throw new Error(d || msg)
    }
    throw new Error(msg)
  }

  const buf = response.data
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(0)

  if (response.status === 200 && uint8IsPdf(u8)) {
    const blob = new Blob([buf], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const entityLabel = String(entityId || 'entity').replace(/ /g, '_')
    link.setAttribute('download', `RFA_${entityLabel}_${mode}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    return
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(u8)
  let detail = parseFastApiErrorBodyText(text)
  if (!detail) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 280)
    detail =
      preview ||
      `Réponse HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} (corps vide ou non JSON)`
  }
  throw new Error(detail)
}

// ── Cotisation Union (stockée en DB — partagée browser / Tauri / prod) ───────────

export const getCotisations = async (entityType = null) => {
  const params = entityType ? { entity_type: entityType } : {}
  const response = await api.get('/cotisations', { params })
  return response.data // [{entity_key, entity_type, amount, facturee, deduite}, ...]
}

export const upsertCotisation = async (entityType, entityKey, data) => {
  const key = String(entityKey || '').trim().toUpperCase()
  const response = await api.put(
    `/cotisations/${encodeURIComponent(entityType)}/${encodeURIComponent(key)}`,
    { amount: data.amount, facturee: Boolean(data.facturee), deduite: Boolean(data.deduite) },
  )
  return response.data
}

export const deleteCotisation = async (entityType, entityKey) => {
  const key = String(entityKey || '').trim().toUpperCase()
  const response = await api.delete(
    `/cotisations/${encodeURIComponent(entityType)}/${encodeURIComponent(key)}`,
  )
  return response.data
}

export const exportUnionPdf = async (importId) => {
  const response = await api.get(`/imports/${importId}/union/export-pdf`, { responseType: 'blob' })
  return response.data
}

export const exportUnionExcel = async (importId) => {
  const response = await api.get(`/imports/${importId}/union/export-excel`, { responseType: 'blob' })
  return response.data
}

// ==================== RÉCAPITULATIF GLOBAL ====================

export const getGlobalRecap = async (importId, dissolvedGroups = []) => {
  const params = {}
  if (dissolvedGroups && dissolvedGroups.length > 0) {
    params.dissolved_groups = dissolvedGroups.join(',')
  }
  const response = await api.get(`/imports/${importId}/recap`, { params })
  return response.data
}

// ==================== AUTHENTIFICATION ====================

export const login = async (username, password) => {
  const response = await api.post('/auth/login', { username, password })
  return response.data
}

export const logout = async () => {
  const response = await api.post('/auth/logout')
  return response.data
}

export const getMe = async (token = null) => {
  const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  const response = await api.get('/auth/me', config)
  return response.data
}

// ==================== UTILISATEURS (Admin) ====================

export const getUsers = async () => {
  const response = await api.get('/users')
  return response.data
}

export const createUser = async (user) => {
  const response = await api.post('/users', user)
  return response.data
}

export const updateUser = async (userId, user) => {
  const response = await api.put(`/users/${userId}`, user)
  return response.data
}

export const deleteUser = async (userId) => {
  const response = await api.delete(`/users/${userId}`)
  return response.data
}

// ==================== UPLOAD IMAGES ====================

export const uploadAdImage = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/uploads/ads', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  
  return response.data
}

export const getUploadUrl = (filename) => {
  return `${API_BASE_URL}/uploads/ads/${filename}`
}

// ==================== AVATARS ====================

export const uploadAvatar = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/uploads/avatars', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  
  return response.data
}

// ==================== LOGOS FOURNISSEURS ====================

export const getSupplierLogos = async () => {
  const response = await api.get('/supplier-logos')
  return response.data
}

export const uploadSupplierLogo = async (supplierKey, supplierName, file) => {
  const formData = new FormData()
  formData.append('supplier_key', supplierKey)
  formData.append('supplier_name', supplierName)
  formData.append('file', file)
  const response = await api.post('/supplier-logos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export const deleteSupplierLogo = async (logoId) => {
  const response = await api.delete(`/supplier-logos/${logoId}`)
  return response.data
}

// ==================== LOGO ====================

export const uploadLogo = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/uploads/logos', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  
  return response.data
}

// ==================== SETTINGS ====================

export const getSetting = async (key) => {
  const response = await api.get(`/settings/${key}`)
  return response.data
}

export const setSetting = async (key, value) => {
  const response = await api.put(`/settings/${key}`, null, {
    params: { value }
  })
  return response.data
}

export const getSettings = async () => {
  const response = await api.get('/settings')
  return response.data
}

// Helper pour construire les URLs d'images
export const getImageUrl = (path) => {
  if (!path) return null
  if (path.startsWith('http')) return path
  if (path.startsWith('/api')) {
    const isTauri = window.__TAURI__ !== undefined
    return isTauri ? `http://localhost:8001${path}` : path
  }
  return path
}

// ==================== TEST IMPORT BRUT (ISOLÉ) ====================

export const uploadRawTest = async (file, yearFilter = null) => {
  const formData = new FormData()
  formData.append('file', file)
  if (yearFilter) {
    formData.append('year_filter', yearFilter)
  }
  
  const response = await api.post('/test/upload-raw', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return response.data
}

// ==================== PURE DATA (COMPARATIF N-1) ====================

export const comparePureData = async ({ file, yearCurrent, yearPrevious, month }) => {
  const formData = new FormData()
  if (file) formData.append('file', file)
  if (yearCurrent) formData.append('year_current', yearCurrent)
  if (yearPrevious) formData.append('year_previous', yearPrevious)
  if (month) formData.append('month', month)

  const response = await api.post('/pure-data/compare', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export const getPureDataSheetsStatus = async () => {
  const response = await api.get('/pure-data/sheets-status')
  return response.data
}

export const loadPureDataFromSupabase = async ({ yearCurrent, yearPrevious, month } = {}) => {
  const response = await api.get('/pure-data/load-from-supabase', {
    params: {
      year_current: yearCurrent || undefined,
      year_previous: yearPrevious || undefined,
      month: month || undefined,
    }
  })
  return response.data
}

export const syncPureDataFromSheets = async () => {
  const response = await api.post('/pure-data/sync-sheets')
  return response.data
}

/** Comparaison N vs N-1 filtrée par fournisseur (pour vue plateforme unique). */
export const getPureDataComparison = async ({ pureDataId, yearCurrent, yearPrevious, month, fournisseur }) => {
  const response = await api.get('/pure-data/comparison', {
    params: {
      pure_data_id: pureDataId,
      year_current: yearCurrent,
      year_previous: yearPrevious,
      month,
      fournisseur: fournisseur || undefined
    }
  })
  return response.data
}

export const getPureDataClientDetail = async ({ pureDataId, codeUnion, yearCurrent, yearPrevious, month, fournisseur }) => {
  const response = await api.get('/pure-data/client-detail', {
    params: {
      pure_data_id: pureDataId,
      code_union: codeUnion,
      year_current: yearCurrent,
      year_previous: yearPrevious,
      month,
      fournisseur: fournisseur || undefined
    }
  })
  return response.data
}

export const getPureDataPlatformDetail = async ({ pureDataId, platform, yearCurrent, yearPrevious, month }) => {
  const response = await api.get('/pure-data/platform-detail', {
    params: {
      pure_data_id: pureDataId,
      platform,
      year_current: yearCurrent,
      year_previous: yearPrevious,
      month
    }
  })
  return response.data
}

/** Magasins (clients) qui contribuent à une marque pour une plateforme donnée. */
export const getPureDataMarqueDetail = async ({ pureDataId, platform, marque, yearCurrent, yearPrevious, month }) => {
  const params = {
    pure_data_id: pureDataId,
    platform,
    marque,
    year_current: yearCurrent,
    year_previous: yearPrevious
  }
  if (month != null && month !== '') params.month = month
  const response = await api.get('/pure-data/marque-detail', { params })
  return response.data
}

// ==================== GENIE RFA (Assistant commercial) ====================

export const genieQuery = async (importId, queryType, params = {}) => {
  const queryParams = { import_id: importId, query_type: queryType, ...params }
  const response = await api.get('/genie/query', { params: queryParams })
  return response.data
}

export const getSmartPlans = async (importId, entityId = null, signal = null) => {
  const params = { import_id: importId }
  if (entityId) params.entity_id = entityId
  const config = signal ? { signal } : {}
  const response = await api.get('/genie/smart-plans', { params, ...config })
  return response.data
}

export const exportSmartPlansExcel = async (importId) => {
  const response = await api.get('/genie/smart-plans/export-excel', {
    params: { import_id: importId },
    responseType: 'blob'
  })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'Plans_Achat_RFA.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// ==================== NATHALIE — Ouverture de comptes ====================

export const nathalieGetClients = async (ouvertureOnly = false) => {
  const response = await api.get('/nathalie/clients', { params: { ouverture_only: ouvertureOnly } })
  return response.data
}

export const nathalieGetSuppliers = async () => {
  const response = await api.get('/nathalie/suppliers')
  return response.data
}

export const nathalieGetTasks = async (codeUnion = null) => {
  const params = codeUnion ? { code_union: codeUnion } : {}
  const response = await api.get('/nathalie/tasks', { params })
  return response.data
}

export const nathalieGenerateEmails = async (codeUnion, supplierNames) => {
  const response = await api.post('/nathalie/generate-emails', {
    code_union: codeUnion,
    supplier_names: supplierNames,
  })
  return response.data
}

/** Envoi réel des emails via Gmail (avec pièces jointes RIB/Kbis/pièce d'identité). */
export const nathalieSendEmails = async (codeUnion, supplierNames, ccEmails = null) => {
  const body = { code_union: codeUnion, supplier_names: supplierNames }
  if (ccEmails && ccEmails.length) body.cc_emails = ccEmails
  const response = await api.post('/nathalie/send-emails', body)
  return response.data
}

export const nathalieGetClientDetail = async (codeUnion) => {
  const response = await api.get(`/nathalie/client/${codeUnion}`)
  return response.data
}

export const nathalieCreateClient = async (formData) => {
  // formData doit être un objet FormData avec les champs + fichiers
  const response = await api.post('/nathalie/create-client', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

// ==================== PURE DATA ====================

export const getPureDataCommercialDetail = async ({ pureDataId, commercial, yearCurrent, yearPrevious, month, fournisseur }) => {
  const response = await api.get('/pure-data/commercial-detail', {
    params: {
      pure_data_id: pureDataId,
      commercial,
      year_current: yearCurrent,
      year_previous: yearPrevious,
      month,
      fournisseur: fournisseur || undefined
    }
  })
  return response.data
}