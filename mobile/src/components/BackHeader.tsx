import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { colors, spacing } from '../theme';

type Props = {
  title?: string;
  subtitle?: string;
};

export function BackHeader({ title, subtitle }: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const parent = navigation.getParent();
    if (parent?.canGoBack?.()) {
      parent.goBack();
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        hitSlop={6}
        style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
      >
        <Icon name="chevron-back" size={24} color={colors.white} />
        <Text style={styles.backText}>Retour</Text>
      </Pressable>
      {title ? (
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingRight: 12,
    paddingLeft: 2,
    gap: 2,
  },
  backPressed: { opacity: 0.7 },
  backText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  titles: { flex: 1, minWidth: 0 },
  title: { color: colors.white, fontWeight: '800', fontSize: 16 },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 1 },
});
