import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeMapFilterCount } from './filterCount.ts';

test('le badge compte plateforme, palier proche et couleur commercial', () => {
  assert.equal(activeMapFilterCount({ supplier: null, nearOnly: false, colorMode: 'plateforme' }), 0);
  assert.equal(activeMapFilterCount({ supplier: 'ACR', nearOnly: false, colorMode: 'plateforme' }), 1);
  assert.equal(activeMapFilterCount({ supplier: 'ACR', nearOnly: true, colorMode: 'plateforme' }), 2);
  assert.equal(activeMapFilterCount({ supplier: null, nearOnly: true, colorMode: 'commercial' }), 2);
  assert.equal(activeMapFilterCount({ supplier: 'DCA', nearOnly: true, colorMode: 'commercial' }), 3);
});
