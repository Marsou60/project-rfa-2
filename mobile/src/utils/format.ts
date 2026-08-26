export function fmtEuro(value?: number | null): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Compact display like "413 € k" from the mockup */
export function fmtEuroK(value?: number | null): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) {
    const k = Math.round(n / 1000);
    return `${new Intl.NumberFormat('fr-FR').format(k)} € k`;
  }
  return fmtEuro(n);
}

export function fmtPct(rate?: number | null): string {
  const n = Number(rate) || 0;
  const asRatio = Math.abs(n) <= 1 ? n : n / 100;
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(asRatio);
}

export function fmtDeltaPct(pct?: number | null): string {
  if (pct == null || Number.isNaN(Number(pct))) return '—';
  const n = Number(pct);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1).replace('.', ',')} %`;
}

export function platformLabel(key: string): string {
  const k = (key || '').replace(/^GLOBAL_/, '').toUpperCase();
  const map: Record<string, string> = {
    ACR: 'ACR',
    DCA: 'DCA',
    EXADIS: 'EXADIS',
    ALLIANCE: 'ALLIANCE',
  };
  return map[k] || k;
}

export function initials(name?: string | null): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
