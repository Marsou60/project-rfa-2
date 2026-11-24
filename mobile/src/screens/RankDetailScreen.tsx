import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { getNetworkDashboard } from '../api/consultation';
import { useNetworkDashboard } from '../api/networkStore';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { useAuth } from '../auth/AuthContext';
import { BackHeader } from '../components/BackHeader';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';
import { rankTitle, rowsForRank } from '../utils/rankRows';
import { FilterKind } from './FilteredClientsScreen';

export type RankKind =
  | 'marques'
  | 'familles'
  | 'sous_familles'
  | 'commerciaux'
  | 'regions'
  | 'groupes'
  | 'clients'
  | 'plateformes';

export type RankRow = {
  key?: string;
  code_union?: string;
  raison_sociale?: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
};

type Params = {
  title?: string;
  kind: RankKind;
  rows?: RankRow[];
  subtitle?: string;
  fournisseur?: string;
  liste?: string;
};

const KIND_HELP: Record<RankKind, string> = {
  marques: 'Tapez une marque pour voir ses plateformes et les adhérents qui l’achètent.',
  familles: 'Répartition du CA réseau par famille de produits (lecture).',
  sous_familles: 'Répartition du CA réseau par sous-famille de produits (lecture).',
  commerciaux: 'Tapez un commercial pour voir son portefeuille clients, puis ouvrez une fiche.',
  regions: 'Tapez une région pour voir ses clients, puis ouvrez une fiche RFA.',
  groupes: 'Tapez un groupe pour ouvrir sa fiche RFA / contrat.',
  clients: 'Tapez un client pour ouvrir sa fiche RFA.',
  plateformes: 'Tapez une plateforme pour voir les clients qui y achètent.',
};

function toFilterKind(kind: RankKind): FilterKind | null {
  if (kind === 'regions') return 'region';
  if (kind === 'commerciaux') return 'commercial';
  if (kind === 'marques') return 'marque';
  if (kind === 'plateformes') return 'plateforme';
  return null;
}

export function RankDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ RankDetail: Params }, 'RankDetail'>>();
  const { commercialScope } = useAuth();
  const { dash } = useNetworkDashboard();
  const params = route.params || { kind: 'marques' as RankKind };
  const { kind, subtitle, fournisseur, liste } = params;
  const title = params.title || rankTitle(kind, liste);
  const passedRows = Array.isArray(params.rows) ? params.rows : null;
  const [remoteRows, setRemoteRows] = useState<RankRow[] | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (passedRows) return undefined;
    if (!fournisseur && dash) {
      setRemoteRows(rowsForRank(dash, kind, liste) as RankRow[]);
      setRemoteError(null);
      return undefined;
    }
    let cancel = false;
    getNetworkDashboard({
      fournisseur: fournisseur || null,
      full: true,
      commercial: commercialScope,
    })
      .then((data) => {
        if (!cancel) setRemoteRows(rowsForRank(data, kind, liste) as RankRow[]);
      })
      .catch((e: unknown) => {
        if (cancel) return;
        const msg =
          (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
            ?.detail ||
          (e as { message?: string })?.message ||
          'Erreur de chargement';
        setRemoteError(String(msg));
        setRemoteRows([]);
      });
    return () => {
      cancel = true;
    };
  }, [passedRows, fournisseur, dash, kind, liste, commercialScope]);

  const rows = passedRows || remoteRows || [];

  const help = subtitle || KIND_HELP[kind];
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.current || 0) - (a.current || 0)),
    [rows],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return sorted;
    return sorted.filter((r) =>
      `${r.raison_sociale || ''} ${r.key || ''} ${r.code_union || ''}`.toUpperCase().includes(q),
    );
  }, [sorted, query]);

  const total = useMemo(() => sorted.reduce((s, r) => s + (r.current || 0), 0), [sorted]);
  const clickable = kind !== 'familles' && kind !== 'sous_familles';

  const openRow = (r: RankRow) => {
    if (kind === 'clients' && r.code_union) {
      navigation.navigate('ClientRfa', {
        codeUnion: r.code_union,
        label: r.raison_sociale || r.key,
      });
      return;
    }
    if (kind === 'groupes' && r.key) {
      navigation.navigate('ClientRfa', { groupeClient: r.key, label: r.key });
      return;
    }
    const value = (r.key || r.raison_sociale || '').trim();
    if (kind === 'marques' && value) {
      navigation.navigate('BrandDetail', { marque: value, onglet: 'plateformes' });
      return;
    }
    const filterKind = toFilterKind(kind);
    if (filterKind && value) {
      navigation.navigate('FilteredClients', {
        kind: filterKind,
        value,
        title: value,
      });
    }
  };

  const loadingRows = !passedRows && !remoteRows && !remoteError;

  return (
    <View style={styles.screen}>
      <BackHeader title={title} subtitle="Classement" />
      <View style={styles.root}>
      <Text style={styles.count}>
        {sorted.length} ligne{sorted.length > 1 ? 's' : ''} · CA total {fmtEuro(total)}
      </Text>
      <Text style={styles.help}>{help}</Text>
      {sorted.length > 12 ? (
        <TextInput
          style={styles.search}
          placeholder="Filtrer dans la liste"
          placeholderTextColor={colors.muted2}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => `${item.code_union || item.key || idx}`}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          loadingRows ? (
            <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>{remoteError || 'Aucune ligne à afficher.'}</Text>
          )
        }
        renderItem={({ item, index }) => {
          const label = item.raison_sociale || item.key || item.code_union || '—';
          const marqueSrc = kind === 'marques' ? getMarqueLogoSource(label) : null;
          return (
            <Pressable style={styles.row} onPress={() => openRow(item)} disabled={!clickable}>
              <Text style={styles.idx}>{index + 1}</Text>
              {kind === 'marques' ? (
                <View style={styles.logoWrap}>
                  {marqueSrc ? (
                    <Image source={marqueSrc} style={styles.logo} resizeMode="contain" />
                  ) : (
                    <Text style={styles.logoFallback}>{String(label).slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {label}
                </Text>
                {item.code_union ? <Text style={styles.sub}>{item.code_union}</Text> : null}
                <Text style={clickable ? styles.hint : styles.sub}>
                  {kind === 'marques'
                    ? 'Plateformes et adhérents ›'
                    : clickable && toFilterKind(kind)
                      ? 'Voir les clients ›'
                      : `CA N-1 : ${fmtEuro(item.previous)}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.ca}>{fmtEuro(item.current)}</Text>
                <Text
                  style={[
                    styles.delta,
                    (item.delta_pct || 0) < 0 ? { color: colors.red } : { color: colors.green },
                  ]}
                >
                  {fmtDeltaPct(item.delta_pct)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  count: { color: colors.white, fontSize: 13, fontWeight: '800' },
  help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 12 },
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
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
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
  idx: { color: colors.orange, fontWeight: '800', width: 22 },
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
  title: { color: colors.white, fontWeight: '700', fontSize: 15 },
  sub: { color: colors.muted2, fontSize: 11, marginTop: 2 },
  hint: { color: colors.orangeSoft, fontSize: 11, marginTop: 3, fontWeight: '700' },
  ca: { color: colors.white, fontWeight: '800' },
  delta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});
