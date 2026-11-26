import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fmtEuro } from './format.ts';
import { alertBadge, buildOwnAlerts, type OwnAlertInput } from './adherentAlerts.ts';

const acr: OwnAlertInput = {
  available: true,
  reporting_month: 10,
  ca: { totals: { global_total: 42000 } },
  level_based: true,
  contract_level: { id: 'CLASSIQUE', tripartites_enabled: false },
  rfa: {
    global: {
      GLOBAL_ACR: {
        label: 'ACR',
        ca: 42000,
        tiers_rfa: [
          { min: 20000, rate: 0.01 },
          { min: 50000, rate: 0.02 },
        ],
        tiers_bonus: [],
      },
      GLOBAL_DCA: {
        label: 'DCA',
        ca: 9000,
        tiers_rfa: [{ min: 10000, rate: 0.015 }],
        tiers_bonus: [],
      },
    },
    tri: {
      TRI_ACR_DISTRIBUTION: {
        label: 'Distribution ACR',
        ca: 4000,
        tiers: [{ min: 8000, rate: 0.01 }],
      },
    },
    acr_challenge: { triggered: false, threshold: 65000, missing: 23000, base_rate: 0.02, boosted_rate: 0.045 },
  },
};

test('les paliers restants sont triés du plus proche, avec le gain de RFA', () => {
  const alerts = buildOwnAlerts(acr);
  assert.equal(alerts.remaining[0].label, 'DCA');
  assert.equal(alerts.remaining[0].missing, 1000);
  assert.equal(alerts.remaining[0].sentence, `Encore ${fmtEuro(1000)} pour +${fmtEuro(150)} de RFA.`);
  assert.equal(alerts.closest?.id, 'GLOBAL_DCA');
  assert.equal(alerts.remaining.some((item) => item.label === 'ACR'), false);
  assert.equal(alerts.remaining.some((item) => item.kind === 'niveau'), false);
  assert.equal(alerts.remaining.some((item) => item.locked), false);
  assert.equal(alerts.badge, 2);
});

test('un palier déjà franchi donne le mois du cumul, pas une date inventée', () => {
  const alerts = buildOwnAlerts(acr, [
    {
      platform: 'ACR',
      months: [
        { month: 1, current: 10000, status: 'known' },
        { month: 2, current: 8000, status: 'known' },
        { month: 3, current: 24000, status: 'known' },
      ],
    },
  ]);
  const hit = alerts.reached.find((item) => item.id === 'GLOBAL_ACR:20000');
  assert.ok(hit);
  assert.equal(hit.month, 3);
  assert.equal(hit.rate, 0.01);
  assert.equal(hit.amount, 420);
  assert.equal(alerts.reached.some((item) => item.threshold === 50000), false);
});

test('sans historique mensuel, le palier atteint n’a pas de mois', () => {
  const alerts = buildOwnAlerts(acr);
  const hit = alerts.reached.find((item) => item.label === 'ACR');
  assert.ok(hit);
  assert.equal(hit.month, null);
});

test('un palier à exactement 2 000 € reste, un palier à 2 001 € non', () => {
  const alerts = buildOwnAlerts({
    available: true,
    ca: { totals: { global_total: 10000 } },
    rfa: {
      global: {
        GLOBAL_ACR: { label: 'ACR', ca: 48000, tiers_rfa: [{ min: 50000, rate: 0.02 }] },
        GLOBAL_DCA: { label: 'DCA', ca: 7999, tiers_rfa: [{ min: 10000, rate: 0.01 }] },
      },
    },
  });
  assert.deepEqual(alerts.remaining.map((item) => item.label), ['ACR']);
  assert.equal(alerts.remaining[0].missing, 2000);
  assert.equal(alerts.closest?.label, 'ACR');
  assert.equal(alerts.reached.length >= 0, true);
});

test('un impayé actif ajoute 1 au badge, les paliers loin non', () => {
  const alerts = buildOwnAlerts(acr);
  assert.equal(alerts.remaining.filter((item) => !item.locked).length, 1);
  assert.equal(alerts.badge, 2);
  assert.equal(alertBadge(alerts, 1), 3);
  assert.equal(alerts.acr?.missing, 23000);
});

test('sans données, aucune alerte', () => {
  const alerts = buildOwnAlerts({ available: false });
  assert.equal(alerts.badge, 0);
  assert.equal(alerts.closest, null);
});
