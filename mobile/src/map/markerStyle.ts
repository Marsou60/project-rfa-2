/** Couleur et taille des pastilles. Pur : testé sans Leaflet. */

export const DOT_MIN = 12;
export const DOT_MAX = 32;
export const HIT_PX = 44;

export type ColorMode = 'commercial' | 'plateforme';

export type StylePoint = {
  ca?: number | null;
  plateformes?: string[];
  commercial?: string | null;
  fournisseur_principal?: string | null;
};

export const PLATFORM_COLORS: Record<string, string> = {
  ACR: '#F97316',
  DCA: '#2563EB',
  EXADIS: '#0F766E',
  ALLIANCE: '#7C3AED',
};

const EXTRA_COLORS = ['#DB2777', '#CA8A04', '#0891B2', '#4F46E5', '#BE123C', '#65A30D'];

export const COMMERCIAL_COLORS = [
  '#F97316',
  '#2563EB',
  '#0F766E',
  '#7C3AED',
  '#DB2777',
  '#CA8A04',
  '#0891B2',
  '#4F46E5',
  '#BE123C',
  '#65A30D',
  '#0EA5E9',
  '#EA580C',
];

const KNOWN_PLATFORMS = ['ACR', 'DCA', 'EXADIS', 'ALLIANCE'];
export const MISSING_LABEL = 'Non renseigné';

/** Classique, Silver dès 100 001 €, Gold dès 300 001 €. */
export function contractTierLabel(ca?: number | null): string | null {
  if (ca == null || Number.isNaN(Number(ca))) return null;
  const value = Number(ca);
  if (value >= 300_001) return 'Gold';
  if (value >= 100_001) return 'Silver';
  return 'Classique';
}

export function principalPlatform(point: StylePoint): string | null {
  const explicit = String(point.fournisseur_principal || '').trim().toUpperCase();
  if (explicit) return explicit;
  const first = (point.plateformes || []).map((item) => String(item || '').trim().toUpperCase()).find(Boolean);
  return first || null;
}

export function caExtent(values: Array<number | null | undefined>): { min: number; max: number } {
  const positive = values.filter((value): value is number => typeof value === 'number' && value > 0 && Number.isFinite(value));
  if (!positive.length) return { min: 0, max: 0 };
  return { min: Math.min(...positive), max: Math.max(...positive) };
}

/**
 * Diamètre en pixels, linéaire sur √CA, borné pour rester lisible.
 * Le plus petit CA affiché vaut DOT_MIN, le plus grand DOT_MAX.
 * Sans CA, ou si tout le monde a le même CA, une taille médiane / minimale.
 */
export function markerDiameter(ca: number | null | undefined, extent: { min: number; max: number }): number {
  const value = typeof ca === 'number' && ca > 0 && Number.isFinite(ca) ? ca : 0;
  const { min, max } = extent;
  if (!(max > min)) {
    return value > 0 ? Math.round((DOT_MIN + DOT_MAX) / 2) : DOT_MIN;
  }
  if (value <= 0) return DOT_MIN;
  const clamped = Math.min(Math.max(value, min), max);
  const start = Math.sqrt(min);
  const end = Math.sqrt(max);
  const t = (Math.sqrt(clamped) - start) / (end - start);
  return Math.round(DOT_MIN + t * (DOT_MAX - DOT_MIN));
}

function extraColor(label: string): string {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return EXTRA_COLORS[hash % EXTRA_COLORS.length];
}

export function commercialKey(name?: string | null): string {
  const label = String(name || '').trim();
  return label || MISSING_LABEL;
}

export function commercialPalette(names: Array<string | null | undefined>): Map<string, string> {
  const labels = new Set<string>();
  names.forEach((name) => labels.add(commercialKey(name)));
  const ordered = Array.from(labels).sort((a, b) => {
    if (a === MISSING_LABEL) return 1;
    if (b === MISSING_LABEL) return -1;
    return a.localeCompare(b, 'fr');
  });
  const palette = new Map<string, string>();
  ordered.forEach((label, index) => {
    palette.set(label, COMMERCIAL_COLORS[index % COMMERCIAL_COLORS.length]);
  });
  return palette;
}

export function pointColor(point: StylePoint, mode: ColorMode, palette: Map<string, string>): string {
  if (mode === 'commercial') {
    return palette.get(commercialKey(point.commercial)) || '#64748B';
  }
  const platform = principalPlatform(point);
  if (!platform) return '#64748B';
  return PLATFORM_COLORS[platform] || extraColor(platform);
}

export function legendEntries(points: StylePoint[], mode: ColorMode): { label: string; color: string }[] {
  if (mode === 'commercial') {
    const palette = commercialPalette(points.map((point) => point.commercial));
    return Array.from(palette.entries()).map(([label, color]) => ({ label, color }));
  }
  const seen = new Set<string>();
  points.forEach((point) => {
    const platform = principalPlatform(point);
    if (platform) seen.add(platform);
  });
  const known = KNOWN_PLATFORMS.filter((label) => seen.has(label));
  const extra = Array.from(seen).filter((label) => !KNOWN_PLATFORMS.includes(label)).sort((a, b) => a.localeCompare(b, 'fr'));
  return [...known, ...extra].map((label) => ({
    label,
    color: PLATFORM_COLORS[label] || extraColor(label),
  }));
}

export type ClusterPreview = {
  count: number;
  totalCa: number;
  byPlatform: { label: string; count: number }[];
  codes: string[];
};

/** Nombre d'adhérents par plateforme (un adhérent multi-plateforme compte dans chacune) et CA total. */
export function clusterPreview(items: Array<StylePoint & { code_union?: string }>): ClusterPreview {
  const counts = new Map<string, number>();
  let totalCa = 0;
  const codes: string[] = [];
  items.forEach((item) => {
    if (item.code_union) codes.push(item.code_union);
    if (typeof item.ca === 'number' && Number.isFinite(item.ca)) totalCa += item.ca;
    const labels = (item.plateformes || []).map((label) => String(label || '').trim().toUpperCase()).filter(Boolean);
    const seen = new Set<string>();
    (labels.length ? labels : ['Autre']).forEach((label) => {
      if (seen.has(label)) return;
      seen.add(label);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  const byPlatform = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([label, count]) => ({ label, count }));
  return { count: items.length, totalCa, byPlatform, codes };
}
