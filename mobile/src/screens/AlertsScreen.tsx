import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NetworkClientRow } from '../api/consultation';
import { useNetworkDashboard } from '../api/networkStore';
import { useAuth } from '../auth/AuthContext';
import { Icon, IconName } from '../components/Icon';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

const MONTHS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type Tone = 'red' | 'amber' | 'green';

type AlertRow = NetworkClientRow & {
  buyers_current?: number;
  buyers_previous?: number;
  buyers_delta?: number;
};

type Category = {
  id: string;
  label: string;
  /** Libellé court pour le chip (évite l’écrasement) */
  chip: string;
  icon: IconName;
  tone: Tone;
  rows: AlertRow[];
  target: 'client' | 'marque';
  intro: string;
  detail: (row: AlertRow) => string;
};

const TONE_COLOR: Record<Tone, string> = {
  red: colors.red,
  amber: colors.orangeSoft,
  green: colors.green,
};

export function AlertsScreen() {
  const navigation = useNavigation<any>();
  const { commercialScope, isNetworkFullAccess } = useAuth();
  const { dash, loading, error, refresh } = useNetworkDashboard();
  const [active, setActive] = useState<string | null>(null);

  const alertes = dash?.alertes;
  const thr = alertes?.cfg?.pct ?? 15;
  const caMin = alertes?.cfg?.ca_min ?? 5000;
  const year = new Date().getFullYear();
  const recentLabel = (alertes?.recent_months || []).map((m) => MONTHS[m] || `mois ${m}`).join(' et ');

  const categories: Category[] = useMemo(() => {
    const a = alertes;
    return [
      {
        id: 'recent',
        label: 'Décrochage récent',
        chip: 'Décrochage',
        icon: 'pulse-outline',
        tone: 'amber',
        target: 'client',
        rows: (a?.clients_recent || []) as AlertRow[],
        intro: `Chute d'au moins ${thr} % sur les 2 derniers mois facturés${recentLabel ? ` (${recentLabel})` : ''}, sur les plateformes mensualisées. Ce sont les décrochages qui n'apparaissent pas encore dans le cumul annuel.`,
        detail: (c) =>
          c.silent
            ? `Cumul annuel encore correct, mais chute récente de ${fmtDeltaPct(c.recent_pct)} : ${fmtEuro(c.recent_current)} contre ${fmtEuro(c.recent_previous)} l'an dernier sur la même période. Risque silencieux à traiter avant qu'il ne pèse sur l'année.`
            : `Chute récente de ${fmtDeltaPct(c.recent_pct)} qui vient s'ajouter à un cumul déjà en retrait (${fmtDeltaPct(c.delta_pct)}). La baisse s'accélère : relance prioritaire.`,
      },
      {
        id: 'risque',
        label: 'À risque',
        chip: 'À risque',
        icon: 'warning-outline',
        tone: 'red',
        target: 'client',
        rows: (a?.clients_risque || []) as AlertRow[],
        intro: `Clients dont le CA cumulé recule de ${thr} % ou plus vs N-1, avec un CA N-1 significatif (au moins ${fmtEuro(caMin)}).`,
        detail: (c) =>
          `CA cumulé ${fmtEuro(c.current)} contre ${fmtEuro(c.previous)} l'an dernier, soit ${fmtDeltaPct(c.delta_pct)}. Manque à gagner de ${fmtEuro(Math.abs(c.delta || 0))} sur l'année.`,
      },
      {
        id: 'perdus',
        label: 'Perdus',
        chip: 'Perdus',
        icon: 'close-circle-outline',
        tone: 'red',
        target: 'client',
        rows: (a?.clients_perdus || []) as AlertRow[],
        intro: `Clients sans aucun CA en ${year} alors qu'ils achetaient en ${year - 1}. Soit ils ont arrêté, soit leurs achats passent ailleurs.`,
        detail: (c) =>
          `Aucun CA en ${year} alors que ${year - 1} faisait ${fmtEuro(c.previous)}. À contacter pour comprendre l'arrêt.`,
      },
      {
        id: 'boom',
        label: 'En boom',
        chip: 'Boom',
        icon: 'rocket-outline',
        tone: 'green',
        target: 'client',
        rows: (a?.clients_boom || []) as AlertRow[],
        intro: `Clients en hausse de ${thr} % ou plus vs N-1. Opportunités à sécuriser : ils passeront peut-être un palier RFA supérieur.`,
        detail: (c) =>
          `CA cumulé ${fmtEuro(c.current)} contre ${fmtEuro(c.previous)}, soit ${fmtDeltaPct(c.delta_pct)} (+${fmtEuro(c.delta || 0)}). À suivre côté palier RFA.`,
      },
      {
        id: 'new',
        label: 'Nouveaux',
        chip: 'Nouveaux',
        icon: 'sparkles-outline',
        tone: 'green',
        target: 'client',
        rows: (a?.clients_new || []) as AlertRow[],
        intro: `Clients sans CA en ${year - 1} qui dépassent ${fmtEuro(caMin)} en ${year}. À intégrer au suivi commercial et contractuel.`,
        detail: (c) => `Premier exercice avec du CA : ${fmtEuro(c.current)} en ${year}. Vérifier son contrat et son palier.`,
      },
      {
        id: 'marques_risque',
        label: 'Marques en baisse',
        chip: 'Marques ↓',
        icon: 'trending-down-outline',
        tone: 'red',
        target: 'marque',
        rows: (a?.marques_risque || []) as AlertRow[],
        intro: `Marques dont le CA réseau recule de ${thr} % ou plus vs N-1.`,
        detail: (m) =>
          `CA réseau ${fmtEuro(m.current)} contre ${fmtEuro(m.previous)}, soit ${fmtDeltaPct(m.delta_pct)}. Tapez pour voir quels clients achètent encore cette marque.`,
      },
      {
        id: 'marques_perdues',
        label: 'Marques perdues',
        chip: 'Marques perdues',
        icon: 'remove-circle-outline',
        tone: 'red',
        target: 'marque',
        rows: (a?.marques_perdues || []) as AlertRow[],
        intro: `Marques sans aucun CA en ${year} alors qu'elles tournaient en ${year - 1}.`,
        detail: (m) => `Plus aucun CA en ${year} alors que ${year - 1} faisait ${fmtEuro(m.previous)}.`,
      },
      {
        id: 'marques_boom',
        label: 'Marques en boom',
        chip: 'Marques ↑',
        icon: 'trending-up-outline',
        tone: 'green',
        target: 'marque',
        rows: (a?.marques_boom || []) as AlertRow[],
        intro: `Marques en hausse de ${thr} % ou plus vs N-1 : les leviers qui fonctionnent sur le réseau.`,
        detail: (m) =>
          `CA réseau ${fmtEuro(m.current)}, ${fmtDeltaPct(m.delta_pct)} vs N-1. À pousser chez les clients qui ne l'achètent pas encore.`,
      },
      {
        id: 'marques_acheteurs',
        label: 'Perte d’acheteurs',
        chip: 'Acheteurs ↓',
        icon: 'people-outline',
        tone: 'amber',
        target: 'marque',
        rows: (a?.marques_acheteurs || []) as AlertRow[],
        intro:
          'Marques qui perdent au moins 20 % de leurs adhérents acheteurs vs N-1, même si le CA tient encore grâce à quelques gros clients.',
        detail: (m) =>
          `${m.buyers_current ?? 0} adhérents acheteurs contre ${m.buyers_previous ?? 0} l'an dernier (${m.buyers_delta ?? 0}). CA ${fmtEuro(m.current)} · ${fmtDeltaPct(m.delta_pct)}.`,
      },
    ];
  }, [alertes, thr, caMin, recentLabel, year]);

  const available = categories.filter((c) => c.rows.length > 0);
  const current = available.find((c) => c.id === active) || available[0] || null;

  const openRow = (cat: Category, row: AlertRow) => {
    if (cat.target === 'client' && row.code_union) {
      navigation.navigate('ClientRfa', {
        codeUnion: row.code_union,
        label: row.raison_sociale || row.key,
      });
      return;
    }
    const value = (row.key || '').trim();
    if (cat.target === 'marque' && value) {
      navigation.navigate('FilteredClients', { kind: 'marque', value, title: value });
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Alertes</Text>
      {!isNetworkFullAccess && commercialScope ? (
        <Text style={styles.scopeHint}>Portefeuille {commercialScope} uniquement</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !dash ? <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} /> : null}

      {dash && alertes ? (
        <>
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>CA à risque</Text>
              <Text style={[styles.kpiValue, { color: colors.red }]}>{fmtEuro(alertes.ca_risque)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>CA perdu</Text>
              <Text style={[styles.kpiValue, { color: colors.red }]}>{fmtEuro(alertes.ca_perdu)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Opportunités</Text>
              <Text style={[styles.kpiValue, { color: colors.green }]}>
                {fmtEuro(alertes.ca_opportunites)}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
          >
            {available.map((cat) => {
              const isActive = current?.id === cat.id;
              const tint = TONE_COLOR[cat.tone];
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setActive(cat.id)}
                  style={[
                    styles.chip,
                    isActive && { backgroundColor: tint, borderColor: tint },
                  ]}
                >
                  <Icon name={cat.icon} size={17} color={isActive ? colors.white : tint} />
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {cat.chip}
                  </Text>
                  <View style={[styles.chipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[styles.chipCount, isActive ? styles.chipCountActive : { color: tint }]}>
                      {cat.rows.length}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {current ? (
            <FlatList
              data={current.rows}
              keyExtractor={(item, idx) => `${current.id}-${item.code_union || item.key || idx}`}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />
              }
              contentContainerStyle={{ paddingBottom: 40 }}
              ListHeaderComponent={
                <View style={styles.introBox}>
                  <Text style={styles.introTitle}>
                    {current.label} · {current.rows.length}
                  </Text>
                  <Text style={styles.introText}>{current.intro}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => openRow(current, item)}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: `${TONE_COLOR[current.tone]}22`, borderColor: TONE_COLOR[current.tone] },
                    ]}
                  >
                    <Icon name={current.icon} size={16} color={TONE_COLOR[current.tone]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.raison_sociale || item.key || item.code_union}
                    </Text>
                    {item.code_union ? <Text style={styles.rowCode}>{item.code_union}</Text> : null}
                    <Text style={styles.rowDetail}>{current.detail(item)}</Text>
                    <Text style={styles.rowLink}>
                      {current.target === 'client' ? 'Ouvrir la fiche RFA ›' : 'Voir les clients ›'}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          ) : (
            <Text style={styles.empty}>Aucune alerte active : le réseau est dans les seuils.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { color: colors.white, fontSize: 26, fontWeight: '800', marginBottom: 4 },
  scopeHint: { color: colors.orangeSoft, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  error: { color: colors.red, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  kpiLabel: { color: colors.muted2, fontSize: 10, fontWeight: '700' },
  kpiValue: { fontWeight: '800', fontSize: 14, marginTop: 3 },
  chipsScroll: { flexGrow: 0, marginBottom: 6 },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingRight: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 9,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 13,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  chipText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    flexShrink: 0,
  },
  chipTextActive: { color: colors.white },
  chipBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  chipCount: { fontSize: 13, fontWeight: '800' },
  chipCountActive: { color: colors.white },
  introBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 10,
  },
  introTitle: { color: colors.white, fontWeight: '800', fontSize: 14 },
  introText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },
  rowCode: { color: colors.muted2, fontSize: 11, marginTop: 1 },
  rowDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  rowLink: { color: colors.orangeSoft, fontSize: 11, fontWeight: '700', marginTop: 5 },
});
