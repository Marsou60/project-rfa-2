import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { HierarchyNode } from '../api/consultation';
import { getMarqueLogoSource } from '../assets/marqueLogos';
import { colors, spacing } from '../theme';
import { fmtDeltaPct, fmtEuro } from '../utils/format';

type Props = {
  nodes: HierarchyNode[];
  emptyLabel?: string;
};

function NodeIcon({ node }: { node: HierarchyNode }) {
  const isMarque = (node.level || '').toLowerCase() === 'marque';
  const src = isMarque ? getMarqueLogoSource(node.label) : null;
  if (src) {
    return (
      <View style={styles.logoWrap}>
        <Image source={src} style={styles.logo} resizeMode="contain" />
      </View>
    );
  }
  const initials = String(node.label || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.logoWrap, styles.logoFallback]}>
      <Text style={styles.logoInitials}>{initials || '?'}</Text>
    </View>
  );
}

function NodeRow({ node, depth }: { node: HierarchyNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const delta = Number(node.delta || 0);

  return (
    <View>
      <Pressable
        style={[styles.row, { paddingLeft: spacing.md + depth * 14 }]}
        onPress={() => hasChildren && setOpen((v) => !v)}
      >
        <NodeIcon node={node} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label} numberOfLines={1}>
            {hasChildren ? (open ? '▼ ' : '▶ ') : ''}
            {node.label}
          </Text>
          <Text style={styles.meta}>
            {node.level ? `${node.level} · ` : ''}
            {node.part_current != null ? `${(Number(node.part_current) * 100).toFixed(1)} % du CA` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.ca}>{fmtEuro(node.ca_current)}</Text>
          <Text style={[styles.delta, delta < 0 ? { color: colors.red } : { color: colors.green }]}>
            {fmtDeltaPct(node.delta_pct)}
          </Text>
        </View>
      </Pressable>
      {open && hasChildren
        ? node.children!.map((child, idx) => (
            <NodeRow key={`${child.label}-${idx}-${depth}`} node={child} depth={depth + 1} />
          ))
        : null}
    </View>
  );
}

export function HierarchyList({ nodes, emptyLabel = 'Aucune donnée' }: Props) {
  if (!nodes?.length) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {nodes.map((node, idx) => (
        <NodeRow key={`${node.label}-${idx}`} node={node} depth={0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: 10,
  },
  logoWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 28, height: 28 },
  logoFallback: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder },
  logoInitials: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  label: { color: colors.white, fontWeight: '700', fontSize: 14 },
  meta: { color: colors.muted2, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  ca: { color: colors.white, fontWeight: '800' },
  delta: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  empty: { color: colors.muted, textAlign: 'center', padding: spacing.lg },
});
