/**
 * Adresse d'écran de la PWA : chemin + query, sans l'origine.
 * Recharge profonde : le routeur relit cette adresse et réaffiche l'écran.
 */

export type AppArea = 'public' | 'union' | 'adherent' | 'demo';

export type BrandOnglet = 'plateformes' | 'adherents';

export type StackLocation =
  | { name: 'Connexion' }
  | { name: 'RankDetail'; kind: string; fournisseur?: string; liste?: string }
  | { name: 'BrandDetail'; marque: string; onglet: BrandOnglet }
  | { name: 'FilteredClients'; kind: string; value: string; fournisseur?: string }
  | { name: 'ClientRfa'; codeUnion?: string; groupeClient?: string; onglet: string }
  | { name: 'SliceDetail'; fournisseur: string; codeUnion?: string; groupeClient?: string };

export type AppLocation = {
  area: AppArea;
  tab: string;
  /** Onglet de l'écran « Ma RFA » (adhérent). */
  onglet?: string;
  vue?: 'groupes';
  /** Puce d'alerte autre que Palier (atteints, à risque, marques…). */
  alerte?: string;
  /** Sous-onglet de la puce Palier. Absent = CA à date. */
  palierVue?: 'projection';
  stack?: StackLocation;
  layers: string[];
};

export type NavRoute = {
  name?: string;
  key?: string;
  params?: Record<string, unknown>;
  state?: NavState;
};

export type NavState = {
  index?: number;
  routes?: NavRoute[];
};

export type NavDecision =
  | { type: 'none' }
  | { type: 'set-params'; params: Record<string, string> }
  | { type: 'go-back' }
  | { type: 'jump-tab'; tab: string; params: Record<string, string> }
  | { type: 'reset' };

const RANK_KINDS = new Set([
  'marques',
  'familles',
  'sous_familles',
  'commerciaux',
  'regions',
  'groupes',
  'clients',
  'plateformes',
]);

const LISTES = new Set(['hausses', 'baisses', 'mono', 'fideles']);
const FILTER_KINDS = new Set(['region', 'commercial', 'marque', 'plateforme']);
const CLIENT_ONGLETS = new Set(['mois', 'rfa', 'marques', 'familles', 'contrat', 'fiche']);

const TAB_SLUG: Record<string, string> = {
  Accueil: 'accueil',
  Reseau: 'reseau',
  Rejoindre: 'rejoindre',
  Adherents: 'adherents',
  Carte: 'carte',
  Analyses: 'analyses',
  Alertes: 'alertes',
  Compte: 'compte',
  RFA: 'ma-rfa',
};

const SLUG_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_SLUG).map(([tab, slug]) => [slug, tab]),
);

export function tabsFor(area: AppArea): string[] {
  if (area === 'public') return ['Accueil', 'Reseau', 'Rejoindre'];
  if (area === 'adherent') return ['Accueil', 'RFA', 'Alertes', 'Compte'];
  if (area === 'demo') return ['Carte'];
  return ['Accueil', 'Adherents', 'Carte', 'Analyses', 'Alertes', 'Compte'];
}

export function defaultTab(area: AppArea): string {
  return tabsFor(area)[0] || 'Accueil';
}

export function homeLocation(area: AppArea): AppLocation {
  const tab = defaultTab(area);
  return {
    area,
    tab,
    onglet: tab === 'RFA' ? 'rfa' : undefined,
    layers: [],
  };
}

export function tabsRouteName(area: AppArea): string {
  if (area === 'public') return 'PublicTabs';
  if (area === 'adherent') return 'AdherentTabs';
  if (area === 'demo') return 'CarteDemo';
  return 'UnionTabs';
}

function isTabsName(name?: string): boolean {
  return name === 'PublicTabs' || name === 'UnionTabs' || name === 'AdherentTabs' || name === 'CarteDemo';
}

export function readLayers(params?: Record<string, unknown> | null): string[] {
  const raw = params?.couches;
  if (typeof raw !== 'string') return [];
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function clientOnglet(value: unknown, fallback = 'mois'): string {
  const text = typeof value === 'string' ? value : '';
  return CLIENT_ONGLETS.has(text) ? text : fallback;
}

function brandOnglet(value: unknown): BrandOnglet {
  return value === 'adherents' ? 'adherents' : 'plateformes';
}

export function leafParams(loc: AppLocation): Record<string, string> {
  const couches = loc.layers.join('|');
  if (!loc.stack) {
    const params: Record<string, string> = {};
    if (loc.tab === 'RFA') params.initialTab = loc.onglet || 'rfa';
    if (loc.tab === 'Adherents') params.vue = loc.vue === 'groupes' ? 'groupes' : '';
    if (couches || loc.tab === 'Accueil' || loc.tab === 'Carte' || loc.tab === 'RFA') params.couches = couches;
    if (loc.tab === 'Alertes') {
      params.alerte = loc.alerte || '';
      params.palier = loc.palierVue === 'projection' ? 'projection' : '';
    }
    return params;
  }
  const params: Record<string, string> = { couches };
  const stack = loc.stack;
  if (stack.name === 'BrandDetail') {
    params.marque = stack.marque;
    params.onglet = stack.onglet;
  } else if (stack.name === 'RankDetail') {
    params.kind = stack.kind;
    params.fournisseur = stack.fournisseur || '';
    params.liste = stack.liste || '';
  } else if (stack.name === 'FilteredClients') {
    params.kind = stack.kind;
    params.value = stack.value;
    params.fournisseur = stack.fournisseur || '';
  } else if (stack.name === 'ClientRfa') {
    params.codeUnion = stack.codeUnion || '';
    params.groupeClient = stack.groupeClient || '';
    params.initialTab = stack.onglet;
  } else if (stack.name === 'SliceDetail') {
    params.fournisseur = stack.fournisseur;
    params.codeUnion = stack.codeUnion || '';
    params.groupeClient = stack.groupeClient || '';
  }
  return params;
}

function stackFromRoute(name: string | undefined, params?: Record<string, unknown>): StackLocation | undefined {
  if (name === 'Connexion') return { name: 'Connexion' };
  if (name === 'BrandDetail') {
    const marque = String(params?.marque || '').trim();
    if (!marque) return undefined;
    return { name: 'BrandDetail', marque, onglet: brandOnglet(params?.onglet) };
  }
  if (name === 'RankDetail') {
    const kind = String(params?.kind || '');
    if (!RANK_KINDS.has(kind)) return undefined;
    const liste = String(params?.liste || '');
    const fournisseur = String(params?.fournisseur || '').trim();
    return {
      name: 'RankDetail',
      kind,
      liste: LISTES.has(liste) ? liste : undefined,
      fournisseur: fournisseur || undefined,
    };
  }
  if (name === 'FilteredClients') {
    const kind = String(params?.kind || '');
    const value = String(params?.value || '').trim();
    if (!FILTER_KINDS.has(kind) || !value) return undefined;
    const fournisseur = String(params?.fournisseur || '').trim();
    return { name: 'FilteredClients', kind, value, fournisseur: fournisseur || undefined };
  }
  if (name === 'ClientRfa') {
    const codeUnion = String(params?.codeUnion || '').trim();
    const groupeClient = String(params?.groupeClient || '').trim();
    if (!codeUnion && !groupeClient) return undefined;
    return {
      name: 'ClientRfa',
      codeUnion: codeUnion || undefined,
      groupeClient: groupeClient || undefined,
      onglet: clientOnglet(params?.initialTab),
    };
  }
  if (name === 'SliceDetail') {
    const fournisseur = String(params?.fournisseur || '').trim();
    if (!fournisseur) return undefined;
    const codeUnion = String(params?.codeUnion || '').trim();
    const groupeClient = String(params?.groupeClient || '').trim();
    return {
      name: 'SliceDetail',
      fournisseur,
      codeUnion: codeUnion || undefined,
      groupeClient: groupeClient || undefined,
    };
  }
  return undefined;
}

function locationFromTab(area: AppArea, tabState?: NavState, fallbackParams?: Record<string, unknown>): AppLocation {
  const names = tabsFor(area);
  let tab = names[0] || 'Accueil';
  let params = fallbackParams || {};
  if (tabState?.routes?.length) {
    const idx = tabState.index ?? 0;
    const route = tabState.routes[idx];
    if (route?.name && names.includes(route.name)) {
      tab = route.name;
      params = route.params || {};
    }
  }
  const alerte = tab === 'Alertes' ? String(params.alerte || '').trim() : '';
  return {
    area,
    tab,
    onglet: tab === 'RFA' ? clientOnglet(params.initialTab, 'rfa') : undefined,
    vue: tab === 'Adherents' && params.vue === 'groupes' ? 'groupes' : undefined,
    alerte: alerte && alerte !== 'palier' ? alerte : undefined,
    palierVue: tab === 'Alertes' && params.palier === 'projection' ? 'projection' : undefined,
    layers: readLayers(params),
  };
}

export function locationFromNav(state: NavState | undefined, area: AppArea): AppLocation {
  const home = homeLocation(area);
  if (!state?.routes?.length) return home;
  const route = state.routes[state.index ?? 0];
  if (!route?.name) return home;
  if (route.name === 'Connexion') {
    return area === 'public' ? { ...home, tab: 'Accueil', stack: { name: 'Connexion' }, layers: [] } : home;
  }
  if (route.name === 'CarteDemo') {
    return { ...homeLocation('demo'), layers: readLayers(route.params), area };
  }
  if (isTabsName(route.name)) return locationFromTab(area, route.state, route.params);
  const tabs = state.routes.find((item) => isTabsName(item.name));
  const tabLoc = locationFromTab(area, tabs?.state);
  const stack = stackFromRoute(route.name, route.params);
  if (!stack) return { ...tabLoc, layers: readLayers(route.params) };
  if (!stackAllowed(area, stack)) return tabLoc;
  return {
    area,
    tab: tabLoc.tab,
    stack,
    layers: readLayers(route.params),
  };
}

function stackAllowed(area: AppArea, stack: StackLocation): boolean {
  if (stack.name === 'Connexion') return area === 'public';
  if (stack.name === 'SliceDetail') return area === 'union' || area === 'adherent';
  return area === 'union';
}

export function previousUrlFromNav(state: NavState | undefined, area: AppArea): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = state.index ?? 0;
  if (index <= 0) return undefined;
  const prev = state.routes[index - 1];
  if (!prev) return undefined;
  const tabs = state.routes.find((item) => isTabsName(item.name));
  const routes = isTabsName(prev.name) ? [prev] : [tabs, prev].filter((item): item is NavRoute => Boolean(item));
  return build(locationFromNav({ index: routes.length - 1, routes }, area));
}

export function focusedRouteKey(state: NavState | undefined): string | undefined {
  let current = state;
  while (current?.routes?.length) {
    const route = current.routes[current.index ?? 0];
    if (!route) return undefined;
    if (route.state?.routes?.length) {
      current = route.state;
      continue;
    }
    return route.key;
  }
  return undefined;
}

export function findRouteKey(state: NavState | undefined, name: string): string | undefined {
  if (!state?.routes) return undefined;
  for (const route of state.routes) {
    if (route.name === name && route.key) return route.key;
    const nested = findRouteKey(route.state, name);
    if (nested) return nested;
  }
  return undefined;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function dec(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function build(loc: AppLocation): string {
  const slug = TAB_SLUG[loc.tab] || TAB_SLUG[defaultTab(loc.area)] || 'accueil';
  let path = `/${slug}`;
  const stack = loc.stack;
  if (stack?.name === 'Connexion') path = '/connexion';
  else if (stack?.name === 'RankDetail') path = `/${slug}/classement/${enc(stack.kind)}`;
  else if (stack?.name === 'BrandDetail') path = `/${slug}/marque/${enc(stack.marque)}/${stack.onglet}`;
  else if (stack?.name === 'FilteredClients') {
    path = `/${slug}/filtre/${enc(stack.kind)}/${enc(stack.value)}`;
  } else if (stack?.name === 'ClientRfa' && stack.codeUnion) {
    path = `/${slug}/fiche/${enc(stack.codeUnion)}/${stack.onglet}`;
  } else if (stack?.name === 'ClientRfa' && stack.groupeClient) {
    path = `/${slug}/groupe/${enc(stack.groupeClient)}/${stack.onglet}`;
  } else if (stack?.name === 'SliceDetail') {
    path = `/${slug}/plateforme/${enc(stack.fournisseur)}`;
    if (stack.codeUnion) path += `/adherent/${enc(stack.codeUnion)}`;
    else if (stack.groupeClient) path += `/groupe/${enc(stack.groupeClient)}`;
  } else if (loc.tab === 'RFA') path = `/ma-rfa/${loc.onglet || 'rfa'}`;

  const query = new URLSearchParams();
  if (stack?.name === 'RankDetail') {
    if (stack.fournisseur) query.set('plateforme', stack.fournisseur);
    if (stack.liste) query.set('liste', stack.liste);
  }
  if (stack?.name === 'FilteredClients' && stack.fournisseur) query.set('plateforme', stack.fournisseur);
  if (!stack && loc.vue === 'groupes') query.set('vue', 'groupes');
  if (!stack && loc.tab === 'Alertes') {
    if (loc.alerte && loc.alerte !== 'palier') query.set('alerte', loc.alerte);
    if (loc.palierVue === 'projection') query.set('palier', 'projection');
  }
  for (const layer of loc.layers) query.append('c', layer);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function parse(url: string, area: AppArea): AppLocation {
  const clean = (url || '').split('#')[0] || '/';
  const withoutOrigin = clean.replace(/^https?:\/\/[^/]+/i, '');
  const [pathPart, queryPart] = withoutOrigin.split('?');
  const normalized = pathPart.replace(/\/index\.html$/, '') || '/';
  const parts = normalized.split('/').filter(Boolean).map(dec);
  const query = new URLSearchParams(queryPart || '');
  const layers = query.getAll('c').map((item) => item.trim()).filter(Boolean);
  const home = homeLocation(area);

  if (!parts.length) return { ...home, layers };

  if (parts[0] === 'connexion') {
    if (area !== 'public') return home;
    return { ...home, tab: 'Accueil', stack: { name: 'Connexion' }, layers: [] };
  }

  const tab = SLUG_TAB[parts[0]];
  if (!tab || !tabsFor(area).includes(tab)) return home;

  const rest = parts.slice(1);
  let stack: StackLocation | undefined;
  let onglet = tab === 'RFA' ? 'rfa' : undefined;
  if (tab === 'RFA' && rest[0]) onglet = clientOnglet(rest[0], 'rfa');

  if (rest[0] === 'classement' && rest[1] && RANK_KINDS.has(rest[1])) {
    const liste = query.get('liste') || '';
    const fournisseur = (query.get('plateforme') || '').trim();
    stack = {
      name: 'RankDetail',
      kind: rest[1],
      liste: LISTES.has(liste) ? liste : undefined,
      fournisseur: fournisseur || undefined,
    };
  } else if (rest[0] === 'marque' && rest[1]) {
    stack = { name: 'BrandDetail', marque: rest[1], onglet: brandOnglet(rest[2]) };
  } else if (rest[0] === 'filtre' && rest[1] && rest[2] && FILTER_KINDS.has(rest[1])) {
    const fournisseur = (query.get('plateforme') || '').trim();
    stack = {
      name: 'FilteredClients',
      kind: rest[1],
      value: rest[2],
      fournisseur: fournisseur || undefined,
    };
  } else if (rest[0] === 'fiche' && rest[1]) {
    stack = { name: 'ClientRfa', codeUnion: rest[1], onglet: clientOnglet(rest[2]) };
  } else if (rest[0] === 'groupe' && rest[1]) {
    stack = { name: 'ClientRfa', groupeClient: rest[1], onglet: clientOnglet(rest[2]) };
  } else if (rest[0] === 'plateforme' && rest[1]) {
    stack = {
      name: 'SliceDetail',
      fournisseur: rest[1],
      codeUnion: rest[2] === 'adherent' ? rest[3] : undefined,
      groupeClient: rest[2] === 'groupe' ? rest[3] : undefined,
    };
    if ((rest[2] === 'adherent' || rest[2] === 'groupe') && !rest[3]) stack = undefined;
  }

  if (stack && !stackAllowed(area, stack)) return home;

  const vue = !stack && tab === 'Adherents' && query.get('vue') === 'groupes' ? 'groupes' : undefined;
  const alerteRaw = !stack && tab === 'Alertes' ? (query.get('alerte') || '').trim() : '';
  const alerte = alerteRaw && alerteRaw !== 'palier' ? alerteRaw : undefined;
  const palierVue = !stack && tab === 'Alertes' && query.get('palier') === 'projection' ? 'projection' : undefined;
  return { area, tab, onglet, vue, alerte, palierVue, stack, layers: stack || tab ? layers : [] };
}

export function canonicalize(url: string, area: AppArea): string {
  return build(parse(url, area));
}

export function leafId(loc: AppLocation): string {
  const stack = loc.stack;
  if (!stack) return `tab:${loc.tab}`;
  if (stack.name === 'Connexion') return 'connexion';
  if (stack.name === 'BrandDetail') return `brand:${loc.tab}:${stack.marque}`;
  if (stack.name === 'RankDetail') {
    return `rank:${loc.tab}:${stack.kind}:${stack.fournisseur || ''}:${stack.liste || ''}`;
  }
  if (stack.name === 'FilteredClients') {
    return `filtre:${loc.tab}:${stack.kind}:${stack.value}:${stack.fournisseur || ''}`;
  }
  if (stack.name === 'ClientRfa') return `fiche:${loc.tab}:${stack.codeUnion || ''}:${stack.groupeClient || ''}`;
  if (stack.name === 'SliceDetail') {
    return `slice:${loc.tab}:${stack.fournisseur}:${stack.codeUnion || ''}:${stack.groupeClient || ''}`;
  }
  return `tab:${loc.tab}`;
}

/** Parent logique quand le navigateur n'a pas d'entrée précédente (lien ouvert à froid). */
export function parentLocation(loc: AppLocation): AppLocation | null {
  if (loc.layers.length) return { ...loc, layers: loc.layers.slice(0, -1) };
  if (loc.vue === 'groupes') return { ...loc, vue: undefined };
  if (loc.stack?.name === 'BrandDetail' && loc.stack.onglet === 'adherents') {
    return { ...loc, stack: { ...loc.stack, onglet: 'plateformes' } };
  }
  if (loc.stack?.name === 'ClientRfa' && loc.stack.onglet !== 'mois') {
    return { ...loc, stack: { ...loc.stack, onglet: 'mois' } };
  }
  if (!loc.stack && loc.tab === 'RFA' && (loc.onglet || 'rfa') !== 'rfa') {
    return { ...loc, onglet: 'rfa' };
  }
  if (loc.stack) return { ...loc, stack: undefined, layers: [] };
  if (!loc.stack && loc.tab === 'Alertes' && loc.palierVue === 'projection') {
    return { ...loc, palierVue: undefined };
  }
  if (!loc.stack && loc.tab === 'Alertes' && loc.alerte) {
    return { ...loc, alerte: undefined, palierVue: undefined };
  }
  if (loc.tab !== defaultTab(loc.area)) {
    const tab = defaultTab(loc.area);
    return { area: loc.area, tab, onglet: tab === 'RFA' ? 'rfa' : undefined, layers: [] };
  }
  return null;
}

/**
 * Adresses à empiler quand l'app saute plusieurs crans d'un coup.
 * Ouvrir une fiche pousse aussi le communiqué dans le même rendu : sans cran
 * intermédiaire, fermer le communiqué quittait la fiche.
 */
export function forwardHistoryUrls(current: AppLocation, next: AppLocation): string[] {
  const nextUrl = build(next);
  const currentUrl = build(current);
  if (nextUrl === currentUrl) return [];
  const sameLeaf = leafId(current) === leafId(next);
  if (!sameLeaf && next.layers.length) {
    const urls: string[] = [];
    for (let i = 0; i <= next.layers.length; i += 1) {
      const url = build({ ...next, layers: next.layers.slice(0, i) });
      if (url !== currentUrl && url !== urls[urls.length - 1]) urls.push(url);
    }
    return urls;
  }
  const prefixOk =
    sameLeaf &&
    next.layers.length > current.layers.length &&
    current.layers.every((layer, index) => next.layers[index] === layer);
  if (prefixOk) {
    const urls: string[] = [];
    for (let i = current.layers.length + 1; i <= next.layers.length; i += 1) {
      urls.push(build({ ...next, layers: next.layers.slice(0, i) }));
    }
    return urls;
  }
  return [nextUrl];
}

export function decideNavigation(current: AppLocation, next: AppLocation, previousUrl?: string): NavDecision {
  if (build(current) === build(next)) return { type: 'none' };
  if (previousUrl && previousUrl === build(next)) return { type: 'go-back' };
  if (leafId(current) === leafId(next)) return { type: 'set-params', params: leafParams(next) };
  if (!current.stack && !next.stack) return { type: 'jump-tab', tab: next.tab, params: leafParams(next) };
  return { type: 'reset' };
}

export function stateFromLocation(loc: AppLocation): NavState {
  if (loc.area === 'demo') {
    return { index: 0, routes: [{ name: 'CarteDemo', params: leafParams(loc) }] };
  }
  const tabsName = tabsRouteName(loc.area);
  const names = tabsFor(loc.area);
  const tab = names.includes(loc.tab) ? loc.tab : names[0];
  const tabIndex = Math.max(0, names.indexOf(tab));
  const tabParams = loc.stack ? undefined : leafParams({ ...loc, tab });
  const tabState: NavState = {
    index: tabIndex,
    routes: names.map((name, index) =>
      index === tabIndex && tabParams ? { name, params: tabParams } : { name },
    ),
  };
  if (loc.stack?.name === 'Connexion') {
    return {
      index: 1,
      routes: [
        { name: 'PublicTabs', state: tabState },
        { name: 'Connexion' },
      ],
    };
  }
  if (!loc.stack) return { index: 0, routes: [{ name: tabsName, state: tabState }] };
  return {
    index: 1,
    routes: [
      { name: tabsName, state: tabState },
      { name: loc.stack.name, params: leafParams(loc) },
    ],
  };
}
