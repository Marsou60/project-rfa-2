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
  polishClientNote,
  uploadClientDocument,
} from '../api/fiches';
import { Icon } from './Icon';
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
  const [polishing, setPolishing] = useState(false);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [claudeText, setClaudeText] = useState<string | null>(null);
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
    setDraft('');
    setRawDraft(null);
    setClaudeText(null);
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
      const created = await addClientNote(codeUnion, text, claudeText);
      setNotes((prev) => [created, ...prev]);
      setDraft('');
      setRawDraft(null);
      setClaudeText(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Note non enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const improve = async () => {
    const text = draft.trim();
    if (!text || polishing) return;
    setPolishing(true);
    setError(null);
    try {
      const improved = await polishClientNote(text);
      setRawDraft((prev) => prev ?? text);
      setClaudeText(improved);
      setDraft(improved);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Claude n’a pas pu réécrire la note.');
    } finally {
      setPolishing(false);
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
        placeholder="Ce qui s'est dit au magasin, même en vrac."
        placeholderTextColor="#C8BBA4"
        multiline
        style={styles.input}
        accessibilityLabel="Note de visite"
      />
      <Pressable
        style={[styles.claude, (polishing || saving || !draft.trim()) && styles.disabled]}
        onPress={improve}
        disabled={polishing || saving || !draft.trim()}
        accessibilityRole="button"
        accessibilityLabel="Améliorer la note avec Claude"
        accessibilityState={{ disabled: polishing || saving || !draft.trim(), busy: polishing }}
      >
        {polishing ? <ActivityIndicator color="#1A140C" /> : <Icon name="sparkles" size={16} color="#1A140C" />}
        <Text style={styles.claudeText}>{polishing ? 'Claude réécrit…' : 'Améliorer avec Claude'}</Text>
      </Pressable>
      <Pressable
        style={[styles.save, (saving || polishing || !draft.trim()) && styles.disabled]}
        onPress={save}
        disabled={saving || polishing || !draft.trim()}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer la note'}</Text>
      </Pressable>
      {rawDraft != null ? (
        <Pressable
          onPress={() => {
            setDraft(rawDraft);
            setRawDraft(null);
            setClaudeText(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Revenir à mon texte"
        >
          <Text style={styles.undo}>Revenir à mon texte</Text>
        </Pressable>
      ) : null}
      {notes.map((note) => (
        <View key={note.id} style={[styles.note, note.note_ia ? styles.noteClaude : null]}>
          <View style={styles.noteHead}>
            <Text style={styles.noteAuthor}>{note.auteur || 'Union'}</Text>
            <Text style={styles.meta}>{whenLabel(note.created_at)}</Text>
          </View>
          <Text style={styles.noteBody}>{note.note_simple}</Text>
          {note.note_ia ? (
            <View style={styles.claudeMark}>
              <Icon name="sparkles" size={13} color="#F6C453" />
              <Text style={styles.claudeMarkText}>Relue par Claude</Text>
            </View>
          ) : null}
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
    minHeight: 104,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
    color: colors.white,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  claude: {
    backgroundColor: '#F6C453',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  claudeText: { color: '#1A140C', fontWeight: '800', fontSize: 15 },
  save: { backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  undo: { color: '#F6C453', fontWeight: '700', textDecorationLine: 'underline' },
  note: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  noteClaude: { backgroundColor: '#2A2112', borderColor: '#6B5428' },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  noteAuthor: { color: colors.white, fontWeight: '800', fontSize: 14, flexShrink: 1 },
  noteBody: { color: colors.text, fontSize: 15, lineHeight: 22 },
  claudeMark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  claudeMarkText: { color: '#F6C453', fontSize: 12, fontWeight: '800' },
});
