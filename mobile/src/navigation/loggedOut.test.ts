import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEB_HISTORY_STORAGE_KEY } from './historyController.ts';
import { LOGGED_OUT_PATH, exitToPublicHome, type LoggedOutTarget } from './loggedOut.ts';

function target(pathname: string, search = ''): LoggedOutTarget & { replaced: string | null; removed: string[] } {
  const removed: string[] = [];
  const state = {
    location: { pathname, search },
    replaced: null as string | null,
    removed,
    history: {
      replaceState: (_data: unknown, _unused: string, url?: string | null) => {
        state.replaced = url ?? null;
      },
    },
    sessionStorage: {
      removeItem: (key: string) => {
        removed.push(key);
      },
    },
  };
  return state;
}

test('quitter /compte revient à l’accueil public et oublie l’historique', () => {
  const page = target('/compte');
  exitToPublicHome(page);
  assert.equal(page.replaced, LOGGED_OUT_PATH);
  assert.deepEqual(page.removed, [WEB_HISTORY_STORAGE_KEY]);
});

test('une couche ouverte sur l’accueil est aussi refermée', () => {
  const page = target('/accueil', '?c=prodex');
  exitToPublicHome(page);
  assert.equal(page.replaced, '/accueil');
});

test('déjà sur /accueil : pas de nouvelle entrée, mais le cache d’historique part', () => {
  const page = target('/accueil');
  exitToPublicHome(page);
  assert.equal(page.replaced, null);
  assert.deepEqual(page.removed, [WEB_HISTORY_STORAGE_KEY]);
});

test('sessionStorage bloqué n’empêche pas de changer d’adresse', () => {
  const page = target('/compte');
  page.sessionStorage.removeItem = () => {
    throw new Error('SecurityError');
  };
  exitToPublicHome(page);
  assert.equal(page.replaced, '/accueil');
});
