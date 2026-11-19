import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClientRfaResponse, getClientRfa } from '../api/consultation';
import { ClientNote, getClientNotes } from '../api/fiches';
import { demoDetail } from '../map/demoData';
import { mapDemoEnabled } from '../map/demoMode';
import { RfaSummary, summarizeRfa } from '../map/summarizeRfa';
import { MapPoint, MapUnlocated, REASON_LABEL } from '../map/types';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';
import { Icon } from './Icon';

type Props = {
  point?: MapPoint | null;
  missing?: MapUnlocated | null;
  onClose: () => void;
  onOpenFiche?: () => void;
};

function whenLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function MapDetailSheet({ point, missing, onClose, onOpenFiche }: Props) {
  const code = point?.code_union || missing?.code_union || '';
  const nom = point?.nom || missing?.nom || code;
  const ville = point?.ville || missing?.ville || null;
  const [rfa, setRfa] = useState<ClientRfaResponse | null>(null);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return undefined;
    let cancel = false;
    setLoading(true);
    setError(null);
    if (mapDemoEnabled) {
      const detail = demoDetail(code);
      setRfa(detail?.rfa || null);
      setNotes(detail?.notes || []);
      setLoading(false);
      return undefined;
    }
    Promise.all([
      getClientRfa({ codeUnion: code }),
      getClientNotes(code).catch(() => [] as ClientNote[]),
    ])
      .then(([nextRfa, nextNotes]) => {
        if (cancel) return;
        setRfa(nextRfa);
        setNotes(nextNotes.slice(0, 3));
      })
      .catch((err: { response?: { data?: { detail?: string } }; message?: string }) => {
        if (cancel) return;
        setRfa(null);
        setNotes([]);
        setError(err?.response?.data?.detail || err?.message || 'Fiche indisponible.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [code]);

  const summary: RfaSummary | null = summarizeRfa(rfa);

  return (
    <View style={styles.sheet} accessibilityRole="summary" accessibilityLabel={`Fiche ${nom}`}>
      <View style={styles.head}>
        <View style={styles.grab} />
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>{nom}</Text>
            <Text style={styles.city}>{ville || 'Ville non renseignée'} · {code}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer la fiche" hitSlop={8}>
            <Icon name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        {missing ? (
          <Text style={styles.warn}>
            Pas placé sur la carte : {REASON_LABEL[missing.reason]}. Le point n’est pas mis au hasard.
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={colors.orange} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {summary ? (
          <>
            <View style={styles.figures}>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>CA 2026</Text>
                <Text style={styles.figureValue}>{fmtEuro(summary.ca)}</Text>
              </View>
              <View style={styles.figure}>
                <Text style={styles.figureLabel}>RFA</Text>
                <Text style={styles.figureValue}>{fmtEuro(summary.rfa)}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {summary.contract || 'Contrat'}{summary.level ? ` · ${String(summary.level).toUpperCase()}` : ''}
            </Text>

            <View style={[styles.obj, summary.done && styles.objDone]}>
              <Text style={styles.objTitle}>{summary.objectiveTitle}</Text>
              <Text style={styles.objBody}>{summary.objectiveBody}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.min(Math.max(summary.progress, 0), 100)}%`,
                      backgroundColor: summary.done ? colors.green : '#FBBF24',
                    },
                  ]}
                />
              </View>
            </View>

            {summary.lines.map((line) => (
              <View key={line.key} style={styles.line}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineLabel}>{line.label}</Text>
                  <Text style={styles.lineRate}>{line.rateLabel}</Text>
                </View>
                <Text style={styles.lineDetail}>{fmtEuro(line.ca)} · {line.detail}</Text>
              </View>
            ))}
          </>
        ) : !loading && !error ? (
          <Text style={styles.meta}>Pas encore de chiffres RFA pour ce code.</Text>
        ) : null}

        <Text style={styles.section}>Notes des commerciaux</Text>
        {notes.length === 0 && !loading ? <Text style={styles.meta}>Aucune note pour l’instant.</Text> : null}
        {notes.slice(0, 3).map((item) => (
          <View key={item.id} style={styles.note}>
            <View style={styles.noteHead}>
              <Text style={styles.noteAuthor}>{item.auteur || 'Union'}</Text>
              <Text style={styles.meta}>{whenLabel(item.created_at)}</Text>
            </View>
            <Text style={styles.noteBody}>{item.note_simple}</Text>
            {item.note_ia ? <Text style={styles.noteIa}>Version relue : {item.note_ia}</Text> : null}
          </View>
        ))}

        {onOpenFiche ? (
          <Pressable style={styles.open} onPress={onOpenFiche} accessibilityRole="button" accessibilityLabel="Ouvrir la fiche complète">
            <Text style={styles.openText}>Ouvrir la fiche complète</Text>
            <Icon name="chevron-forward" size={16} color={colors.bg} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '92%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 12,
  },
  head: { paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 8, gap: 4 },
  grab: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorder,
    marginBottom: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { color: colors.white, fontSize: 20, fontWeight: '800' },
  city: { color: colors.muted, fontSize: 14, marginTop: 2 },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 18 },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: 8 },
  figures: { flexDirection: 'row', gap: 8 },
  figure: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  figureLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  figureValue: { color: colors.white, fontSize: 18, fontWeight: '800', marginTop: 2 },
  meta: { color: colors.muted, fontSize: 13 },
  obj: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  objDone: { backgroundColor: 'rgba(52, 211, 153, 0.12)' },
  objTitle: { color: colors.white, fontWeight: '800' },
  objBody: { color: colors.text, fontSize: 13, lineHeight: 18 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardBorder, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4 },
  line: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  lineTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  lineLabel: { color: colors.white, fontWeight: '800' },
  lineRate: { color: colors.orangeSoft, fontWeight: '800' },
  lineDetail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  section: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 6 },
  note: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  noteAuthor: { color: colors.white, fontWeight: '800', fontSize: 13 },
  noteBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
  noteIa: { color: '#F6C453', fontSize: 13, lineHeight: 18 },
  error: { color: colors.red },
  open: {
    marginTop: 6,
    backgroundColor: colors.orange,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  openText: { color: colors.bg, fontWeight: '800' },
});
