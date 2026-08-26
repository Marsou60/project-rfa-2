import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro, fmtPct } from '../utils/format';

type Props = {
  title?: string;
  ca: number;
  subtitle?: string;
  deltaPct?: number | null;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  rfaEstimated?: number | null;
  avgRate?: number | null;
};

export function HeroCaCard({
  title = 'Chiffre d’affaires RFA cumulé · 2026',
  ca,
  subtitle,
  deltaPct,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  rfaEstimated,
  avgRate,
}: Props) {
  const leftL = leftLabel || 'RFA estimée';
  const leftV = leftValue || fmtEuro(rfaEstimated || 0);
  const rightL = rightLabel || 'Taux moyen';
  const rightV = rightValue || (avgRate != null ? fmtPct(avgRate) : '—');

  return (
    <LinearGradient
      colors={[colors.orange, colors.orangeDeep, '#9A3412']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.ca}>{fmtEuro(ca)}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {deltaPct != null ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {deltaPct >= 0 ? '▲' : '▼'} {fmtDeltaPct(deltaPct)} vs 2025
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerCol}>
          <Text style={styles.footerLabel}>{leftL}</Text>
          <Text style={styles.footerValue}>{leftV}</Text>
        </View>
        <View style={styles.footerCol}>
          <Text style={styles.footerLabel}>{rightL}</Text>
          <Text style={styles.footerValue}>{rightV}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: spacing.lg,
    gap: 6,
  },
  title: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  ca: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  footer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
  },
  footerCol: { flex: 1 },
  footerLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginBottom: 4,
  },
  footerValue: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
});
