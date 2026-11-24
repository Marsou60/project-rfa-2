import { requestInAppBack } from './webHistory';

type Nav = { setParams: (params: Record<string, string>) => void };

export function readCouches(params?: { couches?: unknown } | null): string[] {
  const raw = params?.couches;
  if (typeof raw !== 'string') return [];
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function writeCouches(navigation: Nav, current: string[], next: string[]) {
  const value = next.filter(Boolean).join('|');
  if (value === current.join('|')) return;
  navigation.setParams({ couches: value });
}

/** Ferme la couche du dessus via l'historique, pour rester aligné avec le bouton système. */
export function dismissCouche(navigation: Nav, params: { couches?: unknown } | null | undefined, token: string) {
  const current = readCouches(params);
  if (!current.includes(token)) return;
  if (current[current.length - 1] === token && requestInAppBack()) return;
  writeCouches(
    navigation,
    current,
    current.filter((item) => item !== token),
  );
}

export function pushCouche(navigation: Nav, params: { couches?: unknown } | null | undefined, token: string) {
  const current = readCouches(params);
  if (current[current.length - 1] === token) return;
  writeCouches(
    navigation,
    current,
    current.filter((item) => item !== token).concat(token),
  );
}
