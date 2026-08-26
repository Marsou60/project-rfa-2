import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  ClientDashboardResponse,
  ClientRfaResponse,
  ContractPdfMeta,
  fetchContractPdfBlob,
  getClientDashboard,
  getClientRfa,
  getContractPdfMeta,
} from '../api/consultation';
import { HierarchyList } from '../components/HierarchyList';
import { Icon, IconName } from '../components/Icon';
import { RfaPanel } from '../components/RfaPanel';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

type TabId = 'rfa' | 'marques' | 'familles' | 'contrat';

type Props = {
  codeUnion?: string | null;
  groupeClient?: string | null;
  label?: string;
  initialTab?: TabId;
};

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'rfa', label: 'RFA', icon: 'cash-outline' },
  { id: 'marques', label: 'Marques', icon: 'pricetags-outline' },
  { id: 'familles', label: 'Familles', icon: 'grid-outline' },
  { id: 'contrat', label: 'Contrat', icon: 'document-text-outline' },
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
  initialTab = 'rfa',
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [dash, setDash] = useState<ClientDashboardResponse | null>(null);
  const [rfa, setRfa] = useState<ClientRfaResponse | null>(null);
  const [pdfMeta, setPdfMeta] = useState<ContractPdfMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityId = (codeUnion || groupeClient || '').toString();
  const mode: 'client' | 'group' = codeUnion ? 'client' : 'group';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    if (!codeUnion && !groupeClient) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [d, r] = await Promise.all([
        getClientDashboard({ codeUnion, groupeClient }),
        getClientRfa({ codeUnion, groupeClient, year: 2026 }),
      ]);
      setDash(d);
      setRfa(r);
      try {
        setPdfMeta(
          await getContractPdfMeta({
            mode,
            id: entityId,
            groupeClient: codeUnion ? null : groupeClient,
          }),
        );
      } catch {
        setPdfMeta({ available: false });
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
  }, [codeUnion, groupeClient, entityId, mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = label || dash?.entity_label || rfa?.label || codeUnion || groupeClient || 'Détail';
  const contract = rfa?.contract_applied;
  const level = rfa?.contract_level;

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
      <View style={styles.header}>
        <Text style={styles.kicker}>{codeUnion || groupeClient}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={14} color={tab === t.id ? colors.white : colors.muted} />
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tab === 'rfa' ? (
        <View style={{ flex: 1 }}>
          <RfaPanel codeUnion={codeUnion} groupeClient={groupeClient} title={title} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
        >
          {loading && !dash && !rfa ? (
            <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
          ) : null}

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

              {!dash?.available ? (
                <Text style={styles.muted}>{dash?.message || 'Pas de détail Pure Data.'}</Text>
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
              <Text style={styles.section}>CONTRAT APPLIQUÉ (RFA 2026)</Text>
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
                  {rfa.cotisation?.amount ? (
                    <Text style={styles.meta}>
                      Cotisation : {fmtEuro(rfa.cotisation.amount)}
                      {rfa.cotisation.deducted
                        ? ` (déduite ${fmtEuro(rfa.cotisation.deducted)})`
                        : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    RFA nette : {fmtEuro(rfa.rfa_net ?? rfa.rfa?.totals?.grand_total)}
                  </Text>
                </>
              )}

              <View style={styles.pdfBox}>
                <Text style={styles.section}>PDF CONTRAT / ANNEXE</Text>
                {pdfMeta?.available ? (
                  <>
                    <Text style={styles.meta}>{pdfMeta.label || 'Document disponible'}</Text>
                    <Pressable style={styles.pdfBtn} onPress={openPdf} disabled={pdfBusy}>
                      {pdfBusy ? (
                        <ActivityIndicator color="#fff" />
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 8 },
  kicker: { color: colors.orange, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  title: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.orange },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 11.5 },
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
  kpiLabel: { color: colors.muted2, fontSize: 11, fontWeight: '700' },
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
  section: { color: colors.muted2, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  pdfBtnText: { color: '#fff', fontWeight: '800' },
});
