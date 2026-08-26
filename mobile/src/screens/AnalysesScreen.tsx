import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useNetworkDashboard } from '../api/networkStore';
import { useAuth } from '../auth/AuthContext';
import { MenuGrid, MenuItem } from '../components/MenuGrid';
import { RankKind } from './RankDetailScreen';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';

function countLabel(n: number, unit = 'ligne') {
  if (!n) return '—';
  return `${n} ${unit}${n > 1 ? 's' : ''}`;
}

export function AnalysesScreen() {
  const navigation = useNavigation<any>();
  const { isNetworkFullAccess, commercialScope } = useAuth();
  const { dash, loading, error, refresh } = useNetworkDashboard();

  const clients = dash?.clients || [];
  const groupes = dash?.groupes || [];
  const marques = dash?.marques || dash?.top_marques || [];
  const familles = dash?.familles || dash?.top_familles || [];
  const sousFamilles = dash?.sous_familles || [];
  const commerciaux = dash?.commerciaux || [];
  const regions = dash?.regions || [];
  const cross = dash?.cross;

  const plateformes = useMemo(
    () =>
      (dash?.platforms || []).map((p) => ({
        key: p.platform,
        current: p.current,
        previous: p.previous,
        delta: p.delta,
        delta_pct: p.delta_pct,
      })),
    [dash],
  );

  const openRank = (title: string, kind: RankKind, rows: unknown[], subtitle?: string) =>
    navigation.navigate('RankDetail', { title, kind, rows, subtitle });

  const explorer: MenuItem[] = [
    {
      key: 'clients',
      icon: 'people-outline',
      label: 'Adhérents',
      sub: countLabel(clients.length, 'client'),
      onPress: () => navigation.navigate('Adherents'),
    },
    {
      key: 'groupes',
      icon: 'git-network-outline',
      label: 'Groupes',
      sub: countLabel(groupes.length, 'groupe'),
      onPress: () =>
        openRank(
          'Tous les groupes',
          'groupes',
          groupes,
          'Tous les groupes Pure Data. Tapez un groupe pour sa fiche RFA, marques, familles et contrat.',
        ),
    },
    {
      key: 'marques',
      icon: 'pricetags-outline',
      label: 'Marques',
      sub: countLabel(marques.length, 'marque'),
      onPress: () =>
        openRank(
          'Toutes les marques',
          'marques',
          marques,
          'Toutes les marques du réseau. Tapez une marque pour voir les clients qui en achètent.',
        ),
    },
    {
      key: 'plateformes',
      icon: 'cube-outline',
      label: 'Plateformes',
      sub: countLabel(plateformes.length, 'plateforme'),
      onPress: () =>
        openRank(
          'Plateformes',
          'plateformes',
          plateformes,
          'CA par plateforme. Tapez une plateforme pour voir tous ses clients.',
        ),
    },
    ...(isNetworkFullAccess
      ? ([
          {
            key: 'commerciaux',
            icon: 'briefcase-outline',
            label: 'Commerciaux',
            sub: countLabel(commerciaux.length, 'commercial'),
            onPress: () =>
              openRank(
                'Tous les commerciaux',
                'commerciaux',
                commerciaux,
                'Tous les commerciaux. Tapez un commercial pour voir son portefeuille complet.',
              ),
          },
        ] as MenuItem[])
      : []),
    {
      key: 'regions',
      icon: 'map-outline',
      label: 'Régions',
      sub: countLabel(regions.length, 'région'),
      onPress: () =>
        openRank(
          'Toutes les régions',
          'regions',
          regions,
          'Toutes les régions commerciales. Tapez une région pour voir ses clients.',
        ),
    },
    {
      key: 'familles',
      icon: 'grid-outline',
      label: 'Familles',
      sub: countLabel(familles.length, 'famille'),
      onPress: () =>
        openRank(
          'Toutes les familles',
          'familles',
          familles,
          'Répartition complète du CA réseau par famille de produits.',
        ),
    },
    {
      key: 'sous_familles',
      icon: 'list-outline',
      label: 'Sous-familles',
      sub: countLabel(sousFamilles.length, 'ligne'),
      onPress: () =>
        openRank(
          'Toutes les sous-familles',
          'sous_familles',
          sousFamilles,
          'Répartition complète du CA réseau par sous-famille de produits.',
        ),
    },
  ];

  const progression: MenuItem[] = [
    {
      key: 'up',
      icon: 'trending-up-outline',
      label: 'Plus fortes hausses',
      sub: countLabel((dash?.top_clients_up || []).length, 'client'),
      tone: 'success',
      onPress: () =>
        openRank(
          'Plus fortes hausses',
          'clients',
          dash?.top_clients_up || [],
          'Clients dont le CA cumulé progresse le plus vs N-1 (même période).',
        ),
    },
    {
      key: 'down',
      icon: 'trending-down-outline',
      label: 'Plus fortes baisses',
      sub: countLabel((dash?.top_clients_down || []).length, 'client'),
      tone: 'danger',
      onPress: () =>
        openRank(
          'Plus fortes baisses',
          'clients',
          dash?.top_clients_down || [],
          'Clients dont le CA cumulé recule le plus vs N-1 — à prioriser en relance.',
        ),
    },
    {
      key: 'mono',
      icon: 'flag-outline',
      label: 'Mono-plateforme',
      sub: countLabel((cross?.mono_targets || []).length, 'client'),
      onPress: () =>
        openRank(
          'Clients mono-plateforme',
          'clients',
          cross?.mono_targets || [],
          'Clients qui n’achètent que sur une seule plateforme — potentiel de développement multi-plateformes.',
        ),
    },
    {
      key: 'loyal',
      icon: 'ribbon-outline',
      label: 'Multi-plateformes',
      sub: countLabel((cross?.loyal_clients || []).length, 'client'),
      tone: 'success',
      onPress: () =>
        openRank(
          'Clients multi-plateformes',
          'clients',
          cross?.loyal_clients || [],
          'Clients présents sur toutes les plateformes du réseau — les plus fidèles.',
        ),
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.orange} />
      }
    >
      <Text style={styles.title}>Analyses</Text>
      <Text style={styles.subtitle}>
        {isNetworkFullAccess
          ? 'Toutes les dimensions du réseau, sans plafond : chaque menu ouvre la liste complète, puis la fiche RFA.'
          : `Analyses de votre portefeuille${commercialScope ? ` (${commercialScope})` : ''} uniquement.`}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !dash ? <ActivityIndicator color={colors.orange} style={{ marginTop: 20 }} /> : null}

      {dash ? (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {clients.length} adhérents · {marques.length} marques · {groupes.length} groupes ·{' '}
              {fmtEuro(dash.kpis?.ca_ytd)} de CA cumulé
            </Text>
          </View>

          <Text style={styles.section}>EXPLORER</Text>
          <MenuGrid items={explorer} />

          <Text style={styles.section}>PROGRESSION & POTENTIEL</Text>
          <MenuGrid items={progression} columns={2} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: 12, paddingBottom: 48 },
  title: { color: colors.white, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.red },
  summary: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  summaryText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: {
    color: colors.muted2,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 6,
  },
});
