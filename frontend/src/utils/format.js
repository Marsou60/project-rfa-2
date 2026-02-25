/**
 * Fonctions de formatage centralisées
 */

export const formatAmount = (amount) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

export const formatPercent = (rate, options = {}) => {
  const { minDecimals = 1, maxDecimals = 2 } = options
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(rate || 0)
}
