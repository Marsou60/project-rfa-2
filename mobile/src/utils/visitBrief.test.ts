import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVisitBrief } from './visitBrief.ts';

test('la visite retient la baisse, le palier le plus proche, les impayés et la note', () => {
  const brief = buildVisitBrief({
    ca: 80000,
    previous: 100000,
    deltaPct: -20,
    brands: [
      { label: 'LuK', deltaPct: -30, current: 4000 },
      { label: 'Bosch', deltaPct: 10, current: 9000 },
    ],
    gauges: [
      { label: 'ACR', missing: 8000, gain: 200, progress: 80 },
      { label: 'DCA', missing: 1500, gain: 50, progress: 90 },
    ],
    impayes: [{ montant: 120, actif: true }, { montant: 50, actif: false }],
    note: { text: 'Passer commande filtres', author: 'Rayane' },
  });
  assert.equal(brief.trend, 'En baisse vs N-1');
  assert.deepEqual(brief.brands.map((item) => item.label), ['LuK']);
  assert.equal(brief.nearest?.label, 'DCA');
  assert.equal(brief.impayesCount, 1);
  assert.equal(brief.impayesAmount, 120);
  assert.equal(brief.note?.text, 'Passer commande filtres');
});
