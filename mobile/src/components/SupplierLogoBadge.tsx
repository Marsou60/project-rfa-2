import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { logoKeyFromPlatform } from '../api/logos';

type Props = {
  platformKey: string;
  logos: Record<string, string>;
  size?: number;
};

export function SupplierLogoBadge({ platformKey, logos, size = 28 }: Props) {
  const [failed, setFailed] = useState(false);
  const key = logoKeyFromPlatform(platformKey);
  const uri = logos[key] || logos[platformKey?.toUpperCase?.() || ''];

  if (!uri || failed) {
    return <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 4 }]} />;
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
  },
});
