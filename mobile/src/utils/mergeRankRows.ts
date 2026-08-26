/**
 * Fusionne les lignes de classement qui ne diffèrent que par la casse / espaces
 * (ex. MARTIAL vs Martial) — filet de sécurité tant que le backend n'est pas
 * redéployé, et garde-fou si la source Pure Data redevient inconsistante.
 */
export function mergeRankRowsByKey<
  T extends {
    key?: string;
    code_union?: string;
    raison_sociale?: string;
    current?: number;
    previous?: number;
    delta?: number;
    delta_pct?: number | null;
  },
>(rows: T[] | null | undefined): T[] {
  if (!rows?.length) return [];
  const map = new Map<string, T>();

  for (const row of rows) {
    const raw = String(row.key || row.raison_sociale || row.code_union || '').trim();
    if (!raw) continue;
    const canon = raw.replace(/\s+/g, ' ').toLocaleLowerCase('fr');
    const prev = map.get(canon);
    if (!prev) {
      map.set(canon, {
        ...row,
        key: row.key
          ? raw.replace(/\s+/g, ' ').replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          : row.key,
      });
      continue;
    }
    const current = (prev.current || 0) + (row.current || 0);
    const previous = (prev.previous || 0) + (row.previous || 0);
    const delta = current - previous;
    const delta_pct = previous ? Math.round(((delta / previous) * 1000) / 10) : null;
    map.set(canon, {
      ...prev,
      current,
      previous,
      delta,
      delta_pct,
    });
  }

  return Array.from(map.values()).sort((a, b) => (b.current || 0) - (a.current || 0));
}
