export type MapPoint = {
  code_union: string;
  nom: string;
  ville: string | null;
  lat: number;
  lng: number;
  ca: number | null;
  plateformes: string[];
  near_tier: boolean;
};

export type UnlocatedReason = 'no_address' | 'failed' | 'ambiguous' | 'pending';

export type MapUnlocated = {
  code_union: string;
  nom: string;
  ville: string | null;
  reason: UnlocatedReason;
};

export type AdherentMapResponse = {
  points: MapPoint[];
  unlocated: MapUnlocated[];
  migration_required?: boolean;
  geocode_pending?: boolean;
  total?: number;
};

export const REASON_LABEL: Record<UnlocatedReason, string> = {
  no_address: 'Adresse insuffisante',
  failed: 'Géocodage sans résultat',
  ambiguous: 'Résultat trop incertain',
  pending: 'Coordonnées pas encore calculées',
};
