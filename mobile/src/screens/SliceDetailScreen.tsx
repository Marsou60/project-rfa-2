import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  ClientDashboardResponse,
  ClientMonthlyEvolution,
  HierarchyNode,
  NetworkClientRow,
  NetworkDashboard,
  NetworkRankRow,
  getClientDashboard,
  getClientMonthlyEvolution,
  getNetworkDashboard,
  networkDashboardToMonthly,
} from '../api/consultation';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { useAuth } from '../auth/AuthContext';
import { useSupplierLogos } from '../api/logos';
import { BackHeader } from '../components/BackHeader';
import { HeroCaCard } from '../components/HeroCaCard';
import { HierarchyList } from '../components/HierarchyList';
import { MonthlyCaCard } from '../components/MonthlyCaCard';
import { SupplierLogoBadge } from '../components/SupplierLogoBadge';
import { colors, spacing } from '../theme';
import { canonPlatform, fmtDeltaPct, fmtEuro, platformLabel } from '../utils/format';

export type SliceDetailParams = {
  title?: string;
  fournisseur: string;
  codeUnion?: string;
  groupeClient?: string;
};

function matchPlatformNode(nodes: HierarchyNode[] | undefined, platform: string): HierarchyNode | null {
  const target = canonPlatform(platform);
  for (const node of nodes || []) {
    if (canonPlatform(node.label) === target) return node;
    const nested = matchPlatformNode(node.children, platform);
    if (nested) return nested;
  }
  return null;
}

export function SliceDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ SliceDetail: SliceDetailParams }, 'SliceDetail'>>();
  const { commercialScope } = useAuth();
  const { logos } = useSupplierLogos();
  const fournisseur = canonPlatform(route.params?.fournisseur || '');
  const title = route.params?.title || platformLabel(fournisseur);
  const codeUnion = route.params?.codeUnion || null;
  const groupeClient = route.params?.groupeClient || null;
  const clientMode = Boolean(codeUnion || groupeClient);

  const [dash, setDash] = useState<NetworkDashboard | null>(null);
  const [clientDash, setClientDash] = useState<ClientDashboardResponse | null>(null);
  const [monthly, setMonthly] = useState<ClientMonthlyEvolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fournisseur) {
      setLoading(false);
      setError('Plateforme inconnue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (clientMode) {
        const [monthRes, dashRes] = await Promise.all([
          getClientMonthlyEvolution({
            codeUnion,
            groupeClient,
            fournisseur,
          }).catch(() => null),
          getClientDashboard({ codeUnion, groupeClient }).catch(() => null),
        ]);
        setMonthly(monthRes);
        setClientDash(dashRes);
        setDash(null);
      } else {
        const net = await getNetworkDashboard({
          fournisseur,
          full: true,
          commercial: commercialScope,
        });
        setDash(net);
        setMonthly(networkDashboardToMonthly(net));
        setClientDash(null);
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Erreur de chargement';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [fournisseur, clientMode, codeUnion, groupeClient, commercialScope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const platformNode = useMemo(
    () => matchPlatformNode(clientDash?.platforms, fournisseur),
    [clientDash, fournisseur],
  );

  const ca = clientMode
    ? monthly?.totals?.current || platformNode?.ca_current || 0
    : dash?.kpis?.ca_ytd || 0;
  const deltaPct = clientMode
    ? monthly?.totals?.delta_pct ?? platformNode?.delta_pct ?? null
    : dash?.kpis?.delta_pct ?? null;
  const previous = clientMode
    ? monthly?.totals?.previous ?? platformNode?.ca_previous
    : dash?.kpis?.ca_n1_same_period;
  const clients = (dash?.clients || []).filter((c) => c.code_union && (c.current || 0) > 0);
  const marques: NetworkRankRow[] = (dash?.marques || dash?.top_marques || []).filter(
    (m) => (m.current || 0) > 0 || (m.previous || 0) > 0,
  );
  const clientMarques = platformNode?.children || [];

  const openClient = (row: NetworkClientRow) =>
    navigation.navigate('ClientRfa', {
      codeUnion: row.code_union,
      label: row.raison_sociale || row.key,
    });

  const openMarqueClients = (key: string) =>
    navigation.navigate('FilteredClients', {
      kind: 'marque',
      value: key,
      title: `${key} · ${platformLabel(fournisseur)}`,
      fournisseur,
    });

  return (
    <View style={styles.root}>
      <BackHeader title={title} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
      >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !dash && !monthly && !clientDash ? (
        <ActivityIndicator color={colors.orange} style={{ marginVertical: 24 }} />
      ) : null}

      <View style={styles.head}>
        <SupplierLogoBadge platformKey={fournisseur} logos={logos} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{clientMode ? 'Détail magasin' : 'Détail plateforme'}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      <HeroCaCard
        title={`Achats ${platformLabel(fournisseur)} · 2026`}
        ca={ca}
        subtitle={
          clientMode
            ? [clientDash?.entity_label, codeUnion || groupeClient].filter(Boolean).join(' · ')
            : `${dash?.kpis?.nb_clients || clients.length} clients · ${marques.length} marques`
        }
        deltaPct={deltaPct}
        deltaLabel="CA vs 2025 · même période"
        leftLabel="CA N-1"
        leftValue={previous != null ? fmtEuro(previous) : '—'}
        rightLabel={clientMode ? 'Part magasin' : 'Part réseau'}
        rightValue={
          clientMode
            ? platformNode?.part_current != null
              ? `${(Number(platformNode.part_current) * 100).toFixed(1).replace('.', ',')} %`
              : '—'
            : dash?.platforms?.[0]?.share_pct != null
              ? `${Number(dash.platforms[0].share_pct).toFixed(1).replace('.', ',')} %`
              : '—'
        }
      />

      <MonthlyCaCard data={monthly} emptyHint="Le détail mois par mois n’est pas encore disponible pour cette plateforme." />

      {clientMode ? (
        <>
          <Text style={styles.section}>Marques</Text>
          <Text style={styles.hint}>Déroulez une ligne pour voir familles et sous-familles.</Text>
          <HierarchyList nodes={clientMarques} emptyLabel="Aucune marque sur cette plateforme." />
          <Pressable
            style={styles.cta}
            onPress={() =>
              navigation.navigate('AdherentTabs', { screen: 'RFA', params: { initialTab: 'rfa' } })
            }
            accessibilityRole="button"
            accessibilityLabel="Voir la RFA de ce magasin"
          >
            <Text style={styles.ctaText}>Voir la RFA de ce magasin</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>Marques</Text>
            {marques.length > 8 ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('RankDetail', {
                    title: `Marques · ${platformLabel(fournisseur)}`,
                    kind: 'marques',
                    rows: marques,
                    subtitle: `Marques achetées sur ${platformLabel(fournisseur)}. Tapez une marque pour voir ses clients.`,
                    fournisseur,
                  })
                }
              >
                <Text style={styles.seeAll}>Tout voir ›</Text>
              </Pressable>
            ) : null}
          </View>
          {marques.length === 0 ? (
            <Text style={styles.muted}>Aucune marque sur cette plateforme.</Text>
          ) : (
            marques.slice(0, 8).map((m, idx) => {
              const label = m.key || '—';
              const src = getMarqueLogoSource(label);
              return (
                <Pressable
                  key={`${label}-${idx}`}
                  style={styles.row}
                  onPress={() => openMarqueClients(label)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${fmtEuro(m.current)}`}
                >
                  <Text style={styles.idx}>{idx + 1}</Text>
                  <View style={styles.logoWrap}>
                    {src ? (
                      <Image source={src} style={styles.logo} resizeMode="contain" />
                    ) : (
                      <Text style={styles.logoFallback}>{String(label).slice(0, 2).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.rowHint}>Voir les clients ›</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rowCa}>{fmtEuro(m.current)}</Text>
                    <Text
                      style={[
                        styles.rowDelta,
                        (m.delta_pct || 0) < 0 ? { color: colors.red } : { color: colors.green },
                      ]}
                    >
                      {fmtDeltaPct(m.delta_pct)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          <View style={styles.sectionRow}>
            <Text style={styles.section}>Adhérents</Text>
            {clients.length > 8 ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('FilteredClients', {
                    kind: 'plateforme',
                    value: fournisseur,
                    title: platformLabel(fournisseur),
                  })
                }
              >
                <Text style={styles.seeAll}>Tout voir ›</Text>
              </Pressable>
            ) : null}
          </View>
          {clients.length === 0 ? (
            <Text style={styles.muted}>Aucun adhérent avec du CA sur cette plateforme.</Text>
          ) : (
            clients.slice(0, 8).map((c, idx) => (
              <Pressable
                key={c.code_union}
                style={styles.row}
                onPress={() => openClient(c)}
                accessibilityRole="button"
                accessibilityLabel={`${c.raison_sociale || c.code_union}, ${fmtEuro(c.current)}`}
              >
                <Text style={styles.idx}>{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {c.raison_sociale || c.key || c.code_union}
                  </Text>
                  <Text style={styles.rowSub}>{c.code_union}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowCa}>{fmtEuro(c.current)}</Text>
                  <Text
                    style={[
                      styles.rowDelta,
                      (c.delta_pct || 0) < 0 ? { color: colors.red } : { color: colors.green },
                    ]}
                  >
                    {fmtDeltaPct(c.delta_pct)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48, gap: 12 },
  error: { color: colors.red },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { color: colors.orangeSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: colors.white, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  section: { color: colors.white, fontSize: 17, fontWeight: '800' },
  seeAll: { color: colors.orangeSoft, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: -6 },
  muted: { color: colors.muted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  idx: { color: colors.orange, fontWeight: '800', width: 18 },
  logoWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 30, height: 30 },
  logoFallback: { color: colors.muted2, fontSize: 11, fontWeight: '800' },
  rowTitle: { color: colors.white, fontWeight: '700' },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rowHint: { color: colors.orangeSoft, fontSize: 11, marginTop: 3, fontWeight: '700' },
  rowCa: { color: colors.white, fontWeight: '800' },
  rowDelta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  cta: {
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
