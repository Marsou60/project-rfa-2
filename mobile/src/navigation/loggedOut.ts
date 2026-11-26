import { WEB_HISTORY_STORAGE_KEY } from './historyController';

/** Vitrine publique. L'écran /connexion s'ouvre depuis là. */
export const LOGGED_OUT_PATH = '/accueil';

export type LoggedOutTarget = {
  location: { pathname: string; search: string };
  history: { replaceState: (data: unknown, unused: string, url?: string | null) => void };
  sessionStorage: { removeItem: (key: string) => void };
};

/**
 * Oublie les adresses des écrans privés et pose /accueil.
 * replaceState reste fiable dans la PWA iOS (Safari) et Chrome Android,
 * là où window.confirm et Alert.alert ne le sont pas.
 */
export function exitToPublicHome(target: LoggedOutTarget): void {
  try {
    target.sessionStorage.removeItem(WEB_HISTORY_STORAGE_KEY);
  } catch {
    /* navigation privée : l'onglet n'a pas de sessionStorage */
  }
  const pathname = target.location.pathname || '/';
  const search = target.location.search || '';
  const bare = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if ((bare === LOGGED_OUT_PATH || bare === '/') && search === '') return;
  target.history.replaceState({ rfaLoggedOut: true }, '', LOGGED_OUT_PATH);
}
