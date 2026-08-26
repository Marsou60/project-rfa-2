/**
 * Périmètre commercial mobile — miroir de backend/app/services/commercial_scope.py
 * pour Expo Go même avant redeploy Railway.
 */

const FULL_ACCESS_COMMERCIAL = new Set(['VANESSA']);

const USERNAME_TO_COMMERCIAL: Record<string, string> = {
  RAYANE: 'Rayane',
  ELMEHDI: 'El Mehdi',
  AGATHE: 'Agathe',
  ALYA: 'Alya',
  CORALIE: 'Coralie',
  EMERIC: 'Emeric',
  VANESSA: 'Vanessa',
};

export function hasNetworkFullAccess(user?: {
  role?: string | null;
  username?: string | null;
  network_full_access?: boolean | null;
} | null): boolean {
  if (!user) return false;
  if (typeof user.network_full_access === 'boolean') return user.network_full_access;
  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN') return true;
  if (role === 'COMMERCIAL') {
    return FULL_ACCESS_COMMERCIAL.has(String(user.username || '').trim().toUpperCase());
  }
  return false;
}

export function resolveCommercialScope(user?: {
  role?: string | null;
  username?: string | null;
  display_name?: string | null;
  commercial_scope?: string | null;
  network_full_access?: boolean | null;
} | null): string | null {
  if (!user) return null;
  if (user.commercial_scope) return String(user.commercial_scope);
  if (hasNetworkFullAccess(user)) return null;
  if (String(user.role || '').toUpperCase() !== 'COMMERCIAL') return null;

  const uname = String(user.username || '').trim().toUpperCase();
  if (USERNAME_TO_COMMERCIAL[uname]) return USERNAME_TO_COMMERCIAL[uname];

  const first = String(user.display_name || '')
    .trim()
    .split(/\s+/)[0];
  if (first) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (uname) return uname.charAt(0).toUpperCase() + uname.slice(1).toLowerCase();
  return null;
}
