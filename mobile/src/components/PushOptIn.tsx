import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getPushPublicKey, savePushSubscription } from '../api/push';
import { colors, spacing } from '../theme';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushOptIn() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setMessage('Les notifications se règlent dans le navigateur, ou sur l’écran d’accueil iPhone (iOS 16.4).');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const publicKey = await getPushPublicKey();
      if (!publicKey) {
        setMessage('Le serveur n’a pas encore de clé VAPID. Rien n’est envoyé.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Permission refusée. Aucune notification ne partira.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await savePushSubscription(subscription.toJSON());
      setMessage('Ce téléphone est enregistré. Aucune notification n’a été envoyée.');
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMessage(detail || 'Enregistrement impossible. La migration push n’est peut-être pas appliquée.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.body}>
        Sur Android (Chrome) et sur iPhone si l’app est sur l’écran d’accueil (iOS 16.4 ou plus).
        Vous ne recevez que votre portefeuille, sauf la direction.
      </Text>
      <Pressable
        onPress={enable}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Activer les notifications"
        style={styles.button}
      >
        <Text style={styles.buttonText}>{busy ? 'Patientez…' : 'Activer sur cet appareil'}</Text>
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
    marginTop: 12,
  },
  title: { color: colors.white, fontWeight: '800', fontSize: 16 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '800' },
  message: { color: colors.white, fontSize: 13, lineHeight: 18 },
});
