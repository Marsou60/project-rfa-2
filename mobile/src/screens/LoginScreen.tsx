import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        'Connexion impossible';
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Image source={require('../../assets/union-mark.png')} style={styles.logo} />
        <Text style={styles.brand}>GROUPEMENT UNION</Text>
        <Text style={styles.title}>RFA Mobile</Text>
        <Text style={styles.subtitle}>Consultation — membre Union ou adhérent</Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Identifiant"
          placeholderTextColor={colors.muted2}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Mot de passe"
          placeholderTextColor={colors.muted2}
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy || !username || !password}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Se connecter</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 12,
  },
  logo: { width: 72, height: 72, alignSelf: 'center', marginBottom: 4, borderRadius: 16 },
  brand: {
    color: colors.orangeSoft,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 12,
    textAlign: 'center',
  },
  title: { color: colors.white, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 16,
  },
  error: { color: colors.red, fontSize: 13 },
  button: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
