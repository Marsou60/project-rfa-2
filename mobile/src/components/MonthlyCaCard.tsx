import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClientMonthlyEvolution, MonthlyPlatform } from '../api/consultation';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro, monthShort } from '../utils/format';

type Props = {
  data: ClientMonthlyEvolution | null;
  compact?: boolean;
  emptyHint?: string;
};

function monthSlice(byMonth: MonthlyPlatform['by_month'], month: number) {
  if (!byMonth) return { current: 0, previous: 0 };
  const row = byMonth[String(month)] || byMonth[month as unknown as string];
  return {
    current: Number(row?.current) || 0,
    previous: Number(row?.previous) || 0,
  };
}

export function MonthlyCaCard({ data, compact = false, emptyHint }: Props) {
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const months = useMemo(() => {
    const list = [...(data?.months || [])].sort((a, b) => a.month - b.month);
    if (!compact) return list;
    return list.slice(-6);
  }, [data, compact]);

  const platforms = data?.platforms || [];
  const yearN = data?.year_current ?? 2026;
  const yearN1 = data?.year_previous ?? 2025;
  const maxCa = Math.max(1, ...months.map((m) => Math.max(m.current || 0, m.previous || 0)));

  if (!data?.available || months.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Achats mois par mois</Text>
        <Text style={styles.hint}>
          {emptyHint || 'Le détail janvier–décembre n’est pas encore disponible pour ce magasin.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Achats mois par mois</Text>
      <Text style={styles.hint}>
        {yearN} vs {yearN1}
        {compact
          ? ' · 6 derniers mois'
          : platforms.length
            ? ' · tap un mois pour le détail'
            : ''}
      </Text>

      {months.map((m) => {
        const current = m.current || 0;
        const previous = m.previous || 0;
        const open = openMonth === m.month;
        const deltaPct = m.delta_pct;
        const up = (m.delta || 0) > 0;
        const down = (m.delta || 0) < 0;
        const platRows = open
          ? platforms
              .map((p) => ({
                platform: p.platform,
                ...monthSlice(p.by_month, m.month),
              }))
              .filter((p) => p.current > 0 || p.previous > 0)
              .sort((a, b) => b.current - a.current)
          : [];

        return (
          <View key={m.month} style={styles.monthBlock}>
            <Pressable
              onPress={() => setOpenMonth(open ? null : m.month)}
              accessibilityRole="button"
              accessibilityLabel={`${monthShort(m.month)} ${fmtEuro(current)}, ${fmtDeltaPct(deltaPct)} versus ${yearN1}`}
              style={styles.monthHit}
            >
              <View style={styles.monthHead}>
                <Text style={styles.monthName}>{monthShort(m.month)}</Text>
                <Text style={styles.monthCa}>{fmtEuro(current)}</Text>
                <Text
                  style={[
                    styles.monthDelta,
                    up && { color: colors.green },
                    down && { color: colors.red },
                  ]}
                >
                  {fmtDeltaPct(deltaPct)}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barPrev,
                    { width: `${Math.min(100, (previous / maxCa) * 100)}%` },
                  ]}
                />
                <View
                  style={[
                    styles.barCurr,
                    { width: `${Math.min(100, (current / maxCa) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.vsLine}>
                vs {yearN1} : {fmtEuro(previous)}
              </Text>
            </Pressable>
            {open && platRows.length > 0 ? (
              <View style={styles.platBox}>
                {platRows.map((p) => (
                  <View key={p.platform} style={styles.platRow}>
                    <Text style={styles.platName}>{p.platform}</Text>
                    <Text style={styles.platCa}>{fmtEuro(p.current)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {open && platRows.length === 0 ? (
              <Text style={styles.hint}>Pas de détail plateforme ce mois-là.</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  title: { color: colors.white, fontWeight: '800', fontSize: 16 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  monthBlock: { gap: 4, paddingTop: 4 },
  monthHit: {
    minHeight: 48,
    justifyContent: 'center',
    gap: 6,
  },
  monthHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  monthName: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
    width: 48,
    textTransform: 'capitalize',
  },
  monthCa: { color: colors.white, fontWeight: '800', fontSize: 16, flex: 1 },
  monthDelta: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    position: 'relative',
  },
  barPrev: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 999,
  },
  barCurr: {
    height: '100%',
    backgroundColor: colors.orange,
    borderRadius: 999,
  },
  vsLine: { color: colors.muted2, fontSize: 12 },
  platBox: {
    marginTop: 4,
    marginLeft: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.orangeMuted,
    gap: 4,
  },
  platRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 8 },
  platName: { color: colors.muted, flex: 1, fontSize: 13, fontWeight: '600' },
  platCa: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
