import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NetworkClientRow } from '../api/consultation';
import { useNetworkDashboard } from '../api/networkStore';
import { useAuth } from '../auth/AuthContext';
import { useSupplierLogos } from '../api/logos';
import { BrandHero } from '../components/BrandHero';
import { HeroCaCard } from '../components/HeroCaCard';
import { Icon } from '../components/Icon';
import { PlatformGrid } from '../components/PlatformGrid';
import { RankKind } from './RankDetailScreen';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

const MONTHS = [
  '',
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

function AlertPreview({
  tag,
  tone,
  title,
  detail,
  onPress,
}: {
  tag: string;
  tone: 'red' | 'amber' | 'green';
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const tagStyle =
    tone === 'red' ? styles.alertTagRed : tone === 'amber' ? styles.alertTagAmber : styles.alertTagGreen;
  return (
    <Pressable
      style={styles.alertRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tag} : ${title}`}
    >
      <Text style={[styles.alertTag, tagStyle]}>{tag}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.alertDetail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted2} />
    </Pressable>
  );
}

export function UnionHomeScreen() {
  const { user, isNetworkFullAccess, commercialScope } = useAuth();
  const navigation = useNavigation<any>();
  const { dash, loading, error, refresh } = useNetworkDashboard();
  const { logos } = useSupplierLogos();
  const insets = useSafeAreaInsets();

  const kpis = dash?.kpis;
  const platforms = useMemo(
    () =>
      (dash?.platforms || []).slice(0, 4).map((p) => ({
        key: p.platform,
        label: p.platform,
        ca: p.current || 0,
        deltaPct: p.delta_pct,
      })),
    [dash],
  );

  const openClient = (code: string, label?: string) =>
    navigation.navigate('ClientRfa', { codeUnion: code, label });

  const openRank = (title: string, kind: RankKind, rows: unknown[], subtitle?: string) =>
    navigation.navigate('RankDetail', { title, kind, rows, subtitle });

  const alertes = dash?.alertes;
  const thr = alertes?.cfg?.pct ?? 15;
  const nCrit = alertes?.n_crit || 0;
  const recentMonthsLabel = (alertes?.recent_months || []).map((m) => MONTHS[m] || `M${m}`).join(' + ');

  const preview = useMemo(() => {
    const out: Array<{ tag: string; tone: 'red' | 'amber' | 'green'; row: NetworkClientRow; detail: string }> = [];
    (alertes?.clients_recent || []).slice(0, 2).forEach((c) =>
      out.push({
        tag: 'Décrochage',
        tone: 'amber',
        row: c,
        detail: c.silent
          ? `Cumul encore OK mais chute de ${fmtDeltaPct(c.recent_pct)} sur les 2 derniers mois (${fmtEuro(c.recent_current)} vs ${fmtEuro(c.recent_previous)}).`
          : `Chute récente ${fmtDeltaPct(c.recent_pct)} · cumul ${fmtDeltaPct(c.delta_pct)}. La baisse s'accélère.`,
      }),
    );
    (alertes?.clients_risque || []).slice(0, 2).forEach((c) =>
      out.push({
        tag: 'À risque',
        tone: 'red',
        row: c,
        detail: `CA cumulé ${fmtEuro(c.current)} · ${fmtDeltaPct(c.delta_pct)} vs N-1 (seuil −${thr} %).`,
      }),
    );
    (alertes?.clients_boom || []).slice(0, 1).forEach((c) =>
      out.push({
        tag: 'Boom',
        tone: 'green',
        row: c,
        detail: `Forte hausse ${fmtDeltaPct(c.delta_pct)} · CA ${fmtEuro(c.current)}. Palier RFA à surveiller.`,
      }),
    );
    return out;
  }, [alertes, thr]);

  const displayName = user?.display_name || user?.username || 'Union';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />
      }
    >
      <BrandHero source={require('../../assets/vitrine/convention.jpeg')}>
        <View style={{ paddingTop: Math.max(insets.top, 12) }}>
          <Text style={styles.hello}>Bonjour</Text>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.bannerText}>
            {isNetworkFullAccess
              ? 'Pilotage réseau · lecture seule'
              : `Portefeuille ${commercialScope || ''} · vos alertes`}
          </Text>
        </View>
      </BrandHero>

      <View style={styles.body}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !dash ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 20 }} /> : null}

      {kpis ? (
        <>
          <HeroCaCard
            title={
              isNetworkFullAccess
                ? 'Chiffre d’affaires réseau cumulé · 2026'
                : `CA portefeuille ${commercialScope || ''} · 2026`
            }
            ca={kpis.ca_ytd || 0}
            subtitle={
              isNetworkFullAccess
                ? `${kpis.nb_clients || 0} clients · Objectif ${fmtEuro(kpis.objectif || 0)}`
                : `${kpis.nb_clients || 0} clients de votre portefeuille`
            }
            deltaPct={kpis.delta_pct}
            deltaLabel="CA vs 2025 · même période"
            leftLabel="Projection"
            leftValue={fmtEuro(kpis.projection || 0)}
            rightLabel={isNetworkFullAccess ? 'Avancement' : 'vs N-1'}
            rightValue={
              isNetworkFullAccess
                ? kpis.objectif_pct != null
                  ? `${Number(kpis.objectif_pct).toFixed(1).replace('.', ',')} %`
                  : '—'
                : fmtDeltaPct(kpis.delta_pct)
            }
          />

          {preview.length ? (
            <View style={styles.block}>
              <Pressable
                style={styles.sectionRow}
                onPress={() => navigation.navigate('Alertes')}
                accessibilityRole="button"
                accessibilityLabel="Voir toutes les alertes"
              >
                <Text style={styles.section}>
                  {nCrit ? `${nCrit} alerte${nCrit > 1 ? 's' : ''} à traiter` : 'Alertes du réseau'}
                </Text>
                <Text style={styles.seeAll}>Tout voir ›</Text>
              </Pressable>
              <Text style={styles.alertIntro}>
                Seuil de baisse : {thr} %. Les décrochages récents comparent les 2 derniers mois
                facturés{recentMonthsLabel ? ` (${recentMonthsLabel})` : ''} à la même période N-1.
              </Text>
              {preview.slice(0, 3).map((p, i) => (
                <AlertPreview
                  key={`${p.tag}-${p.row.code_union}-${i}`}
                  tag={p.tag}
                  tone={p.tone}
                  title={p.row.raison_sociale || p.row.code_union}
                  detail={p.detail}
                  onPress={() => openClient(p.row.code_union, p.row.raison_sociale)}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.kpiStrip}>
            <View style={styles.kpiChip}>
              <Text style={styles.kpiChipLabel}>Panier moyen</Text>
              <Text style={styles.kpiChipValue}>{fmtEuro(kpis.panier_moyen || 0)}</Text>
            </View>
            <View style={styles.kpiChip}>
              <Text style={styles.kpiChipLabel}>Nouveaux</Text>
              <Text style={styles.kpiChipValue}>{kpis.nb_clients_new ?? '—'}</Text>
            </View>
            <View style={styles.kpiChip}>
              <Text style={styles.kpiChipLabel}>Perdus</Text>
              <Text style={styles.kpiChipValue}>{kpis.nb_clients_lost ?? '—'}</Text>
            </View>
          </View>

          {kpis.best_month ? (
            <Text style={styles.metaLine}>
              Meilleur mois : {MONTHS[kpis.best_month] || kpis.best_month} · {fmtEuro(kpis.best_month_ca)}
              {kpis.platform_star ? ` · Star ${kpis.platform_star}` : ''}
            </Text>
          ) : null}

          <PlatformGrid items={platforms} title="CA par plateforme" logos={logos} />

          <View style={styles.block}>
            <Pressable
              style={styles.sectionRow}
              onPress={() =>
                openRank(
                  'Tous les adhérents',
                  'clients',
                  dash?.clients || [],
                  'Tous les adhérents avec du CA en 2026, classés par CA cumulé.',
                )
              }
            >
              <Text style={styles.section}>Top adhérents</Text>
              <Text style={styles.seeAll}>Tout voir ›</Text>
            </Pressable>
            {(dash?.clients || []).slice(0, 3).map((c, idx) => (
              <Pressable
                key={`${c.code_union}-${idx}`}
                style={styles.rankRow}
                onPress={() => openClient(c.code_union, c.raison_sociale)}
              >
                <Text style={styles.rankIdx}>{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankTitle} numberOfLines={1}>
                    {c.raison_sociale || c.key || c.code_union}
                  </Text>
                  <Text style={styles.rankSub}>{c.code_union}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rankCa}>{fmtEuro(c.current)}</Text>
                  <Text
                    style={[styles.rankDelta, (c.delta_pct || 0) < 0 && { color: colors.red }]}
                  >
                    {fmtDeltaPct(c.delta_pct)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48 },
  body: { paddingHorizontal: spacing.lg, gap: 12 },
  hello: { color: 'rgba(248,250,252,0.8)', fontSize: 16, fontWeight: '600' },
  name: { color: colors.white, fontSize: 32, fontWeight: '800', marginTop: 4, letterSpacing: -0.5, lineHeight: 38 },
  bannerText: { color: 'rgba(248,250,252,0.82)', fontSize: 14, lineHeight: 20, marginTop: 8 },
  error: { color: colors.red },
  kpiStrip: { flexDirection: 'row', gap: 8 },
  kpiChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  kpiChipLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  kpiChipValue: { color: colors.white, fontWeight: '800', fontSize: 15, marginTop: 4 },
  metaLine: { color: colors.muted, fontSize: 13 },
  block: { gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  seeAll: { color: colors.orangeSoft, fontSize: 14, fontWeight: '700' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rankIdx: { color: colors.orange, fontWeight: '800', width: 18 },
  rankTitle: { color: colors.white, fontWeight: '700' },
  rankSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rankCa: { color: colors.white, fontWeight: '700' },
  rankDelta: { color: colors.green, fontSize: 12, marginTop: 2, fontWeight: '700' },
  alertIntro: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  alertTag: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 2,
  },
  alertTagRed: { backgroundColor: 'rgba(248,113,113,0.15)', color: colors.red },
  alertTagAmber: { backgroundColor: colors.orangeMuted, color: colors.orangeSoft },
  alertTagGreen: { backgroundColor: 'rgba(52,211,153,0.15)', color: colors.green },
  alertTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },
  alertDetail: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 3 },
});
