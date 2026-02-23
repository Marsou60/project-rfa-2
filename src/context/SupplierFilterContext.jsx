import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getKeysForSupplier } from '../constants/suppliers'

const SupplierFilterContext = createContext(null)

const STORAGE_KEY = 'rfa_supplier_filter'

export function SupplierFilterProvider({ children }) {
  const [supplierFilter, setSupplierFilterState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && ['ACR', 'DCA', 'EXADIS', 'ALLIANCE'].includes(saved)) return saved
    } catch (_) {}
    return null
  })

  useEffect(() => {
    try {
      if (supplierFilter) {
        localStorage.setItem(STORAGE_KEY, supplierFilter)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (_) {}
  }, [supplierFilter])

  const setSupplierFilter = useCallback((value) => {
    setSupplierFilterState(value || null)
  }, [])

  const getKeysForCurrentSupplier = useCallback(() => {
    return getKeysForSupplier(supplierFilter)
  }, [supplierFilter])

  const value = {
    supplierFilter,
    setSupplierFilter,
    getKeysForCurrentSupplier,
  }

  return (
    <SupplierFilterContext.Provider value={value}>
      {children}
    </SupplierFilterContext.Provider>
  )
}

export function useSupplierFilter() {
  const ctx = useContext(SupplierFilterContext)
  if (!ctx) {
    return {
      supplierFilter: null,
      setSupplierFilter: () => {},
      getKeysForCurrentSupplier: () => [],
    }
  }
  return ctx
}
