/* Auto-generated marque logo map — do not edit by hand */
const MARQUE_LOGOS: Record<string, number> = {
  AUTOPUZZ: require('./marques/AUTOPUZZ.png'),
  AVACOOLING: require('./marques/AVACOOLING.png'),
  BK2C: require('./marques/BK2C.png'),
  BOSCH: require('./marques/BOSCH.png'),
  BREMBO: require('./marques/BREMBO.png'),
  CEVAM: require('./marques/CEVAM.png'),
  COOPERSFIAAM: require('./marques/COOPERSFIAAM.png'),
  CORTECO: require('./marques/CORTECO.png'),
  DAYCO: require('./marques/DAYCO.png'),
  DELPHI: require('./marques/DELPHI.png'),
  DELPHI2: require('./marques/DELPHI2.png'),
  DIFFRAMA: require('./marques/DIFFRAMA.png'),
  DOLZ: require('./marques/DOLZ.png'),
  ELRING: require('./marques/ELRING.png'),
  FEBI: require('./marques/FEBI.png'),
  FUCHS: require('./marques/FUCHS.png'),
  GATES: require('./marques/GATES.png'),
  INA: require('./marques/INA.png'),
  KAYABA: require('./marques/KAYABA.png'),
  KNECHT: require('./marques/KNECHT.png'),
  LUK: require('./marques/LUK.png'),
  NAPA: require('./marques/NAPA.png'),
  NGK: require('./marques/NGK.png'),
  NK: require('./marques/NK.png'),
  NRF: require('./marques/NRF.png'),
  PIERBURG: require('./marques/PIERBURG.png'),
  PURFLUX: require('./marques/PURFLUX.png'),
  PURFLUXGROUP: require('./marques/PURFLUXGROUP.png'),
  SACHS: require('./marques/SACHS.png'),
  SASIC: require('./marques/SASIC.png'),
  SBS: require('./marques/SBS.png'),
  SCHAEFFLER: require('./marques/SCHAEFFLER.png'),
  SIDEM: require('./marques/SIDEM.png'),
  SKF: require('./marques/SKF.png'),
  SNR: require('./marques/SNR.png'),
  TOTAL: require('./marques/TOTAL.png'),
  TRW: require('./marques/TRW.png'),
  VALEO: require('./marques/VALEO.png'),
  VALEOSERVICES: require('./marques/VALEOSERVICES.png'),
  VENEPORTE: require('./marques/VENEPORTE.png'),
  WIX: require('./marques/WIX.png'),
};

const ALIASES: Record<string, string> = { KYB: 'KAYABA' };

export function marqueSlug(label?: string | null): string {
  const raw = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return ALIASES[raw] || raw;
}

export function getMarqueLogoSource(label?: string | null) {
  const slug = marqueSlug(label);
  return MARQUE_LOGOS[slug] || null;
}

export default MARQUE_LOGOS;
