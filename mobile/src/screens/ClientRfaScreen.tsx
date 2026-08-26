import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { ClientDetailScreen } from './ClientDetailScreen';
import { colors } from '../theme';

type Params = {
  ClientRfa: {
    codeUnion?: string;
    groupeClient?: string;
    label?: string;
    initialTab?: 'rfa' | 'marques' | 'familles' | 'contrat';
  };
};

export function ClientRfaScreen() {
  const route = useRoute<RouteProp<Params, 'ClientRfa'>>();
  const { codeUnion, groupeClient, label, initialTab } = route.params || {};

  return (
    <View style={styles.root}>
      <ClientDetailScreen
        codeUnion={codeUnion}
        groupeClient={groupeClient}
        label={label}
        initialTab={initialTab || 'rfa'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
