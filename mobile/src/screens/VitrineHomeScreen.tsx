import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHero } from '../components/BrandHero';
import { Icon } from '../components/Icon';
import { SupplierLogoBadge } from '../components/SupplierLogoBadge';
import { useSupplierLogos } from '../api/logos';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { UNION_PLATFORMS, UNION_RFA_PLAIN, UNION_SHOWCASE_MARQUES } from '../content/union';
import { colors, spacing } from '../theme';

const WHY_CARDS: Array<{ icon: React.ComponentProps<typeof Icon>['name']; title: string; body: string }> = [
  {
    icon: 'cart-outline',
    title: 'Acheter plus fort',
    body: 'Le volume du réseau pèse dans chaque négociation. Vous achetez aux conditions d’un grand groupe, en restant patron chez vous.',
  },
  {
    icon: 'document-text-outline',
    title: 'Des contrats déjà négociés',
    body: 'Union porte les contrats fournisseurs et les paliers. Vous n’avez rien à renégocier : vous achetez, le contrat travaille pour vous.',
  },
  {
    icon: 'trending-up-outline',
    title: 'La RFA en fin d’année',
    body: 'Vos achats deviennent une rémunération. Vous suivez paliers et projection dans l’espace membre.',
  },
];

function WeightBar() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, {
        toValue: 1,
        duration: 720,
        delay: 160,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      alive = false;
    };
  }, [progress]);

  return (
    <View style={styles.weightTrack} accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.weightFill,
          {
            width: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['8%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

export function VitrineHomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { logos } = useSupplierLogos();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHero source={require('../../assets/vitrine/equipe.jpeg')}>
        <View style={{ paddingTop: Math.max(insets.top, 16) + 10 }}>
          <View style={styles.logoCard}>
            <Image
              source={require('../../assets/vitrine/logo-union-cropped.png')}
              style={styles.logoWide}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.tagline}>
            Seul on achète.{'\n'}
            <Text style={styles.taglineAccent}>Ensemble, on pèse.</Text>
          </Text>
          <WeightBar />
          <Text style={styles.lead}>
            Distributeurs indépendants de pièces auto. Volume collectif, contrats négociés, RFA
            reversée chaque année.
          </Text>
          <Pressable
            style={styles.ctaPrimary}
            onPress={() => navigation.navigate('Rejoindre')}
            accessibilityRole="button"
            accessibilityLabel="Nous rejoindre"
          >
            <Text style={styles.ctaPrimaryText}>Nous rejoindre</Text>
            <Icon name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
          <Pressable
            style={styles.ctaGhost}
            onPress={() => navigation.navigate('Connexion')}
            accessibilityRole="button"
            accessibilityLabel="Espace membre"
          >
            <Text style={styles.ctaGhostText}>Déjà membre — espace</Text>
          </Pressable>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statBig}>4</Text>
              <Text style={styles.statSmall}>plateformes</Text>
            </View>
            <View style={styles.statRule} />
            <View style={styles.stat}>
              <Text style={styles.statBig}>100 %</Text>
              <Text style={styles.statSmall}>indépendants</Text>
            </View>
          </View>
        </View>
      </BrandHero>

      <View style={styles.rfaExplain}>
        <Text style={styles.rfaExplainTitle}>C’est quoi, la RFA ?</Text>
        <Text style={styles.rfaExplainBody}>{UNION_RFA_PLAIN}</Text>
      </View>

      {/* ── PLATEFORMES ── */}
      <Text style={styles.section}>Quatre plateformes d’achat</Text>
      <Text style={styles.sectionHint}>
        Chaque commande passée ici construit votre RFA de fin d’année.
      </Text>
      <View style={styles.platformGrid}>
        {UNION_PLATFORMS.map((p) => (
          <View key={p.key} style={styles.platformTile}>
            <SupplierLogoBadge platformKey={p.key} logos={logos} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.platformName}>{p.name}</Text>
              <Text style={styles.platformRole}>{p.role}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── POURQUOI ── */}
      <Text style={styles.section}>Pourquoi nous rejoindre</Text>
      {WHY_CARDS.map((item) => (
        <View key={item.title} style={styles.whyCard}>
          <View style={styles.whyIcon}>
            <Icon name={item.icon} size={22} color={colors.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.whyTitle}>{item.title}</Text>
            <Text style={styles.whyBody}>{item.body}</Text>
          </View>
        </View>
      ))}

      {/* ── MARQUES ── */}
      <Text style={styles.section}>Ils sont dans nos rayons</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.brandStrip}
      >
        {UNION_SHOWCASE_MARQUES.map((name) => {
          const src = getMarqueLogoSource(name);
          if (!src) return null;
          return (
            <View key={name} style={styles.brandChip}>
              <Image source={src} style={styles.brandLogo} resizeMode="contain" />
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate('Reseau')}
        accessibilityRole="button"
        accessibilityLabel="Découvrir le réseau"
      >
        <Text style={styles.linkText}>Découvrir le réseau</Text>
        <Icon name="arrow-forward" size={16} color={colors.orange} />
      </Pressable>

      {/* ── CTA FINAL ── */}
      <LinearGradient
        colors={[colors.orange, colors.orangeDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.finalCta}
      >
        <Text style={styles.finalTitle}>Et si votre magasin pesait plus lourd ?</Text>
        <Text style={styles.finalBody}>
          Adhérent ou partenaire, on vous répond rapidement et sans engagement.
        </Text>
        <Pressable
          style={styles.finalButton}
          onPress={() => navigation.navigate('Rejoindre')}
          accessibilityRole="button"
          accessibilityLabel="Contactez-nous"
        >
          <Text style={styles.finalButtonText}>Contactez-nous</Text>
          <Icon name="arrow-forward" size={16} color={colors.orangeDeep} />
        </Pressable>
      </LinearGradient>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xl, gap: 12 },

  logoCard: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 18,
  },
  logoWide: { width: 168, height: 36 },
  tagline: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  taglineAccent: { color: colors.orange },
  weightTrack: {
    height: 4,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    marginTop: 16,
    overflow: 'hidden',
  },
  weightFill: {
    height: 4,
    backgroundColor: colors.orange,
    borderRadius: 999,
  },
  lead: { color: 'rgba(248,250,252,0.88)', fontSize: 16, lineHeight: 24, marginTop: 14, marginBottom: 18 },
  ctaPrimary: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: { color: colors.white, fontWeight: '800', fontSize: 17 },
  ctaGhost: {
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 44,
  },
  ctaGhostText: { color: colors.orangeSoft, fontWeight: '700', fontSize: 16 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 16,
  },
  stat: { flex: 1 },
  statRule: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.28)', marginHorizontal: 16 },
  statBig: { color: colors.white, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  statSmall: { color: 'rgba(248,250,252,0.8)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  rfaExplain: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.orange,
    borderRadius: 20,
    padding: spacing.lg,
    gap: 8,
  },
  rfaExplainTitle: { color: colors.white, fontWeight: '800', fontSize: 22, lineHeight: 26 },
  rfaExplainBody: { color: 'rgba(255,255,255,0.95)', fontSize: 15, lineHeight: 22 },

  section: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    marginTop: 14,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    marginTop: -6,
  },

  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: spacing.lg,
  },
  platformTile: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  platformName: { color: colors.white, fontWeight: '800', fontSize: 16 },
  platformRole: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },

  whyCard: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  whyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.orangeMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whyTitle: { color: colors.white, fontWeight: '800', fontSize: 16 },
  whyBody: { color: colors.muted, fontSize: 13.5, lineHeight: 20, marginTop: 4 },

  brandStrip: { gap: 8, paddingHorizontal: spacing.lg },
  brandChip: {
    width: 92,
    height: 56,
    backgroundColor: colors.white,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  brandLogo: { width: '90%', height: '90%' },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    minHeight: 44,
  },
  linkText: { color: colors.orange, fontWeight: '700', fontSize: 15 },

  finalCta: {
    marginHorizontal: spacing.lg,
    borderRadius: 20,
    padding: spacing.lg,
    gap: 8,
  },
  finalTitle: { color: colors.white, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  finalBody: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  finalButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  finalButtonText: { color: colors.orangeDeep, fontWeight: '800', fontSize: 15 },
});
