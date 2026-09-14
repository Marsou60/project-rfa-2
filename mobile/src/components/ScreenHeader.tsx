import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, gap: 6 },
  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
