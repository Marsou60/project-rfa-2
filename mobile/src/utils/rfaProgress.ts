/** Progression paliers RFA 2026 — même logique affichage que le web (ClientSpacePage). */

export type Tier = { min: number; rate: number };

export type TierProgress = {
  rate: number;
  nextMin: number | null;
  nextRate: number | null;
  progress: number;
  currentValue: number;
  missing: number;
  projectedGain: number;
  achieved: boolean;
  minReached: number | null;
};

export function parseTiers(raw: unknown): Tier[] {
  if (!raw) return [];
  let arr: unknown = raw;
  if (!Array.isArray(raw)) {
    try {
      arr = JSON.parse(String(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return (arr as Array<{ min?: number; rate?: number }>)
    .map((x) => ({ min: Number(x.min) || 0, rate: Number(x.rate) || 0 }))
    .sort((a, b) => a.min - b.min);
}

function rateForThreshold(tiers: Tier[], threshold: number | null): number {
  if (!tiers.length || threshold == null) return 0;
  let rate = 0;
  for (const t of tiers) {
    if (t.min <= threshold) rate = t.rate;
    else break;
  }
  return rate;
}

function progBase(ca: number, tiers: Tier[]) {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  let rate = 0;
  let minReached: number | null = null;
  for (const t of sorted) {
    if (t.min <= ca) {
      rate = t.rate;
      minReached = t.min;
    } else break;
  }
  const next = sorted.find((t) => t.min > ca) || null;
  return { rate, nextMin: next ? next.min : null, minReached };
}

/** Progression combinée RFA + Bonus (plateformes globales). */
export function globalProgress(
  ca: number,
  tiersRfa: Tier[],
  tiersBonus: Tier[],
  caRemunere?: number | null,
): TierProgress {
  const pr = progBase(ca, tiersRfa);
  const pb = progBase(ca, tiersBonus);
  const nexts = [pr.nextMin, pb.nextMin].filter((v): v is number => v != null);
  const nextMin = nexts.length ? Math.min(...nexts) : null;
  const rate = (pr.rate || 0) + (pb.rate || 0);
  const nextRate =
    nextMin != null ? rateForThreshold(tiersRfa, nextMin) + rateForThreshold(tiersBonus, nextMin) : null;
  const progress = nextMin ? Math.min((ca / nextMin) * 100, 100) : 100;
  const excluded = caRemunere == null ? 0 : Math.max(ca - caRemunere, 0);
  const base = caRemunere == null ? ca : caRemunere;
  const currentValue = rate * base;
  const missing = nextMin != null ? Math.max(nextMin - ca, 0) : 0;
  const nextBase = nextMin != null ? Math.max(nextMin - excluded, 0) : 0;
  const projectedGain =
    nextMin != null && nextRate != null ? Math.max(nextRate * nextBase - currentValue, 0) : 0;
  return {
    rate,
    nextMin,
    nextRate,
    progress,
    currentValue,
    missing,
    projectedGain,
    achieved: nextMin == null && (pr.minReached != null || pb.minReached != null),
    minReached: pr.minReached ?? pb.minReached,
  };
}

/** Progression simple (tripartite). */
export function triProgress(ca: number, tiers: Tier[], caRemunere?: number | null): TierProgress {
  const p = progBase(ca, tiers);
  const nextRate = p.nextMin != null ? rateForThreshold(tiers, p.nextMin) : null;
  const progress = p.nextMin ? Math.min((ca / p.nextMin) * 100, 100) : 100;
  const excluded = caRemunere == null ? 0 : Math.max(ca - caRemunere, 0);
  const base = caRemunere == null ? ca : caRemunere;
  const currentValue = (p.rate || 0) * base;
  const missing = p.nextMin != null ? Math.max(p.nextMin - ca, 0) : 0;
  const nextBase = p.nextMin != null ? Math.max(p.nextMin - excluded, 0) : 0;
  const projectedGain =
    p.nextMin != null && nextRate != null ? Math.max(nextRate * nextBase - currentValue, 0) : 0;
  return {
    rate: p.rate,
    nextMin: p.nextMin,
    nextRate,
    progress,
    currentValue,
    missing,
    projectedGain,
    achieved: p.nextMin == null && p.minReached != null,
    minReached: p.minReached,
  };
}

export function combinedLadder(tiersRfa: Tier[], tiersBonus: Tier[]) {
  const mins = [
    ...new Set([...tiersRfa.map((t) => t.min), ...tiersBonus.map((t) => t.min)].filter((v) => v != null)),
  ].sort((a, b) => a - b);
  return mins.map((min) => {
    const rfa = rateForThreshold(tiersRfa, min);
    const bonus = rateForThreshold(tiersBonus, min);
    return { min, rfa, bonus, total: rfa + bonus };
  });
}

export type PalierGauge = {
  key: string;
  label: string;
  current: number;
  nextMin: number | null;
  missing: number;
  progress: number;
  gain: number;
  projectedCa: number | null;
  projectedMissing: number | null;
  projectedProgress: number | null;
  projectedGain: number | null;
  projectionReaches: boolean;
};

const LEVELS = [
  { id: 'SILVER', min: 100001, label: 'Silver' },
  { id: 'GOLD', min: 300001, label: 'Gold' },
];

export function fichePalierGauges(input: {
  caGlobal?: number;
  level?: string | null;
  levelBased?: boolean;
  lines: Array<{
    key: string;
    label: string;
    ca?: number;
    caRemunere?: number | null;
    tiersRfa?: unknown;
    tiersBonus?: unknown;
    projectedCa?: number | null;
  }>;
}): PalierGauge[] {
  const gauges: PalierGauge[] = [];
  const caGlobal = Number(input.caGlobal) || 0;
  const level = String(input.level || '').toUpperCase();
  if (input.levelBased) {
    const next = LEVELS.find((item) => caGlobal < item.min && (level === '' || level === 'CLASSIQUE' || (level === 'SILVER' && item.id === 'GOLD')));
    if (next && (level === 'CLASSIQUE' || level === '' || (level === 'SILVER' && next.id === 'GOLD'))) {
      const missing = Math.max(next.min - caGlobal, 0);
      gauges.push({
        key: `niveau:${next.id}`,
        label: `Passer ${next.label}`,
        current: caGlobal,
        nextMin: next.min,
        missing,
        progress: Math.min((caGlobal / next.min) * 100, 100),
        gain: 0,
        projectedCa: null,
        projectedMissing: null,
        projectedProgress: null,
        projectedGain: null,
        projectionReaches: false,
      });
    }
  }
  for (const line of input.lines) {
    const ca = Number(line.ca) || 0;
    if (ca <= 0) continue;
    const prog = globalProgress(ca, parseTiers(line.tiersRfa), parseTiers(line.tiersBonus), line.caRemunere);
    if (prog.nextMin == null) continue;
    const projectedCa = line.projectedCa == null ? null : Number(line.projectedCa);
    const projected = projectedCa == null
      ? null
      : globalProgress(projectedCa, parseTiers(line.tiersRfa), parseTiers(line.tiersBonus), line.caRemunere);
    gauges.push({
      key: line.key,
      label: line.label,
      current: ca,
      nextMin: prog.nextMin,
      missing: prog.missing,
      progress: prog.progress,
      gain: prog.projectedGain,
      projectedCa,
      projectedMissing: projected?.missing ?? null,
      projectedProgress: projected?.progress ?? null,
      projectedGain: projected?.projectedGain ?? null,
      projectionReaches: projected != null && projected.nextMin == null,
    });
  }
  return gauges;
}
