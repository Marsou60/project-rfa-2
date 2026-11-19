import { MapPoint } from './types';

/** Seuils Silver / Gold affichés sur la fiche RFA. */
export const CONTRACT_THRESHOLDS = [100_001, 300_001] as const;

/** Au moins 80 % du prochain seuil, comme la jauge ambre de la fiche. */
export function nearContractTier(ca?: number | null): boolean {
  if (ca == null || ca <= 0) return false;
  return CONTRACT_THRESHOLDS.some((threshold) => ca < threshold && ca / threshold >= 0.8);
}

export function filterPoints(
  points: MapPoint[],
  opts: { supplier: string | null; nearOnly: boolean; query: string },
): MapPoint[] {
  const query = opts.query.trim().toLocaleLowerCase('fr');
  return points.filter((point) => {
    if (opts.supplier && !point.plateformes.some((item) => item.toUpperCase() === opts.supplier)) {
      return false;
    }
    if (opts.nearOnly && !point.near_tier && !nearContractTier(point.ca)) return false;
    if (!query) return true;
    const blob = `${point.nom} ${point.ville || ''} ${point.code_union}`.toLocaleLowerCase('fr');
    return blob.includes(query);
  });
}

export function supplierChoices(points: MapPoint[]): string[] {
  const known = ['ACR', 'DCA', 'EXADIS', 'ALLIANCE'];
  const extra = new Set<string>();
  points.forEach((point) => {
    point.plateformes.forEach((item) => {
      const label = item.toUpperCase();
      if (!known.includes(label)) extra.add(label);
    });
  });
  return [...known, ...Array.from(extra).sort()];
}
