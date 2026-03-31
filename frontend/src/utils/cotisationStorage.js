/**
 * Cotisation Union (liste adhérents) — même stockage localStorage que ClientsPage.
 */

export function migrateCotisationMap(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && v > 0) {
      out[k] = { amount: v, facturee: true, deduite: true }
    } else if (v && typeof v === 'object' && typeof v.amount === 'number' && v.amount > 0) {
      const amt = Number(v.amount)
      if ('facturee' in v || 'deduite' in v) {
        out[k] = {
          amount: amt,
          facturee: Boolean(v.facturee),
          deduite: Boolean(v.deduite),
        }
      } else if (v.kind === 'offerte') {
        out[k] = { amount: amt, facturee: false, deduite: false }
      } else {
        out[k] = { amount: amt, facturee: true, deduite: true }
      }
    }
  }
  return out
}

function normGroupe(s) {
  return (s || '').toString().trim().toUpperCase()
}

/**
 * @param {Record<string, { amount: number, facturee?: boolean, deduite?: boolean }>} map
 * @param {'client'|'group'} mode
 * @param {{ code_union?: string, groupe_client?: string, id?: string }} entity
 */
export function resolveCotisationInfo(map, mode, entity) {
  if (!map || typeof map !== 'object' || !entity) {
    return {
      amount: 0,
      facturee: true,
      deduite: true,
      isOfferte: false,
      isFacture: false,
    }
  }
  const keyClient = (entity.code_union || entity.id || '').toString().trim()
  const keyGroup = normGroupe(entity.groupe_client || entity.id || '')
  const primary = mode === 'group' ? keyGroup : keyClient
  let row = map[primary]
  if (!row && mode === 'client' && primary) {
    const p = primary.toUpperCase()
    for (const [k, v] of Object.entries(map)) {
      if (k && k.toString().trim().toUpperCase() === p) {
        row = v
        break
      }
    }
  }
  if (!row && mode === 'group' && primary) {
    const t = normGroupe(primary)
    for (const [k, v] of Object.entries(map)) {
      if (normGroupe(k) === t) {
        row = v
        break
      }
    }
  }
  if (!row || typeof row.amount !== 'number' || row.amount <= 0) {
    return {
      amount: 0,
      facturee: true,
      deduite: true,
      isOfferte: false,
      isFacture: false,
    }
  }
  let facturee = Boolean(row.facturee)
  let deduite = Boolean(row.deduite)
  if (facturee !== deduite) {
    facturee = true
    deduite = true
  }
  const amount = Number(row.amount)
  const isOfferte = amount > 0 && !facturee && !deduite
  const isFacture = amount > 0 && facturee && deduite
  return { amount, facturee, deduite, isOfferte, isFacture }
}

export function readCotisationMap(importId) {
  if (!importId) return {}
  try {
    const s = localStorage.getItem(`cotisation_amounts_${importId}`)
    if (!s) return {}
    return migrateCotisationMap(JSON.parse(s))
  } catch {
    return {}
  }
}
