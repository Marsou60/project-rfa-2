export type ReachedMonth = {
  id: string;
  label: string;
  threshold: number;
  month: number | null;
};

/**
 * Marque principale : au moins 5 000 € de CA N-1 (même ordre de grandeur
 * que le seuil « CA N-1 significatif » des alertes réseau) et baisse
 * d'au moins 15 % sur la même période. delta_pct est en points (–15 = –15 %).
 */
export const BRAND_DROP_PCT = 15;
export const BRAND_MIN_PREVIOUS_EUR = 5000;

/**
 * Dernier mois importé : baisse d'au moins 15 % vs le même mois N-1,
 * et au moins 1 000 € l'an dernier pour ignorer un mois trop petit.
 */
export const MONTH_DROP_PCT = 15;
export const MONTH_MIN_PREVIOUS_EUR = 1000;

export type BrandRow = {
  label?: string;
  ca_current?: number;
  ca_previous?: number;
  delta_pct?: number | null;
};

export type MonthRow = {
  month: number;
  current?: number;
  previous?: number;
  delta_pct?: number | null;
  status?: string;
};

export type BrandDrop = {
  label: string;
  current: number;
  previous: number;
  deltaPct: number;
};

export type MonthDrop = {
  month: number;
  current: number;
  previous: number;
  deltaPct: number;
};

export type SituationAlerts = {
  brands: BrandDrop[];
  month: MonthDrop | null;
  missingDocs: string[];
  /** Paliers dont le cumul mensuel passe le seuil pendant le dernier mois importé. */
  reachedThisMonth: ReachedMonth[];
  /** Marques en baisse + mois en baisse + pièces manquantes. Pas le palier positif. */
  badge: number;
};

function pct(current: number, previous: number, given?: number | null): number | null {
  if (given != null && !Number.isNaN(Number(given))) return Number(given);
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function droppingBrands(rows: BrandRow[]): BrandDrop[] {
  const drops: BrandDrop[] = [];
  for (const row of rows) {
    const previous = Number(row.ca_previous) || 0;
    const current = Number(row.ca_current) || 0;
    if (previous < BRAND_MIN_PREVIOUS_EUR) continue;
    const deltaPct = pct(current, previous, row.delta_pct);
    if (deltaPct == null || deltaPct > -BRAND_DROP_PCT) continue;
    const label = (row.label || '').trim();
    if (!label) continue;
    drops.push({ label, current, previous, deltaPct });
  }
  drops.sort((a, b) => a.deltaPct - b.deltaPct);
  return drops;
}

export function droppingMonth(months: MonthRow[]): MonthDrop | null {
  const complete = [...months]
    .filter((item) => item.status !== 'pending' && item.month >= 1 && item.month <= 12)
    .sort((a, b) => b.month - a.month);
  const last = complete[0];
  if (!last) return null;
  const previous = Number(last.previous) || 0;
  const current = Number(last.current) || 0;
  if (previous < MONTH_MIN_PREVIOUS_EUR) return null;
  const deltaPct = pct(current, previous, last.delta_pct);
  if (deltaPct == null || deltaPct > -MONTH_DROP_PCT) return null;
  return { month: last.month, current, previous, deltaPct };
}

export function reachedThisMonth(reached: ReachedMonth[], reportingMonth?: number | null): ReachedMonth[] {
  const month = Number(reportingMonth) || 0;
  if (month < 1 || month > 12) return [];
  return reached.filter((item) => item.month === month);
}

export function buildSituationAlerts(input: {
  brands?: BrandRow[];
  months?: MonthRow[];
  missingDocs?: string[];
  reached?: ReachedPalier[];
  reportingMonth?: number | null;
}): SituationAlerts {
  const brands = droppingBrands(input.brands || []);
  const month = droppingMonth(input.months || []);
  const missingDocs = (input.missingDocs || []).map((item) => item.trim()).filter(Boolean);
  const reachedNow = reachedThisMonth(input.reached || [], input.reportingMonth);
  return {
    brands,
    month,
    missingDocs,
    reachedThisMonth: reachedNow,
    badge: brands.length + (month ? 1 : 0) + missingDocs.length,
  };
}
