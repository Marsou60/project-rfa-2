import React from 'react';
import {
  ImageBackground,
  ImageSourcePropType,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../theme';

type Props = {
  source: ImageSourcePropType;
  children: React.ReactNode;
  style?: ViewStyle;
};

/** Full-bleed Union photo + navy wash. The vitrine’s strongest move, reused. */
export function BrandHero({ source, children, style }: Props) {
  return (
    <ImageBackground source={source} style={[styles.bg, style]} resizeMode="cover">
      <LinearGradient
        colors={['rgba(7,11,20,0.28)', 'rgba(7,11,20,0.62)', colors.bg]}
        locations={[0, 0.5, 1]}
        style={styles.grad}
      >
        {children}
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { width: '100%' },
  grad: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
