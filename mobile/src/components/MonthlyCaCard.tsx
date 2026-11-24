import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ClientMonthlyEvolution } from '../api/consultation';
import { dismissCouche, pushCouche, readCouches } from '../navigation/couches';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro, monthLong, monthShort } from '../utils/format';
import { rowsForMonth } from '../utils/monthPlatforms';

type Props = {
  data: ClientMonthlyEvolution | null;
  compact?: boolean;
  emptyHint?: string;
};

function monthToken(month: number): string {
  return `mois:${month}`;
}

function monthFromCouches(params?: { couches?: unknown } | null): number | null {
  const token = readCouches(params).find((item) => item.startsWith('mois:'));
  const month = Number(token?.slice(5));
  return month >= 1 && month <= 12 ? month : null;
}

export function MonthlyCaCard({ data, compact = false, emptyHint }: Props) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const openMonth = monthFromCouches(route.params);

  const months = React.useMemo(() => {
    const list = [...(data?.months || [])].sort((a, b) => a.month - b.month);
    if (!compact) return list;
    return list.slice(-6);
  }, [data, compact]);

  const yearN = data?.year_current ?? 2026;
  const yearN1 = data?.year_previous ?? 2025;
  const maxCa = Math.max(1, ...months.map((m) => Math.max(m.current || 0, m.previous || 0)));

  const selectMonth = (month: number) => {
    const token = monthToken(month);
    if (openMonth === month) {
      dismissCouche(navigation, route.params, token);
      return;
    }
    const current = readCouches(route.params).filter((item) => !item.startsWith('mois:'));
    if (openMonth) {
      const previous = readCouches(route.params);
      navigation.setParams({ couches: [...current, token].join('|') });
      if (previous.join('|') === [...current, token].join('|')) return;
      return;
    }
    pushCouche(navigation, route.params, token);
  };

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
        {compact ? ' · 6 derniers mois' : ''}. Tapez un mois pour le détail par plateforme.
      </Text>

      {months.map((m) => {
        const current = m.current || 0;
        const previous = m.previous || 0;
        const open = openMonth === m.month;
        const deltaPct = m.delta_pct;
        const up = (m.delta || 0) > 0;
        const down = (m.delta || 0) < 0;
        const platRows = open ? rowsForMonth(data, m.month) : [];

        return (
          <View key={m.month} style={styles.monthBlock}>
            <Pressable
              onPress={() => selectMonth(m.month)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${monthLong(m.month)} ${fmtEuro(current)}, ${fmtDeltaPct(deltaPct)} versus ${yearN1}`}
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
            {open ? (
              <View style={styles.platBox}>
                <Text style={styles.platTitle}>
                  {monthLong(m.month)} {yearN} par plateforme
                </Text>
                {platRows.length === 0 ? (
                  <Text style={styles.hint}>Aucun achat enregistré sur ce mois.</Text>
                ) : (
                  platRows.map((p) => (
                    <View key={p.platform} style={styles.platRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.platName}>{p.platform}</Text>
                        <Text style={styles.platPrev}>
                          {yearN1} : {fmtEuro(p.previous)}
                        </Text>
                      </View>
                      {p.pending ? (
                        <Text style={styles.pending}>Pas encore reçu</Text>
                      ) : (
                        <Text style={styles.platCa}>{fmtEuro(p.current)}</Text>
                      )}
                    </View>
                  ))
                )}
              </View>
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
    gap: 6,
  },
  platTitle: { color: colors.white, fontWeight: '800', fontSize: 13, textTransform: 'capitalize' },
  platRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 8 },
  platName: { color: colors.white, fontSize: 14, fontWeight: '700' },
  platPrev: { color: colors.muted2, fontSize: 12, marginTop: 1 },
  platCa: { color: colors.white, fontSize: 14, fontWeight: '800' },
  pending: { color: colors.orangeSoft, fontSize: 13, fontWeight: '800', textAlign: 'right' },
});
