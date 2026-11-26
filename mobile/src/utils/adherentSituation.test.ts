import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOwnAlerts } from './adherentAlerts.ts';
import { buildSituationAlerts, droppingBrands, droppingMonth } from './adherentSituation.ts';

test('une marque principale en baisse de 15 % est signalée, une petite marque non', () => {
  const drops = droppingBrands([
    { label: 'LuK', ca_current: 8000, ca_previous: 10000, delta_pct: -20 },
    { label: 'Valeo', ca_current: 9000, ca_previous: 10000, delta_pct: -10 },
    { label: 'NK', ca_current: 100, ca_previous: 400, delta_pct: -75 },
  ]);
  assert.deepEqual(drops.map((item) => item.label), ['LuK']);
});

test('le dernier mois importé en baisse claire est retenu', () => {
  const drop = droppingMonth([
    { month: 8, current: 9000, previous: 8000, delta_pct: 12.5 },
    { month: 9, current: 4000, previous: 8000, delta_pct: -50 },
    { month: 10, current: 0, previous: 100, status: 'pending', delta_pct: -100 },
  ]);
  assert.equal(drop?.month, 9);
  assert.equal(droppingMonth([{ month: 9, current: 900, previous: 800, delta_pct: -15 }]), null);
});

test('le palier franchi ce mois compte à part et n’entre pas dans le badge', () => {
  const paliers = buildOwnAlerts(
    {
      available: true,
      reporting_month: 3,
      ca: { totals: { global_total: 42000 } },
      rfa: {
        global: {
          GLOBAL_ACR: {
            label: 'ACR',
            ca: 42000,
            tiers_rfa: [
              { min: 20000, rate: 0.01 },
              { min: 50000, rate: 0.02 },
            ],
          },
        },
      },
    },
    [
      {
        platform: 'ACR',
        months: [
          { month: 1, current: 10000 },
          { month: 2, current: 8000 },
          { month: 3, current: 24000 },
        ],
      },
    ],
  );
  const situation = buildSituationAlerts({
    brands: [{ label: 'LuK', ca_current: 4000, ca_previous: 8000, delta_pct: -50 }],
    months: [{ month: 3, current: 5000, previous: 8000, delta_pct: -37.5 }],
    missingDocs: ['RIB', 'Kbis'],
    reached: paliers.reached,
    reportingMonth: 3,
  });
  assert.equal(situation.reachedThisMonth.length, 1);
  assert.equal(situation.reachedThisMonth[0].month, 3);
  assert.equal(situation.badge, 1 + 1 + 2);
  assert.equal(situation.badge, situation.brands.length + 1 + situation.missingDocs.length);
});
