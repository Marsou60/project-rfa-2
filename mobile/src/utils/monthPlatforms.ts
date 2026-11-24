import { canonPlatform } from './format';

const ORDER = ['ACR', 'DCA', 'EXADIS', 'ALLIANCE'];

export type MonthPlatformRow = {
  platform: string;
  current: number;
  previous: number;
  /** Le mois n'est pas encore importé pour cette plateforme. */
  pending: boolean;
};

type MonthCell = {
  month: number;
  current?: number;
  previous?: number;
  status?: string;
};

type PlatformSlice = {
  platform?: string;
  total_current?: number;
  total_previous?: number;
  months?: MonthCell[];
  by_month?: Record<string, { current?: number; previous?: number }>;
};

export type MonthBreakdown = {
  available?: boolean;
  platform_months?: Record<string, number | null | undefined>;
  platforms?: PlatformSlice[];
};

function cellFor(platform: PlatformSlice, month: number) {
  const fromList = (platform.months || []).find((item) => Number(item.month) === month);
  if (fromList) {
    return {
      current: Number(fromList.current) || 0,
      previous: Number(fromList.previous) || 0,
      status: fromList.status,
    };
  }
  const by = platform.by_month || {};
  const row = by[String(month)] || by[month as unknown as string];
  return {
    current: Number(row?.current) || 0,
    previous: Number(row?.previous) || 0,
    status: undefined as string | undefined,
  };
}

function coveredThrough(data: MonthBreakdown, platform: string): number | null {
  const map = data.platform_months || {};
  const key = canonPlatform(platform);
  const raw = map[key] ?? map[platform];
  const month = Number(raw);
  return month >= 1 && month <= 12 ? month : null;
}

export function rowsForMonth(data: MonthBreakdown | null | undefined, month: number): MonthPlatformRow[] {
  if (!data?.available || !month) return [];
  const rows: MonthPlatformRow[] = [];
  for (const platform of data.platforms || []) {
    const name = String(platform.platform || '').trim();
    if (!name) continue;
    const cell = cellFor(platform, month);
    const through = coveredThrough(data, name);
    const pending = cell.status === 'pending' || (through != null && month > through);
    const used = (Number(platform.total_current) || 0) > 0 || (Number(platform.total_previous) || 0) > 0;
    if (!used && cell.current === 0 && cell.previous === 0) continue;
    if (!pending && cell.current === 0 && cell.previous === 0) continue;
    rows.push({
      platform: name,
      current: pending ? 0 : cell.current,
      previous: cell.previous,
      pending,
    });
  }
  return rows.sort((a, b) => {
    const ia = ORDER.indexOf(canonPlatform(a.platform));
    const ib = ORDER.indexOf(canonPlatform(b.platform));
    const ra = ia === -1 ? ORDER.length : ia;
    const rb = ib === -1 ? ORDER.length : ib;
    if (ra !== rb) return ra - rb;
    if (a.pending !== b.pending) return a.pending ? 1 : -1;
    return b.current - a.current;
  });
}
