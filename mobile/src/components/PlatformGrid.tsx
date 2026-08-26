import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { fmtEuro, fmtEuroK } from '../utils/format';
import { SupplierLogoBadge } from './SupplierLogoBadge';

export type PlatformTile = {
  key: string;
  label: string;
  ca: number;
  rfa?: number | null;
  deltaPct?: number | null;
};

type Props = {
  title?: string;
  items: PlatformTile[];
  logos?: Record<string, string>;
};

export function PlatformGrid({ title = 'RÉPARTITION PAR PLATEFORME', items, logos = {} }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.key} style={styles.tile}>
            <View style={styles.head}>
              <SupplierLogoBadge platformKey={item.key} logos={logos} size={30} />
              <Text style={styles.label}>{item.label}</Text>
            </View>
            <Text style={styles.ca}>{fmtEuroK(item.ca)}</Text>
            {item.rfa != null ? (
              <Text style={styles.rfa}>RFA {fmtEuro(item.rfa)}</Text>
            ) : item.deltaPct != null ? (
              <Text style={[styles.rfa, item.deltaPct < 0 && { color: colors.red }]}>
                {item.deltaPct >= 0 ? '+' : ''}
                {item.deltaPct.toFixed(1).replace('.', ',')} %
              </Text>
            ) : (
              <Text style={styles.rfaMuted}>—</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  section: {
    color: colors.muted2,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    minHeight: 104,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  ca: { color: colors.white, fontSize: 22, fontWeight: '800' },
  rfa: { color: colors.green, fontSize: 13, fontWeight: '700', marginTop: 8 },
  rfaMuted: { color: colors.muted2, fontSize: 13, marginTop: 8 },
});
