import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { BrandHero } from '../components/BrandHero';
import { UNION_CONTACT } from '../content/union';
import { colors, spacing } from '../theme';

export function AccountScreen() {
  const { user, isUnion, isAdherent, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const name = user?.display_name || user?.username || 'Membre Union';
  const roleLabel = isUnion ? 'Membre Union' : isAdherent ? 'Adhérent' : user?.role || '—';

  const confirmLogout = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Vous pourrez revenir avec vos identifiants Union.',
      [
        { text: 'Rester connecté', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
      ],
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BrandHero source={require('../../assets/vitrine/convention.jpeg')}>
        <View style={{ paddingTop: Math.max(insets.top, 12) }}>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/vitrine/logo-union-cropped.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="Groupement Union"
            />
          </View>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.lead}>Lecture seule · chiffres 2026 du groupement</Text>
        </View>
      </BrandHero>

      <View style={styles.body}>
        <View style={styles.card}>
          <Row label="Profil" value={roleLabel} />
          {user?.username ? <Row label="Identifiant" value={`@${user.username}`} /> : null}
          {user?.linked_code_union ? (
            <Row label="Code Union" value={String(user.linked_code_union)} />
          ) : null}
          {user?.linked_groupe ? <Row label="Groupe" value={String(user.linked_groupe)} /> : null}
          <Row label="Secrétariat" value={UNION_CONTACT.email} last />
        </View>

        <Pressable
          style={styles.button}
          onPress={confirmLogout}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Text style={styles.buttonText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xl },
  logoWrap: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 16,
  },
  logo: { width: 148, height: 32 },
  title: { fontSize: 32, fontWeight: '800', color: colors.white, lineHeight: 38, letterSpacing: -0.5 },
  lead: { color: 'rgba(248,250,252,0.85)', fontSize: 15, lineHeight: 22, marginTop: 6 },
  body: { paddingHorizontal: spacing.lg, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 4,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  rowValue: { color: colors.white, fontSize: 16, fontWeight: '700' },
  button: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
