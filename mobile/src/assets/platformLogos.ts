/** Logos plateformes packagés dans l’app — fiables hors ligne / Expo Go. */
export const PLATFORM_LOGO_SOURCES: Record<string, number> = {
  ACR: require('../../assets/platforms/ACR.png'),
  DCA: require('../../assets/platforms/DCA.png'),
  EXADIS: require('../../assets/platforms/EXADIS.jpeg'),
  ALLIANCE: require('../../assets/platforms/ALLIANCE.jpg'),
};

export function getPlatformLogoSource(platformKey?: string | null) {
  const key = String(platformKey || '')
    .replace(/^GLOBAL_/i, '')
    .replace(/^TRI_/i, '')
    .split('_')[0]
    .trim()
    .toUpperCase();
  return PLATFORM_LOGO_SOURCES[key] || null;
}
