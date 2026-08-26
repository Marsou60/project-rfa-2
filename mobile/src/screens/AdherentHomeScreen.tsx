import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ClientRfaResponse, getClientRfa } from '../api/consultation';
import { useSupplierLogos } from '../api/logos';
import { useAuth } from '../auth/AuthContext';
import { HeroCaCard } from '../components/HeroCaCard';
import { MenuGrid, MenuItem } from '../components/MenuGrid';
import { PlatformGrid } from '../components/PlatformGrid';
import { colors, spacing } from '../theme';
import { initials, platformLabel } from '../utils/format';

function asNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'value' in (v as object)) {
    return Number((v as { value?: number }).value) || 0;
  }
  return Number(v) || 0;
}

export function AdherentHomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const code = user?.linked_code_union || null;
  const groupe = user?.linked_groupe || null;
  const [data, setData] = useState<ClientRfaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logos } = useSupplierLogos();

  const load = useCallback(async () => {
    if (!code && !groupe) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getClientRfa({ codeUnion: code, groupeClient: code ? null : groupe, year: 2026 }));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Erreur RFA';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [code, groupe]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const label = data?.label || code || groupe || 'Mon espace';
  const displayName = user?.display_name || user?.username || label;
  const ca = data?.ca?.totals?.global_total || 0;
  const rfaNet = data?.rfa_net ?? data?.rfa?.totals?.grand_total ?? 0;
  const avgRate = ca > 0 ? rfaNet / ca : null;
  const deltaPct = data?.comparison_n1?.delta_pct ?? null;

  const platforms = useMemo(() => {
    const global = data?.rfa?.global || {};
    const order = ['GLOBAL_ACR', 'GLOBAL_DCA', 'GLOBAL_EXADIS', 'GLOBAL_ALLIANCE'];
    const keys = order.filter((k) => global[k]).concat(Object.keys(global).filter((k) => !order.includes(k)));
    return keys.slice(0, 4).map((key) => {
      const item = global[key] || {};
      return {
        key,
        label: platformLabel(key),
        ca: Number(item.ca) || 0,
        rfa: asNum(item.total) || asNum(item.rfa) + asNum(item.bonus),
      };
    });
  }, [data]);

  const shortcuts: MenuItem[] = [
    {
      key: 'rfa',
      icon: 'cash-outline',
      label: 'Ma RFA',
      sub: 'Paliers & projection',
      onPress: () => navigation.navigate('RFA', { initialTab: 'rfa' }),
    },
    {
      key: 'marques',
      icon: 'pricetags-outline',
      label: 'Mes marques',
      sub: 'Toutes mes marques',
      onPress: () => navigation.navigate('RFA', { initialTab: 'marques' }),
    },
    {
      key: 'familles',
      icon: 'grid-outline',
      label: 'Mes familles',
      sub: 'Détail produits',
      onPress: () => navigation.navigate('RFA', { initialTab: 'familles' }),
    },
    {
      key: 'contrat',
      icon: 'document-text-outline',
      label: 'Mon contrat',
      sub: 'PDF & niveau',
      onPress: () => navigation.navigate('RFA', { initialTab: 'contrat' }),
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>BONJOUR 👋</Text>
          <Text style={styles.name}>{label}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(displayName)}</Text>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Connecté en Adhérent — tu vois uniquement tes chiffres
          {code ? ` (code ${code})` : groupe ? ` (groupe ${groupe})` : ''}.
        </Text>
      </View>

      {!code && !groupe ? (
        <Text style={styles.error}>Aucun client lié à ce compte.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 20 }} /> : null}

      {data?.available ? (
        <>
          <HeroCaCard
            ca={ca}
            subtitle={label}
            deltaPct={deltaPct}
            rfaEstimated={rfaNet}
            avgRate={avgRate}
          />
          <Text style={styles.section}>ACCÈS RAPIDE</Text>
          <MenuGrid items={shortcuts} columns={2} />
          <PlatformGrid items={platforms} logos={logos} />
        </>
      ) : data && !data.available ? (
        <Text style={styles.muted}>{data.message || 'Pas encore de données 2026.'}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: 14, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  name: { color: colors.white, fontSize: 26, fontWeight: '800', marginTop: 2 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800' },
  banner: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  bannerText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.red },
  muted: { color: colors.muted },
  section: { color: colors.muted2, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
