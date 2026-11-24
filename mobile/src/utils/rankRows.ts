export type RankInput = {
  key?: string;
  code_union?: string;
  raison_sociale?: string;
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number | null;
  platform?: string;
};

type DashLike = {
  clients?: RankInput[];
  groupes?: RankInput[];
  marques?: RankInput[];
  top_marques?: RankInput[];
  familles?: RankInput[];
  top_familles?: RankInput[];
  sous_familles?: RankInput[];
  commerciaux?: RankInput[];
  regions?: RankInput[];
  platforms?: Array<{
    platform: string;
    current?: number;
    previous?: number;
    delta?: number;
    delta_pct?: number | null;
  }>;
  top_clients_up?: RankInput[];
  top_clients_down?: RankInput[];
  cross?: {
    mono_targets?: RankInput[];
    loyal_clients?: RankInput[];
  };
};

/** Lignes du classement, rechargées depuis le dashboard si l'écran est ouvert par l'URL. */
export function rowsForRank(dash: DashLike | null | undefined, kind: string, liste?: string | null): RankInput[] {
  if (!dash) return [];
  if (liste === 'hausses') return dash.top_clients_up || [];
  if (liste === 'baisses') return dash.top_clients_down || [];
  if (liste === 'mono') return dash.cross?.mono_targets || [];
  if (liste === 'fideles') return dash.cross?.loyal_clients || [];
  switch (kind) {
    case 'clients':
      return dash.clients || [];
    case 'groupes':
      return dash.groupes || [];
    case 'marques':
      return dash.marques?.length ? dash.marques : dash.top_marques || [];
    case 'familles':
      return dash.familles?.length ? dash.familles : dash.top_familles || [];
    case 'sous_familles':
      return dash.sous_familles || [];
    case 'commerciaux':
      return dash.commerciaux || [];
    case 'regions':
      return dash.regions || [];
    case 'plateformes':
      return (dash.platforms || []).map((p) => ({
        key: p.platform,
        current: p.current,
        previous: p.previous,
        delta: p.delta,
        delta_pct: p.delta_pct,
      }));
    default:
      return [];
  }
}

export function rankTitle(kind: string, liste?: string | null): string {
  if (liste === 'hausses') return 'Plus fortes hausses';
  if (liste === 'baisses') return 'Plus fortes baisses';
  if (liste === 'mono') return 'Clients mono-plateforme';
  if (liste === 'fideles') return 'Clients multi-plateformes';
  const titles: Record<string, string> = {
    marques: 'Toutes les marques',
    familles: 'Toutes les familles',
    sous_familles: 'Toutes les sous-familles',
    commerciaux: 'Tous les commerciaux',
    regions: 'Toutes les régions',
    groupes: 'Tous les groupes',
    clients: 'Tous les adhérents',
    plateformes: 'Plateformes',
  };
  return titles[kind] || 'Classement';
}
