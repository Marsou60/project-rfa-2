import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FranceMapProps } from '../map/chrome';
import { commercialPalette, contractTierLabel, pointColor, principalPlatform } from '../map/markerStyle';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';

/**
 * Secours natif (Expo Go / APK). La carte Leaflet, les bulles et le zoom
 * sont dans la PWA, qui est le build web déployé.
 */
export function FranceMap({
  points,
  selectedCode,
  onSelect,
  colorMode = 'plateforme',
}: FranceMapProps) {
  const palette = commercialPalette(points.map((point) => point.commercial));
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        La carte de France (bulles, zoom, fond) est disponible dans la PWA. Ici, les mêmes adhérents en liste.
      </Text>
      <FlatList
        data={points}
        keyExtractor={(item) => item.code_union}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = item.code_union === selectedCode;
          const color = pointColor(item, colorMode, palette);
          const palier = item.palier || contractTierLabel(item.ca);
          const supplier = principalPlatform(item);
          return (
            <Pressable
              style={[styles.row, selected && styles.rowOn]}
              onPress={() => onSelect(item.code_union)}
              accessibilityRole="button"
              accessibilityLabel={`${item.nom}${item.ville ? `, ${item.ville}` : ''}`}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.nom}</Text>
                <Text style={styles.meta}>
                  {item.ville || 'Ville non renseignée'}
                  {palier ? ` · ${palier}` : ''}
                  {supplier ? ` · ${supplier}` : ''}
                </Text>
              </View>
              <Text style={styles.ca}>{item.ca != null ? fmtEuro(item.ca) : '—'}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, padding: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rowOn: { borderColor: colors.orange },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: colors.white, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13 },
  ca: { color: colors.orangeSoft, fontWeight: '800' },
});
