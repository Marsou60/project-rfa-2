import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fichePalierGauges } from './rfaProgress.ts';

test('la jauge plateforme dit le manque et le gain, et la projection', () => {
  const gauges = fichePalierGauges({
    caGlobal: 40000,
    level: 'CLASSIQUE',
    levelBased: true,
    lines: [
      {
        key: 'GLOBAL_ACR',
        label: 'ACR',
        ca: 42000,
        tiersRfa: [{ min: 50000, rate: 0.02 }],
        tiersBonus: [],
        projectedCa: 50400,
      },
    ],
  });
  const acr = gauges.find((item) => item.key === 'GLOBAL_ACR');
  assert.ok(acr);
  assert.equal(acr.missing, 8000);
  assert.equal(acr.gain, 1000);
  assert.equal(acr.projectionReaches, true);
  assert.equal(gauges[0].label, 'Passer Silver');
});
