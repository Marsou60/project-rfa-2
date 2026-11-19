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
import { MapClusterCard } from '../components/MapClusterCard';
import { MapCompactCard } from '../components/MapCompactCard';
import { MapDetailSheet } from '../components/MapDetailSheet';
import { MapLegend } from '../components/MapLegend';
import { BasemapId, FitTarget } from '../map/chrome';
import { DEMO_MAP } from '../map/demoData';
import { mapDemoEnabled } from '../map/demoMode';
import { activeMapFilterCount, filterPoints, supplierChoices } from '../map/filters';
import {
  ClusterPreview,
  ColorMode,
  commercialPalette,
  pointColor,
} from '../map/markerStyle';
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
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('plateforme');
  const [legendOpen, setLegendOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>('light');
  const [showDepartments, setShowDepartments] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cluster, setCluster] = useState<ClusterPreview | null>(null);
  const [locateRequest, setLocateRequest] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [fitTarget, setFitTarget] = useState<FitTarget>('france');
  const [zoomRequest, setZoomRequest] = useState(0);
  const [zoomCodes, setZoomCodes] = useState<string[]>([]);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [deptMessage, setDeptMessage] = useState<string | null>(null);

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

  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent || !fullscreen) return undefined;
    const bottomPad = Math.max(insets.bottom, 10);
    parent.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent.setOptions({
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.orange,
          borderTopWidth: 1,
          height: 62 + bottomPad,
          paddingTop: 8,
          paddingBottom: bottomPad,
        },
      });
    };
  }, [fullscreen, insets.bottom, navigation]);

  const points = payload?.points || [];
  const unlocated = payload?.unlocated || [];
  const suppliers = useMemo(() => supplierChoices(points), [points]);
  const visible = useMemo(
    () => filterPoints(points, { supplier, nearOnly, query }),
    [points, supplier, nearOnly, query],
  );
  const palette = useMemo(
    () => commercialPalette(visible.map((point) => point.commercial)),
    [visible],
  );
  const selectedPoint = points.find((point) => point.code_union === selected) || null;
  const selectedMissing = unlocated.find((row) => row.code_union === selected) || null;
  const sheetPoint = points.find((point) => point.code_union === sheetCode) || null;
  const sheetMissing = unlocated.find((row) => row.code_union === sheetCode) || null;
  const cardOpen = Boolean((selected && (selectedPoint || selectedMissing) && !sheetCode) || cluster);
  const dockBottom = cardOpen ? 200 + (fullscreen ? insets.bottom : 0) : 8 + (fullscreen ? Math.max(insets.bottom, 0) : 0);
  const activeFilters = activeMapFilterCount({ supplier, nearOnly, colorMode });

  useEffect(() => {
    setCluster(null);
  }, [supplier, nearOnly, query]);

  const openFullClient = sheetCode && !mapDemoEnabled
    ? () => navigation.navigate('ClientRfa', {
        codeUnion: sheetCode,
        label: sheetPoint?.nom || sheetMissing?.nom,
        initialTab: 'rfa',
      })
    : undefined;

  const askFit = (target: FitTarget) => {
    setFitTarget(target);
    setFitRequest((value) => value + 1);
  };

  return (
    <View style={styles.root}>
      {!fullscreen ? (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 6) }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Carte</Text>
            <Text
              style={styles.count}
              accessibilityLabel={loading ? 'Chargement de la carte' : `${visible.length} sur la carte`}
            >
              {loading ? '…' : String(visible.length)}
            </Text>
            <View style={{ flex: 1 }} />
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
          <View style={styles.searchRow}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Nom, ville ou code"
              placeholderTextColor={colors.muted2}
              autoCorrect={false}
              accessibilityLabel="Filtrer les adhérents sur la carte"
            />
            <Pressable
              style={[styles.filterBtn, (filtersOpen || activeFilters > 0) && styles.filterBtnOn]}
              onPress={() => setFiltersOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: filtersOpen }}
              accessibilityLabel={activeFilters ? `Filtres, ${activeFilters} actifs` : 'Filtres'}
            >
              <Icon name="options" size={16} color={filtersOpen || activeFilters > 0 ? colors.bg : colors.white} />
              <Text style={filtersOpen || activeFilters > 0 ? styles.filterTextOn : styles.filterText}>Filtres</Text>
              {activeFilters > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeFilters}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {payload?.migration_required ? (
        <Text style={styles.banner}>Les coordonnées ne sont pas encore en base. La migration reste à lancer.</Text>
      ) : null}
      {payload?.geocode_pending ? (
        <Text style={styles.banner}>Le géocodage n’a pas encore été lancé. Aucun point n’est placé au hasard.</Text>
      ) : null}
      {locateMessage ? <Text style={styles.banner} accessibilityRole="alert">{locateMessage}</Text> : null}
      {deptMessage ? <Text style={styles.banner}>{deptMessage}</Text> : null}

      <View style={styles.mapWrap}>
        {loading && points.length === 0 ? (
          <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
        ) : (
          <FranceMap
            points={visible}
            selectedCode={selected}
            onSelect={(code) => {
              setSelected(code);
              setSheetCode(null);
              setCluster(null);
              setFiltersOpen(false);
            }}
            onBackgroundPress={() => {
              setSelected(null);
              setSheetCode(null);
              setCluster(null);
              setFiltersOpen(false);
            }}
            onCluster={(preview) => {
              setCluster(preview);
              setSelected(null);
              setSheetCode(null);
            }}
            colorMode={colorMode}
            basemap={basemap}
            showDepartments={showDepartments}
            locateRequest={locateRequest}
            fitRequest={fitRequest}
            fitTarget={fitTarget}
            zoomRequest={zoomRequest}
            zoomCodes={zoomCodes}
            dockBottom={dockBottom}
            onLocateMessage={setLocateMessage}
            onDepartmentMessage={setDeptMessage}
          />
        )}

        <View style={[styles.legendFloat, { top: 8 }]} pointerEvents="box-none">
          <MapLegend
            points={visible}
            mode={colorMode}
            open={legendOpen}
            onToggle={() => setLegendOpen((value) => !value)}
          />
        </View>

        {filtersOpen && !fullscreen ? (
          <View style={styles.filterPanel}>
            <Text style={styles.panelLabel}>Plateformes</Text>
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
            <Text style={styles.panelLabel}>Colorer par</Text>
            <View style={styles.chips}>
              <Chip label="Plateforme" active={colorMode === 'plateforme'} onPress={() => setColorMode('plateforme')} />
              <Chip label="Commercial" active={colorMode === 'commercial'} onPress={() => setColorMode('commercial')} />
            </View>
          </View>
        ) : null}

        <View
          style={[styles.rail, { bottom: dockBottom + 108, top: fullscreen ? Math.max(insets.top, 8) : 8 }]}
          pointerEvents="box-none"
        >
          <RoundTool
            icon="locate"
            label="Où je suis"
            onPress={() => {
              setLocateMessage(null);
              setLocateRequest((value) => value + 1);
            }}
          />
          <RoundTool icon="people" label="Portefeuille" onPress={() => askFit('points')} />
          <RoundTool icon="map" label="France" onPress={() => askFit('france')} />
          <RoundTool
            icon={basemap === 'dark' ? 'sunny' : 'moon'}
            label={basemap === 'dark' ? 'Fond clair' : 'Fond sombre'}
            active={basemap === 'dark'}
            onPress={() => setBasemap((value) => (value === 'dark' ? 'light' : 'dark'))}
          />
          <RoundTool
            icon="layers"
            label="Départements"
            active={showDepartments}
            onPress={() => setShowDepartments((value) => !value)}
          />
          <RoundTool
            icon={fullscreen ? 'contract' : 'expand'}
            label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            active={fullscreen}
            onPress={() => {
              setFullscreen((value) => !value);
              setFiltersOpen(false);
            }}
          />
        </View>

        {!loading && visible.length === 0 ? (
          <View style={styles.empty} pointerEvents="none">
            <Text style={styles.emptyText}>Aucun adhérent pour ce filtre.</Text>
          </View>
        ) : null}

        <View style={[styles.dock, { paddingBottom: fullscreen ? Math.max(insets.bottom, 8) : 8 }]} pointerEvents="box-none">
          {cluster && !sheetCode ? (
            <MapClusterCard
              preview={cluster}
              onClose={() => setCluster(null)}
              onZoom={() => {
                setZoomCodes(cluster.codes);
                setZoomRequest((value) => value + 1);
                setCluster(null);
              }}
            />
          ) : null}
          {selected && (selectedPoint || selectedMissing) && !sheetCode ? (
            <MapCompactCard
              point={selectedPoint}
              missing={selectedPoint ? null : selectedMissing}
              color={pointColor(selectedPoint || selectedMissing || {}, colorMode, palette)}
              showCommercial={colorMode === 'commercial'}
              onClose={() => setSelected(null)}
              onOpenFiche={() => setSheetCode(selected)}
            />
          ) : null}
        </View>

        {sheetCode && (sheetPoint || sheetMissing) ? (
          <MapDetailSheet
            point={sheetPoint}
            missing={sheetPoint ? null : sheetMissing}
            onClose={() => setSheetCode(null)}
            onOpenFiche={openFullClient}
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
          setSheetCode(null);
          setCluster(null);
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

function RoundTool({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      style={[styles.round, active && styles.roundOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Icon name={icon} size={20} color={active ? colors.bg : colors.white} />
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
  header: { paddingHorizontal: 12, gap: 6, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  title: { color: colors.white, fontSize: 22, fontWeight: '800' },
  count: { color: colors.muted, fontSize: 15, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterBtnOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  filterText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  filterTextOn: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
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
    flex: 1,
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
  legendFloat: { position: 'absolute', left: 8, zIndex: 5, maxWidth: '68%' },
  filterPanel: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 56,
    zIndex: 12,
    backgroundColor: 'rgba(15, 22, 36, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    gap: 8,
  },
  panelLabel: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  rail: {
    position: 'absolute',
    right: 8,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 22, 36, 0.94)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  roundOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  empty: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyText: { color: colors.white, fontWeight: '700' },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
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
