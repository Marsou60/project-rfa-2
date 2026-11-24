import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ClientDashboardResponse,
  ClientRfaResponse,
  getClientDashboard,
  getImpayesByAdherent,
} from '../api/consultation';
import { ClientNote, getClientNotes } from '../api/fiches';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';
import { fichePalierGauges } from '../utils/rfaProgress';
import { VisitBrief, buildVisitBrief } from '../utils/visitBrief';

type Props = {
  codeUnion?: string | null;
  rfa: ClientRfaResponse | null;
  onClose: () => void;
};

function brandsFrom(dash: ClientDashboardResponse | null) {
  const nodes = dash?.by_marque || [];
  return nodes
    .map((node) => ({
      label: node.label,
      current: node.ca_current,
      deltaPct: node.delta_pct,
    }))
    .filter((item) => item.label);
}

export function VisitPrepSheet({ codeUnion, rfa, onClose }: Props) {
  const [brief, setBrief] = useState<VisitBrief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    const code = codeUnion || '';
    Promise.all([
      code ? getClientDashboard({ codeUnion: code }).catch(() => null) : Promise.resolve(null),
      code ? getImpayesByAdherent(code).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      code ? getClientNotes(code).catch(() => [] as ClientNote[]) : Promise.resolve([] as ClientNote[]),
    ]).then(([dash, impayes, notes]) => {
      if (cancel) return;
      const gauges = fichePalierGauges({
        caGlobal: rfa?.ca?.totals?.global_total,
        level: rfa?.contract_level?.id || rfa?.contract_applied?.level,
        levelBased: Boolean(rfa?.level_based || rfa?.contract_level?.id),
        lines: Object.entries(rfa?.rfa?.global || {}).map(([key, line]) => ({
          key,
          label: line.label || key,
          ca: line.ca,
          tiersRfa: line.tiers_rfa,
          tiersBonus: line.tiers_bonus,
          projectedCa: rfa?.rfa_projected?.global?.[key]?.ca ?? null,
        })),
      }).map((item) => ({
        label: item.label,
        missing: item.missing,
        gain: item.gain,
        progress: item.progress,
      }));
      const note = notes[0];
      setBrief(buildVisitBrief({
        ca: rfa?.comparison_n1?.ca_n_ytd_full ?? rfa?.ca?.totals?.global_total,
        previous: rfa?.comparison_n1?.ca_n1_full ?? null,
        deltaPct: rfa?.comparison_n1?.delta_pct ?? null,
        brands: brandsFrom(dash),
        gauges,
        impayes: impayes.items || [],
        note: note ? { text: note.note_simple, author: note.auteur, at: note.created_at } : null,
      }));
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [codeUnion, rfa]);

  return (
    <View style={styles.sheet}>
      <View style={styles.head}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Retour">
          <Text style={styles.back}>‹ Retour</Text>
        </Pressable>
        <Text style={styles.title}>Préparer ma visite</Text>
      </View>
      {loading || !brief ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.kicker}>Chiffre à date</Text>
          <Text style={styles.ca}>{fmtEuro(brief.ca)}</Text>
          <Text style={styles.line}>
            {brief.trend}
            {brief.previous != null ? ` · N-1 ${fmtEuro(brief.previous)}` : ''}
            {brief.deltaPct != null ? ` · ${fmtDeltaPct(brief.deltaPct)}` : ''}
          </Text>
          <Text style={styles.kicker}>Marques en baisse</Text>
          {brief.brands.length ? brief.brands.map((brand) => (
            <Text key={brand.label} style={styles.line}>
              {brand.label} · {fmtEuro(brand.current)} · {fmtDeltaPct(brand.deltaPct)}
            </Text>
          )) : <Text style={styles.muted}>Aucune marque en baisse sur la période.</Text>}
          <Text style={styles.kicker}>Palier le plus proche</Text>
          {brief.nearest ? (
            <Text style={styles.line}>
              {brief.nearest.label} · plus que {fmtEuro(brief.nearest.missing)}
              {brief.nearest.gain > 0 ? ` · +${fmtEuro(brief.nearest.gain)} de RFA` : ''}
            </Text>
          ) : <Text style={styles.muted}>Pas de palier encore ouvert.</Text>}
          <Text style={styles.kicker}>Impayés</Text>
          <Text style={styles.line}>
            {brief.impayesCount
              ? `${brief.impayesCount} dossier${brief.impayesCount > 1 ? 's' : ''} · ${fmtEuro(brief.impayesAmount)}`
              : 'Aucun impayé ouvert.'}
          </Text>
          <Text style={styles.kicker}>Dernière note</Text>
          {brief.note ? (
            <Text style={styles.line}>
              {brief.note.text}
              {brief.note.author ? ` — ${brief.note.author}` : ''}
            </Text>
          ) : <Text style={styles.muted}>Pas de note de visite.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 5 },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 4 },
  back: { color: colors.orange, fontWeight: '800', fontSize: 16 },
  title: { color: colors.white, fontWeight: '800', fontSize: 22 },
  body: { padding: spacing.lg, gap: 8, paddingBottom: 40 },
  kicker: { color: colors.orangeSoft, fontWeight: '800', fontSize: 13, marginTop: 8 },
  ca: { color: colors.white, fontWeight: '800', fontSize: 28 },
  line: { color: colors.white, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14 },
});
