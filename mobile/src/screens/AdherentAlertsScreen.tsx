import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getClientMonthlyEvolution,
  getClientRfa,
  getImpayesByAdherent,
  ImpayeItem,
} from '../api/consultation';
import { useSupplierLogos } from '../api/logos';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { SupplierLogoBadge } from '../components/SupplierLogoBadge';
import { colors, spacing } from '../theme';
import { OwnAlerts, OwnPalier, PALIER_NEAR_EUR, ReachedPalier, buildOwnAlerts } from '../utils/adherentAlerts';
import { canonPlatform, fmtEuro, fmtPct, monthLong } from '../utils/format';

const KNOWN = new Set(['ACR', 'DCA', 'EXADIS', 'ALLIANCE']);

function Gauge({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function logoKey(id: string): string | null {
  const key = canonPlatform(id);
  return KNOWN.has(key) ? key : null;
}

export function AdherentAlertsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const code = user?.linked_code_union || null;
  const groupe = user?.linked_groupe || null;
  const { logos } = useSupplierLogos();
  const [alerts, setAlerts] = useState<OwnAlerts | null>(null);
  const [impayes, setImpayes] = useState<ImpayeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!code && !groupe) {
      setLoading(false);
      setAlerts(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rfa, monthly, imp] = await Promise.all([
        getClientRfa({ codeUnion: code, groupeClient: code ? null : groupe, year: 2026 }),
        getClientMonthlyEvolution({ codeUnion: code, groupeClient: code ? null : groupe }).catch(() => null),
        code ? getImpayesByAdherent(code).catch(() => null) : Promise.resolve(null),
      ]);
      setAlerts(buildOwnAlerts(rfa, monthly?.platforms || []));
      setImpayes(imp?.items || []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (e as { message?: string })?.message ||
        'Alertes indisponibles';
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

  const openRfa = () => navigation.navigate('RFA', { initialTab: 'rfa' });
  const actifs = impayes.filter((item) => item.actif);
  const impayeAmount = actifs.reduce((sum, item) => sum + (Number(item.montant) || 0), 0);
  const until = alerts?.reportingMonth ? monthLong(alerts.reportingMonth) : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
    >
      <ScreenHeader
        title="Vos alertes"
        subtitle="Uniquement votre magasin. Rien du réseau."
      />

      {!code && !groupe ? (
        <Text style={styles.muted}>Aucun magasin n’est lié à ce compte. Contactez Union.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !alerts ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 24 }} /> : null}

      {alerts ? (
        <>
          <Text style={styles.section}>À aller chercher</Text>
          <Text style={styles.intro}>
            Seulement les paliers à {fmtEuro(PALIER_NEAR_EUR)} ou moins, du plus proche au plus loin. L’écart est le CA à date{until ? ` (jusqu’en ${until})` : ''}.
          </Text>
          {alerts.remaining.length === 0 ? (
            <Text style={styles.empty}>
              Aucun palier à {fmtEuro(PALIER_NEAR_EUR)} ou moins. Les seuils plus loin restent dans Ma RFA.
            </Text>
          ) : (
            alerts.remaining.map((item) => (
              <PalierCard key={item.id} item={item} logos={logos} onPress={openRfa} />
            ))
          )}

          <Text style={styles.section}>Déjà atteints</Text>
          <Text style={styles.intro}>
            Le mois n’est indiqué que lorsqu’on peut le déduire de vos achats mois par mois. Sinon, on ne devine pas la date.
          </Text>
          {alerts.reached.length === 0 ? (
            <Text style={styles.empty}>Aucun palier franchi sur le CA connu.</Text>
          ) : (
            alerts.reached.map((item) => <ReachedCard key={item.id} item={item} logos={logos} />)
          )}

          {alerts.acr ? (
            <View style={alerts.acr.triggered ? styles.good : styles.warn}>
              <Text style={styles.kicker}>Challenge ACR</Text>
              <Text style={styles.cardTitle}>
                {alerts.acr.triggered ? 'Challenge atteint' : 'Challenge en cours'}
              </Text>
              <Text style={styles.body}>
                {alerts.acr.triggered
                  ? `Taux fixe ${fmtPct(alerts.acr.boostedRate)} à la place de ${fmtPct(alerts.acr.baseRate)}. Le bonus du barème n’est pas ajouté en plus.`
                  : `Au-delà de ${fmtEuro(alerts.acr.threshold)} chez ACR, le palier est remplacé par un taux fixe. Encore ${fmtEuro(alerts.acr.missing)}.`}
              </Text>
            </View>
          ) : null}

          {actifs.length > 0 ? (
            <View style={styles.danger}>
              <Text style={styles.kicker}>Impayé</Text>
              <Text style={styles.cardTitle}>
                {actifs.length} dossier{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} · {fmtEuro(impayeAmount)}
              </Text>
              <Text style={styles.body}>
                {actifs
                  .slice(0, 3)
                  .map((item) => item.plateforme || item.motif || 'Dossier')
                  .join(' · ')}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function PalierCard({
  item,
  logos,
  onPress,
}: {
  item: OwnPalier;
  logos: Record<string, string>;
  onPress: () => void;
}) {
  const logo = logoKey(item.id);
  return (
    <Pressable
      style={[styles.card, item.locked && styles.cardLocked]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}. ${item.sentence}`}
    >
      <View style={styles.row}>
        {logo ? <SupplierLogoBadge platformKey={logo} logos={logos} size={32} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{item.kind === 'tripartite' ? 'Tripartite' : item.kind === 'niveau' ? 'Contrat' : 'Plateforme'}</Text>
          <Text style={styles.cardTitle}>{item.label}</Text>
        </View>
        <Text style={styles.pct}>{Math.round(item.progress)} %</Text>
      </View>
      <Text style={styles.body}>{item.sentence}</Text>
      <Gauge progress={item.progress} color={item.locked ? colors.muted2 : '#FBBF24'} />
      <Text style={styles.meta}>
        CA {fmtEuro(item.current)} · seuil {fmtEuro(item.threshold)} · ouvrir la fiche RFA ›
      </Text>
    </Pressable>
  );
}

function ReachedCard({ item, logos }: { item: ReachedPalier; logos: Record<string, string> }) {
  const logo = logoKey(item.id);
  const when = item.month ? `franchi en ${monthLong(item.month)}` : 'date de franchissement inconnue';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {logo ? <SupplierLogoBadge platformKey={logo} logos={logos} size={32} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Atteint</Text>
          <Text style={styles.cardTitle}>{item.label}</Text>
        </View>
      </View>
      <Text style={styles.body}>
        {`Palier ${fmtEuro(item.threshold)}`}
        {item.rate > 0 ? ` · taux ${fmtPct(item.rate)}` : ''}
        {item.amount != null && item.amount > 0 ? ` · +${fmtEuro(item.amount)} de RFA sur le CA actuel` : ''}
        {` · ${when}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: { color: colors.white, fontSize: 20, fontWeight: '800', marginTop: 18 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.red, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: 8,
    marginBottom: 10,
  },
  cardLocked: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { color: colors.orangeSoft, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: '800' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  pct: { color: '#FBBF24', fontWeight: '800', fontSize: 16 },
  track: { height: 8, borderRadius: 99, backgroundColor: '#1E293B', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 99 },
  warn: {
    backgroundColor: colors.orangeMuted,
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
    marginTop: 8,
  },
  good: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
    marginTop: 8,
  },
  danger: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
    marginTop: 10,
  },
});
