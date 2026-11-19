import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ColorMode,
  DOT_MIN,
  caExtent,
  legendEntries,
  markerDiameter,
} from '../map/markerStyle';
import { MapPoint } from '../map/types';
import { colors } from '../theme';
import { fmtEuro } from '../utils/format';
import { Icon } from './Icon';

type Props = {
  points: MapPoint[];
  mode: ColorMode;
  open: boolean;
  onToggle: () => void;
};

export function MapLegend({ points, mode, open, onToggle }: Props) {
  const entries = legendEntries(points, mode);
  const extent = caExtent(points.map((point) => point.ca));
  const samples = extent.max > extent.min
    ? [
        { label: fmtEuro(extent.min), px: markerDiameter(extent.min, extent) },
        {
          label: fmtEuro(((Math.sqrt(extent.min) + Math.sqrt(extent.max)) / 2) ** 2),
          px: markerDiameter(((Math.sqrt(extent.min) + Math.sqrt(extent.max)) / 2) ** 2, extent),
        },
        { label: fmtEuro(extent.max), px: markerDiameter(extent.max, extent) },
      ]
    : [{ label: extent.max > 0 ? fmtEuro(extent.max) : 'CA —', px: extent.max > 0 ? Math.round((DOT_MIN + 32) / 2) : DOT_MIN }];

  return (
    <View style={styles.box}>
      <Pressable
        style={styles.head}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Replier la légende' : 'Afficher la légende'}
      >
        <Text style={styles.title}>Légende</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <View style={styles.swatches}>
            {entries.length === 0 ? <Text style={styles.note}>Aucun point pour cette couleur.</Text> : null}
            {entries.map((entry) => (
              <View key={entry.label} style={styles.swatchRow}>
                <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                <Text style={styles.label}>{entry.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            {mode === 'plateforme' ? 'Couleur du fournisseur principal. ' : 'Couleur du commercial. '}
            Taille selon √CA
            {extent.max > 0 ? `, de ${fmtEuro(extent.min)} à ${fmtEuro(extent.max)}` : ''}
          </Text>
          <View style={styles.sizes}>
            {samples.map((sample) => (
              <View key={sample.label} style={styles.sizeItem}>
                <View style={[styles.sizeDot, { width: sample.px, height: sample.px, borderRadius: sample.px / 2 }]} />
                <Text style={styles.note}>{sample.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  head: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.white, fontWeight: '800', fontSize: 13 },
  body: { gap: 6, paddingBottom: 4 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#fff' },
  label: { color: colors.text, fontSize: 12, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 12 },
  sizes: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  sizeItem: { alignItems: 'center', gap: 4 },
  sizeDot: { backgroundColor: colors.orange, borderWidth: 2, borderColor: '#fff' },
});
