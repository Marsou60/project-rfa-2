import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMERCIAL_COLORS,
  DOT_MAX,
  DOT_MIN,
  PLATFORM_COLORS,
  caExtent,
  clusterPreview,
  commercialPalette,
  contractTierLabel,
  legendEntries,
  markerDiameter,
  pointColor,
  principalPlatform,
} from './markerStyle.ts';

test('le palier suit les seuils Silver et Gold', () => {
  assert.equal(contractTierLabel(null), null);
  assert.equal(contractTierLabel(86_000), 'Classique');
  assert.equal(contractTierLabel(100_001), 'Silver');
  assert.equal(contractTierLabel(250_000), 'Silver');
  assert.equal(contractTierLabel(300_001), 'Gold');
});

test('la taille suit la racine du CA entre un minimum et un maximum lisibles', () => {
  const extent = { min: 10_000, max: 360_000 };
  assert.equal(markerDiameter(extent.min, extent), DOT_MIN);
  assert.equal(markerDiameter(extent.max, extent), DOT_MAX);
  assert.equal(markerDiameter(null, extent), DOT_MIN);
  assert.equal(markerDiameter(0, extent), DOT_MIN);
  assert.equal(markerDiameter(-20, extent), DOT_MIN);

  const sqrtMid = ((Math.sqrt(extent.min) + Math.sqrt(extent.max)) / 2) ** 2;
  const linearMid = (extent.min + extent.max) / 2;
  const atSqrt = markerDiameter(sqrtMid, extent);
  const atLinear = markerDiameter(linearMid, extent);
  assert.ok(Math.abs(atSqrt - (DOT_MIN + DOT_MAX) / 2) <= 1);
  assert.ok(atLinear > atSqrt, 'le milieu arithmétique du CA est plus gros que le milieu des racines');

  let previous = 0;
  [10_000, 40_000, 90_000, 160_000, 250_000, 360_000].forEach((ca) => {
    const size = markerDiameter(ca, extent);
    assert.ok(size >= previous);
    assert.ok(size >= DOT_MIN && size <= DOT_MAX);
    previous = size;
  });
});

test('un CA unique prend la taille médiane, un CA nul la taille minimale', () => {
  assert.equal(markerDiameter(80_000, { min: 80_000, max: 80_000 }), Math.round((DOT_MIN + DOT_MAX) / 2));
  assert.equal(markerDiameter(null, caExtent([null, 0])), DOT_MIN);
});

test('les couleurs de plateforme sont stables et distinctes', () => {
  const palette = new Map<string, string>();
  const acr = { fournisseur_principal: 'acr', plateformes: ['DCA'] };
  assert.equal(pointColor(acr, 'plateforme', palette), PLATFORM_COLORS.ACR);
  assert.equal(pointColor({ plateformes: ['DCA'] }, 'plateforme', palette), PLATFORM_COLORS.DCA);
  assert.equal(pointColor({ plateformes: ['EXADIS'] }, 'plateforme', palette), PLATFORM_COLORS.EXADIS);
  assert.equal(pointColor({ plateformes: ['Alliance'] }, 'plateforme', palette), PLATFORM_COLORS.ALLIANCE);
  const used = new Set([
    PLATFORM_COLORS.ACR,
    PLATFORM_COLORS.DCA,
    PLATFORM_COLORS.EXADIS,
    PLATFORM_COLORS.ALLIANCE,
  ]);
  assert.equal(used.size, 4);
  assert.equal(principalPlatform({ fournisseur_principal: 'DCA', plateformes: ['ACR'] }), 'DCA');
});

test('la couleur commercial ne dépend pas de l ordre des points', () => {
  const names = ['Inès Morel', 'Camille Martin', null];
  const forward = commercialPalette(names);
  const backward = commercialPalette([...names].reverse());
  assert.equal(forward.get('Camille Martin'), backward.get('Camille Martin'));
  assert.equal(forward.get('Inès Morel'), backward.get('Inès Morel'));
  assert.equal(forward.get('Non renseigné'), backward.get('Non renseigné'));
  assert.notEqual(forward.get('Camille Martin'), forward.get('Inès Morel'));
  assert.equal(forward.get('Camille Martin'), COMMERCIAL_COLORS[0]);

  const points = names.map((commercial) => ({ commercial, plateformes: ['ACR'] }));
  const legend = legendEntries(points, 'commercial').map((entry) => entry.label);
  assert.deepEqual(legend, ['Camille Martin', 'Inès Morel', 'Non renseigné']);
  assert.deepEqual(
    legendEntries(points, 'plateforme').map((entry) => entry.label),
    ['ACR'],
  );
});

test('la légende plateforme suit ACR, DCA, EXADIS, Alliance puis le reste', () => {
  const points = [
    { fournisseur_principal: 'CODIFA', plateformes: ['CODIFA'] },
    { fournisseur_principal: 'ALLIANCE', plateformes: ['ALLIANCE'] },
    { fournisseur_principal: 'ACR', plateformes: ['ACR'] },
    { fournisseur_principal: 'DCA', plateformes: ['DCA'] },
  ];
  assert.deepEqual(
    legendEntries(points, 'plateforme').map((entry) => entry.label),
    ['ACR', 'DCA', 'ALLIANCE', 'CODIFA'],
  );
});

test('l aperçu de bulle compte les plateformes et le CA sans zoomer', () => {
  const preview = clusterPreview([
    { code_union: 'A', ca: 80_000, plateformes: ['ACR', 'DCA'] },
    { code_union: 'B', ca: 20_000, plateformes: ['ACR'] },
    { code_union: 'C', ca: null, plateformes: [] },
  ]);
  assert.equal(preview.count, 3);
  assert.equal(preview.totalCa, 100_000);
  assert.deepEqual(preview.codes, ['A', 'B', 'C']);
  assert.deepEqual(preview.byPlatform, [
    { label: 'ACR', count: 2 },
    { label: 'Autre', count: 1 },
    { label: 'DCA', count: 1 },
  ]);
});
