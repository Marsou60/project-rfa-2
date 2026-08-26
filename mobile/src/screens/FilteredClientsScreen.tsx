import React, { useCallback, useMemo, useState } from 'react';
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
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { getNetworkDashboard, NetworkClientRow } from '../api/consultation';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

export type FilterKind = 'region' | 'commercial' | 'marque' | 'plateforme';

type Params = {
  kind: FilterKind;
  value: string;
  title?: string;
};

const KIND_LABEL: Record<FilterKind, string> = {
  region: 'Région',
  commercial: 'Commercial',
  marque: 'Marque',
  plateforme: 'Plateforme',
};

export function FilteredClientsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ FilteredClients: Params }, 'FilteredClients'>>();
  const { kind, value, title } = route.params || { kind: 'region' as FilterKind, value: '' };

  const [rows, setRows] = useState<NetworkClientRow[]>([]);
  const [query, setQuery] = useState('');
  const [caTotal, setCaTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!value) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const dash = await getNetworkDashboard({
        region: kind === 'region' ? value : null,
        commercial: kind === 'commercial' ? value : null,
        marque: kind === 'marque' ? value : null,
        fournisseur: kind === 'plateforme' ? value : null,
        full: true,
      });
      const clients = (dash.clients || []).filter((c) => c.code_union && (c.current || 0) > 0);
      setRows(clients);
      setCaTotal(dash.kpis?.ca_ytd || clients.reduce((s, c) => s + (c.current || 0), 0));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Erreur chargement clients';
      setError(String(msg));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, value]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = useMemo(() => {
    const kindLabel = KIND_LABEL[kind] || kind;
    return {
      title: title || value,
      subtitle: `${kindLabel} · ${rows.length} client${rows.length > 1 ? 's' : ''} · CA ${fmtEuro(caTotal)}`,
      help:
        kind === 'region'
          ? `Tous les clients Pure Data de la région « ${value} ». Tapez un client pour ouvrir sa fiche RFA.`
          : kind === 'commercial'
            ? `Portefeuille complet du commercial « ${value} ». Tapez un client pour sa fiche RFA.`
            : kind === 'plateforme'
              ? `Tous les clients avec du CA sur la plateforme « ${value} ».`
              : `Tous les clients ayant du CA sur la marque « ${value} ». Tapez pour ouvrir la fiche.`,
    };
  }, [kind, value, title, rows.length, caTotal]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.code_union || ''} ${r.raison_sociale || r.key || ''}`.toUpperCase().includes(q),
    );
  }, [rows, query]);

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>{KIND_LABEL[kind]}</Text>
      <Text style={styles.title}>{header.title}</Text>
      <Text style={styles.subtitle}>{header.subtitle}</Text>
      <Text style={styles.help}>{header.help}</Text>

      {rows.length > 12 ? (
        <TextInput
          style={styles.search}
          placeholder="Filtrer par nom ou code"
          placeholderTextColor={colors.muted2}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.code_union}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Aucun client avec CA pour ce filtre.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('ClientRfa', {
                codeUnion: item.code_union,
                label: item.raison_sociale || item.key,
              })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{item.code_union}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.raison_sociale || item.key}
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
              <Text style={styles.open}>Fiche ›</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  kicker: { color: colors.orangeSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  help: { color: colors.muted2, fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 12 },
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
  error: { color: colors.red, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  code: { color: colors.orange, fontWeight: '800', fontSize: 12 },
  name: { color: colors.white, fontWeight: '700', fontSize: 15, marginTop: 2 },
  ca: { color: colors.white, fontWeight: '800' },
  delta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  open: { color: colors.orangeSoft, fontSize: 11, fontWeight: '700', marginTop: 4 },
});
