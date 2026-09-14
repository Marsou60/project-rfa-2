import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors } from '../theme';

export type MenuItem = {
  key: string;
  icon: IconName;
  label: string;
  sub?: string;
  tone?: 'default' | 'danger' | 'success';
  onPress: () => void;
};

type Props = {
  items: MenuItem[];
  columns?: 2 | 3;
};

const TONE_COLOR: Record<NonNullable<MenuItem['tone']>, string> = {
  default: colors.orange,
  danger: colors.red,
  success: colors.green,
};

export function MenuGrid({ items, columns = 2 }: Props) {
  const basis = columns === 2 ? '48%' : '31%';
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const tint = TONE_COLOR[item.tone || 'default'];
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.sub ? `${item.label}, ${item.sub}` : item.label}
            style={({ pressed }) => [styles.tile, { flexBasis: basis }, pressed && styles.tilePressed]}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
              <Icon name={item.icon} size={20} color={tint} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {item.label}
            </Text>
            {item.sub ? (
              <Text style={styles.sub} numberOfLines={1}>
                {item.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    minHeight: 48,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  tilePressed: { borderColor: colors.orange, opacity: 0.85 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.white, fontWeight: '800', fontSize: 14, textAlign: 'center', lineHeight: 18 },
  sub: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
});
