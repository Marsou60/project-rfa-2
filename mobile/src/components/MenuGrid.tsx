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

export function MenuGrid({ items, columns = 3 }: Props) {
  const basis = columns === 2 ? '48%' : '31%';
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const tint = TONE_COLOR[item.tone || 'default'];
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
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
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  tilePressed: { borderColor: colors.orange, opacity: 0.85 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.white, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  sub: { color: colors.muted2, fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
