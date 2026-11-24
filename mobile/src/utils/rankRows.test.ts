import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankTitle, rowsForRank } from './rankRows.ts';

test('le classement reprend la bonne liste du dashboard', () => {
  const dash = {
    marques: [{ key: 'LuK', current: 10 }],
    top_marques: [{ key: 'Autre', current: 1 }],
    clients: [{ key: 'Tous', current: 5 }],
    top_clients_up: [{ key: 'Hausse', current: 2 }],
    platforms: [{ platform: 'ACR', current: 4, previous: 1, delta: 3, delta_pct: 300 }],
    cross: { mono_targets: [{ key: 'Mono', current: 8, platform: 'DCA' }] },
  };
  assert.equal(rowsForRank(dash, 'marques')[0].key, 'LuK');
  assert.equal(rowsForRank(dash, 'clients', 'hausses')[0].key, 'Hausse');
  assert.equal(rowsForRank(dash, 'clients', 'mono')[0].key, 'Mono');
  assert.equal(rowsForRank(dash, 'plateformes')[0].key, 'ACR');
  assert.equal(rankTitle('clients', 'hausses'), 'Plus fortes hausses');
  assert.equal(rankTitle('marques'), 'Toutes les marques');
});
