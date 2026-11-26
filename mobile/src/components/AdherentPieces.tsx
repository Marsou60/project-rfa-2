import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { OwnPiece, getMyDocuments, submitMyDocument } from '../api/fiches';
import { colors, spacing } from '../theme';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';

type Picked = { name: string; type: string; file?: Blob; uri?: string };

function pick(capture: boolean): Promise<Picked | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      copyToCacheDirectory: true,
    }).then((result) => {
      if (result.canceled || !result.assets?.[0]) return null;
      const asset = result.assets[0];
      if ((asset.size || 0) > MAX_BYTES) return { name: '', type: 'too-big' };
      return {
        name: asset.name || 'document',
        type: asset.mimeType || 'application/pdf',
        uri: asset.uri,
      };
    });
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        resolve({ name: '', type: 'too-big' });
        return;
      }
      resolve({ name: file.name, type: file.type || 'application/pdf', file });
    };
    input.click();
  });
}

export function AdherentPieces() {
  const [pieces, setPieces] = useState<OwnPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPieces(await getMyDocuments());
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Pièces indisponibles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async (kind: string, capture: boolean) => {
    const picked = await pick(capture);
    if (!picked) return;
    if (picked.type === 'too-big') {
      setError('Fichier trop lourd (8 Mo maximum).');
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      await submitMyDocument(kind, picked);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Envoi impossible.');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Mes pièces</Text>
      <Text style={styles.lead}>RIB, Kbis et pièce d’identité. Union valide avant de les enregistrer.</Text>
      {loading ? <ActivityIndicator color={colors.orange} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pieces.map((piece) => (
        <View key={piece.kind} style={styles.row}>
          <Text style={styles.label}>{piece.label}</Text>
          {!piece.missing ? <Text style={styles.ok}>Présente</Text> : null}
          {piece.missing && piece.status === 'pending' ? (
            <Text style={styles.wait}>En attente de validation</Text>
          ) : null}
          {piece.missing && piece.status === 'refused' ? (
            <Text style={styles.error}>Refusée{piece.reason ? ` : ${piece.reason}` : ''}. Vous pouvez renvoyer.</Text>
          ) : null}
          {piece.missing && piece.status !== 'pending' ? (
            <View style={styles.actions}>
              <Pressable
                style={styles.btn}
                onPress={() => send(piece.kind, true)}
                disabled={Boolean(busy)}
                accessibilityRole="button"
                accessibilityLabel={`Photographier ${piece.label}`}
              >
                <Text style={styles.btnText}>{busy === piece.kind ? 'Envoi…' : 'Photo'}</Text>
              </Pressable>
              <Pressable
                style={styles.btnGhost}
                onPress={() => send(piece.kind, false)}
                disabled={Boolean(busy)}
                accessibilityRole="button"
                accessibilityLabel={`Choisir un fichier pour ${piece.label}`}
              >
                <Text style={styles.btnGhostText}>Fichier</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: 10,
    marginTop: 16,
  },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  lead: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  label: { color: colors.white, fontWeight: '800' },
  ok: { color: colors.green, fontWeight: '700' },
  wait: { color: colors.orangeSoft, fontWeight: '700' },
  error: { color: colors.red, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.white, fontWeight: '800' },
  btnGhost: {
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  btnGhostText: { color: colors.white, fontWeight: '700' },
});
