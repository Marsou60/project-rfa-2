import { canonPlatform, fmtEuro } from './format';
import { globalProgress, parseTiers, triProgress, type Tier } from './rfaProgress';

/** Entrée minimale : la réponse `client-rfa` déjà bornée au code de l'adhérent. */
export type OwnAlertLine = {
  label?: string;
  ca?: number;
  ca_remunere?: number;
  ca_exclu?: number;
  tiers?: unknown;
  tiers_rfa?: unknown;
  tiers_bonus?: unknown;
};

export type OwnAlertInput = {
  available?: boolean;
  reporting_month?: number | null;
  ca?: { totals?: { global_total?: number } };
  level_based?: boolean;
  contract_level?: { id?: string; tripartites_enabled?: boolean } | null;
  contract_applied?: { level?: string | null } | null;
  rfa?: {
    global?: Record<string, OwnAlertLine>;
    tri?: Record<string, OwnAlertLine>;
    acr_challenge?: {
      triggered?: boolean;
      threshold?: number;
      missing?: number;
      bonus_rate?: number;
      base_rate?: number;
      boosted_rate?: number;
    } | null;
  } | null;
};

export type OwnMonthPoint = { month: number; current?: number; status?: string };
export type OwnMonthSeries = { platform?: string; months?: OwnMonthPoint[] };

export type OwnPalier = {
  id: string;
  label: string;
  kind: 'plateforme' | 'tripartite' | 'niveau';
  current: number;
  threshold: number;
  missing: number;
  progress: number;
  gain: number;
  locked: boolean;
  /** Phrase affichée : « Encore X € pour +Y € de RFA. » */
  sentence: string;
};

export type ReachedPalier = {
  id: string;
  label: string;
  kind: 'plateforme' | 'tripartite' | 'niveau';
  threshold: number;
  rate: number;
  /** RFA supplémentaire de ce seuil sur le CA rémunéré actuel. Absent si le CA rémunéré est inconnu. */
  amount: number | null;
  /** Mois (1-12) où le cumul des achats a passé le seuil. Absent si l'historique mensuel ne le dit pas. */
  month: number | null;
};

export type OwnAcr = {
  triggered: boolean;
  threshold: number;
  missing: number;
  baseRate: number;
  boostedRate: number;
};

export type OwnAlerts = {
  remaining: OwnPalier[];
  reached: ReachedPalier[];
  closest: OwnPalier | null;
  /** Paliers à 2 000 € ou moins (hors tripartites verrouillées) + challenge ACR en cours. */
  badge: number;
  acr: OwnAcr | null;
  reportingMonth: number | null;
};

const SILVER_MIN = 100001;
const GOLD_MIN = 300001;

/**
 * Même seuil que le filtre « Palier » de l'écran Alertes Union
 * (valeur par défaut : 2 000 €). Un palier plus loin reste dans Ma RFA.
 */
export const PALIER_NEAR_EUR = 2000;

function rateAt(tiers: Tier[], threshold: number): number {
  let rate = 0;
  for (const tier of tiers) {
    if (tier.min <= threshold) rate = tier.rate;
    else break;
  }
  return rate;
}

function remunerated(line: OwnAlertLine): number | null {
  if (line.ca_exclu) return Number(line.ca_remunere) || 0;
  if (line.ca == null) return null;
  return Number(line.ca) || 0;
}

function ytdByMonth(series: OwnMonthSeries | undefined): Array<{ month: number; ytd: number }> {
  let ytd = 0;
  return [...(series?.months || [])]
    .filter((point) => point.status !== 'pending')
    .sort((a, b) => a.month - b.month)
    .map((point) => {
      ytd += Number(point.current) || 0;
      return { month: point.month, ytd };
    });
}

function monthSeriesFor(key: string, series: OwnMonthSeries[]): OwnMonthSeries | undefined {
  const wanted = canonPlatform(key);
  return series.find((item) => canonPlatform(item.platform || '') === wanted);
}

function crossedMonth(key: string, threshold: number, series: OwnMonthSeries[]): number | null {
  const hit = ytdByMonth(monthSeriesFor(key, series)).find((point) => point.ytd >= threshold);
  return hit?.month ?? null;
}

function sentence(missing: number, gain: number, locked: boolean): string {
  if (locked) {
    return `Encore ${fmtEuro(missing)} de CA. Ces tripartites se versent à partir du niveau Silver.`;
  }
  if (gain > 0) return `Encore ${fmtEuro(missing)} pour +${fmtEuro(gain)} de RFA.`;
  return `Encore ${fmtEuro(missing)} de CA pour le prochain seuil.`;
}

function pushReached(
  out: ReachedPalier[],
  opts: {
    id: string;
    label: string;
    kind: ReachedPalier['kind'];
    ca: number;
    tiers: Tier[];
    base: number | null;
    series: OwnMonthSeries[];
    seriesKey: string;
  },
) {
  const passed = opts.tiers.filter((tier) => tier.min > 0 && tier.min <= opts.ca);
  passed.forEach((tier, index) => {
    const previous = index === 0 ? 0 : rateAt(opts.tiers, passed[index - 1].min);
    const rate = tier.rate;
    const extra = rate - previous;
    out.push({
      id: `${opts.id}:${tier.min}`,
      label: opts.label,
      kind: opts.kind,
      threshold: tier.min,
      rate,
      amount: opts.base == null ? null : Math.max(extra, 0) * opts.base,
      month: crossedMonth(opts.seriesKey, tier.min, opts.series),
    });
  });
}

export function buildOwnAlerts(input: OwnAlertInput | null | undefined, months: OwnMonthSeries[] = []): OwnAlerts {
  const empty: OwnAlerts = {
    remaining: [],
    reached: [],
    closest: null,
    badge: 0,
    acr: null,
    reportingMonth: input?.reporting_month ?? null,
  };
  if (!input?.available) return empty;

  const caGlobal = Number(input.ca?.totals?.global_total) || 0;
  const level = String(input.contract_level?.id || input.contract_applied?.level || '').toUpperCase();
  const levelBased = Boolean(input.level_based || input.contract_level?.id);
  const triEnabled = levelBased ? input.contract_level?.tripartites_enabled === true : true;
  const remaining: OwnPalier[] = [];
  const reached: ReachedPalier[] = [];

  if (levelBased && (level === '' || level === 'CLASSIQUE') && caGlobal < SILVER_MIN) {
    const missing = SILVER_MIN - caGlobal;
    remaining.push({
      id: 'niveau:SILVER',
      label: 'Niveau Silver',
      kind: 'niveau',
      current: caGlobal,
      threshold: SILVER_MIN,
      missing,
      progress: Math.min((caGlobal / SILVER_MIN) * 100, 100),
      gain: 0,
      locked: false,
      sentence: `Encore ${fmtEuro(missing)} de CA global pour débloquer les tripartites.`,
    });
  } else if (levelBased && level === 'SILVER' && caGlobal < GOLD_MIN) {
    const missing = GOLD_MIN - caGlobal;
    remaining.push({
      id: 'niveau:GOLD',
      label: 'Niveau Gold',
      kind: 'niveau',
      current: caGlobal,
      threshold: GOLD_MIN,
      missing,
      progress: Math.min((caGlobal / GOLD_MIN) * 100, 100),
      gain: 0,
      locked: false,
      sentence: `Encore ${fmtEuro(missing)} de CA global pour le bonus Union supérieur.`,
    });
  }
  if (level === 'SILVER' || level === 'GOLD') {
    reached.push({
      id: `niveau:${level}`,
      label: level === 'GOLD' ? 'Niveau Gold' : 'Niveau Silver',
      kind: 'niveau',
      threshold: level === 'GOLD' ? GOLD_MIN : SILVER_MIN,
      rate: 0,
      amount: null,
      month: null,
    });
  }

  const globals = Object.entries(input.rfa?.global || {}).filter(([, line]) => (Number(line.ca) || 0) > 0);
  for (const [key, line] of globals) {
    const ca = Number(line.ca) || 0;
    const tiersRfa = parseTiers(line.tiers_rfa);
    const tiersBonus = parseTiers(line.tiers_bonus);
    const base = remunerated(line);
    const prog = globalProgress(ca, tiersRfa, tiersBonus, line.ca_exclu ? line.ca_remunere : null);
    const label = line.label || canonPlatform(key);
    if (prog.nextMin != null) {
      remaining.push({
        id: key,
        label,
        kind: 'plateforme',
        current: ca,
        threshold: prog.nextMin,
        missing: prog.missing,
        progress: prog.progress,
        gain: prog.projectedGain,
        locked: false,
        sentence: sentence(prog.missing, prog.projectedGain, false),
      });
    }
    pushReached(reached, {
      id: key,
      label,
      kind: 'plateforme',
      ca,
      tiers: [...tiersRfa, ...tiersBonus.filter((tier) => !tiersRfa.some((item) => item.min === tier.min))]
        .sort((a, b) => a.min - b.min)
        .map((tier) => ({
          min: tier.min,
          rate: rateAt(tiersRfa, tier.min) + rateAt(tiersBonus, tier.min),
        })),
      base,
      series: months,
      seriesKey: key,
    });
  }

  const tris = Object.entries(input.rfa?.tri || {}).filter(([, line]) => (Number(line.ca) || 0) > 0);
  for (const [key, line] of tris) {
    const tiers = parseTiers(line.tiers);
    if (!tiers.length) continue;
    const ca = Number(line.ca) || 0;
    const base = remunerated(line);
    const prog = triProgress(ca, tiers, line.ca_exclu ? line.ca_remunere : null);
    const label = line.label || key.replace(/^TRI_/i, '').replace(/_/g, ' ');
    const locked = !triEnabled;
    if (prog.nextMin != null) {
      remaining.push({
        id: key,
        label,
        kind: 'tripartite',
        current: ca,
        threshold: prog.nextMin,
        missing: prog.missing,
        progress: prog.progress,
        gain: locked ? 0 : prog.projectedGain,
        locked,
        sentence: sentence(prog.missing, locked ? 0 : prog.projectedGain, locked),
      });
    }
    if (!locked) {
      pushReached(reached, {
        id: key,
        label,
        kind: 'tripartite',
        ca,
        tiers,
        base,
        series: months,
        seriesKey: key,
      });
    }
  }

  remaining.sort((a, b) => Number(a.locked) - Number(b.locked) || a.missing - b.missing || b.gain - a.gain);
  const near = remaining.filter((item) => item.missing > 0 && item.missing <= PALIER_NEAR_EUR);
  reached.sort((a, b) => (b.month || 0) - (a.month || 0) || a.label.localeCompare(b.label, 'fr'));

  const acrRaw = input.rfa?.acr_challenge;
  const acr: OwnAcr | null = acrRaw
    ? {
        triggered: Boolean(acrRaw.triggered),
        threshold: Number(acrRaw.threshold) || 65000,
        missing: Number(acrRaw.missing) || 0,
        baseRate: Number(acrRaw.base_rate) || 0,
        boostedRate: Number(acrRaw.boosted_rate) || (Number(acrRaw.base_rate) || 0) + (Number(acrRaw.bonus_rate) || 0.025),
      }
    : null;

  const chase = near.filter((item) => !item.locked).length + (acr && !acr.triggered && acr.missing > 0 ? 1 : 0);
  return {
    remaining: near,
    reached,
    closest: near.find((item) => !item.locked) || near[0] || null,
    badge: chase,
    acr,
    reportingMonth: input.reporting_month ?? null,
  };
}

export function alertBadge(alerts: OwnAlerts, impayeActifs = 0): number {
  return alerts.badge + (impayeActifs > 0 ? 1 : 0);
}
