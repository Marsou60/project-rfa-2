import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type AppArea, type AppLocation, build, parse } from './appLocation.ts';
import {
  type HistoryApi,
  type HistoryController,
  type HistoryStorage,
  createHistoryController,
} from './historyController.ts';

function memoryHistory(initial: string): HistoryApi & { index: number } {
  const entries: { url: string; state: unknown }[] = [{ url: initial, state: null }];
  let index = 0;
  const listeners = new Set<() => void>();
  return {
    get length() {
      return entries.length;
    },
    get index() {
      return index;
    },
    get url() {
      return entries[index].url;
    },
    get state() {
      return entries[index].state;
    },
    pushState(state: unknown, _title: string, url: string) {
      entries.splice(index + 1);
      entries.push({ url, state });
      index += 1;
    },
    replaceState(state: unknown, _title: string, url: string) {
      entries[index] = { url, state };
    },
    back() {
      if (index === 0) return;
      index -= 1;
      listeners.forEach((fn) => fn());
    },
    onPop(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

function memoryStorage(): HistoryStorage & { dump: () => string | null } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    dump: () => data.get('rfa-web-history') ?? null,
  };
}

function harness(area: AppArea, initialUrl: string, initialLoc?: AppLocation) {
  const history = memoryHistory(initialUrl);
  const storage = memoryStorage();
  let loc = initialLoc || parse(initialUrl, area);
  let steps = 0;
  let ctl: HistoryController | undefined;
  const bridge = {
    getArea: () => area,
    getLocation: () => loc,
    applyLocation: (next: AppLocation) => {
      steps += 1;
      if (steps > 25) throw new Error('boucle historique');
      loc = next;
      ctl?.notify();
    },
  };
  ctl = createHistoryController(history, bridge, storage, 'test-sid');
  return {
    history,
    storage,
    get loc() {
      return loc;
    },
    set loc(next: AppLocation) {
      loc = next;
    },
    ctl,
    go(next: AppLocation) {
      loc = next;
      ctl.notify();
    },
  };
}

test('le démarrage remplace l’adresse sans empiler un cran', () => {
  const app = harness('union', '/');
  assert.equal(app.history.length, 1);
  assert.equal(app.history.url, '/accueil');
  assert.equal(app.history.index, 0);
  assert.equal(build(app.loc), '/accueil');
});

test('chaque écran empile l’historique et le retour en enlève un', () => {
  const app = harness('union', '/accueil', parse('/accueil', 'union'));
  app.go(parse('/analyses', 'union'));
  app.go(parse('/analyses/classement/marques', 'union'));
  app.go(parse('/analyses/marque/LuK/plateformes', 'union'));
  app.go(parse('/analyses/marque/LuK/adherents', 'union'));
  assert.equal(app.history.url, '/analyses/marque/LuK/adherents');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/analyses/marque/LuK/plateformes');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/analyses/classement/marques');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/analyses');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/accueil');
  assert.equal(app.ctl.requestInAppBack(), false);
  assert.equal(app.history.index, 0);
  assert.equal(build(app.loc), '/accueil');
});

test('une couche déjà ouverte au démarrage reste visible et se ferme au retour', () => {
  const app = harness('adherent', '/accueil', parse('/accueil?c=prodex', 'adherent'));
  assert.equal(build(app.loc), '/accueil?c=prodex');
  assert.equal(app.history.url, '/accueil?c=prodex');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/accueil');
  assert.equal(app.ctl.requestInAppBack(), false);
});

test('une feuille est un niveau, et la racine ne boucle pas', () => {
  const app = harness('union', '/carte', parse('/carte', 'union'));
  app.go(parse('/carte?c=fiche%3AM0001', 'union'));
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/carte');
  // Ouvert directement sur Carte : le retour in-app ramène à l'accueil, une seule fois.
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/accueil');
  assert.equal(app.ctl.requestInAppBack(), false);
  assert.equal(build(app.loc), '/accueil');
});

test('recharger une adresse profonde réaffiche l’écran et le retour reste dans l’app', () => {
  const first = harness('union', '/accueil', parse('/accueil', 'union'));
  first.go(parse('/analyses', 'union'));
  first.go(parse('/analyses/marque/LuK/plateformes', 'union'));
  first.ctl.dispose();

  const history = first.history;
  const storage = first.storage;
  let loc = parse('/accueil', 'union');
  let steps = 0;
  let ctl: HistoryController | undefined;
  const bridge = {
    getArea: () => 'union' as const,
    getLocation: () => loc,
    applyLocation: (next: AppLocation) => {
      steps += 1;
      if (steps > 25) throw new Error('boucle historique');
      loc = next;
      ctl?.notify();
    },
  };
  ctl = createHistoryController(history, bridge, storage, 'after-reload');
  assert.equal(build(loc), '/analyses/marque/LuK/plateformes');
  assert.equal(ctl.requestInAppBack(), true);
  assert.equal(build(loc), '/analyses');
  assert.equal(history.url, '/analyses');
});

test('ouvrir une fiche avec le communiqué laisse la fiche au retour', () => {
  const app = harness('union', '/alertes', parse('/alertes', 'union'));
  app.go(parse('/alertes/fiche/M0001/mois?c=prodex', 'union'));
  assert.equal(app.history.url, '/alertes/fiche/M0001/mois?c=prodex');
  assert.equal(app.history.index, 2);
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/alertes/fiche/M0001/mois');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/alertes');
});

test('depuis une marque, fermer le communiqué reste sur la fiche', () => {
  const app = harness('union', '/analyses', parse('/analyses', 'union'));
  app.go(parse('/analyses/marque/LuK/adherents', 'union'));
  app.go(parse('/analyses/fiche/M0001/mois?c=prodex', 'union'));
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/analyses/fiche/M0001/mois');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/analyses/marque/LuK/adherents');
});

test('le sous-onglet projection est un cran, le retour revient à date', () => {
  const app = harness('union', '/alertes', parse('/alertes', 'union'));
  app.go(parse('/alertes?palier=projection', 'union'));
  assert.equal(app.history.url, '/alertes?palier=projection');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/alertes');
  assert.equal(app.ctl.requestInAppBack(), true);
  assert.equal(build(app.loc), '/accueil');
});

test('un retour in-app qui change déjà l’écran aligne l’historique sans doubler', () => {
  const app = harness('union', '/accueil', parse('/accueil', 'union'));
  app.go(parse('/analyses', 'union'));
  app.go(parse('/analyses/marque/LuK/plateformes', 'union'));
  app.go(parse('/analyses', 'union'));
  assert.equal(app.history.url, '/analyses');
  assert.equal(app.history.index, 1);
});
