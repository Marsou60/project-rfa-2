/** Badge du bouton Filtres. La recherche n’y compte pas : elle est déjà visible. */
export function activeMapFilterCount(opts: {
  supplier: string | null;
  nearOnly: boolean;
  colorMode: 'commercial' | 'plateforme';
}): number {
  let count = 0;
  if (opts.supplier) count += 1;
  if (opts.nearOnly) count += 1;
  if (opts.colorMode === 'commercial') count += 1;
  return count;
}
