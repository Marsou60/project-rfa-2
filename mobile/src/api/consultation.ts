import { api } from './client';

export type NetworkClientRow = {
  code_union: string;
  key?: string;
  raison_sociale?: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
  n_platforms?: number;
  platforms?: string[];
  recent_current?: number;
  recent_previous?: number;
  recent_delta?: number;
  recent_pct?: number | null;
  silent?: boolean;
};

export type NetworkRankRow = {
  key?: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
};

export type NetworkAlertes = {
  cfg?: { pct?: number; ca_min?: number };
  ca_risque?: number;
  ca_perdu?: number;
  ca_opportunites?: number;
  ca_recent?: number;
  recent_months?: number[];
  mens_platforms?: string[];
  n_crit?: number;
  clients_risque?: NetworkClientRow[];
  clients_perdus?: NetworkClientRow[];
  clients_recent?: NetworkClientRow[];
  clients_boom?: NetworkClientRow[];
  clients_new?: NetworkClientRow[];
  marques_risque?: Array<{ key?: string; current?: number; previous?: number; delta_pct?: number | null }>;
  marques_perdues?: Array<{ key?: string; current?: number; previous?: number; delta_pct?: number | null }>;
  marques_boom?: Array<{ key?: string; current?: number; previous?: number; delta_pct?: number | null }>;
  marques_acheteurs?: Array<{
    key?: string;
    buyers_current?: number;
    buyers_previous?: number;
    buyers_delta?: number;
    current?: number;
    delta_pct?: number | null;
  }>;
};

export type NetworkDashboard = {
  kpis?: {
    ca_ytd?: number;
    ca_n1_same_period?: number | null;
    ca_n1_realise?: number | null;
    delta?: number | null;
    delta_pct?: number | null;
    objectif?: number;
    objectif_pct?: number | null;
    projection?: number | null;
    nb_clients?: number;
    nb_clients_new?: number;
    nb_clients_lost?: number;
    panier_moyen?: number | null;
    best_month?: number | null;
    best_month_ca?: number | null;
    platform_star?: string | null;
  };
  platforms?: Array<{
    platform: string;
    current?: number;
    previous?: number;
    delta?: number;
    delta_pct?: number | null;
    share_pct?: number | null;
    nb_clients?: number;
  }>;
  clients?: NetworkClientRow[];
  top_clients_up?: NetworkClientRow[];
  top_clients_down?: NetworkClientRow[];
  top_marques?: NetworkRankRow[];
  top_familles?: NetworkRankRow[];
  marques?: NetworkRankRow[];
  familles?: NetworkRankRow[];
  sous_familles?: NetworkRankRow[];
  groupes?: NetworkRankRow[];
  commerciaux?: NetworkRankRow[];
  regions?: NetworkRankRow[];
  alertes?: NetworkAlertes;
  cross?: {
    n_platforms?: number;
    mono?: number;
    mono_ca?: number;
    loyal?: number;
    loyal_ca?: number;
    avg_platforms?: number;
    distribution?: Array<{ n: number; count: number; ca: number }>;
    mono_targets?: Array<{
      code_union: string;
      raison_sociale?: string;
      platform?: string;
      current?: number;
    }>;
    loyal_clients?: Array<{
      code_union: string;
      raison_sociale?: string;
      n_platforms?: number;
      current?: number;
    }>;
  };
  [key: string]: unknown;
};

export type RfaLine = {
  ca?: number;
  rate?: number;
  amount?: number;
  value?: number;
  rfa?: number | { value?: number; rate?: number };
  bonus?: number | { value?: number; rate?: number };
  total?: number | { value?: number };
  label?: string;
  tiers?: unknown;
  tiers_rfa?: unknown;
  tiers_bonus?: unknown;
};

export type ClientRfaResponse = {
  available: boolean;
  message?: string;
  label?: string;
  year?: number;
  entity_kind?: string;
  data_source?: string;
  reporting_month?: number | null;
  ca?: {
    global?: Record<string, number>;
    tri?: Record<string, number>;
    totals?: { global_total?: number; tri_total?: number; grand_total?: number };
  };
  rfa?: {
    global?: Record<string, RfaLine>;
    tri?: Record<string, RfaLine>;
    totals?: { global_total?: number; tri_total?: number; grand_total?: number; rfa_total?: number; bonus_total?: number };
    contract_level?: { id?: string; tripartites_enabled?: boolean; total_ca?: number } | null;
  };
  rfa_projected?: {
    totals?: { grand_total?: number };
    contract_level?: { id?: string; tripartites_enabled?: boolean } | null;
    global?: Record<string, RfaLine>;
    tri?: Record<string, RfaLine>;
  } | null;
  contract_applied?: {
    id?: number | null;
    name?: string;
    level?: string | null;
    level_based?: boolean;
    tripartites_enabled?: boolean | null;
  };
  contract_level?: { id?: string; tripartites_enabled?: boolean; total_ca?: number } | null;
  projected_level?: { id?: string; tripartites_enabled?: boolean } | null;
  level_based?: boolean;
  comparison_n1?: {
    ca_n1_full?: number;
    ca_n_ytd_full?: number;
    ca_projected_full?: number | null;
    delta?: number | null;
    delta_pct?: number | null;
    trend?: string | null;
  } | null;
  rfa_net?: number;
  rfa_projected_net?: number | null;
  cotisation?: { amount?: number; deducted?: number; source?: string; [key: string]: unknown };
};

export async function getNetworkDashboard(params?: {
  yearCurrent?: number;
  yearPrevious?: number;
  commercial?: string | null;
  region?: string | null;
  marque?: string | null;
  fournisseur?: string | null;
  /** Listes sans plafond : tous les adhérents, toutes les marques… */
  full?: boolean;
}): Promise<NetworkDashboard> {
  const { data } = await api.get('/pure-data/cumulative/network-dashboard', {
    params: {
      year_current: params?.yearCurrent ?? 2026,
      year_previous: params?.yearPrevious ?? 2025,
      commercial: params?.commercial || undefined,
      region: params?.region || undefined,
      marque: params?.marque || undefined,
      fournisseur: params?.fournisseur || undefined,
      full: params?.full ? true : undefined,
    },
  });
  return data;
}

export async function getClientRfa(params: {
  codeUnion?: string | null;
  groupeClient?: string | null;
  year?: number;
}): Promise<ClientRfaResponse> {
  const { data } = await api.get('/pure-data/cumulative/client-rfa', {
    params: {
      code_union: params.codeUnion || undefined,
      groupe_client: params.groupeClient || undefined,
      year: params.year ?? 2026,
    },
  });
  return data;
}

export type HierarchyNode = {
  level?: string;
  label: string;
  ca_current?: number;
  ca_previous?: number;
  delta?: number;
  delta_pct?: number | null;
  part_current?: number;
  children?: HierarchyNode[];
  [key: string]: unknown;
};

export type ClientDashboardResponse = {
  available: boolean;
  message?: string;
  entity_kind?: string;
  entity_label?: string;
  year_current?: number;
  year_previous?: number;
  data_source?: string;
  totals?: {
    current?: number;
    previous?: number;
    delta?: number;
    delta_pct?: number | null;
  };
  platforms?: HierarchyNode[];
  by_marque?: HierarchyNode[];
  by_famille?: HierarchyNode[];
  platform_summary?: Array<{
    label: string;
    ca_current?: number;
    ca_previous?: number;
    delta?: number;
    delta_pct?: number | null;
    part_current?: number;
  }>;
  top_marques?: Array<{ label: string; ca_current?: number; delta_pct?: number | null }>;
  top_familles?: Array<{ label: string; ca_current?: number; delta_pct?: number | null }>;
  reporting_period?: {
    month?: number | null;
    year?: number | null;
    filename?: string | null;
    updated_at?: string | null;
  };
};

export async function getClientDashboard(params: {
  codeUnion?: string | null;
  groupeClient?: string | null;
  yearCurrent?: number;
  yearPrevious?: number;
}): Promise<ClientDashboardResponse> {
  const { data } = await api.get('/pure-data/cumulative/client-dashboard', {
    params: {
      code_union: params.codeUnion || undefined,
      groupe_client: params.groupeClient || undefined,
      year_current: params.yearCurrent ?? 2026,
      year_previous: params.yearPrevious ?? 2025,
    },
  });
  return data;
}

export type ContractPdfMeta = {
  available: boolean;
  label?: string;
  kind?: string;
  message?: string;
};

export async function getContractPdfMeta(params: {
  mode: 'client' | 'group';
  id: string;
  groupeClient?: string | null;
}): Promise<ContractPdfMeta> {
  const { data } = await api.get('/commercial/contract-pdf/meta', {
    params: {
      mode: params.mode,
      id: params.id,
      groupe_client: params.groupeClient || undefined,
    },
  });
  return data;
}

/** Download contract PDF bytes (auth required). */
export async function fetchContractPdfBlob(params: {
  mode: 'client' | 'group';
  id: string;
  groupeClient?: string | null;
}): Promise<{ data: ArrayBuffer; filename: string }> {
  const response = await api.get('/commercial/contract-pdf', {
    params: {
      mode: params.mode,
      id: params.id,
      groupe_client: params.groupeClient || undefined,
    },
    responseType: 'arraybuffer',
  });
  const disposition = String(response.headers?.['content-disposition'] || '');
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || `contrat-${params.id}.pdf`;
  return { data: response.data, filename };
}
