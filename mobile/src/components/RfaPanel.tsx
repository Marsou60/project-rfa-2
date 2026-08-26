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
import { useFocusEffect } from '@react-navigation/native';
import { ClientRfaResponse, getClientRfa, RfaLine } from '../api/consultation';
import { useSupplierLogos } from '../api/logos';
import { HeroCaCard } from './HeroCaCard';
import { RfaProgressCard } from './RfaProgressCard';
import { colors, spacing } from '../theme';
import { fmtEuro, fmtPct } from '../utils/format';
import { globalProgress, parseTiers, triProgress } from '../utils/rfaProgress';

type Props = {
  codeUnion?: string | null;
  groupeClient?: string | null;
  title?: string;
};

const SILVER_MIN = 100001;
const GOLD_MIN = 300001;

function asNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'value' in (v as object)) {
    return Number((v as { value?: number }).value) || 0;
  }
  return Number(v) || 0;
}

function lineAmount(item: RfaLine): number {
  if (item.total != null) return asNum(item.total);
  if (item.value != null) return asNum(item.value);
  return asNum(item.rfa) + asNum(item.bonus);
}

export function RfaPanel({ codeUnion, groupeClient, title }: Props) {
  const [data, setData] = useState<ClientRfaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logos } = useSupplierLogos();

  const load = useCallback(async () => {
    if (!codeUnion && !groupeClient) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getClientRfa({ codeUnion, groupeClient, year: 2026 });
      setData(res);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Erreur de chargement';
      setError(String(msg));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [codeUnion, groupeClient]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const derived = useMemo(() => {
    if (!data?.available) return null;
    const caGlobal = data.ca?.totals?.global_total || 0;
    const rfaGross = data.rfa?.totals?.grand_total || 0;
    const rfaNet = data.rfa_net ?? rfaGross;
    const level = data.contract_level?.id || data.contract_applied?.level || null;
    const isLevelBased = Boolean(data.level_based || data.contract_level?.id);
    const triEnabled = isLevelBased ? data.contract_level?.tripartites_enabled === true : true;
    const projected = data.rfa_projected || null;
    const projLevelId = data.projected_level?.id || null;
    const projTriEnabled = data.projected_level?.tripartites_enabled === true;
    const showLevelLock = isLevelBased && !triEnabled;
    const triProjectedUnlock = showLevelLock && projTriEnabled;
    const triFullyLocked = showLevelLock && !projTriEnabled;
    const gapToSilver = Math.max(SILVER_MIN - caGlobal, 0);
    const gapToGold = Math.max(GOLD_MIN - caGlobal, 0);

    const globalItems = Object.entries(data.rfa?.global || {}).filter(([, it]) => (it.ca || 0) > 0);
    const triItems = Object.entries(data.rfa?.tri || {})
      .filter(([, v]) => (v.ca || 0) > 0)
      .filter(([, v]) => parseTiers(v.tiers).length > 0);

    const platformOpps = globalItems
      .map(([key, it]) => {
        const tRfa = parseTiers(it.tiers_rfa);
        const tBonus = parseTiers(it.tiers_bonus);
        const prog = globalProgress(it.ca || 0, tRfa, tBonus);
        return { key, label: it.label || key, prog };
      })
      .filter((x) => x.prog.nextMin != null && x.prog.projectedGain > 0)
      .sort((a, b) => b.prog.projectedGain - a.prog.projectedGain);

    const bestOpp = platformOpps[0] || null;
    let nextObjective: {
      title: string;
      body: string;
      progress: number;
      done?: boolean;
    };

    if (isLevelBased && String(level).toUpperCase() === 'CLASSIQUE' && gapToSilver > 0) {
      nextObjective = {
        title: 'Objectif : Silver',
        body: `Encore ${fmtEuro(gapToSilver)} de CA global pour débloquer les tripartites.`,
        progress: Math.min((caGlobal / SILVER_MIN) * 100, 100),
      };
    } else if (isLevelBased && String(level).toUpperCase() === 'SILVER' && gapToGold > 0) {
      nextObjective = {
        title: 'Objectif : Gold',
        body: `Encore ${fmtEuro(gapToGold)} de CA global pour le bonus Union supérieur.`,
        progress: Math.min((caGlobal / GOLD_MIN) * 100, 100),
      };
    } else if (bestOpp) {
      nextObjective = {
        title: `Prochain palier · ${bestOpp.label}`,
        body: `Encore ${fmtEuro(bestOpp.prog.missing)} pour +${fmtEuro(bestOpp.prog.projectedGain)} de RFA.`,
        progress: bestOpp.prog.progress,
      };
    } else {
      nextObjective = {
        title: 'Objectifs atteints',
        body: 'Paliers maximaux atteints sur les plateformes suivies.',
        progress: 100,
        done: true,
      };
    }

    const zeroBecauseBelow =
      rfaNet <= 0 &&
      caGlobal > 0 &&
      globalItems.some(([, it]) => {
        const prog = globalProgress(it.ca || 0, parseTiers(it.tiers_rfa), parseTiers(it.tiers_bonus));
        return prog.rate === 0 && prog.nextMin != null;
      });

    return {
      caGlobal,
      rfaNet,
      level,
      isLevelBased,
      contractName: data.contract_applied?.name || '—',
      proj: data.rfa_projected_net ?? data.rfa_projected?.totals?.grand_total,
      projectedLevel: projLevelId,
      cmp: data.comparison_n1,
      avgRate: caGlobal > 0 ? rfaNet / caGlobal : null,
      globalItems,
      triItems,
      nextObjective,
      zeroBecauseBelow,
      triProjectedUnlock,
      triFullyLocked,
      gapToSilver,
      projected,
      lockHintBase:
        gapToSilver > 0
          ? `Encore ${fmtEuro(gapToSilver)} de CA global pour passer Silver et encaisser ces tripartites.`
          : 'Passez Silver ou Gold pour encaisser ces tripartites.',
    };
  }, [data]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} size="large" />
        <Text style={styles.muted}>Calcul RFA 2026…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  if (!data?.available || !derived) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{title || 'RFA 2026'}</Text>
        <Text style={styles.muted}>{data?.message || 'Aucune donnée Pure Data 2026.'}</Text>
      </View>
    );
  }

  const d = derived;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}
    >
      <HeroCaCard
        title="Chiffre d’affaires RFA cumulé · 2026"
        ca={d.caGlobal}
        subtitle={`${title || data.label || codeUnion || groupeClient}${d.level ? ` · ${d.level}` : ''}`}
        deltaPct={d.cmp?.delta_pct}
        rfaEstimated={d.rfaNet}
        avgRate={d.avgRate}
      />

      <View style={styles.contractRow}>
        <Text style={styles.meta}>Contrat : {d.contractName}</Text>
        {d.level ? (
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{String(d.level).toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      {d.zeroBecauseBelow ? (
        <View style={styles.whyBox}>
          <Text style={styles.whyTitle}>Pourquoi 0 € de RFA ?</Text>
          <Text style={styles.whyBody}>
            Du CA est enregistré, mais le 1er palier du contrat n’est pas encore atteint. Les jauges
            ci-dessous montrent le manque à combler et le gain au prochain seuil.
          </Text>
        </View>
      ) : null}

      <View style={[styles.objCard, d.nextObjective.done && styles.objDone]}>
        <Text style={styles.objTitle}>{d.nextObjective.title}</Text>
        <Text style={styles.objBody}>{d.nextObjective.body}</Text>
        <View style={styles.gaugeTrack}>
          <View
            style={[
              styles.gaugeFill,
              {
                width: `${Math.min(d.nextObjective.progress, 100)}%`,
                backgroundColor: d.nextObjective.done ? colors.green : '#FBBF24',
              },
            ]}
          />
        </View>
        <Text style={styles.objPct}>{Math.round(d.nextObjective.progress)} %</Text>
      </View>

      {d.proj != null ? (
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>Projection RFA fin d’année</Text>
          <Text style={styles.bannerValue}>{fmtEuro(d.proj)}</Text>
          {d.projectedLevel ? (
            <Text style={styles.bannerMeta}>Niveau projeté : {d.projectedLevel}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.section}>Plateformes</Text>
      <Text style={styles.sectionHint}>Tap pour ouvrir le barème · jauge = progression vers le prochain palier</Text>
      {d.globalItems.length === 0 ? (
        <Text style={styles.muted}>Aucun CA plateforme</Text>
      ) : (
        d.globalItems.map(([key, it]) => {
          const tRfa = parseTiers(it.tiers_rfa);
          const tBonus = parseTiers(it.tiers_bonus);
          const prog = globalProgress(it.ca || 0, tRfa, tBonus);
          const pj = d.projected?.global?.[key];
          const pjRate =
            pj && typeof pj.total === 'object' && pj.total && 'rate' in pj.total
              ? Number((pj.total as { rate?: number }).rate) || 0
              : 0;
          return (
            <RfaProgressCard
              key={key}
              platformKey={key}
              logos={logos}
              label={it.label || key.replace(/^GLOBAL_/, '')}
              ca={it.ca || 0}
              prog={prog}
              tiersRfa={tRfa}
              tiersBonus={tBonus}
              levelLabel={d.level ? `Barème ${String(d.level).toUpperCase()}` : null}
              proj={
                pj
                  ? {
                      ca: pj.ca || 0,
                      rate: pjRate,
                      value: lineAmount(pj),
                    }
                  : null
              }
            />
          );
        })
      )}

      <Text style={styles.section}>Tripartites</Text>
      {d.triProjectedUnlock ? (
        <View style={styles.infoCyan}>
          <Text style={styles.infoCyanTitle}>Projection ≥ Silver — tripartites débloquées fin 2026</Text>
          <Text style={styles.infoCyanBody}>
            À date encore {d.level || 'Classique'}
            {d.gapToSilver > 0 ? ` (il reste ${fmtEuro(d.gapToSilver)})` : ''}.
          </Text>
        </View>
      ) : null}
      {d.triFullyLocked ? (
        <View style={styles.infoAmber}>
          <Text style={styles.infoAmberTitle}>Niveau {d.level || 'Classique'} — tripartites verrouillées</Text>
          <Text style={styles.infoAmberBody}>
            Réservées Silver & Gold (CA ≥ {fmtEuro(SILVER_MIN)}).
            {d.gapToSilver > 0 ? ` Il reste ${fmtEuro(d.gapToSilver)}.` : ''}
          </Text>
        </View>
      ) : null}
      {d.triItems.length === 0 ? (
        <Text style={styles.muted}>Aucune ligne tripartite avec CA / paliers</Text>
      ) : (
        d.triItems.map(([key, it]) => {
          const tiers = parseTiers(it.tiers);
          const prog = triProgress(it.ca || 0, tiers);
          const pjt = d.projected?.tri?.[key];
          return (
            <RfaProgressCard
              key={key}
              platformKey={key}
              logos={logos}
              label={it.label || key.replace(/^TRI_/, '')}
              ca={it.ca || 0}
              prog={prog}
              tiersTri={tiers}
              locked={d.triFullyLocked}
              projectedUnlock={d.triProjectedUnlock}
              lockHint={d.triFullyLocked ? d.lockHintBase : null}
              proj={
                pjt
                  ? {
                      ca: pjt.ca || 0,
                      rate: typeof pjt.rate === 'number' ? pjt.rate : 0,
                      value: lineAmount(pjt),
                    }
                  : null
              }
            />
          );
        })
      )}

      {data.cotisation?.amount ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cotisation</Text>
          <Text style={styles.rowText}>Montant : {fmtEuro(data.cotisation.amount)}</Text>
          <Text style={styles.rowText}>Déduite : {fmtEuro(data.cotisation.deducted || 0)}</Text>
          {d.avgRate != null ? <Text style={styles.rowText}>Taux moyen net : {fmtPct(d.avgRate)}</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bg,
    gap: 10,
  },
  scroll: { padding: spacing.lg, paddingBottom: 40, backgroundColor: colors.bg, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', color: colors.white },
  meta: { color: colors.muted, flex: 1 },
  muted: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  error: { color: colors.red, textAlign: 'center' },
  retry: { backgroundColor: colors.orange, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  contractRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  levelBadge: {
    backgroundColor: colors.orangeMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.orange,
  },
  levelText: { color: colors.orangeSoft, fontWeight: '800', fontSize: 12, letterSpacing: 0.4 },
  whyBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderRadius: 14,
    padding: spacing.md,
    gap: 4,
  },
  whyTitle: { color: '#FBBF24', fontWeight: '800', fontSize: 14 },
  whyBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  objCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    gap: 6,
  },
  objDone: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  objTitle: { color: colors.white, fontWeight: '800', fontSize: 15 },
  objBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  objPct: { color: colors.muted2, fontSize: 11, fontWeight: '700', alignSelf: 'flex-end' },
  gaugeTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    marginTop: 4,
  },
  gaugeFill: { height: '100%', borderRadius: 999 },
  banner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  bannerLabel: { color: colors.muted, fontSize: 12 },
  bannerValue: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: 4 },
  bannerMeta: { color: colors.orangeSoft, marginTop: 4, fontSize: 13, fontWeight: '600' },
  section: { color: colors.white, fontWeight: '800', fontSize: 16, marginTop: 8 },
  sectionHint: { color: colors.muted2, fontSize: 12, marginBottom: 4, marginTop: -4 },
  infoCyan: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: 'rgba(34, 211, 238, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    gap: 4,
  },
  infoCyanTitle: { color: '#67E8F9', fontWeight: '800', fontSize: 13 },
  infoCyanBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  infoAmber: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    gap: 4,
  },
  infoAmberTitle: { color: '#FCD34D', fontWeight: '800', fontSize: 13 },
  infoAmberBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
    marginTop: 4,
  },
  cardTitle: { color: colors.white, fontWeight: '800', fontSize: 16 },
  rowText: { color: colors.muted, fontSize: 14 },
});
