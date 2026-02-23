import axios from 'axios'

// En mode Tauri, utiliser l'URL complète du backend
// En mode dev web, utiliser le proxy Vite
const isTauri = window.__TAURI__ !== undefined
const API_BASE_URL = isTauri ? 'http://localhost:8001/api' : '/api'

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

export const getEntities = async (importId, mode = 'client') => {
  const response = await api.get(`/imports/${importId}/entities`, {
    params: { mode }
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

export const exportEntityPdf = async (importId, mode, entityId, contractId = null) => {
  const params = { mode, id: entityId }
  if (contractId) {
    params.contract_id = contractId
  }
  const response = await api.get(`/imports/${importId}/entity/pdf`, {
    params,
    responseType: 'blob'
  })
  
  // Créer un lien de téléchargement
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  const entityLabel = entityId.replace(/ /g, '_')
  link.setAttribute('download', `RFA_${entityLabel}_${mode}.pdf`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
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
  formData.append('file', file)
  if (yearCurrent) formData.append('year_current', yearCurrent)
  if (yearPrevious) formData.append('year_previous', yearPrevious)
  if (month) formData.append('month', month)

  const response = await api.post('/pure-data/compare', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
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

export const getSmartPlans = async (importId, entityId = null) => {
  const params = { import_id: importId }
  if (entityId) params.entity_id = entityId
  const response = await api.get('/genie/smart-plans', { params })
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