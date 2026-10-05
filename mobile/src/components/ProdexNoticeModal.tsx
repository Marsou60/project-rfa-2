import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getPlatformLogoSource } from '../assets/platformLogos';
import { colors, spacing } from '../theme';

type ModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProdexNoticeModal({ visible, onClose }: ModalProps) {
  const logo = getPlatformLogoSource('EXADIS');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer le communiqué">
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.inner} bounces={false}>
            <View style={styles.hero}>
              {logo ? (
                <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="EXADIS" />
              ) : (
                <Text style={styles.fallback}>EXADIS</Text>
              )}
              <Text style={styles.title}>Rappel du communiqué du 2 septembre 2026</Text>
              <Text style={styles.brand}>PRODEX</Text>
            </View>
            <Text style={styles.body}>
              Le Groupement Union déplore la décision unilatérale d’EXADIS de ne pas rémunérer le chiffre d’affaires réalisé sur la marque PRODEX.
            </Text>
            <Text style={styles.body}>
              Cette décision, prise indépendamment de notre volonté, nous contraint de déduire le chiffre d’affaires PRODEX du calcul de la RFA finale.
            </Text>
            <Text style={styles.body}>
              Nous regrettons les conséquences de cette mesure pour nos adhérents et restons à votre disposition pour tout complément d’information.
            </Text>
            <Pressable
              style={styles.button}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="J’ai compris"
            >
              <Text style={styles.buttonText}>J’ai compris</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProdexFicheNote({ onOpen }: { onOpen: () => void }) {
  return (
    <Text style={styles.note}>
      <Text style={styles.noteBold}>
        Cette décision, prise indépendamment de notre volonté, nous contraint de déduire le chiffre d’affaires PRODEX du calcul de la RFA finale.
      </Text>
      {' '}
      <Text
        style={styles.link}
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel="voir le communiqué"
      >
        voir le communiqué
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 18,
    maxHeight: '88%',
  },
  inner: { padding: spacing.lg, gap: 12 },
  hero: { alignItems: 'center', gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  logo: { height: 64, width: 220 },
  fallback: { color: '#0F172A', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#0F172A', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  brand: { color: '#020617', fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  body: { color: '#334155', fontSize: 14, lineHeight: 21 },
  button: {
    marginTop: 4,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  note: { color: colors.white, fontSize: 12, lineHeight: 17, marginTop: 4 },
  noteBold: { fontWeight: '800', color: colors.white },
  link: { color: '#A5B4FC', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
});
