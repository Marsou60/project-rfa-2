import { Alert, Linking } from 'react-native';

/** Contact vitrine — une seule adresse à changer si le secrétariat évolue. */
export const UNION_CONTACT = {
  email: 'martial@groupementunion.pro',
  domain: 'groupementunion.pro',
};

export const UNION_MISSION = {
  kicker: 'GROUPEMENT UNION',
  tagline: 'Le groupement des indépendants de la pièce automobile',
  lead:
    'Union rassemble des distributeurs indépendants de pièces auto. Ensemble, nous achetons mieux, nous négocions plus fort, et nous redistribuons la valeur sous forme de rémunération de fin d’année.',
  why: [
    {
      title: 'Acheter ensemble',
      body: 'Les adhérents s’approvisionnent via quatre plateformes nationales. Le volume du réseau pèse dans les négociations — pas le magasin isolé.',
    },
    {
      title: 'Contrats & paliers',
      body: 'Union porte les contrats fournisseurs. Plus vos achats progressent dans le réseau, plus votre niveau de rémunération peut s’améliorer.',
    },
    {
      title: 'RFA de fin d’année',
      body: 'La Remise de Fin d’Année (RFA) est calculée sur vos achats réels : globale par plateforme, et tripartite par familles de produits. Tout est lié : le collectif renforce chacun.',
    },
  ],
};

/** Phrase unique à l’écran — ne pas réécrire ailleurs. */
export const UNION_RFA_PLAIN =
  'La Remise de Fin d’Année (RFA) est calculée sur vos achats réels. Globale : une part par plateforme d’achat. Tripartite : une part en plus, par famille de pièces.';

export const UNION_PLATFORMS = [
  {
    key: 'ACR',
    name: 'ACR',
    role: 'Plateforme d’achat',
  },
  {
    key: 'DCA',
    name: 'DCA',
    role: 'Plateforme d’achat',
  },
  {
    key: 'EXADIS',
    name: 'EXADIS',
    role: 'Plateforme d’achat',
  },
  {
    key: 'ALLIANCE',
    name: 'ALLIANCE',
    role: 'Plateforme d’achat',
  },
] as const;

export const UNION_HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Vous restez indépendant',
    body: 'Vous gardez votre enseigne, vos clients, votre magasin. Union n’est pas une franchise : c’est un groupement.',
  },
  {
    step: '2',
    title: 'Vous achetez sur le réseau',
    body: 'Vos commandes passent par ACR, DCA, EXADIS et ALLIANCE. Ces achats constituent votre chiffre d’affaires groupement.',
  },
  {
    step: '3',
    title: 'Union suit et calcule',
    body: 'Les contrats, les paliers et la RFA sont portés par le groupement. Chaque adhérent retrouve ses chiffres dans son espace membre.',
  },
];

/** Marques du réseau dont le logo est packagé dans l’app (vitrine, pas de CA). */
export const UNION_SHOWCASE_MARQUES = [
  'BOSCH',
  'VALEO',
  'BREMBO',
  'SKF',
  'NGK',
  'TRW',
  'GATES',
  'SACHS',
  'LUK',
  'INA',
  'DAYCO',
  'ELRING',
  'FEBI',
  'FUCHS',
  'TOTAL',
  'NRF',
  'KAYABA',
  'CORTECO',
  'PIERBURG',
  'WIX',
  'PURFLUX',
  'DELPHI',
  'SCHAEFFLER',
  'SNR',
  'SIDEM',
  'NAPA',
] as const;

export type ContactIntent = 'adherent' | 'partenaire';

const MAIL_COPY: Record<ContactIntent, { subject: string; body: string }> = {
  adherent: {
    subject: 'Candidature adhérent — Groupement Union',
    body: `Bonjour,

Je souhaite rejoindre le Groupement Union en tant qu’adhérent (distributeur indépendant de pièces automobiles).

Ville / département :
Activité (négoce, garage, mixte…) :
Nombre de points de vente :
Plateformes déjà utilisées (ACR, DCA, EXADIS, ALLIANCE) :

Cordialement,
`,
  },
  partenaire: {
    subject: 'Partenariat — Groupement Union',
    body: `Bonjour,

Je souhaite échanger avec le Groupement Union en vue d’un partenariat (marque, fournisseur ou plateforme).

Société :
Marque(s) / offre :
Contact :

Cordialement,
`,
  },
};

export async function openUnionMail(intent: ContactIntent) {
  const { email } = UNION_CONTACT;
  const copy = MAIL_COPY[intent];
  const url = `mailto:${email}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(copy.body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Nous écrire', `Aucun client mail sur cet appareil.\n\n${email}`);
  }
}
