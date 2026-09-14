import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHero } from '../components/BrandHero';
import { Icon } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';

function mapLoginError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes('401') ||
    s.includes('403') ||
    s.includes('credential') ||
    s.includes('incorrect') ||
    s.includes('invalid') ||
    s.includes('unauthorized') ||
    s.includes('mot de passe') ||
    s.includes('identifiant')
  ) {
    return 'Identifiant ou mot de passe incorrect.';
  }
  if (
    s.includes('network') ||
    s.includes('timeout') ||
    s.includes('econnrefused') ||
    s.includes('failed to connect') ||
    s.includes('network error')
  ) {
    return 'Réseau indisponible. Vérifiez votre connexion et réessayez.';
  }
  return 'Connexion impossible pour le moment. Réessayez, ou écrivez à Union si ça persiste.';
}

export function LoginScreen() {
  const { login } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e: unknown) {
      const raw =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        '';
      setError(mapLoginError(String(raw)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <BrandHero source={require('../../assets/vitrine/equipe.jpeg')} style={styles.hero}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={[styles.back, { marginTop: Math.max(insets.top, 12) }]}
            hitSlop={8}
          >
            <Icon name="chevron-back" size={26} color={colors.white} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/vitrine/logo-union-cropped.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="Groupement Union"
            />
          </View>
          <Text style={styles.title}>Vos chiffres,{'\n'}au magasin.</Text>
        </BrandHero>

        <View style={styles.form}>
          <Text style={styles.subtitle}>
            Achats et Remise de Fin d’Année. Identifiants fournis par Union — pas d’inscription ici.
          </Text>
          {Platform.OS === 'web' ? (
            <Text style={styles.pwaHint}>
              Sur iPhone : ouvrir dans Safari, puis Partager → « Sur l’écran d’accueil ».
            </Text>
          ) : null}

          <Text nativeID="login-username-label" style={styles.fieldLabel}>
            Identifiant
          </Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            accessibilityLabel="Identifiant"
            accessibilityLabelledBy="login-username-label"
            placeholder="Votre identifiant Union"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            returnKeyType="next"
          />

          <Text nativeID="login-password-label" style={styles.fieldLabel}>
            Mot de passe
          </Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              accessibilityLabel="Mot de passe"
              accessibilityLabelledBy="login-password-label"
              placeholder="Mot de passe"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              hitSlop={8}
              style={styles.eyeBtn}
            >
              <Icon
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={colors.muted}
              />
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={busy || !username || !password}
            accessibilityRole="button"
            accessibilityLabel="Se connecter"
            accessibilityState={{ disabled: busy || !username || !password, busy }}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('PublicTabs', { screen: 'Rejoindre' })}
            accessibilityRole="button"
            accessibilityLabel="Pas encore membre, nous écrire"
            style={styles.contactHit}
          >
            <Text style={styles.contactLink}>Pas encore membre ? Écrivez-nous</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: spacing.xl },
  hero: { minHeight: 280 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -8,
    minHeight: 44,
    paddingRight: 12,
  },
  backText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  logoWrap: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  logo: { width: 176, height: 32 },
  title: {
    color: colors.white,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
    marginTop: 18,
    letterSpacing: -0.6,
  },
  form: { paddingHorizontal: spacing.lg, gap: 10, marginTop: -8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  pwaHint: { color: colors.orange, fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 8 },
  fieldLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.white,
    fontSize: 16,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.white,
    fontSize: 16,
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 12, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  error: { color: colors.red, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 17 },
  contactHit: { paddingVertical: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  contactLink: { color: colors.orange, textAlign: 'center', fontWeight: '700', fontSize: 15 },
});
