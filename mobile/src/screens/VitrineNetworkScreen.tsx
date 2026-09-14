import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHero } from '../components/BrandHero';
import { Icon, IconName } from '../components/Icon';
import { SupplierLogoBadge } from '../components/SupplierLogoBadge';
import { useSupplierLogos } from '../api/logos';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { UNION_PLATFORMS, UNION_RFA_PLAIN, UNION_SHOWCASE_MARQUES } from '../content/union';
import { colors, spacing } from '../theme';

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'storefront-outline',
    title: 'Vous restez indépendant',
    body: 'Votre enseigne, vos clients, vos prix. Union n’est pas une franchise : chaque adhérent reste patron chez lui.',
  },
  {
    icon: 'cart-outline',
    title: 'Vous achetez sur le réseau',
    body: 'Vos commandes passent par ACR, DCA, EXADIS et ALLIANCE. Ces achats constituent votre chiffre d’affaires groupement.',
  },
  {
    icon: 'analytics-outline',
    title: 'Union suit et calcule',
    body: 'Contrats, paliers et RFA sont portés par le groupement. Chaque adhérent retrouve ses chiffres dans son espace membre, en temps réel.',
  },
  {
    icon: 'gift-outline',
    title: 'La RFA tombe en fin d’année',
    body: UNION_RFA_PLAIN + ' Plus le collectif achète, mieux chacun est rémunéré.',
  },
];

export function VitrineNetworkScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { logos } = useSupplierLogos();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHero source={require('../../assets/vitrine/seminaire.jpeg')}>
        <View style={{ paddingTop: Math.max(insets.top, 16) + 10 }}>
          <Text style={styles.title}>
            Indépendants,{'\n'}
            <Text style={styles.titleAccent}>unis par l’achat.</Text>
          </Text>
          <Text style={styles.lead}>
            Des distributeurs de pièces auto partout en France. Chacun maître de son commerce, tous
            plus forts au moment d’acheter.
          </Text>
        </View>
      </BrandHero>

      <Text style={styles.section}>Comment ça marche</Text>
      <View style={styles.timeline}>
        {STEPS.map((item, i) => (
          <View key={item.title} style={styles.stepRow}>
            <View style={styles.stepRail}>
              <View style={styles.stepBadge}>
                <Icon name={item.icon} size={19} color={colors.orange} />
              </View>
              {i < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
            </View>
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>{item.title}</Text>
              <Text style={styles.stepBody}>{item.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Les plateformes</Text>
      <View style={styles.platformRow}>
        {UNION_PLATFORMS.map((p) => (
          <View key={p.key} style={styles.platformTile}>
            <SupplierLogoBadge platformKey={p.key} logos={logos} size={44} />
            <Text style={styles.platformName}>{p.name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Le réseau en vrai</Text>
      <Text style={styles.sectionHint}>
        Séminaires, conventions, moments d’équipe : un groupement, ce sont d’abord des gens qui se
        connaissent.
      </Text>
      <View style={styles.photoBlock}>
        <Image
          source={require('../../assets/vitrine/equipe.jpeg')}
          style={styles.photoLarge}
          resizeMode="cover"
        />
        <View style={styles.photoRow}>
          <Image
            source={require('../../assets/vitrine/seminaire.jpeg')}
            style={styles.photoSmall}
            resizeMode="cover"
          />
          <Image
            source={require('../../assets/vitrine/convention.jpeg')}
            style={styles.photoSmall}
            resizeMode="cover"
          />
        </View>
      </View>

      <Text style={styles.section}>Marques du réseau</Text>
      <Text style={styles.sectionHint}>
        Un extrait des enseignes référencées — les gammes complètes sont côté membres.
      </Text>
      <View style={styles.brandGrid}>
        {UNION_SHOWCASE_MARQUES.map((name) => {
          const src = getMarqueLogoSource(name);
          if (!src) return null;
          return (
            <View key={name} style={styles.brandTile}>
              <Image source={src} style={styles.brandLogo} resizeMode="contain" />
            </View>
          );
        })}
      </View>

      <Pressable
        style={styles.cta}
        onPress={() => navigation.navigate('Rejoindre')}
        accessibilityRole="button"
        accessibilityLabel="Rejoindre le réseau"
      >
        <Text style={styles.ctaText}>Rejoindre le réseau</Text>
        <Icon name="arrow-forward" size={16} color={colors.white} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xl, gap: 12 },

  title: {
    color: colors.white,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 42,
    letterSpacing: -0.6,
  },
  titleAccent: { color: colors.orange },
  lead: { color: 'rgba(248,250,252,0.88)', fontSize: 16, lineHeight: 24, marginTop: 12 },

  section: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    marginTop: 10,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    marginTop: -6,
  },

  timeline: { paddingHorizontal: spacing.lg, gap: 0 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 40 },
  stepBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.orangeMuted,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.cardBorder, marginVertical: 4 },
  stepCard: { flex: 1, paddingBottom: 18 },
  stepTitle: { color: colors.white, fontWeight: '800', fontSize: 16, marginTop: 8 },
  stepBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },

  platformRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg },
  platformTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  platformName: { color: colors.white, fontWeight: '800', fontSize: 12 },

  photoBlock: { paddingHorizontal: spacing.lg, gap: 8 },
  photoLarge: { width: '100%', height: 190, borderRadius: 16 },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoSmall: { flex: 1, height: 110, borderRadius: 14 },

  brandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.lg },
  brandTile: {
    width: '22%',
    flexGrow: 1,
    maxWidth: '24%',
    aspectRatio: 1.5,
    backgroundColor: colors.white,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  brandLogo: { width: '88%', height: '88%' },

  cta: {
    marginHorizontal: spacing.lg,
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
