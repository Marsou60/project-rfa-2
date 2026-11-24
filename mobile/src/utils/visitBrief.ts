export type VisitBrand = { label: string; current?: number; deltaPct?: number | null };
export type VisitGauge = { label: string; missing: number; gain: number; progress: number };
export type VisitNote = { text: string; author?: string; at?: string };

export type VisitBrief = {
  ca: number;
  previous: number | null;
  deltaPct: number | null;
  trend: string;
  brands: VisitBrand[];
  nearest: VisitGauge | null;
  impayesCount: number;
  impayesAmount: number;
  note: VisitNote | null;
};

export function buildVisitBrief(input: {
  ca?: number | null;
  previous?: number | null;
  deltaPct?: number | null;
  brands?: VisitBrand[];
  gauges?: VisitGauge[];
  impayes?: Array<{ montant?: number; actif?: boolean }>;
  note?: VisitNote | null;
}): VisitBrief {
  const ca = Number(input.ca) || 0;
  const previous = input.previous == null ? null : Number(input.previous);
  const deltaPct = input.deltaPct == null || Number.isNaN(Number(input.deltaPct)) ? null : Number(input.deltaPct);
  const trend = deltaPct == null ? 'Tendance indisponible' : deltaPct < 0 ? 'En baisse vs N-1' : deltaPct > 0 ? 'En hausse vs N-1' : 'Stable vs N-1';
  const brands = (input.brands || [])
    .filter((item) => item.label && item.deltaPct != null && Number(item.deltaPct) < 0)
    .sort((a, b) => Number(a.deltaPct ?? 0) - Number(b.deltaPct ?? 0))
    .slice(0, 5);
  const nearest = [...(input.gauges || [])].filter((item) => item.missing > 0).sort((a, b) => a.missing - b.missing)[0] || null;
  const open = (input.impayes || []).filter((item) => item.actif !== false);
  return {
    ca,
    previous,
    deltaPct,
    trend,
    brands,
    nearest,
    impayesCount: open.length,
    impayesAmount: open.reduce((sum, item) => sum + (Number(item.montant) || 0), 0),
    note: input.note?.text ? input.note : null,
  };
}
