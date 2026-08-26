import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

export function AccountScreen() {
  const { user, isUnion, isAdherent, logout } = useAuth();

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>COMPTE</Text>
      <Text style={styles.title}>{user?.display_name || user?.username || 'Utilisateur'}</Text>
      <Text style={styles.meta}>@{user?.username}</Text>
      <Text style={styles.meta}>
        Profil : {isUnion ? 'Membre Union' : isAdherent ? 'Adhérent' : user?.role || '—'}
      </Text>
      {user?.linked_code_union ? (
        <Text style={styles.meta}>Code Union : {String(user.linked_code_union)}</Text>
      ) : null}
      {user?.linked_groupe ? (
        <Text style={styles.meta}>Groupe : {String(user.linked_groupe)}</Text>
      ) : null}

      <Pressable style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>Déconnexion</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: 8 },
  kicker: { color: colors.orange, fontWeight: '800', letterSpacing: 1, fontSize: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.white },
  meta: { color: colors.muted, fontSize: 15 },
  button: {
    marginTop: 28,
    alignSelf: 'flex-start',
    backgroundColor: colors.orange,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800' },
});
