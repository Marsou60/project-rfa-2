import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  ClientDashboardResponse,
  ClientMonthlyEvolution,
  ClientRfaResponse,
  ContractPdfMeta,
  fetchContractPdfBlob,
  getClientDashboard,
  getClientMonthlyEvolution,
  getClientRfa,
  getContractPdfMeta,
} from '../api/consultation';
import { BackHeader } from '../components/BackHeader';
import { ImpayesBanner } from '../components/ImpayesBanner';
import { ProdexNoticeModal } from '../components/ProdexNoticeModal';
import { HierarchyList } from '../components/HierarchyList';
import { Icon, IconName } from '../components/Icon';
import { MonthlyCaCard } from '../components/MonthlyCaCard';
import { RfaPanel } from '../components/RfaPanel';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';
import { describeCotisation } from '../utils/cotisationStatus';
import { downloadBlob } from '../utils/downloadBlob';
import { ClientFichePanel } from '../components/ClientFichePanel';
import { getClientFiche } from '../api/fiches';

type TabId = 'rfa' | 'mois' | 'marques' | 'familles' | 'contrat' | 'fiche';

type Props = {
  codeUnion?: string | null;
  groupeClient?: string | null;
  label?: string;
  initialTab?: TabId;
  bleedStatusBar?: boolean;
  showBack?: boolean;
  /** Fiche Nathalie, notes et dépôt de pièces : équipe Union uniquement. */
  staffFiche?: boolean;
};

const BASE_TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'mois', label: 'Mensuel', icon: 'calendar-outline' },
  { id: 'rfa', label: 'RFA', icon: 'cash-outline' },
  { id: 'marques', label: 'Marques', icon: 'pricetags-outline' },
  { id: 'familles', label: 'Familles', icon: 'grid-outline' },
  { id: 'contrat', label: 'Contrat', icon: 'document-text-outline' },
  { id: 'fiche', label: 'Fiche et notes', icon: 'business-outline' },
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < binary.length; i += 3) {
    const c1 = binary.charCodeAt(i);
    const c2 = i + 1 < binary.length ? binary.charCodeAt(i + 1) : NaN;
    const c3 = i + 2 < binary.length ? binary.charCodeAt(i + 2) : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (Number.isNaN(c2) ? 0 : c2 >> 4);
    const e3 = Number.isNaN(c2) ? 64 : ((c2 & 15) << 2) | (Number.isNaN(c3) ? 0 : c3 >> 6);
    const e4 = Number.isNaN(c3) ? 64 : c3 & 63;
    output +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? '=' : chars.charAt(e3)) +
      (e4 === 64 ? '=' : chars.charAt(e4));
  }
  return output;
}

export function ClientDetailScreen({
  codeUnion,
  groupeClient,
  label,
  initialTab = 'mois',
  bleedStatusBar = false,
  showBack = false,
  staffFiche = false,
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [dash, setDash] = useState<ClientDashboardResponse | null>(null);
  const [rfa, setRfa] = useState<ClientRfaResponse | null>(null);
  const [monthly, setMonthly] = useState<ClientMonthlyEvolution | null>(null);
  const [pdfMeta, setPdfMeta] = useState<ContractPdfMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [rfaLoading, setRfaLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prodexNotice, setProdexNotice] = useState(true);
  const [missingDocs, setMissingDocs] = useState<string[] | null>(null);
  const insets = useSafeAreaInsets();
  const tabs = staffFiche ? BASE_TABS : BASE_TABS.filter((item) => item.id !== 'fiche');

  const entityId = (codeUnion || groupeClient || '').toString();
  const mode: 'client' | 'group' = codeUnion ? 'client' : 'group';
  const [entityKey, setEntityKey] = useState(entityId);
  if (entityKey !== entityId) {
    setEntityKey(entityId);
    setDash(null);
    setRfa(null);
    setMonthly(null);
    setPdfMeta(null);
    setLoading(true);
    setRfaLoading(true);
    setError(null);
  }

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!staffFiche || !codeUnion) {
      setMissingDocs(null);
      return;
    }
    let cancel = false;
    getClientFiche(codeUnion)
      .then((fiche) => {
        if (cancel) return;
        setMissingDocs(fiche?.missing_docs?.length ? fiche.missing_docs : null);
      })
      .catch(() => {
        if (!cancel) setMissingDocs(null);
      });
    return () => {
      cancel = true;
    };
  }, [staffFiche, codeUnion]);

  const load = useCallback(async () => {
    if (!codeUnion && !groupeClient) {
      setLoading(false);
      setRfaLoading(false);
      return;
    }
    setLoading(true);
    setRfaLoading(true);
    setError(null);
    const monthlyTask = getClientMonthlyEvolution({ codeUnion, groupeClient })
      .then((m) => setMonthly(m))
      .catch(() => setMonthly(null))
      .finally(() => setLoading(false));
    const dashTask = getClientDashboard({ codeUnion, groupeClient })
      .then((d) => setDash(d))
      .catch(() => setDash({ available: false, message: 'Détail marques et familles indisponible.' }));
    const rfaTask = getClientRfa({ codeUnion, groupeClient, year: 2026 })
      .then((r) => setRfa(r))
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
            ?.detail ||
          (e as { message?: string })?.message ||
          'Erreur de chargement RFA';
        setRfa({ available: false, message: String(msg) });
      })
      .finally(() => setRfaLoading(false));
    const pdfTask = getContractPdfMeta({
      mode,
      id: entityId,
      groupeClient: codeUnion ? null : groupeClient,
    })
      .then((meta) => setPdfMeta(meta))
      .catch(() => setPdfMeta({ available: false }));
    await Promise.all([monthlyTask, dashTask, rfaTask, pdfTask]);
  }, [codeUnion, groupeClient, entityId, mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = label || dash?.entity_label || rfa?.label || codeUnion || groupeClient || 'Détail';
  const contract = rfa?.contract_applied;
  const level = rfa?.contract_level;
  const cotis = describeCotisation(rfa?.cotisation);

  const openPdf = async () => {
    if (!pdfMeta?.available) return;
    setPdfBusy(true);
    setError(null);
    try {
      const { data, filename } = await fetchContractPdfBlob({
        mode,
        id: entityId,
        groupeClient: codeUnion ? null : groupeClient,
      });
      if (downloadBlob(data, filename)) return;
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!dir) throw new Error('Stockage local indisponible');
      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, arrayBufferToBase64(data), {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/pdf',
          dialogTitle: pdfMeta.label || 'Contrat PDF',
        });
      } else {
        setError('Partage de fichier non disponible sur cet appareil.');
      }
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message || 'Ouverture PDF impossible';
      setError(String(msg));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {showBack ? (
        <BackHeader title={title} subtitle={codeUnion || groupeClient || undefined} />
      ) : (
        <View
          style={[
            styles.header,
            { paddingTop: bleedStatusBar ? Math.max(insets.top, 12) : spacing.md },
          ]}
        >
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {codeUnion || groupeClient ? (
            <Text style={styles.codeLine}>{codeUnion || groupeClient}</Text>
          ) : null}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === t.id }}
            accessibilityLabel={t.label}
          >
            <Icon name={t.icon} size={18} color={tab === t.id ? colors.white : colors.muted} />
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ProdexNoticeModal visible={prodexNotice} onClose={() => setProdexNotice(false)} />
      <Modal visible={Boolean(missingDocs?.length)} transparent animationType="fade" onRequestClose={() => setMissingDocs(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.alertKicker}>Document manquant</Text>
            <Text style={styles.modalTitle}>Il manque {(missingDocs || []).join(', ')}.</Text>
            <Text style={styles.modalText}>Ouvrez l’onglet Fiche pour déposer le RIB, le Kbis ou la pièce d’identité.</Text>
            <Pressable
              style={styles.alertBtn}
              onPress={() => {
                setMissingDocs(null);
                setTab('fiche');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.alertBtnText}>Voir la fiche</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {codeUnion ? (
        <View style={styles.bannerWrap}>
          <ImpayesBanner codeUnion={codeUnion} />
        </View>
      ) : null}

      <View style={tab === 'rfa' ? styles.rfaSlot : styles.rfaHidden} pointerEvents={tab === 'rfa' ? 'auto' : 'none'}>
        <RfaPanel
          codeUnion={codeUnion}
          groupeClient={groupeClient}
          title={title}
          seed={rfa}
          seedMonthly={monthly}
          busy={rfaLoading}
          onRefresh={load}
        />
      </View>
      {staffFiche && codeUnion ? (
        <View style={tab === 'fiche' ? styles.rfaSlot : styles.rfaHidden}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <ClientFichePanel codeUnion={codeUnion} />
          </ScrollView>
        </View>
      ) : null}

      {tab !== 'rfa' && tab !== 'fiche' ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
        >
          {loading && !monthly && tab === 'mois' ? (
            <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
          ) : null}

          {tab === 'mois' && (
            <>
              <Text style={styles.hint}>
                Chiffre par plateforme. Tapez une plateforme pour voir chaque mois.
              </Text>
              <MonthlyCaCard data={monthly} />
            </>
          )}

          {(tab === 'marques' || tab === 'familles') && (
            <>
              {dash?.totals ? (
                <View style={styles.kpiRow}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>CA {dash.year_current}</Text>
                    <Text style={styles.kpiValue}>{fmtEuro(dash.totals.current)}</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>vs {dash.year_previous}</Text>
                    <Text
                      style={[
                        styles.kpiValue,
                        (dash.totals.delta || 0) < 0 ? { color: colors.red } : { color: colors.green },
                      ]}
                    >
                      {fmtDeltaPct(dash.totals.delta_pct)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.hint}>
                Touche une ligne pour dérouler (plateforme, famille, sous-famille…).
              </Text>

              {!dash ? (
                <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
              ) : !dash.available ? (
                <Text style={styles.muted}>{dash.message || 'Pas de détail Pure Data.'}</Text>
              ) : (
                <HierarchyList
                  nodes={tab === 'marques' ? dash.by_marque || [] : dash.by_famille || []}
                  emptyLabel={tab === 'marques' ? 'Aucune marque' : 'Aucune famille'}
                />
              )}
            </>
          )}

          {tab === 'contrat' && (
            <View style={styles.contractCard}>
              <Text style={styles.section}>Contrat appliqué · 2026</Text>
              {!rfa?.available ? (
                <Text style={styles.muted}>
                  {rfa?.message || 'Contrat indisponible sans données RFA.'}
                </Text>
              ) : (
                <>
                  <Text style={styles.contractName}>{contract?.name || '—'}</Text>
                  {level?.id || contract?.level ? (
                    <Text style={styles.meta}>Niveau : {level?.id || contract?.level}</Text>
                  ) : null}
                  <Text style={styles.meta}>
                    Tripartites :{' '}
                    {level?.tripartites_enabled || contract?.tripartites_enabled
                      ? 'activées'
                      : 'selon barème / niveau'}
                  </Text>
                  {cotis ? (
                    <Text style={styles.meta}>
                      Cotisation {fmtEuro(cotis.amount)} · {cotis.badge}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    RFA nette à date : {fmtEuro(rfa.rfa_net ?? rfa.rfa?.totals?.grand_total)}
                  </Text>
                </>
              )}

              <View style={styles.pdfBox}>
                <Text style={styles.section}>PDF contrat</Text>
                {pdfMeta?.available ? (
                  <>
                    <Text style={styles.meta}>{pdfMeta.label || 'Document disponible'}</Text>
                    <Pressable
                      style={styles.pdfBtn}
                      onPress={openPdf}
                      disabled={pdfBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Ouvrir le PDF du contrat"
                    >
                      {pdfBusy ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.pdfBtnText}>Ouvrir / partager le PDF</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.muted}>
                    {pdfMeta?.message || 'Aucun PDF de contrat associé à cette entité.'}
                  </Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rfaSlot: { flex: 1 },
  rfaHidden: { display: 'none' },
  header: { paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 4 },
  title: { color: colors.white, fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 32 },
  codeLine: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  tabsScroll: { flexGrow: 0 },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 14 },
  tabTextActive: { color: colors.white },
  scroll: { padding: spacing.lg, gap: 12, paddingBottom: 40 },
  error: { color: colors.red, paddingHorizontal: spacing.lg, marginBottom: 6 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  kpiLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  kpiValue: { color: colors.white, fontSize: 18, fontWeight: '800', marginTop: 4 },
  hint: { color: colors.muted, fontSize: 12 },
  muted: { color: colors.muted },
  contractCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  section: { color: colors.white, fontSize: 16, fontWeight: '800' },
  contractName: { color: colors.white, fontSize: 20, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 14 },
  pdfBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    gap: 8,
  },
  pdfBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBtnText: { color: colors.white, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.72)', justifyContent: 'flex-end', padding: spacing.lg },
  modalCard: { backgroundColor: colors.bgElevated, borderRadius: 18, padding: spacing.lg, gap: 8 },
  alertKicker: { color: colors.red, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  modalTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  modalText: { color: colors.muted, fontSize: 14 },
  alertBtn: { marginTop: 8, backgroundColor: colors.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  alertBtnText: { color: colors.white, fontWeight: '800' },
});
