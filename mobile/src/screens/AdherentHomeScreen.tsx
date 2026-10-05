import React, { useCallback, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClientMonthlyEvolution,
  ClientRfaResponse,
  caDeltaPct,
  getClientMonthlyEvolution,
  getClientRfa,
} from '../api/consultation';
import { useSupplierLogos } from '../api/logos';
import { useAuth } from '../auth/AuthContext';
import { BrandHero } from '../components/BrandHero';
import { HeroCaCard } from '../components/HeroCaCard';
import { ImpayesBanner } from '../components/ImpayesBanner';
import { MonthlyCaCard } from '../components/MonthlyCaCard';
import { PlatformGrid } from '../components/PlatformGrid';
import { ProdexNoticeModal } from '../components/ProdexNoticeModal';
import { colors, spacing } from '../theme';
import { canonPlatform, fmtEuro, fmtPct, platformLabel, untilMonthLabel } from '../utils/format';

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
  const [monthly, setMonthly] = useState<ClientMonthlyEvolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logos } = useSupplierLogos();
  const insets = useSafeAreaInsets();
  const [prodexNotice, setProdexNotice] = useState(true);

  const load = useCallback(async () => {
    if (!code && !groupe) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rfa, monthRes] = await Promise.all([
        getClientRfa({ codeUnion: code, groupeClient: code ? null : groupe, year: 2026 }),
        getClientMonthlyEvolution({
          codeUnion: code,
          groupeClient: code ? null : groupe,
        }).catch(() => null),
      ]);
      setData(rfa);
      setMonthly(monthRes);
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
  const ca = data?.ca?.totals?.global_total || 0;
  const rfaNet = data?.rfa_net ?? data?.rfa?.totals?.grand_total ?? 0;
  const rfaYearEnd = data?.rfa_projected_net ?? data?.rfa_projected?.totals?.grand_total ?? null;
  const avgRate = ca > 0 ? rfaNet / ca : null;
  const caDeltaPctValue = caDeltaPct({ comparison: data?.comparison_n1, monthly });
  const until = untilMonthLabel(data?.reporting_month);

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
        caExclu: Number(item.ca_exclu) || 0,
        caRemunere: Number(item.ca_remunere) || 0,
      };
    });
  }, [data]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
    >
      <BrandHero source={require('../../assets/vitrine/equipe.jpeg')}>
        <View style={{ paddingTop: Math.max(insets.top, 12) }}>
          <Text style={styles.hello}>Bonjour</Text>
          <Text style={styles.name}>{label}</Text>
          <Text style={styles.bannerText}>
            Uniquement l’activité de ce magasin
            {code ? ` · ${code}` : ''}.
          </Text>
        </View>
      </BrandHero>

      <View style={styles.body}>
      <ProdexNoticeModal visible={prodexNotice} onClose={() => setProdexNotice(false)} />
      {code ? <ImpayesBanner codeUnion={code} /> : null}

      {!code && !groupe ? (
        <Text style={styles.error}>Aucun magasin n’est lié à ce compte. Contactez Union.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.orange} style={{ marginVertical: 20 }} /> : null}

      {data?.available ? (
        <>
          <HeroCaCard
            title={until ? `Vos achats 2026 à date (${until})` : 'Vos achats 2026 à date'}
            ca={ca}
            subtitle={label}
            deltaPct={caDeltaPctValue}
            deltaLabel="CA vs 2025 · même période"
            leftLabel="RFA à date"
            rfaEstimated={rfaNet}
            rightLabel="RFA fin d’année"
            rightValue={rfaYearEnd != null ? fmtEuro(rfaYearEnd) : '—'}
            note={
              rfaYearEnd != null
                ? 'À gauche : RFA déjà calculée sur les mois connus. À droite : estimation au 31 décembre si le rythme se poursuit.'
                : avgRate != null
                  ? `Taux moyen à date : ${fmtPct(avgRate)}`
                  : null
            }
          />
          <Pressable
            style={styles.rfaCta}
            onPress={() => navigation.navigate('RFA')}
            accessibilityRole="button"
            accessibilityLabel="Voir le détail de ma RFA"
          >
            <Text style={styles.rfaCtaText}>Voir le détail de ma RFA</Text>
            <Text style={styles.rfaCtaSub}>Paliers, contrat, marques</Text>
          </Pressable>
          <Pressable
            style={styles.monthCta}
            onPress={() => navigation.navigate('RFA', { initialTab: 'mois' })}
            accessibilityRole="button"
            accessibilityLabel="Voir la vision mensuelle"
          >
            <Text style={styles.monthCtaText}>Vision mensuelle</Text>
            <Text style={styles.monthCtaSub}>Achats mois par mois vs 2025</Text>
          </Pressable>
          {monthly?.available ? <MonthlyCaCard data={monthly} /> : null}
          <PlatformGrid
            items={platforms}
            title="Vos plateformes"
            logos={logos}
            onOpenProdexNotice={() => setProdexNotice(true)}
            onPress={(item) =>
              navigation.navigate('SliceDetail', {
                fournisseur: canonPlatform(item.key),
                title: item.label,
                codeUnion: code,
                groupeClient: code ? null : groupe,
              })
            }
          />
        </>
      ) : data && !data.available ? (
        <Text style={styles.muted}>{data.message || 'Pas encore de données 2026.'}</Text>
      ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48 },
  body: { paddingHorizontal: spacing.lg, gap: 14 },
  hello: { color: 'rgba(248,250,252,0.8)', fontSize: 16, fontWeight: '600' },
  name: { color: colors.white, fontSize: 32, fontWeight: '800', marginTop: 4, letterSpacing: -0.5, lineHeight: 38 },
  bannerText: { color: 'rgba(248,250,252,0.82)', fontSize: 14, lineHeight: 20, marginTop: 8 },
  error: { color: colors.red, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  rfaCta: {
    backgroundColor: colors.orange,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    gap: 4,
  },
  rfaCtaText: { color: colors.white, fontWeight: '800', fontSize: 17 },
  rfaCtaSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18 },
  monthCta: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    gap: 4,
  },
  monthCtaText: { color: colors.white, fontWeight: '800', fontSize: 17 },
  monthCtaSub: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
