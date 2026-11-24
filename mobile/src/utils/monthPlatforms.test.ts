import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rowsForMonth } from './monthPlatforms.ts';

const data = {
  available: true,
  year_current: 2026,
  year_previous: 2025,
  platform_months: { ACR: 10, DCA: 9, EXADIS: 9, ALLIANCE: 10 },
  platforms: [
    {
      platform: 'EXADIS',
      total_current: 1000,
      total_previous: 900,
      months: [
        { month: 10, current: 0, previous: 400, status: 'pending' },
        { month: 9, current: 300, previous: 250, status: 'known' },
      ],
    },
    {
      platform: 'ACR',
      total_current: 2000,
      total_previous: 1500,
      months: [{ month: 10, current: 500, previous: 400, status: 'known' }],
    },
    {
      platform: 'PRODEX',
      total_current: 80,
      total_previous: 0,
      months: [{ month: 10, current: 80, previous: 0, status: 'known' }],
    },
    {
      platform: 'DCA',
      total_current: 100,
      total_previous: 100,
      months: [{ month: 10, current: 0, previous: 0, status: 'pending' }],
    },
  ],
};

test('octobre montre ACR, Prodex, et le retard EXADIS/DCA', () => {
  const rows = rowsForMonth(data, 10);
  assert.deepEqual(
    rows.map((row) => [row.platform, row.pending, row.current, row.previous]),
    [
      ['ACR', false, 500, 400],
      ['DCA', true, 0, 0],
      ['EXADIS', true, 0, 400],
      ['PRODEX', false, 80, 0],
    ],
  );
});

test('un mois couvert à zéro sans N-1 n’est pas listé', () => {
  const quiet = {
    available: true,
    platform_months: { ACR: 10 },
    platforms: [
      {
        platform: 'ACR',
        total_current: 10,
        months: [{ month: 3, current: 0, previous: 0, status: 'known' }],
      },
    ],
  };
  assert.deepEqual(rowsForMonth(quiet, 3), []);
});
