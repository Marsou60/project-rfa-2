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
export function globalProgress(ca: number, tiersRfa: Tier[], tiersBonus: Tier[]): TierProgress {
  const pr = progBase(ca, tiersRfa);
  const pb = progBase(ca, tiersBonus);
  const nexts = [pr.nextMin, pb.nextMin].filter((v): v is number => v != null);
  const nextMin = nexts.length ? Math.min(...nexts) : null;
  const rate = (pr.rate || 0) + (pb.rate || 0);
  const nextRate =
    nextMin != null ? rateForThreshold(tiersRfa, nextMin) + rateForThreshold(tiersBonus, nextMin) : null;
  const progress = nextMin ? Math.min((ca / nextMin) * 100, 100) : 100;
  const currentValue = rate * ca;
  const missing = nextMin != null ? Math.max(nextMin - ca, 0) : 0;
  const projectedGain =
    nextMin != null && nextRate != null ? Math.max(nextRate * nextMin - currentValue, 0) : 0;
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
export function triProgress(ca: number, tiers: Tier[]): TierProgress {
  const p = progBase(ca, tiers);
  const nextRate = p.nextMin != null ? rateForThreshold(tiers, p.nextMin) : null;
  const progress = p.nextMin ? Math.min((ca / p.nextMin) * 100, 100) : 100;
  const currentValue = (p.rate || 0) * ca;
  const missing = p.nextMin != null ? Math.max(p.nextMin - ca, 0) : 0;
  const projectedGain =
    p.nextMin != null && nextRate != null ? Math.max(nextRate * p.nextMin - currentValue, 0) : 0;
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
