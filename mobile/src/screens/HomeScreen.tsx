import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

const NAVY = '#0B1F3A';
const RED = '#C8102E';

export function HomeScreen() {
  const { user, isUnion, isAdherent, logout } = useAuth();

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>{isUnion ? 'Espace Union' : isAdherent ? 'Espace adhérent' : 'Compte'}</Text>
      <Text style={styles.title}>Bonjour{user?.username ? `, ${user.username}` : ''}</Text>
      <Text style={styles.meta}>Rôle : {user?.role || '—'}</Text>
      {isAdherent && user?.linked_code_union ? (
        <Text style={styles.meta}>Code Union : {String(user.linked_code_union)}</Text>
      ) : null}
      <Text style={styles.hint}>
        Prochaine étape : écrans consultation (RFA, fiche client, dashboard lecture). Aucun import /
        export ici.
      </Text>
      <Pressable style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>Déconnexion</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F5F2', padding: 24, justifyContent: 'center', gap: 10 },
  kicker: { color: RED, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '700', color: NAVY },
  meta: { fontSize: 15, color: '#4A5568' },
  hint: { marginTop: 12, fontSize: 14, color: '#4A5568', lineHeight: 20 },
  button: {
    marginTop: 24,
    alignSelf: 'flex-start',
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
