/**
 * Démo locale uniquement. Jamais active dans un export de production
 * (`__DEV__` est faux après `expo export`), même si la variable traîne.
 * Pour voir la carte sans base ni login :
 *   EXPO_PUBLIC_MAP_DEMO=1 npx expo start --web
 */
export const mapDemoEnabled =
  typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_MAP_DEMO === '1';
