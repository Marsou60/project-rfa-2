import { ClientNote } from '../api/fiches';
import { ClientRfaResponse } from '../api/consultation';
import { nearContractTier } from './filters';
import { contractTierLabel } from './markerStyle';
import { AdherentMapResponse, MapPoint, MapUnlocated } from './types';

type Seed = {
  code: string;
  nom: string;
  ville: string | null;
  lat?: number;
  lng?: number;
  ca: number;
  plateformes: string[];
  reason?: MapUnlocated['reason'];
  notes?: ClientNote[];
};

const brestNotes: ClientNote[] = [
  {
    id: 1,
    code_union: 'DEMO-BREST',
    type_note: 'NOTE SIMPLE',
    note_simple:
      'Visite fictive. Le magasin veut passer le palier ACR avant l’été. Ils manquent surtout du freinage.',
    auteur: 'Camille Martin',
    created_at: '2026-11-12T09:30:00Z',
  },
  {
    id: 2,
    code_union: 'DEMO-BREST',
    type_note: 'NOTE SIMPLE',
    note_simple: 'Rappel : envoyer le barème. Texte d’origine, un peu télégraphique.',
    note_ia: 'Relance prévue : envoyer le barème freinage et confirmer le prochain passage.',
    auteur: 'Camille Martin',
    created_at: '2026-10-02T14:15:00Z',
  },
];

function note(code: string, text: string): ClientNote {
  return {
    id: code.length,
    code_union: code,
    type_note: 'NOTE SIMPLE',
    note_simple: text,
    auteur: 'Camille Martin',
    created_at: '2026-09-18T11:00:00Z',
  };
}

/** Garages inventés. Les villes sont réelles, les enseignes ne le sont pas. */
const SEEDS: Seed[] = [
  { code: 'DEMO-BREST', nom: 'Garage des Tilleuls', ville: 'Brest', lat: 48.39, lng: -4.486, ca: 86000, plateformes: ['ACR', 'DCA'], notes: brestNotes },
  { code: 'DEMO-PARIS-1', nom: 'Pièces du Canal', ville: 'Paris', lat: 48.8566, lng: 2.3522, ca: 142000, plateformes: ['ACR', 'DCA', 'EXADIS'], notes: [note('DEMO-PARIS-1', 'Passage fictif, vitrine refaite.')] },
  { code: 'DEMO-PARIS-2', nom: 'Atelier Bellevue', ville: 'Paris', lat: 48.8534, lng: 2.369, ca: 54000, plateformes: ['ACR'], notes: [note('DEMO-PARIS-2', 'Démo : intéressés par Alliance.')] },
  { code: 'DEMO-PARIS-3', nom: 'Auto Saint-Martin', ville: 'Paris', lat: 48.862, lng: 2.344, ca: 98000, plateformes: ['DCA', 'ALLIANCE'], notes: [note('DEMO-PARIS-3', 'Démo : proche du palier contrat.')] },
  { code: 'DEMO-PARIS-4', nom: 'Freins République', ville: 'Paris', lat: 48.849, lng: 2.358, ca: 210000, plateformes: ['ACR', 'EXADIS', 'ALLIANCE'], notes: [note('DEMO-PARIS-4', 'Démo : bon mois de septembre.')] },
  { code: 'DEMO-PARIS-5', nom: 'Comptoir des Halles', ville: 'Paris', lat: 48.866, lng: 2.348, ca: 33000, plateformes: ['DCA'], notes: [note('DEMO-PARIS-5', 'Démo : petit compte, à relancer.')] },
  { code: 'DEMO-LYON-1', nom: 'Garage des Quais', ville: 'Lyon', lat: 45.764, lng: 4.8357, ca: 175000, plateformes: ['ACR', 'DCA'], notes: [note('DEMO-LYON-1', 'Démo : stock filtration bas.')] },
  { code: 'DEMO-LYON-2', nom: 'Pièces Villeurbanne', ville: 'Villeurbanne', lat: 45.767, lng: 4.88, ca: 64000, plateformes: ['EXADIS'], notes: [note('DEMO-LYON-2', 'Démo : uniquement Exadis.')] },
  { code: 'DEMO-LYON-3', nom: 'Atelier du Rhône', ville: 'Lyon', lat: 45.748, lng: 4.847, ca: 91000, plateformes: ['ACR', 'ALLIANCE'], notes: [note('DEMO-LYON-3', 'Démo : proche de Silver.')] },
  { code: 'DEMO-MARS-1', nom: 'Garage du Vieux-Port', ville: 'Marseille', lat: 43.296, lng: 5.37, ca: 128000, plateformes: ['DCA', 'EXADIS'], notes: [note('DEMO-MARS-1', 'Démo : visite du comptoir.')] },
  { code: 'DEMO-MARS-2', nom: 'Pièces de la Joliette', ville: 'Marseille', lat: 43.29, lng: 5.395, ca: 47000, plateformes: ['ACR'], notes: [note('DEMO-MARS-2', 'Démo : premier passage.')] },
  { code: 'DEMO-LILLE', nom: 'Atelier des Flandres', ville: 'Lille', lat: 50.629, lng: 3.057, ca: 250000, plateformes: ['ACR', 'DCA', 'EXADIS', 'ALLIANCE'], notes: [note('DEMO-LILLE', 'Démo : proche du palier Gold.')] },
  { code: 'DEMO-NANTES', nom: 'Garage de l’Erdre', ville: 'Nantes', lat: 47.218, lng: -1.554, ca: 72000, plateformes: ['DCA', 'ALLIANCE'], notes: [note('DEMO-NANTES', 'Démo : rien d’urgent.')] },
  { code: 'DEMO-BORDEAUX', nom: 'Pièces des Chartrons', ville: 'Bordeaux', lat: 44.858, lng: -0.566, ca: 156000, plateformes: ['ACR', 'EXADIS'], notes: [note('DEMO-BORDEAUX', 'Démo : CA stable.')] },
  { code: 'DEMO-TOULOUSE', nom: 'Atelier Garonne', ville: 'Toulouse', lat: 43.604, lng: 1.444, ca: 39000, plateformes: ['ALLIANCE'], notes: [note('DEMO-TOULOUSE', 'Démo : mono Alliance.')] },
  { code: 'DEMO-STRASBOURG', nom: 'Garage de l’Ill', ville: 'Strasbourg', lat: 48.573, lng: 7.752, ca: 118000, plateformes: ['ACR', 'DCA'], notes: [note('DEMO-STRASBOURG', 'Démo : bon démarrage.')] },
  { code: 'DEMO-RENNES', nom: 'Pièces de la Vilaine', ville: 'Rennes', lat: 48.117, lng: -1.678, ca: 88000, plateformes: ['EXADIS', 'DCA'], notes: [note('DEMO-RENNES', 'Démo : proche de Silver.')] },
  { code: 'DEMO-NICE', nom: 'Atelier du Paillon', ville: 'Nice', lat: 43.71, lng: 7.262, ca: 203000, plateformes: ['ACR', 'ALLIANCE'], notes: [note('DEMO-NICE', 'Démo : palier ACR atteint.')] },
  { code: 'DEMO-ROUEN', nom: 'Garage de la Seine', ville: 'Rouen', lat: 49.443, lng: 1.1, ca: 51000, plateformes: ['DCA'], notes: [note('DEMO-ROUEN', 'Démo : petit volume.')] },
  { code: 'DEMO-CLERMONT', nom: 'Pièces du Puy', ville: 'Clermont-Ferrand', lat: 45.777, lng: 3.087, ca: 99000, plateformes: ['ACR', 'EXADIS'], notes: [note('DEMO-CLERMONT', 'Démo : tout près de Silver.')] },
  { code: 'DEMO-DIJON', nom: 'Atelier des Ducs', ville: 'Dijon', lat: 47.322, lng: 5.041, ca: 166000, plateformes: ['ACR', 'DCA', 'ALLIANCE'], notes: [note('DEMO-DIJON', 'Démo : trois fournisseurs.')] },
  { code: 'DEMO-AJACCIO', nom: 'Garage des Sanguinaires', ville: 'Ajaccio', lat: 41.919, lng: 8.738, ca: 28000, plateformes: ['EXADIS'], notes: [note('DEMO-AJACCIO', 'Démo : compte corse fictif.')] },
  { code: 'DEMO-SANS', nom: 'Atelier sans adresse', ville: null, ca: 12000, plateformes: ['ACR'], reason: 'no_address', notes: [note('DEMO-SANS', 'Démo : aucune adresse exploitable, donc pas de point.')] },
  { code: 'DEMO-FLOU', nom: 'Garage des deux Saint-Martin', ville: 'Saint-Martin', ca: 44000, plateformes: ['DCA'], reason: 'ambiguous', notes: [note('DEMO-FLOU', 'Démo : plusieurs communes possibles, point non placé.')] },
  { code: 'DEMO-RATE', nom: 'Pièces du lieu-dit', ville: 'Lieu-dit fictif', ca: 8000, plateformes: [], reason: 'failed', notes: [note('DEMO-RATE', 'Démo : l’API Adresse n’a rien trouvé.')] },
];

function buildRfa(seed: Seed): ClientRfaResponse {
  const ca = seed.ca;
  const level = ca >= 300001 ? 'GOLD' : ca >= 100001 ? 'SILVER' : 'CLASSIQUE';
  const shares = seed.plateformes.length ? seed.plateformes : ['ACR'];
  const slice = Math.round(ca / shares.length);
  const lines: NonNullable<NonNullable<ClientRfaResponse['rfa']>['global']> = {};
  shares.forEach((name, index) => {
    const part = index === shares.length - 1 ? ca - slice * (shares.length - 1) : slice;
    lines[name] = {
      label: name,
      ca: part,
      tiers_rfa: [
        { min: 0, rate: 0.01 },
        { min: 60000, rate: 0.02 },
        { min: 120000, rate: 0.03 },
      ],
      tiers_bonus: name === 'ACR' ? [{ min: 80000, rate: 0.005 }] : [],
    };
  });
  const rfa = Math.round(ca * (level === 'CLASSIQUE' ? 0.012 : 0.02));
  return {
    available: true,
    label: seed.nom,
    year: 2026,
    reporting_month: 10,
    level_based: true,
    contract_applied: { name: 'Contrat démonstration', level },
    contract_level: { id: level, tripartites_enabled: level !== 'CLASSIQUE', total_ca: ca },
    ca: { totals: { global_total: ca, grand_total: ca } },
    rfa: { totals: { grand_total: rfa }, global: lines },
    rfa_net: rfa,
    comparison_n1: { delta_pct: 0.04 },
  };
}

const DETAILS = new Map(SEEDS.map((seed) => [seed.code, { rfa: buildRfa(seed), notes: seed.notes || [] }]));

/** Commerciaux fictifs, pour la légende. Pas les vrais portefeuilles. */
function demoCommercial(code: string): string {
  if (/PARIS|LILLE|STRASBOURG|DIJON/.test(code)) return 'Noah Bernard';
  if (/LYON|MARS|TOULOUSE|NICE|CLERMONT|AJACCIO/.test(code)) return 'Inès Morel';
  return 'Camille Martin';
}

function toPoint(seed: Seed): MapPoint {
  const commercial = demoCommercial(seed.code);
  const fournisseur = seed.plateformes[0] || null;
  return {
    code_union: seed.code,
    nom: seed.nom,
    ville: seed.ville,
    lat: seed.lat || 0,
    lng: seed.lng || 0,
    ca: seed.ca,
    plateformes: seed.plateformes,
    near_tier: nearContractTier(seed.ca),
    commercial,
    palier: contractTierLabel(seed.ca),
    fournisseur_principal: fournisseur,
  };
}

export const DEMO_MAP: AdherentMapResponse = {
  points: SEEDS.filter((seed) => seed.lat != null && seed.lng != null && !seed.reason).map(toPoint),
  unlocated: SEEDS.filter((seed) => seed.reason).map((seed) => ({
    code_union: seed.code,
    nom: seed.nom,
    ville: seed.ville,
    reason: seed.reason || 'no_address',
    ca: seed.ca,
    plateformes: seed.plateformes,
    commercial: demoCommercial(seed.code),
    palier: contractTierLabel(seed.ca),
    fournisseur_principal: seed.plateformes[0] || null,
  })),
  migration_required: false,
  geocode_pending: false,
  total: SEEDS.length,
};

export function demoDetail(code: string): { rfa: ClientRfaResponse; notes: ClientNote[] } | null {
  return DETAILS.get(code) || null;
}
