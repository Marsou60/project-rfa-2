import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { logoKeyFromPlatform } from '../api/logos';
import { getPlatformLogoSource } from '../assets/platformLogos';

type Props = {
  platformKey: string;
  logos?: Record<string, string>;
  size?: number;
};

export function SupplierLogoBadge({ platformKey, logos = {}, size = 28 }: Props) {
  const [failed, setFailed] = useState(false);
  const key = logoKeyFromPlatform(platformKey);
  const local = getPlatformLogoSource(key);
  const uri = logos[key] || logos[platformKey?.toUpperCase?.() || ''];

  if (local) {
    return (
      <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 4 }]}>
        <Image
          source={local}
          style={{ width: size - 4, height: size - 4 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (!uri || failed) {
    return (
      <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 4 }]}>
        <Text style={[styles.fallback, { fontSize: Math.max(9, size * 0.22) }]} numberOfLines={1}>
          {key || '?'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 4 }]}>
      <Image
        source={{ uri }}
        style={{ width: size - 4, height: size - 4 }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  fallback: { color: colors.muted, fontWeight: '800' },
});
