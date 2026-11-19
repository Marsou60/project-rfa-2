import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { contractTierLabel, principalPlatform } from '../map/markerStyle';
import { MapPoint, MapUnlocated, REASON_LABEL } from '../map/types';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';
import { Icon } from './Icon';

type Props = {
  point?: MapPoint | null;
  missing?: MapUnlocated | null;
  color: string;
  showCommercial?: boolean;
  onClose: () => void;
  onOpenFiche: () => void;
};

export function MapCompactCard({ point, missing, color, showCommercial, onClose, onOpenFiche }: Props) {
  const code = point?.code_union || missing?.code_union || '';
  const nom = point?.nom || missing?.nom || code;
  const ville = point?.ville || missing?.ville || null;
  const ca = point?.ca ?? missing?.ca;
  const palier = point?.palier || missing?.palier || contractTierLabel(ca);
  const supplier = principalPlatform(point || missing || {}) || '—';
  const commercial = point?.commercial || missing?.commercial || null;
  const others = (point?.plateformes || missing?.plateformes || [])
    .map((item) => item.toUpperCase())
    .filter((item) => item && item !== supplier);
  const supplierLabel = others.length ? `${supplier} +${others.length}` : supplier;

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`Fiche courte ${nom}`}>
      <View style={styles.titleRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{nom}</Text>
          <Text style={styles.city} numberOfLines={1}>{ville || 'Ville non renseignée'}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer la fiche" hitSlop={8}>
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.meta} numberOfLines={2}>
        {ca != null ? fmtEuro(ca) : 'CA —'}
        {' · '}
        {palier || 'Palier —'}
        {' · '}
        {supplierLabel}
      </Text>
      {showCommercial ? (
        <Text style={styles.commercial} numberOfLines={1}>{commercial || 'Commercial non renseigné'}</Text>
      ) : null}
      {missing ? (
        <Text style={styles.warn}>Pas placé sur la carte : {REASON_LABEL[missing.reason]}.</Text>
      ) : null}
      <Pressable style={styles.open} onPress={onOpenFiche} accessibilityRole="button" accessibilityLabel="Voir la fiche">
        <Text style={styles.openText}>Voir la fiche</Text>
        <Icon name="chevron-up" size={16} color={colors.bg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  name: { color: colors.white, fontSize: 17, fontWeight: '800' },
  city: { color: colors.muted, fontSize: 13, marginTop: 1 },
  meta: { color: colors.text, fontSize: 14, fontWeight: '700' },
  commercial: { color: colors.muted, fontSize: 13 },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 18 },
  open: {
    marginTop: 2,
    backgroundColor: colors.orange,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  openText: { color: colors.bg, fontWeight: '800' },
});
