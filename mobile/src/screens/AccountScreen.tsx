import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { BrandHero } from '../components/BrandHero';
import { PushOptIn } from '../components/PushOptIn';
import { UNION_CONTACT } from '../content/union';
import { colors, spacing } from '../theme';

export function AccountScreen() {
  const { user, isUnion, isAdherent, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const name = user?.display_name || user?.username || 'Membre Union';
  const roleLabel = isUnion ? 'Membre Union' : isAdherent ? 'Adhérent' : user?.role || '—';
  const [askLogout, setAskLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const stay = () => {
    if (leaving) return;
    setAskLogout(false);
  };

  const runLogout = () => {
    if (leaving) return;
    setLeaving(true);
    // Alert.alert est une fonction vide sur react-native-web : la PWA n'affichait
    // rien et ne déconnectait pas. La confirmation est donc une fenêtre de l'app.
    logout().finally(() => {
      setLeaving(false);
      setAskLogout(false);
    });
  };

  return (
    <View style={styles.root}>
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
      {isUnion ? <PushOptIn /> : null}

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
          onPress={() => setAskLogout(true)}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          testID="logout-button"
        >
          <Text style={styles.buttonText}>Se déconnecter</Text>
        </Pressable>
      </View>
      </ScrollView>

      <Modal visible={askLogout} transparent animationType="fade" onRequestClose={stay}>
        <Pressable style={styles.backdrop} onPress={stay} accessibilityLabel="Rester connecté">
          <Pressable
            style={styles.dialog}
            onPress={() => undefined}
            accessibilityViewIsModal
            accessibilityRole="alert"
            accessibilityLabel="Se déconnecter ?"
          >
            <Text style={styles.dialogTitle}>Se déconnecter ?</Text>
            <Text style={styles.dialogBody}>Vous pourrez revenir avec vos identifiants Union.</Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={styles.stayBtn}
                onPress={stay}
                disabled={leaving}
                accessibilityRole="button"
                accessibilityLabel="Rester connecté"
              >
                <Text style={styles.stayText}>Rester connecté</Text>
              </Pressable>
              <Pressable
                style={[styles.leaveBtn, leaving && styles.leaveBtnBusy]}
                onPress={runLogout}
                disabled={leaving}
                accessibilityRole="button"
                accessibilityLabel="Confirmer la déconnexion"
                testID="logout-confirm"
              >
                <Text style={styles.leaveText}>{leaving ? 'Déconnexion…' : 'Se déconnecter'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
  },
  dialogTitle: { color: colors.white, fontSize: 22, fontWeight: '800' },
  dialogBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  dialogActions: { marginTop: 20, gap: 10 },
  stayBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stayText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  leaveBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  leaveBtnBusy: { opacity: 0.7 },
  leaveText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
});
