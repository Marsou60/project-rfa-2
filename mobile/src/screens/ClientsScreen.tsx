import React, { useMemo, useState } from 'react';
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
import { NetworkClientRow } from '../api/consultation';
import { useNetworkDashboard } from '../api/networkStore';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

type Mode = 'clients' | 'groupes';
type Sort = 'ca' | 'alpha';

type GroupRow = {
  key: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
};

export function ClientsScreen() {
  const navigation = useNavigation<any>();
  const { commercialScope, isNetworkFullAccess } = useAuth();
  const [mode, setMode] = useState<Mode>('clients');
  const [sort, setSort] = useState<Sort>('ca');
  const [query, setQuery] = useState('');
  const { dash, loading, error, refresh } = useNetworkDashboard();

  const rows = useMemo<NetworkClientRow[]>(() => dash?.clients || [], [dash]);
  const groupes = useMemo<GroupRow[]>(() => (dash?.groupes || []) as GroupRow[], [dash]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q
      ? rows.filter((r) =>
          `${r.code_union || ''} ${r.raison_sociale || r.key || ''}`.toUpperCase().includes(q),
        )
      : rows;
    if (sort === 'alpha') {
      return [...base].sort((a, b) =>
        String(a.raison_sociale || a.key || a.code_union).localeCompare(
          String(b.raison_sociale || b.key || b.code_union),
          'fr',
        ),
      );
    }
    return [...base].sort((a, b) => (b.current || 0) - (a.current || 0));
  }, [rows, query, sort]);

  const filteredGroupes = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q ? groupes.filter((g) => (g.key || '').toUpperCase().includes(q)) : groupes;
    if (sort === 'alpha') {
      return [...base].sort((a, b) => String(a.key).localeCompare(String(b.key), 'fr'));
    }
    return [...base].sort((a, b) => (b.current || 0) - (a.current || 0));
  }, [groupes, query, sort]);

  const openClient = (code: string, label?: string) => {
    navigation.navigate('ClientRfa', { codeUnion: code, label });
  };

  const openGroupe = (groupe: string) => {
    navigation.navigate('ClientRfa', {
      groupeClient: groupe,
      label: groupe,
    });
  };

  const openTyped = () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    if (mode === 'clients') openClient(q, q);
    else openGroupe(q);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{mode === 'clients' ? 'Adhérents' : 'Groupes'}</Text>
      <Text style={styles.subtitle}>
        {mode === 'clients'
          ? `${rows.length} adhérents${
              !isNetworkFullAccess && commercialScope ? ` · portefeuille ${commercialScope}` : ''
            } · tri ${sort === 'ca' ? 'par CA' : 'alphabétique'}`
          : `${groupes.length} groupes · RFA / marques / contrat`}
      </Text>

      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modePill, mode === 'clients' && styles.modePillActive]}
          onPress={() => setMode('clients')}
        >
          <Text style={mode === 'clients' ? styles.modeTextActive : styles.modeText}>
            Adhérents ({rows.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modePill, mode === 'groupes' && styles.modePillActive]}
          onPress={() => setMode('groupes')}
        >
          <Text style={mode === 'groupes' ? styles.modeTextActive : styles.modeText}>
            Groupes ({groupes.length})
          </Text>
        </Pressable>
      </View>

      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortChip, sort === 'ca' && styles.sortChipActive]}
          onPress={() => setSort('ca')}
        >
          <Icon name="podium-outline" size={13} color={sort === 'ca' ? colors.orange : colors.muted} />
          <Text style={sort === 'ca' ? styles.sortTextActive : styles.sortText}>CA décroissant</Text>
        </Pressable>
        <Pressable
          style={[styles.sortChip, sort === 'alpha' && styles.sortChipActive]}
          onPress={() => setSort('alpha')}
        >
          <Icon name="text-outline" size={13} color={sort === 'alpha' ? colors.orange : colors.muted} />
          <Text style={sort === 'alpha' ? styles.sortTextActive : styles.sortText}>A → Z</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder={
          mode === 'clients'
            ? 'Rechercher ou saisir un code (ex. M0024)'
            : 'Rechercher un groupe (ex. CODIFA)'
        }
        placeholderTextColor={colors.muted2}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={openTyped}
      />

      {query.trim() ? (
        <Pressable style={styles.openDirect} onPress={openTyped}>
          <Text style={styles.openDirectText}>
            Ouvrir {mode === 'clients' ? 'RFA de' : 'groupe'} {query.trim().toUpperCase()}
          </Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && rows.length === 0 && groupes.length === 0 ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 20 }} />
      ) : null}

      {mode === 'clients' ? (
        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.code_union}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>Aucun client dans la liste filtrée.</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => openClient(item.code_union, item.raison_sociale || item.key)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowCode}>{item.code_union}</Text>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.raison_sociale || item.key}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowCa}>{fmtEuro(item.current)}</Text>
                <Text
                  style={[
                    styles.rowDelta,
                    (item.delta_pct || 0) < 0 ? { color: colors.red } : { color: colors.green },
                  ]}
                >
                  {fmtDeltaPct(item.delta_pct)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={filteredGroupes}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>Aucun groupe dans la liste filtrée.</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openGroupe(item.key)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowCode}>GROUPE</Text>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.key}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowCa}>{fmtEuro(item.current)}</Text>
                <Text
                  style={[
                    styles.rowDelta,
                    (item.delta_pct || 0) < 0 ? { color: colors.red } : { color: colors.green },
                  ]}
                >
                  {fmtDeltaPct(item.delta_pct)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: colors.white },
  subtitle: { color: colors.muted, marginBottom: 12 },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modePill: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modePillActive: { backgroundColor: colors.orange },
  modeText: { color: colors.muted, fontWeight: '700' },
  modeTextActive: { color: colors.white, fontWeight: '800' },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
  },
  sortChipActive: { borderColor: colors.orange, backgroundColor: colors.orangeMuted },
  sortText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sortTextActive: { color: colors.white, fontSize: 12, fontWeight: '800' },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.white,
    marginBottom: 10,
  },
  openDirect: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  openDirectText: { color: '#fff', fontWeight: '800' },
  error: { color: colors.red, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
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
  rowCode: { color: colors.orange, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  rowName: { color: colors.white, fontWeight: '700', fontSize: 15, marginTop: 2 },
  rowCa: { color: colors.white, fontWeight: '800' },
  rowDelta: { fontSize: 12, marginTop: 2, fontWeight: '700' },
});
