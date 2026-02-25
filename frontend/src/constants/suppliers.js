/**
 * Clés des fournisseurs (plateformes) et mapping vers les champs RFA (global + tri).
 * Utilisé pour le filtre fournisseur : quand on sélectionne ACR, on n'affiche que GLOBAL_ACR + TRI_ACR_*.
 */

export const SUPPLIER_KEYS = ['ACR', 'DCA', 'EXADIS', 'ALLIANCE']

export const SUPPLIER_LABELS = {
  ACR: 'ACR',
  DCA: 'DCA',
  EXADIS: 'EXADIS',
  ALLIANCE: 'Alliance',
}

/** Liste des clés (GLOBAL_* et TRI_*) qui appartiennent à un fournisseur */
const SUPPLIER_FIELD_KEYS = {
  ACR: [
    'GLOBAL_ACR',
    'TRI_ACR_FREINAGE',
    'TRI_ACR_EMBRAYAGE',
    'TRI_ACR_FILTRE',
    'TRI_ACR_DISTRIBUTION',
    'TRI_ACR_MACHINE_TOURNANTE',
    'TRI_ACR_LIAISON_AU_SOL',
  ],
  DCA: [
    'GLOBAL_DCA',
    'TRI_DCA_SBS',
    'TRI_DCA_DAYCO',
  ],
  EXADIS: [
    'GLOBAL_EXADIS',
    'TRI_EXADIS_FREINAGE',
    'TRI_EXADIS_EMBRAYAGE',
    'TRI_EXADIS_FILTRATION',
    'TRI_EXADIS_DISTRIBUTION',
    'TRI_EXADIS_ETANCHEITE',
    'TRI_EXADIS_THERMIQUE',
  ],
  ALLIANCE: [
    'GLOBAL_ALLIANCE',
    'TRI_SCHAEFFLER',
    'TRI_ALLIANCE_DELPHI',
    'TRI_ALLIANCE_BREMBO',
    'TRI_ALLIANCE_SOGEFI',
    'TRI_ALLIANCE_SKF',
    'TRI_ALLIANCE_NAPA',
    'TRI_PURFLUX_COOPERS',
  ],
}

/**
 * Retourne les clés de champs (global + tri) pour un fournisseur donné.
 * @param {string} supplierKey - 'ACR' | 'DCA' | 'EXADIS' | 'ALLIANCE'
 * @returns {string[]}
 */
export function getKeysForSupplier(supplierKey) {
  if (!supplierKey) return []
  return SUPPLIER_FIELD_KEYS[supplierKey] || []
}

/**
 * Indique si une clé de champ (row.key) appartient au fournisseur.
 * @param {string} fieldKey - ex: GLOBAL_ACR, TRI_ACR_EMBRAYAGE
 * @param {string} supplierKey - ex: ACR
 */
export function fieldBelongsToSupplier(fieldKey, supplierKey) {
  if (!supplierKey || !fieldKey) return true
  return getKeysForSupplier(supplierKey).includes(fieldKey)
}
