import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'rfa_auth_token';
const USER_KEY = 'rfa_auth_user';

export type UserRole = 'ADMIN' | 'COMMERCIAL' | 'ADHERENT' | string;

export type AuthUser = {
  id?: number | string;
  username?: string;
  display_name?: string;
  role?: UserRole;
  linked_code_union?: string | null;
  linked_groupe?: string | null;
  [key: string]: unknown;
};

function getApiRoot(): string {
  const base = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!base) {
    throw new Error(
      'EXPO_PUBLIC_API_URL manquant. Copie mobile/.env.example vers mobile/.env et renseigne l’URL Railway.',
    );
  }
  return `${base}/api`;
}

export const api = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  config.baseURL = getApiRoot();
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function login(username: string, password: string) {
  const { data } = await api.post('/auth/login', { username, password });
  // Backend LoginResponse: flat fields + `token` (not access_token / nested user)
  const token = data.token || data.access_token;
  if (!token) {
    throw new Error('Réponse login sans token');
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  const user: AuthUser = data.user || {
    id: data.user_id,
    username: data.username,
    role: data.role,
    linked_code_union: data.linked_code_union,
    linked_groupe: data.linked_groupe,
    display_name: data.display_name,
    avatar_url: data.avatar_url,
    network_full_access: data.network_full_access,
    commercial_scope: data.commercial_scope,
  };
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  return { token, user };
}

export async function getMe(token?: string): Promise<AuthUser> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const { data } = await api.get('/auth/me', { headers });
  return data as AuthUser;
}

export async function loadStoredSession(): Promise<{ token: string; user: AuthUser } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) as AuthUser };
  } catch {
    return null;
  }
}

export async function logout() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export function isUnionRole(role?: string | null): boolean {
  const r = (role || '').toUpperCase();
  return r === 'ADMIN' || r === 'COMMERCIAL';
}

export function isAdherentRole(role?: string | null): boolean {
  return (role || '').toUpperCase() === 'ADHERENT';
}
