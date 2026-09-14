import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../components/Icon';
import { openUnionMail, UNION_CONTACT } from '../content/union';
import { colors, spacing } from '../theme';

const ADHERENT_PERKS: Array<{ icon: IconName; text: string }> = [
  { icon: 'pricetags-outline', text: 'Conditions d’achat d’un grand groupe' },
  { icon: 'cash-outline', text: 'RFA reversée sur vos achats réels' },
  { icon: 'shield-checkmark-outline', text: 'Vous restez 100 % indépendant' },
];

const PARTNER_PERKS: Array<{ icon: IconName; text: string }> = [
  { icon: 'people-outline', text: 'Un réseau national de points de vente' },
  { icon: 'document-text-outline', text: 'Un seul contrat pour tout le réseau' },
  { icon: 'trending-up-outline', text: 'Des volumes qui progressent ensemble' },
];

export function VitrineContactScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 18 }]}
    >
      <Text style={styles.title}>
        Parlons de <Text style={styles.titleAccent}>votre</Text> projet.
      </Text>
      <Text style={styles.lead}>
        Adhésion ou partenariat : un mail suffit, l’équipe Union vous répond rapidement et sans
        engagement.
      </Text>

      <Image
        source={require('../../assets/vitrine/convention.jpeg')}
        style={styles.banner}
        resizeMode="cover"
      />

      {/* ── FUTUR ADHÉRENT ── */}
      <LinearGradient
        colors={[colors.orange, colors.orangeDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bigCard}
      >
        <View style={styles.bigHead}>
          <View style={styles.bigIcon}>
            <Icon name="storefront-outline" size={24} color={colors.white} />
          </View>
          <Text style={styles.bigTitle}>Futur adhérent</Text>
        </View>
        <Text style={styles.bigSub}>
          Vous distribuez de la pièce auto et vous voulez acheter plus fort ?
        </Text>
        {ADHERENT_PERKS.map((p) => (
          <View key={p.text} style={styles.perkRow}>
            <Icon name={p.icon} size={16} color="rgba(255,255,255,0.9)" />
            <Text style={styles.perkText}>{p.text}</Text>
          </View>
        ))}
        <Pressable
          style={styles.bigButton}
          onPress={() => openUnionMail('adherent')}
          accessibilityRole="button"
          accessibilityLabel="Écrire pour adhérer"
        >
          <Text style={styles.bigButtonText}>Écrire pour adhérer</Text>
          <Icon name="mail-outline" size={16} color={colors.orangeDeep} />
        </Pressable>
      </LinearGradient>

      {/* ── FUTUR PARTENAIRE ── */}
      <View style={styles.partnerCard}>
        <View style={styles.bigHead}>
          <View style={styles.partnerIcon}>
            <Icon name="briefcase-outline" size={24} color={colors.orange} />
          </View>
          <Text style={styles.bigTitle}>Futur partenaire</Text>
        </View>
        <Text style={styles.partnerSub}>
          Marque, fournisseur ou plateforme : ouvrez votre offre à tout le réseau.
        </Text>
        {PARTNER_PERKS.map((p) => (
          <View key={p.text} style={styles.perkRow}>
            <Icon name={p.icon} size={16} color={colors.orangeSoft} />
            <Text style={styles.partnerPerkText}>{p.text}</Text>
          </View>
        ))}
        <Pressable
          style={styles.partnerButton}
          onPress={() => openUnionMail('partenaire')}
          accessibilityRole="button"
          accessibilityLabel="Écrire pour un partenariat"
        >
          <Text style={styles.partnerButtonText}>Écrire pour un partenariat</Text>
          <Icon name="mail-outline" size={16} color={colors.white} />
        </Pressable>
      </View>

      <Pressable
        style={styles.mailBox}
        onPress={() => Linking.openURL(`mailto:${UNION_CONTACT.email}`)}
      >
        <Icon name="at-outline" size={18} color={colors.muted2} />
        <View>
          <Text style={styles.mailLabel}>Écrire directement</Text>
          <Text style={styles.mailValue}>{UNION_CONTACT.email}</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.member}
        onPress={() => navigation.navigate('Connexion')}
        accessibilityRole="button"
        accessibilityLabel="Déjà membre, se connecter"
      >
        <Text style={styles.memberText}>Déjà membre ? Se connecter</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: 14 },
  title: { color: colors.white, fontSize: 36, fontWeight: '800', lineHeight: 42, letterSpacing: -0.6 },
  titleAccent: { color: colors.orange },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  banner: { width: '100%', height: 210, borderRadius: 20 },

  bigCard: { borderRadius: 20, padding: spacing.lg, gap: 10 },
  bigHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigTitle: { color: colors.white, fontWeight: '800', fontSize: 20 },
  bigSub: { color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 20 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText: { color: 'rgba(255,255,255,0.95)', fontSize: 13.5, fontWeight: '600', flex: 1 },
  bigButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bigButtonText: { color: colors.orangeDeep, fontWeight: '800', fontSize: 15 },

  partnerCard: {
    borderRadius: 20,
    padding: spacing.lg,
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  partnerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.orangeMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerSub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  partnerPerkText: { color: colors.text, fontSize: 13.5, fontWeight: '600', flex: 1 },
  partnerButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  partnerButtonText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  mailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  mailLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  mailValue: { color: colors.white, fontSize: 15, fontWeight: '700', marginTop: 2 },
  member: { alignItems: 'center', paddingVertical: 14, minHeight: 44, justifyContent: 'center' },
  memberText: { color: colors.orange, fontWeight: '700', fontSize: 15 },
});
