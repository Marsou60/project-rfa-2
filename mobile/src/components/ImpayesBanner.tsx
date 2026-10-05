import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getImpayesByAdherent, ImpayeItem } from '../api/consultation';
import { colors, spacing } from '../theme';
import { fmtEuro } from '../utils/format';

const STATUT_LABEL: Record<string, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours de paiement',
  echeancier: 'Échéancier',
  contentieux: 'Contentieux',
  regularise: 'Régularisé',
  abandonne: 'Abandonné',
};

type Props = {
  codeUnion?: string | null;
};

export function ImpayesBanner({ codeUnion }: Props) {
  const [items, setItems] = useState<ImpayeItem[] | null>(null);
  const [amount, setAmount] = useState(0);
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!codeUnion) {
        setItems(null);
        return;
      }
      let cancel = false;
      getImpayesByAdherent(codeUnion)
        .then((res) => {
          if (cancel) return;
          setItems(res.items || []);
          setAmount(Number(res.summary?.actifs_montant) || 0);
        })
        .catch(() => {
          if (!cancel) setItems(null);
        });
      return () => {
        cancel = true;
      };
    }, [codeUnion]),
  );

  if (!codeUnion || !items) return null;

  const actifs = items.filter((item) => item.actif);
  const worst =
    actifs.find((item) => item.statut === 'contentieux') ||
    actifs.find((item) => item.statut === 'echeancier') ||
    actifs[0] ||
    items[0];
  const alert = actifs.length > 0;
  const tone = !alert ? styles.ok : worst?.statut === 'contentieux' ? styles.danger : styles.warn;

  if (items.length === 0) {
    return (
      <View style={[styles.box, styles.ok]}>
        <Text style={styles.title}>Aucun impayé recensé</Text>
        <Text style={styles.sub}>Pas de dossier ouvert pour cet adhérent.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, tone]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel="Impayés de l’adhérent"
      >
        <Text style={styles.kicker}>Impayés plateformes / partenaires</Text>
        {alert ? (
          <Text style={styles.title}>
            {actifs.length} dossier{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} · {fmtEuro(amount)}
          </Text>
        ) : (
          <Text style={styles.title}>Dossiers clôturés ({items.length}) — plus d’encours</Text>
        )}
        {worst && alert ? (
          <Text style={styles.sub}>
            Dont {worst.plateforme} · {fmtEuro(worst.montant)} · {STATUT_LABEL[worst.statut || ''] || worst.statut}
          </Text>
        ) : null}
        <Text style={styles.more}>{open ? 'Masquer le détail' : 'Voir le détail'}</Text>
      </Pressable>
      {open
        ? items.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {row.plateforme} · {fmtEuro(row.montant)}
              </Text>
              <Text style={styles.sub}>
                {STATUT_LABEL[row.statut || ''] || row.statut}
                {row.date_facture_label ? ` · ${row.date_facture_label}` : ''}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

export function ImpayeListBadge({
  actifsNb,
  amount,
  contentieux,
}: {
  actifsNb?: number;
  amount?: number;
  contentieux?: boolean;
}) {
  if (!actifsNb) return null;
  return (
    <View style={[styles.badge, contentieux && styles.badgeDanger]}>
      <Text style={styles.badgeText}>
        Impayé · {fmtEuro(amount || 0)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    gap: 4,
  },
  ok: { backgroundColor: 'rgba(52, 211, 153, 0.12)', borderColor: 'rgba(52, 211, 153, 0.45)' },
  warn: { backgroundColor: 'rgba(251, 191, 36, 0.12)', borderColor: 'rgba(251, 191, 36, 0.5)' },
  danger: { backgroundColor: 'rgba(248, 113, 113, 0.14)', borderColor: 'rgba(248, 113, 113, 0.55)' },
  kicker: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { color: colors.white, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  more: { color: colors.orangeSoft, fontSize: 12, fontWeight: '700', marginTop: 4 },
  row: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 10,
  },
  rowTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeDanger: { backgroundColor: 'rgba(248, 113, 113, 0.2)' },
  badgeText: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
});
