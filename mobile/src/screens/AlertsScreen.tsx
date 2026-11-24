import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getPalierAlerts, NetworkClientRow, PalierAlerts, PalierAlertRow } from '../api/consultation';
import { useNetworkDashboard } from '../api/networkStore';
import { useAuth } from '../auth/AuthContext';
import { Icon, IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

const MONTHS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type Tone = 'red' | 'amber' | 'green';

type AlertRow = NetworkClientRow & PalierAlertRow & {
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
  pinned?: boolean;
};

const GAP_PRESETS = [1500, 2000, 3000, 5000];

function parseGap(text: string): number {
  const n = Number(String(text).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 2000;
  return Math.round(n);
}

function objectiveLine(row: AlertRow): string {
  const kind =
    row.kind === 'tripartite' ? 'Tripartite' : row.kind === 'niveau' ? 'Contrat' : 'Plateforme';
  return `${kind} · ${row.objective || 'Objectif'}`;
}

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
  const [gapText, setGapText] = useState('2000');
  const [palier, setPalier] = useState<PalierAlerts | null>(null);
  const [palierLoading, setPalierLoading] = useState(false);
  const [palierError, setPalierError] = useState<string | null>(null);
  const gap = parseGap(gapText);
  const yearFromData = palier?.year || dash?.year_current || 2026;

  const loadPalier = useCallback(() => {
    setPalierLoading(true);
    setPalierError(null);
    getPalierAlerts({ yearCurrent: dash?.year_current || 2026 })
      .then((data) => setPalier(data))
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
            ?.detail ||
          (e as { message?: string })?.message ||
          'Paliers indisponibles';
        setPalierError(String(msg));
      })
      .finally(() => setPalierLoading(false));
  }, [dash?.year_current]);

  useEffect(() => {
    loadPalier();
  }, [loadPalier]);

  const alertes = dash?.alertes;
  const thr = alertes?.cfg?.pct ?? 15;
  const caMin = alertes?.cfg?.ca_min ?? 5000;
  const year = new Date().getFullYear();
  const recentLabel = (alertes?.recent_months || []).map((m) => MONTHS[m] || `mois ${m}`).join(' et ');

  const monthName = palier?.month ? MONTHS[palier.month] || `mois ${palier.month}` : null;
  const proches = useMemo(
    () =>
      (palier?.proches || []).filter(
        (row) => (row.missing || 0) > 0 && (row.missing || 0) <= gap,
      ) as AlertRow[],
    [palier, gap],
  );
  const projectionRows = useMemo(
    () =>
      (palier?.projection || []).filter(
        (row) => (row.missing || 0) > 0 && (row.missing || 0) <= gap,
      ) as AlertRow[],
    [palier, gap],
  );
  const atteints = (palier?.atteints || []) as AlertRow[];

  const categories: Category[] = useMemo(() => {
    const a = alertes;
    return [
      {
        id: 'proches',
        label: 'Paliers proches',
        chip: 'Proches',
        icon: 'flag-outline',
        tone: 'amber',
        target: 'client',
        pinned: true,
        rows: proches,
        intro: palierError
          ? palierError
          : `Adhérents à moins de ${fmtEuro(gap)} de leur prochain palier. L'écart est le CA à date ${yearFromData} (cumul déjà importé), le même que la jauge de la fiche — pas la projection de fin d'année. Plateformes, niveau de contrat, et tripartites quand le contrat les ouvre.`,
        detail: (row) =>
          `${objectiveLine(row)}. CA à date ${fmtEuro(row.current)} · prochain palier ${fmtEuro(row.next_palier)} · il manque ${fmtEuro(row.missing)}.`,
      },
      {
        id: 'projection',
        label: 'Projection 31/12',
        chip: '31/12',
        icon: 'calendar-outline',
        tone: 'amber',
        target: 'client',
        pinned: true,
        rows: projectionRows,
        intro: palierError
          ? palierError
          : `Même liste, mais l'écart est sur le CA projeté au 31 décembre : le CA à date de chaque plateforme est multiplié par 12 divisé par le mois de cette plateforme, comme l'estimation de RFA de décembre sur la fiche. On ne garde que ceux qui restent sous le palier suivant, à moins de ${fmtEuro(gap)}.`,
        detail: (row) =>
          `${objectiveLine(row)}. CA à date ${fmtEuro(row.current)} · projection 31/12 ${fmtEuro(row.projected)} · prochain palier ${fmtEuro(row.next_palier)} · il manque ${fmtEuro(row.missing)} en projection.`,
      },
      {
        id: 'atteints',
        label: 'Paliers atteints du mois',
        chip: 'Atteints',
        icon: 'checkmark-circle-outline',
        tone: 'green',
        target: 'client',
        pinned: true,
        rows: atteints,
        intro: monthName
          ? `Paliers franchis en ${monthName} ${yearFromData}, le dernier mois présent dans les imports. Le mois suivant remplace celui-ci dès qu'il est chargé. Calcul sur le CA à date, pas sur une projection.`
          : `Aucun mois daté dans les imports de ${yearFromData} : on ne peut pas dire quel palier a été franchi ce mois-ci.`,
        detail: (row) =>
          `${objectiveLine(row)}. Palier ${fmtEuro(row.palier)} atteint${monthName ? ` en ${monthName}` : ''}. CA à date ${fmtEuro(row.current)}.`,
      },
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
          `CA réseau ${fmtEuro(m.current)} contre ${fmtEuro(m.previous)}, soit ${fmtDeltaPct(m.delta_pct)}. Tapez pour voir les plateformes et les adhérents.`,
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
    ];
  }, [alertes, thr, caMin, recentLabel, year, proches, projectionRows, atteints, gap, palierError, monthName, yearFromData]);

  const available = categories.filter((cat) => cat.pinned || cat.rows.length > 0);
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
      navigation.navigate('BrandDetail', { marque: value, onglet: 'plateformes' });
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Alertes"
        subtitle={
          !isNetworkFullAccess && commercialScope
            ? `Portefeuille ${commercialScope} uniquement`
            : undefined
        }
      />
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

          <View style={styles.chips}>
            {available.map((cat) => {
              const isActive = current?.id === cat.id;
              const tint = TONE_COLOR[cat.tone];
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setActive(cat.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${cat.label}, ${cat.rows.length}`}
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
          </View>

          {current ? (
            <FlatList
              data={current.rows}
              keyExtractor={(item, idx) =>
                `${current.id}-${item.code_union || item.key || idx}-${item.objective || ''}-${item.palier || item.next_palier || ''}`
              }
              refreshControl={
                <RefreshControl
                  refreshing={loading || palierLoading}
                  onRefresh={() => {
                    refresh();
                    loadPalier();
                  }}
                  tintColor={colors.orange}
                />
              }
              contentContainerStyle={{ paddingBottom: 40 }}
              ListHeaderComponent={
                <View style={styles.introBox}>
                  <Text style={styles.introTitle}>
                    {current.label} · {palierLoading && current.pinned ? '…' : current.rows.length}
                  </Text>
                  <Text style={styles.introText}>{current.intro}</Text>
                  {current.id === 'proches' || current.id === 'projection' ? (
                    <View style={styles.gapBox}>
                      <Text style={styles.gapLabel}>Seuil de proximité</Text>
                      <View style={styles.gapRow}>
                        {GAP_PRESETS.map((preset) => {
                          const on = gap === preset;
                          return (
                            <Pressable
                              key={preset}
                              onPress={() => setGapText(String(preset))}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`Moins de ${fmtEuro(preset)}`}
                              style={[styles.gapChip, on && styles.gapChipOn]}
                            >
                              <Text style={[styles.gapChipText, on && styles.gapChipTextOn]}>
                                {fmtEuro(preset)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <TextInput
                        style={styles.gapInput}
                        value={gapText}
                        onChangeText={setGapText}
                        keyboardType="numeric"
                        accessibilityLabel="Montant maximum manquant, en euros"
                        placeholder="2000"
                        placeholderTextColor={colors.muted2}
                      />
                    </View>
                  ) : null}
                </View>
              }
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {current.id === 'proches'
                    ? `Aucun adhérent à moins de ${fmtEuro(gap)} d'un palier sur le CA à date.`
                    : current.id === 'projection'
                      ? `Aucun adhérent dont la projection au 31/12 reste à moins de ${fmtEuro(gap)} du palier suivant.`
                      : 'Aucune ligne pour cette alerte.'}
                </Text>
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
                      {current.target === 'client' ? 'Ouvrir la fiche RFA ›' : 'Voir la marque ›'}
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
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  error: { color: colors.red, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28, lineHeight: 20 },
  gapBox: { marginTop: 10, gap: 8 },
  gapLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  gapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gapChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  gapChipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  gapChipText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  gapChipTextOn: { color: colors.white },
  gapInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.white,
    fontWeight: '700',
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  kpiLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  kpiValue: { fontWeight: '800', fontSize: 15, marginTop: 4 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    paddingLeft: 14,
    paddingRight: 10,
    minHeight: 48,
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
  introTitle: { color: colors.white, fontWeight: '800', fontSize: 16 },
  introText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
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
  rowTitle: { color: colors.white, fontWeight: '700', fontSize: 16 },
  rowCode: { color: colors.muted, fontSize: 12, marginTop: 1 },
  rowDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  rowLink: { color: colors.orangeSoft, fontSize: 13, fontWeight: '700', marginTop: 6 },
});
