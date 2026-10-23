import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  ClientFiche,
  ClientNote,
  addClientNote,
  getClientFiche,
  getClientNotes,
  uploadClientDocument,
} from '../api/fiches';
import { colors, spacing } from '../theme';

const DOCS = [
  { kind: 'rib', label: 'RIB', missing: 'RIB' },
  { kind: 'kbis', label: 'Kbis', missing: 'Kbis' },
  { kind: 'piece_identite', label: "Pièce d'identité", missing: "Pièce d'identité" },
];

type Picked = { uri?: string; name: string; type: string; file?: Blob };

async function pickFile(): Promise<Picked | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf,application/pdf';
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, type: file.type || 'application/octet-stream', file } : null);
      };
      input.click();
    });
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || 'document',
    type: asset.mimeType || 'application/octet-stream',
  };
}

function whenLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ClientFichePanel({ codeUnion }: { codeUnion: string }) {
  const [fiche, setFiche] = useState<ClientFiche | null>(null);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, journal] = await Promise.all([getClientFiche(codeUnion), getClientNotes(codeUnion)]);
      setFiche(next);
      setNotes(journal);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Fiche indisponible.');
    } finally {
      setLoading(false);
    }
  }, [codeUnion]);

  useEffect(() => {
    setFiche(null);
    setNotes([]);
    load();
  }, [load]);

  const address = [fiche?.adresse, fiche?.code_postal, fiche?.ville].filter(Boolean).join(', ');
  const missing = fiche?.missing_docs || [];

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const created = await addClientNote(codeUnion, text);
      setNotes((prev) => [created, ...prev]);
      setDraft('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Note non enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const send = async (kind: string) => {
    const picked = await pickFile();
    if (!picked) return;
    setUploading(kind);
    setError(null);
    try {
      const next = await uploadClientDocument(codeUnion, kind, picked);
      if (next) setFiche(next);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Document non déposé.');
    } finally {
      setUploading('');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.section}>Fiche magasin</Text>
      {loading ? <ActivityIndicator color={colors.orange} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {fiche ? (
        <>
          <Text style={styles.name}>{fiche.nom_client}</Text>
          {fiche.groupe ? <Text style={styles.meta}>{fiche.groupe} · {fiche.agent_union || 'Agent non renseigné'}</Text> : null}
          {address ? (
            <Pressable
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)}
              accessibilityRole="link"
              accessibilityLabel="Ouvrir l'adresse"
            >
              <Text style={styles.link}>{address}</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>Adresse non renseignée.</Text>
          )}
          {fiche.telephone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${fiche.telephone}`)} accessibilityRole="link">
              <Text style={styles.link}>Appeler {fiche.contact_magasin || fiche.telephone}</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>{fiche.contact_magasin || 'Pas de téléphone.'}</Text>
          )}
          <View style={styles.docRow}>
            {DOCS.map((doc) => {
              const ok = !missing.includes(doc.missing);
              return (
                <Pressable
                  key={doc.kind}
                  style={[styles.docBtn, ok ? styles.docOk : styles.docMissing]}
                  onPress={() => send(doc.kind)}
                  disabled={Boolean(uploading)}
                  accessibilityRole="button"
                  accessibilityLabel={ok ? `${doc.label} présent, remplacer` : `Déposer ${doc.label}`}
                >
                  <Text style={styles.docText}>
                    {uploading === doc.kind ? 'Envoi…' : ok ? `${doc.label} OK` : `+ ${doc.label}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : !loading ? (
        <Text style={styles.meta}>Aucune fiche Nathalie pour ce code. Vous pouvez quand même noter.</Text>
      ) : null}

      <Text style={styles.section}>Notes</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Note de visite…"
        placeholderTextColor={colors.muted2}
        multiline
        style={styles.input}
      />
      <Pressable style={styles.save} onPress={save} disabled={saving || !draft.trim()} accessibilityRole="button">
        <Text style={styles.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer la note'}</Text>
      </Pressable>
      {notes.map((note) => (
        <View key={note.id} style={styles.note}>
          <Text style={styles.meta}>{[note.auteur, whenLabel(note.created_at)].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.noteBody}>{note.note_simple}</Text>
        </View>
      ))}
      {!loading && notes.length === 0 ? <Text style={styles.meta}>Aucune note pour l’instant.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  section: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 4 },
  name: { color: colors.white, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13 },
  link: { color: colors.orangeSoft, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  error: { color: colors.red },
  docRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  docOk: { borderColor: colors.green },
  docMissing: { borderColor: colors.red, backgroundColor: 'rgba(248,113,113,0.12)' },
  docText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  input: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
    color: colors.white,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  save: { backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '800' },
  note: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 4,
  },
  noteBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
