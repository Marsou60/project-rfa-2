import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { ClientDetailScreen } from './ClientDetailScreen';
import { colors, spacing } from '../theme';

type Params = {
  RFA: { initialTab?: 'rfa' | 'marques' | 'familles' | 'contrat' } | undefined;
};

export function AdherentRfaScreen() {
  const { user } = useAuth();
  const route = useRoute<RouteProp<Params, 'RFA'>>();
  const code = user?.linked_code_union || null;
  const groupe = user?.linked_groupe || null;

  if (!code && !groupe) {
    return (
      <View style={styles.empty}>
        <Text style={styles.title}>Détail</Text>
        <Text style={styles.muted}>Aucun client lié à ce compte.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ClientDetailScreen
        codeUnion={code}
        groupeClient={code ? null : groupe}
        label={user?.display_name || code || groupe || undefined}
        initialTab={route.params?.initialTab || 'rfa'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, marginBottom: 8 },
  muted: { color: colors.muted },
});
