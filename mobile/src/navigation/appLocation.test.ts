import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AppLocation,
  build,
  decideNavigation,
  forwardHistoryUrls,
  homeLocation,
  locationFromNav,
  parentLocation,
  parse,
  previousUrlFromNav,
} from './appLocation.ts';

function roundTrip(loc: AppLocation) {
  const url = build(loc);
  const again = parse(url, loc.area);
  assert.equal(build(again), url);
  return url;
}

test('les adresses d’écran survivent à un aller-retour', () => {
  const samples: AppLocation[] = [
    homeLocation('union'),
    { area: 'union', tab: 'Analyses', layers: [] },
    { area: 'union', tab: 'Alertes', layers: [], stack: { name: 'BrandDetail', marque: 'LuK', onglet: 'plateformes' } },
    { area: 'union', tab: 'Analyses', layers: [], stack: { name: 'BrandDetail', marque: 'MANN FILTER', onglet: 'adherents' } },
    { area: 'union', tab: 'Analyses', layers: ['prodex'], stack: { name: 'RankDetail', kind: 'marques' } },
    {
      area: 'union',
      tab: 'Analyses',
      layers: [],
      stack: { name: 'RankDetail', kind: 'clients', liste: 'hausses' },
    },
    {
      area: 'union',
      tab: 'Accueil',
      layers: [],
      stack: { name: 'RankDetail', kind: 'marques', fournisseur: 'EXADIS' },
    },
    {
      area: 'union',
      tab: 'Adherents',
      layers: [],
      stack: { name: 'ClientRfa', codeUnion: 'M0001', onglet: 'mois' },
    },
    {
      area: 'union',
      tab: 'Adherents',
      layers: ['docs'],
      stack: { name: 'ClientRfa', groupeClient: 'Groupe Sud', onglet: 'rfa' },
    },
    { area: 'union', tab: 'Adherents', vue: 'groupes', layers: [] },
    {
      area: 'union',
      tab: 'Analyses',
      layers: [],
      stack: { name: 'FilteredClients', kind: 'region', value: 'IDF' },
    },
    { area: 'adherent', tab: 'RFA', onglet: 'mois', layers: [] },
    { area: 'adherent', tab: 'Accueil', layers: ['prodex'] },
    {
      area: 'adherent',
      tab: 'Accueil',
      layers: [],
      stack: { name: 'SliceDetail', fournisseur: 'ACR', codeUnion: 'M0001' },
    },
    { area: 'public', tab: 'Rejoindre', layers: [] },
    { area: 'public', tab: 'Accueil', layers: [], stack: { name: 'Connexion' } },
    { area: 'union', tab: 'Carte', layers: ['filtres', 'fiche:M0001'] },
    { area: 'union', tab: 'Alertes', layers: [], palierVue: 'projection' },
    { area: 'union', tab: 'Alertes', alerte: 'atteints', layers: [] },
    { area: 'union', tab: 'Adherents', layers: ['mois:1'], stack: { name: 'ClientRfa', codeUnion: 'M0001', onglet: 'mois' } },
  ];
  for (const loc of samples) roundTrip(loc);
});

test('une adresse inconnue ou hors rôle revient à l’accueil', () => {
  assert.equal(build(parse('/nope', 'union')), '/accueil');
  assert.equal(build(parse('/compte', 'public')), '/accueil');
  assert.equal(build(parse('/analyses/marque/LuK/plateformes', 'public')), '/accueil');
  assert.equal(build(parse('/', 'adherent')), '/accueil');
  assert.equal(build(parse('/ma-rfa', 'adherent')), '/ma-rfa/rfa');
  assert.equal(build(parse('/alertes', 'adherent')), '/alertes');
});

test('le parent logique recule d’un seul niveau et s’arrête à la racine', () => {
  let loc = parse('/analyses/marque/LuK/adherents?c=prodex', 'union');
  const seen = new Set<string>();
  const steps: string[] = [];
  while (true) {
    const url = build(loc);
    assert.equal(seen.has(url), false);
    seen.add(url);
    steps.push(url);
    const parent = parentLocation(loc);
    if (!parent) break;
    loc = parent;
  }
  assert.deepEqual(steps, [
    '/analyses/marque/LuK/adherents?c=prodex',
    '/analyses/marque/LuK/adherents',
    '/analyses/marque/LuK/plateformes',
    '/analyses',
    '/accueil',
  ]);
  assert.equal(parentLocation(homeLocation('union')), null);
  assert.equal(parentLocation(homeLocation('public')), null);
  assert.equal(build(parentLocation(parse('/alertes?palier=projection', 'union'))!), '/alertes');
  assert.equal(build(parentLocation(parse('/alertes?alerte=atteints', 'union'))!), '/alertes');
});

test('fermer le communiqué ne saute pas la fiche', () => {
  const list = parse('/alertes', 'union');
  const fiche = parse('/alertes/fiche/M0001/mois?c=prodex', 'union');
  assert.deepEqual(forwardHistoryUrls(list, fiche), [
    '/alertes/fiche/M0001/mois',
    '/alertes/fiche/M0001/mois?c=prodex',
  ]);
  const bare = parse('/alertes/fiche/M0001/mois', 'union');
  assert.equal(decideNavigation(fiche, bare, '/alertes').type, 'set-params');
});

test('le retour sur l’écran précédent utilise goBack, un onglet utilise setParams', () => {
  const brand = parse('/analyses/marque/LuK/adherents', 'union');
  const brandHome = parse('/analyses/marque/LuK/plateformes', 'union');
  const list = parse('/analyses/classement/marques', 'union');
  assert.equal(decideNavigation(brand, brandHome).type, 'set-params');
  assert.equal(decideNavigation(brandHome, list, build(list)).type, 'go-back');
  assert.equal(decideNavigation(parse('/analyses', 'union'), parse('/accueil', 'union')).type, 'jump-tab');
  assert.equal(decideNavigation(parse('/accueil', 'public'), parse('/connexion', 'public')).type, 'reset');
});

test('l’état de navigation se relit en adresse', () => {
  const state = {
    index: 1,
    routes: [
      {
        name: 'UnionTabs',
        state: {
          index: 3,
          routes: [
            { name: 'Accueil' },
            { name: 'Adherents' },
            { name: 'Carte' },
            { name: 'Analyses' },
            { name: 'Alertes' },
            { name: 'Compte' },
          ],
        },
      },
      { name: 'BrandDetail', params: { marque: 'LuK', onglet: 'adherents', couches: '' } },
    ],
  };
  assert.equal(build(locationFromNav(state, 'union')), '/analyses/marque/LuK/adherents');
  assert.equal(previousUrlFromNav(state, 'union'), '/analyses');
});
