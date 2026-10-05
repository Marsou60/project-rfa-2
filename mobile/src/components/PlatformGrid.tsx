import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { fmtEuro, fmtEuroK } from '../utils/format';
import { ProdexFicheNote } from './ProdexNoticeModal';
import { SupplierLogoBadge } from './SupplierLogoBadge';

export type PlatformTile = {
  key: string;
  label: string;
  ca: number;
  rfa?: number | null;
  deltaPct?: number | null;
  caExclu?: number;
  caRemunere?: number;
};

type Props = {
  title?: string;
  items: PlatformTile[];
  logos?: Record<string, string>;
  onPress?: (item: PlatformTile) => void;
  onOpenProdexNotice?: () => void;
};

export function PlatformGrid({
  title = 'Répartition par plateforme',
  items,
  logos = {},
  onPress,
  onOpenProdexNotice,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const exadis = String(item.key || '').toUpperCase().includes('EXADIS');
          const inner = (
            <>
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
              {item.caExclu ? (
                <Text style={styles.exclu}>
                  Dont {fmtEuro(item.caExclu)} Prodex non rémunéré. Palier sur {fmtEuroK(item.ca)}, RFA sur {fmtEuro(item.caRemunere || 0)}.
                </Text>
              ) : null}
              {onPress ? <Text style={styles.open}>Détail ›</Text> : null}
            </>
          );
          return (
            <View key={item.key} style={[styles.tile, exadis && onOpenProdexNotice && styles.tileWide]}>
              {onPress ? (
                <Pressable
                  onPress={() => onPress(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${fmtEuroK(item.ca)}, ouvrir le détail`}
                >
                  {inner}
                </Pressable>
              ) : (
                inner
              )}
              {exadis && onOpenProdexNotice ? <ProdexFicheNote onOpen={onOpenProdexNotice} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  section: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
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
  tileWide: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  ca: { color: colors.white, fontSize: 22, fontWeight: '800' },
  rfa: { color: colors.green, fontSize: 13, fontWeight: '700', marginTop: 8 },
  exclu: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  rfaMuted: { color: colors.muted2, fontSize: 13, marginTop: 8 },
  open: { color: colors.orangeSoft, fontSize: 12, fontWeight: '700', marginTop: 8 },
});
