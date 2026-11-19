import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdherentMap } from '../api/map';
import { FranceMap } from '../components/FranceMap';
import { Icon } from '../components/Icon';
import { MapDetailSheet } from '../components/MapDetailSheet';
import { DEMO_MAP } from '../map/demoData';
import { mapDemoEnabled } from '../map/demoMode';
import { filterPoints, supplierChoices } from '../map/filters';
import { AdherentMapResponse, MapUnlocated, REASON_LABEL } from '../map/types';
import { colors, spacing } from '../theme';

export function MapScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<AdherentMapResponse | null>(mapDemoEnabled ? DEMO_MAP : null);
  const [loading, setLoading] = useState(!mapDemoEnabled);
  const [error, setError] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<string | null>(null);
  const [nearOnly, setNearOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const load = () => {
    if (mapDemoEnabled) {
      setPayload(DEMO_MAP);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getAdherentMap()
      .then((data) => setPayload(data))
      .catch((err: { response?: { data?: { detail?: string } }; message?: string }) => {
        setError(err?.response?.data?.detail || 'Carte indisponible.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const points = payload?.points || [];
  const unlocated = payload?.unlocated || [];
  const suppliers = useMemo(() => supplierChoices(points), [points]);
  const visible = useMemo(
    () => filterPoints(points, { supplier, nearOnly, query }),
    [points, supplier, nearOnly, query],
  );
  const selectedPoint = points.find((point) => point.code_union === selected) || null;
  const selectedMissing = unlocated.find((row) => row.code_union === selected) || null;

  const openFiche = selected && !mapDemoEnabled
    ? () => navigation.navigate('ClientRfa', {
        codeUnion: selected,
        label: selectedPoint?.nom || selectedMissing?.nom,
        initialTab: 'rfa',
      })
    : undefined;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Carte</Text>
            <Text style={styles.subtitle}>
              {loading ? 'Chargement…' : `${visible.length} sur la carte`}
              {supplier ? ` · ${supplier}` : ''}
              {nearOnly ? ' · palier proche' : ''}
            </Text>
          </View>
          <Pressable
            style={styles.missingBtn}
            onPress={() => setShowMissing(true)}
            accessibilityRole="button"
            accessibilityLabel={`${unlocated.length} adhérents sans position`}
          >
            <Text style={styles.missingText}>{unlocated.length} sans position</Text>
          </Pressable>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Actualiser la carte" hitSlop={8}>
            <Icon name="refresh" size={20} color={colors.orange} />
          </Pressable>
        </View>

        <View style={styles.chips}>
          <Chip label="Tous" active={!supplier && !nearOnly} onPress={() => { setSupplier(null); setNearOnly(false); }} />
          {suppliers.map((item) => (
            <Chip
              key={item}
              label={item}
              active={supplier === item}
              onPress={() => { setSupplier(supplier === item ? null : item); }}
            />
          ))}
          <Chip label="Palier proche" active={nearOnly} onPress={() => setNearOnly((value) => !value)} />
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Nom, ville ou code"
          placeholderTextColor={colors.muted2}
          autoCorrect={false}
          accessibilityLabel="Filtrer les adhérents sur la carte"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {payload?.migration_required ? (
        <Text style={styles.banner}>Les coordonnées ne sont pas encore en base. La migration reste à lancer.</Text>
      ) : null}
      {payload?.geocode_pending ? (
        <Text style={styles.banner}>Le géocodage n’a pas encore été lancé. Aucun point n’est placé au hasard.</Text>
      ) : null}

      <View style={styles.mapWrap}>
        {loading && points.length === 0 ? (
          <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
        ) : (
          <FranceMap points={visible} selectedCode={selected} onSelect={setSelected} />
        )}
        {!loading && visible.length === 0 ? (
          <View style={styles.empty} pointerEvents="none">
            <Text style={styles.emptyText}>Aucun adhérent pour ce filtre.</Text>
          </View>
        ) : null}
        {selected && (selectedPoint || selectedMissing) ? (
          <MapDetailSheet
            point={selectedPoint}
            missing={selectedPoint ? null : selectedMissing}
            onClose={() => setSelected(null)}
            onOpenFiche={openFiche}
          />
        ) : null}
      </View>

      <MissingModal
        visible={showMissing}
        rows={unlocated}
        onClose={() => setShowMissing(false)}
        onPick={(code) => {
          setShowMissing(false);
          setSelected(code);
        }}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={active ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function MissingModal({
  visible,
  rows,
  onClose,
  onPick,
}: {
  visible: boolean;
  rows: MapUnlocated[];
  onClose: () => void;
  onPick: (code: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer la liste" />
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Sans position fiable</Text>
        <Text style={styles.subtitle}>
          Ces adhérents ne sont pas placés au hasard. Il manque une adresse exploitable, ou le géocodage n’a pas été assez sûr.
        </Text>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.code_union}
          ListEmptyComponent={<Text style={styles.subtitle}>Tout le monde est sur la carte.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.missingRow}
              onPress={() => onPick(item.code_union)}
              accessibilityRole="button"
              accessibilityLabel={`${item.nom}, ${REASON_LABEL[item.reason]}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.missingName}>{item.nom}</Text>
                <Text style={styles.subtitle}>{item.ville || 'Ville non renseignée'} · {REASON_LABEL[item.reason]}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={colors.muted2} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  header: { paddingHorizontal: spacing.md, gap: 8, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.white, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  missingBtn: {
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  missingText: { color: colors.orangeSoft, fontWeight: '800', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chipTextOn: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  search: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.white,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  error: { color: colors.red, paddingHorizontal: spacing.md, marginBottom: 6 },
  banner: { color: '#FBBF24', paddingHorizontal: spacing.md, marginBottom: 6, fontSize: 13 },
  mapWrap: { flex: 1, minHeight: 280, position: 'relative' },
  empty: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyText: { color: colors.white, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    maxHeight: '70%',
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    gap: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  modalTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  missingName: { color: colors.white, fontWeight: '800' },
});
