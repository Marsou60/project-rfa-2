import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClusterPreview } from '../map/markerStyle';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';
import { Icon } from './Icon';

type Props = {
  preview: ClusterPreview;
  onClose: () => void;
  onZoom: () => void;
};

export function MapClusterCard({ preview, onClose, onZoom }: Props) {
  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`${preview.count} adhérents dans cette zone`}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{preview.count} adhérents</Text>
          <Text style={styles.meta}>CA total {fmtEuro(preview.totalCa)}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer l’aperçu" hitSlop={8}>
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.platforms}>
        {preview.byPlatform.map((item) => `${item.label} ${item.count}`).join(' · ') || 'Aucune plateforme'}
      </Text>
      <Pressable style={styles.zoom} onPress={onZoom} accessibilityRole="button" accessibilityLabel="Zoomer sur ce groupe">
        <Icon name="add" size={16} color={colors.bg} />
        <Text style={styles.zoomText}>Zoomer</Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { color: colors.white, fontSize: 17, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  platforms: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  zoom: {
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
  zoomText: { color: colors.bg, fontWeight: '800' },
});
