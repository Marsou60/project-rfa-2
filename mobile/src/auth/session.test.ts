import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearStoredSession } from './session.ts';

test('la déconnexion efface le jeton et l’utilisateur', async () => {
  const removed: string[] = [];
  await clearStoredSession(async (key) => {
    removed.push(key);
  });
  assert.deepEqual(removed, [AUTH_TOKEN_KEY, AUTH_USER_KEY]);
});

test('un échec sur le jeton n’empêche pas d’effacer l’utilisateur', async () => {
  const removed: string[] = [];
  await assert.rejects(
    clearStoredSession(async (key) => {
      removed.push(key);
      if (key === AUTH_TOKEN_KEY) throw new Error('stockage indisponible');
    }),
    /stockage indisponible/,
  );
  assert.deepEqual(removed, [AUTH_TOKEN_KEY, AUTH_USER_KEY]);
});

test('l’écran Compte ne passe plus par Alert.alert ni window.confirm', () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../screens/AccountScreen.tsx');
  const source = readFileSync(file, 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/Alert\.alert|window\.confirm|window\.alert/.test(code), false);
  assert.equal(code.includes('<Modal'), true);
});
