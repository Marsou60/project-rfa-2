import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  getImpayesFlags,
  getNetworkDashboard,
  ImpayeFlag,
  NetworkClientRow,
  NetworkDashboard,
} from '../api/consultation';
import { useSupplierLogos } from '../api/logos';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { useAuth } from '../auth/AuthContext';
import { BackHeader } from '../components/BackHeader';
import { ImpayeListBadge } from '../components/ImpayesBanner';
import { SupplierLogoBadge } from '../components/SupplierLogoBadge';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro, platformLabel, untilMonthLabel } from '../utils/format';

type Onglet = 'plateformes' | 'adherents';

type Params = {
  BrandDetail: {
    marque?: string;
    onglet?: Onglet;
  };
};

type PlatformRow = {
  platform: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
  share_pct?: number | null;
  nb_clients?: number;
};

function platformAmounts(per?: Record<string, number>) {
  return Object.entries(per || {})
    .filter(([, amount]) => Number(amount) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
}

export function BrandDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'BrandDetail'>>();
  const marque = String(route.params?.marque || '').trim();
  const onglet: Onglet = route.params?.onglet === 'adherents' ? 'adherents' : 'plateformes';
  const { commercialScope } = useAuth();
  const { logos } = useSupplierLogos();

  const [dash, setDash] = useState<NetworkDashboard | null>(null);
  const [flags, setFlags] = useState<Record<string, ImpayeFlag>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!marque) {
      setDash(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [next, impayes] = await Promise.all([
        getNetworkDashboard({ marque, full: true, commercial: commercialScope }),
        getImpayesFlags().catch(() => ({}) as Record<string, ImpayeFlag>),
      ]);
      setDash(next);
      setFlags(impayes);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Erreur de chargement de la marque';
      setError(String(msg));
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [marque, commercialScope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const year = dash?.year_current ?? 2026;
  const previousYear = dash?.year_previous ?? 2025;
  const period = untilMonthLabel(dash?.reporting_month, year);
  const platforms = ((dash?.platforms || []) as PlatformRow[]).filter(
    (row) => (row.current || 0) > 0 || (row.previous || 0) > 0,
  );
  const members = (dash?.clients || []).filter((row) => row.code_union && (row.current || 0) > 0);
  const visibleMembers = members.filter((row) => {
    const q = query.trim().toUpperCase();
    if (!q) return true;
    return `${row.code_union || ''} ${row.raison_sociale || row.key || ''}`.toUpperCase().includes(q);
  });
  const logo = getMarqueLogoSource(marque);

  const select = (next: Onglet) => {
    if (next === onglet) return;
    navigation.setParams({ onglet: next });
  };

  return (
    <View style={styles.screen}>
      <BackHeader title={marque || 'Marque'} subtitle="Marque" />
      <View style={styles.body}>
        <View style={styles.intro}>
          <View style={styles.logoWrap}>
            {logo ? (
              <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel={marque} />
            ) : (
              <Text style={styles.logoFallback}>{marque.slice(0, 2).toUpperCase() || '—'}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ca}>{loading && !dash ? '…' : fmtEuro(dash?.kpis?.ca_ytd)}</Text>
            <Text style={styles.period}>
              Achats {year} vs {previousYear}
              {period ? ` · ${period}` : ''} · même période que la liste des marques
            </Text>
            <Text style={[styles.delta, (dash?.kpis?.delta_pct || 0) < 0 ? styles.down : styles.up]}>
              {fmtDeltaPct(dash?.kpis?.delta_pct)}
              {dash?.kpis?.ca_n1_same_period != null
                ? ` · N-1 ${fmtEuro(dash.kpis.ca_n1_same_period)}`
                : ''}
            </Text>
          </View>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            style={[styles.tab, onglet === 'plateformes' && styles.tabOn]}
            onPress={() => select('plateformes')}
            accessibilityRole="tab"
            accessibilityState={{ selected: onglet === 'plateformes' }}
            accessibilityLabel="Plateformes"
          >
            <Text style={[styles.tabText, onglet === 'plateformes' && styles.tabTextOn]}>
              Plateformes ({platforms.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, onglet === 'adherents' && styles.tabOn]}
            onPress={() => select('adherents')}
            accessibilityRole="tab"
            accessibilityState={{ selected: onglet === 'adherents' }}
            accessibilityLabel="Adhérents"
          >
            <Text style={[styles.tabText, onglet === 'adherents' && styles.tabTextOn]}>
              Adhérents ({members.length})
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!marque ? <Text style={styles.empty}>Marque inconnue.</Text> : null}

        {onglet === 'plateformes' ? (
          <FlatList
            data={platforms}
            keyExtractor={(item) => item.platform}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
              ) : (
                <Text style={styles.empty}>Aucun achat de cette marque sur les plateformes pour cette période.</Text>
              )
            }
            renderItem={({ item }) => (
              <View style={styles.row} accessibilityLabel={`${platformLabel(item.platform)}, ${fmtEuro(item.current)}`}>
                <SupplierLogoBadge platformKey={item.platform} logos={logos} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{platformLabel(item.platform)}</Text>
                  <Text style={styles.sub}>
                    {item.nb_clients || 0} adhérent{(item.nb_clients || 0) > 1 ? 's' : ''}
                    {item.share_pct != null ? ` · ${Number(item.share_pct).toFixed(1).replace('.', ',')} %` : ''}
                  </Text>
                  <Text style={styles.sub}>N-1 : {fmtEuro(item.previous)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.caSmall}>{fmtEuro(item.current)}</Text>
                  <Text style={[styles.delta, (item.delta_pct || 0) < 0 ? styles.down : styles.up]}>
                    {fmtDeltaPct(item.delta_pct)}
                  </Text>
                </View>
              </View>
            )}
          />
        ) : (
          <>
            {members.length > 12 ? (
              <TextInput
                style={styles.search}
                placeholder="Filtrer par nom ou code"
                placeholderTextColor={colors.muted2}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Filtrer les adhérents"
              />
            ) : null}
            <FlatList
              data={visibleMembers}
              keyExtractor={(item) => item.code_union}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
                ) : (
                  <Text style={styles.empty}>Aucun adhérent n’achète cette marque sur la période.</Text>
                )
              }
              renderItem={({ item }) => (
                <MemberRow
                  item={item}
                  flag={flags[(item.code_union || '').toUpperCase()]}
                  onPress={() =>
                    navigation.navigate('ClientRfa', {
                      codeUnion: item.code_union,
                      label: item.raison_sociale || item.key,
                    })
                  }
                />
              )}
            />
          </>
        )}
      </View>
    </View>
  );
}

function MemberRow({
  item,
  flag,
  onPress,
}: {
  item: NetworkClientRow;
  flag?: ImpayeFlag;
  onPress: () => void;
}) {
  const bits = platformAmounts(item.per_platform);
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.raison_sociale || item.key}, ${fmtEuro(item.current)}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.code}>{item.code_union}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {item.raison_sociale || item.key}
        </Text>
        <Text style={styles.sub}>
          {bits.length
            ? bits.map(([key, amount]) => `${platformLabel(key)} ${fmtEuro(amount)}`).join(' · ')
            : 'Répartition plateforme indisponible'}
        </Text>
        <ImpayeListBadge
          actifsNb={flag?.actifs_nb}
          amount={flag?.actifs_montant}
          contentieux={flag?.worst_statut === 'contentieux'}
        />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.caSmall}>{fmtEuro(item.current)}</Text>
        <Text style={[styles.delta, (item.delta_pct || 0) < 0 ? styles.down : styles.up]}>
          {fmtDeltaPct(item.delta_pct)}
        </Text>
        <Text style={styles.open}>Fiche ›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  intro: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 44, height: 44 },
  logoFallback: { color: colors.muted2, fontWeight: '800' },
  ca: { color: colors.white, fontSize: 22, fontWeight: '800' },
  caSmall: { color: colors.white, fontWeight: '800' },
  period: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  delta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  up: { color: colors.green },
  down: { color: colors.red },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  tabOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextOn: { color: colors.white },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.white,
    marginBottom: 10,
  },
  list: { paddingBottom: 40 },
  error: { color: colors.red, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: { color: colors.white, fontWeight: '700', fontSize: 15 },
  code: { color: colors.orange, fontWeight: '800', fontSize: 12 },
  sub: { color: colors.muted2, fontSize: 12, marginTop: 3, lineHeight: 17 },
  open: { color: colors.orangeSoft, fontSize: 11, fontWeight: '700', marginTop: 4 },
});
