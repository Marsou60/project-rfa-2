export type MapPoint = {
  code_union: string;
  nom: string;
  ville: string | null;
  lat: number;
  lng: number;
  ca: number | null;
  plateformes: string[];
  near_tier: boolean;
  /** Commercial du portefeuille. Sert à colorer la carte. */
  commercial?: string | null;
  /** Classique, Silver ou Gold. */
  palier?: string | null;
  /** Plateforme au plus gros CA, ou la première si les montants manquent. */
  fournisseur_principal?: string | null;
};

export type UnlocatedReason = 'no_address' | 'failed' | 'ambiguous' | 'pending';

export type MapUnlocated = {
  code_union: string;
  nom: string;
  ville: string | null;
  reason: UnlocatedReason;
  ca?: number | null;
  plateformes?: string[];
  commercial?: string | null;
  palier?: string | null;
  fournisseur_principal?: string | null;
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
