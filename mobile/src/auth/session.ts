export const AUTH_TOKEN_KEY = 'rfa_auth_token';
export const AUTH_USER_KEY = 'rfa_auth_user';

const SESSION_KEYS = [AUTH_TOKEN_KEY, AUTH_USER_KEY] as const;

/**
 * Efface le jeton et le profil. Les deux clés sont toujours tentées :
 * un échec sur la première ne laisse pas la seconde en place.
 */
export async function clearStoredSession(remove: (key: string) => Promise<void>): Promise<void> {
  const results = await Promise.allSettled(SESSION_KEYS.map(async (key) => remove(key)));
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
}
