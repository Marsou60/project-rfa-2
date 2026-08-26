import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SupplierLogoBadge } from './SupplierLogoBadge';
import { colors, spacing } from '../theme';
import { fmtEuro, fmtPct } from '../utils/format';
import { combinedLadder, Tier, TierProgress } from '../utils/rfaProgress';

type Logos = Record<string, string>;

type Props = {
  platformKey?: string | null;
  logos?: Logos;
  label: string;
  ca: number;
  prog: TierProgress;
  tiersRfa?: Tier[];
  tiersBonus?: Tier[];
  tiersTri?: Tier[];
  locked?: boolean;
  projectedUnlock?: boolean;
  lockHint?: string | null;
  levelLabel?: string | null;
  proj?: { ca?: number; rate?: number; value?: number } | null;
};

function Gauge({ progress, tone }: { progress: number; tone: 'green' | 'amber' | 'orange' | 'cyan' | 'muted' }) {
  const fill =
    tone === 'green'
      ? colors.green
      : tone === 'amber'
        ? '#FBBF24'
        : tone === 'cyan'
          ? '#22D3EE'
          : tone === 'muted'
            ? colors.muted2
            : colors.orange;
  return (
    <View style={styles.gaugeTrack}>
      <View style={[styles.gaugeFill, { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: fill }]} />
    </View>
  );
}

export function RfaProgressCard({
  platformKey,
  logos,
  label,
  ca,
  prog,
  tiersRfa = [],
  tiersBonus = [],
  tiersTri = [],
  locked = false,
  projectedUnlock = false,
  lockHint,
  levelLabel,
  proj,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasRfaBonus = tiersRfa.length > 0 || tiersBonus.length > 0;
  const hasTri = tiersTri.length > 0;
  const hasLadder = hasRfaBonus || hasTri;
  const hasTiers = hasLadder;
  const near = !prog.achieved && prog.nextMin != null && prog.progress >= 80;
  const tone: 'green' | 'amber' | 'orange' | 'cyan' | 'muted' = prog.achieved
    ? 'green'
    : near
      ? 'amber'
      : projectedUnlock
        ? 'cyan'
        : locked
          ? 'muted'
          : 'orange';

  if (!hasTiers) {
    return (
      <View style={[styles.card, styles.cardNoTier]}>
        <View style={styles.row}>
          {platformKey ? <SupplierLogoBadge platformKey={platformKey} logos={logos || {}} size={28} /> : null}
          <Text style={[styles.label, { flex: 1 }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.ca}>{fmtEuro(ca)}</Text>
        </View>
        <Text style={styles.badgeNoTier}>Non éligible — aucun palier sur ce contrat</Text>
        <Text style={styles.hint}>RFA à date : 0 € (pas de barème applicable)</Text>
      </View>
    );
  }

  return (
    <Pressable style={[styles.card, locked && !projectedUnlock && styles.cardLocked]} onPress={() => setOpen((v) => !v)}>
      <View style={styles.row}>
        {platformKey ? <SupplierLogoBadge platformKey={platformKey} logos={logos || {}} size={28} /> : null}
        <Text style={[styles.label, { flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.ca}>{fmtEuro(ca)}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </View>

      {projectedUnlock ? (
        <View style={styles.badgeRow}>
          <Text style={styles.badgeAmber}>À date : verrouillé</Text>
          <Text style={styles.badgeCyan}>Fin 2026 : débloqué</Text>
        </View>
      ) : null}
      {locked && !projectedUnlock ? <Text style={styles.badgeAmber}>Réservé Silver & Gold</Text> : null}

      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          Taux {fmtPct(prog.rate)}
          {!prog.achieved && prog.nextRate != null ? (
            <Text style={styles.metaNext}> → {fmtPct(prog.nextRate)}</Text>
          ) : null}
        </Text>
        <Text style={[styles.rfaAmt, (prog.currentValue || 0) <= 0 && { color: colors.muted }]}>
          {locked && !projectedUnlock ? '0 € à date' : `${fmtEuro(prog.currentValue)} RFA`}
        </Text>
      </View>

      <Gauge progress={prog.progress} tone={tone} />

      {prog.achieved ? (
        <Text style={styles.statusOk}>Palier maximal atteint</Text>
      ) : prog.nextMin != null ? (
        <Text style={styles.statusNext}>
          Prochain palier {fmtEuro(prog.nextMin)}
          {prog.missing > 0 ? ` · encore ${fmtEuro(prog.missing)}` : ''}
          {prog.projectedGain > 0 ? ` · +${fmtEuro(prog.projectedGain)} RFA` : ''}
        </Text>
      ) : (
        <Text style={styles.hint}>Sous le 1er palier — RFA 0 € tant que le seuil n’est pas atteint</Text>
      )}

      {prog.rate === 0 && prog.nextMin != null && !locked ? (
        <Text style={styles.whyZero}>
          Pourquoi 0 € ? CA sous le seuil {fmtEuro(prog.nextMin)} (manque {fmtEuro(prog.missing)}).
        </Text>
      ) : null}

      {lockHint ? <Text style={styles.hint}>{lockHint}</Text> : null}

      {proj && (proj.value != null || proj.ca) ? (
        <View style={styles.projBox}>
          <Text style={styles.projTitle}>Projection fin d’année</Text>
          <Text style={styles.projLine}>
            CA {fmtEuro(proj.ca)} · {fmtPct(proj.rate)} · RFA {fmtEuro(proj.value)}
          </Text>
        </View>
      ) : null}

      {open && hasRfaBonus ? (
        <View style={styles.ladder}>
          {levelLabel ? <Text style={styles.ladderTitle}>{levelLabel}</Text> : null}
          <Text style={styles.ladderTitle}>Barème RFA + Bonus</Text>
          {combinedLadder(tiersRfa, tiersBonus).map((t) => {
            const reached = t.min <= ca && (prog.nextMin == null || t.min <= (prog.minReached || ca));
            const isNext = prog.nextMin != null && t.min === prog.nextMin;
            return (
              <View key={t.min} style={[styles.ladderRow, isNext && styles.ladderNext, reached && !isNext && styles.ladderReached]}>
                <Text style={styles.ladderMin}>
                  {reached && !isNext ? '✓ ' : isNext ? '→ ' : ''}≥ {fmtEuro(t.min)}
                </Text>
                <Text style={styles.ladderRate}>
                  {fmtPct(t.rfa)}+{fmtPct(t.bonus)} = {fmtPct(t.total)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {open && hasTri ? (
        <View style={styles.ladder}>
          <Text style={styles.ladderTitle}>Paliers</Text>
          {tiersTri.map((t) => {
            const isNext = prog.nextMin != null && t.min === prog.nextMin;
            const reached = t.min <= ca;
            return (
              <View key={t.min} style={[styles.ladderRow, isNext && styles.ladderNext, reached && !isNext && styles.ladderReached]}>
                <Text style={styles.ladderMin}>
                  {reached && !isNext ? '✓ ' : isNext ? '→ ' : ''}≥ {fmtEuro(t.min)}
                </Text>
                <Text style={styles.ladderRate}>{fmtPct(t.rate)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 10,
    gap: 8,
  },
  cardNoTier: { borderColor: '#7F1D1D', backgroundColor: '#1A0F12' },
  cardLocked: { borderColor: '#92400E', backgroundColor: '#1A1408' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.white, fontWeight: '800', fontSize: 14 },
  ca: { color: colors.white, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chevron: { color: colors.muted2, fontSize: 10, marginLeft: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeAmber: {
    alignSelf: 'flex-start',
    color: '#FCD34D',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  badgeCyan: {
    alignSelf: 'flex-start',
    color: '#67E8F9',
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  badgeNoTier: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: colors.muted, fontSize: 12 },
  metaNext: { color: '#FBBF24', fontWeight: '800' },
  rfaAmt: { color: colors.green, fontWeight: '800', fontSize: 13 },
  gaugeTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  gaugeFill: { height: '100%', borderRadius: 999 },
  statusOk: { color: colors.green, fontSize: 12, fontWeight: '700' },
  statusNext: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  whyZero: { color: '#FBBF24', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  hint: { color: colors.muted2, fontSize: 11, lineHeight: 16 },
  projBox: {
    marginTop: 2,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.25)',
  },
  projTitle: { color: '#67E8F9', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  projLine: { color: colors.white, fontSize: 12, fontWeight: '600' },
  ladder: { marginTop: 4, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder, paddingTop: 8 },
  ladderTitle: { color: colors.muted2, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  ladderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  ladderReached: { backgroundColor: 'rgba(52, 211, 153, 0.12)' },
  ladderNext: { backgroundColor: 'rgba(251, 191, 36, 0.12)' },
  ladderMin: { color: colors.white, fontSize: 12, fontWeight: '600' },
  ladderRate: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
});
