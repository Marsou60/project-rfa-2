import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ClientRfaResponse, RfaLine } from '../api/consultation';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';
import { PalierGauge, fichePalierGauges } from '../utils/rfaProgress';

type Props = { data: ClientRfaResponse };

function lineCa(line?: RfaLine | null): number | null {
  if (!line || line.ca == null) return null;
  return Number(line.ca) || 0;
}

export function PalierGauges({ data }: Props) {
  const gauges = useMemo(() => {
    const lines = Object.entries(data.rfa?.global || {}).map(([key, line]) => ({
      key,
      label: line.label || key.replace(/^GLOBAL_/, ''),
      ca: line.ca,
      caRemunere: line.ca_exclu ? line.ca_remunere : null,
      tiersRfa: line.tiers_rfa,
      tiersBonus: line.tiers_bonus,
      projectedCa: lineCa(data.rfa_projected?.global?.[key]),
    }));
    return fichePalierGauges({
      caGlobal: data.ca?.totals?.global_total,
      level: data.contract_level?.id || data.contract_applied?.level,
      levelBased: Boolean(data.level_based || data.contract_level?.id),
      lines,
    });
  }, [data]);

  if (!gauges.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Jauges de palier</Text>
      <Text style={styles.hint}>À date, et la projection au 31/12 quand le rythme est connu.</Text>
      {gauges.map((gauge) => (
        <Gauge key={gauge.key} gauge={gauge} />
      ))}
    </View>
  );
}

function Gauge({ gauge }: { gauge: PalierGauge }) {
  const width = `${Math.max(0, Math.min(gauge.progress, 100))}%` as `${number}%`;
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{gauge.label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width }]} />
      </View>
      <Text style={styles.line}>
        {gauge.missing > 0
          ? `Plus que ${fmtEuro(gauge.missing)} pour le palier`
          : 'Palier atteint à date'}
        {gauge.gain > 0 ? ` · +${fmtEuro(gauge.gain)} de RFA` : ''}
      </Text>
      {gauge.projectedCa != null ? (
        <Text style={styles.proj}>
          {gauge.projectionReaches
            ? '31/12 : le rythme passe déjà ce palier'
            : gauge.projectedMissing != null && gauge.projectedMissing > 0
              ? `31/12 : plus que ${fmtEuro(gauge.projectedMissing)} au rythme actuel`
              : '31/12 : projection indisponible'}
        </Text>
      ) : null}
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
    gap: 12,
  },
  kicker: { color: colors.white, fontWeight: '800', fontSize: 16 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  block: { gap: 4 },
  label: { color: colors.white, fontWeight: '700', fontSize: 14 },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#FBBF24', borderRadius: 999 },
  line: { color: colors.white, fontSize: 13, lineHeight: 18 },
  proj: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
