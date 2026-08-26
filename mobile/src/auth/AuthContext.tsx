import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  isAdherentRole,
  isUnionRole,
  loadStoredSession,
  login as apiLogin,
  logout as apiLogout,
} from '../api/client';
import { clearNetworkDashboard, setNetworkCommercialFilter } from '../api/networkStore';
import { hasNetworkFullAccess, resolveCommercialScope } from './commercialScope';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isUnion: boolean;
  isAdherent: boolean;
  /** ADMIN + Vanessa : vue réseau complète */
  isNetworkFullAccess: boolean;
  /** Filtre Pure Data forcé pour un commercial (ex. "Rayane") */
  commercialScope: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await loadStoredSession();
        if (!cancelled && session) {
          setNetworkCommercialFilter(resolveCommercialScope(session.user));
          setUser(session.user);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    clearNetworkDashboard();
    const { user: next } = await apiLogin(username, password);
    setNetworkCommercialFilter(resolveCommercialScope(next));
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    clearNetworkDashboard();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isUnion: isUnionRole(user?.role),
      isAdherent: isAdherentRole(user?.role),
      isNetworkFullAccess: hasNetworkFullAccess(user),
      commercialScope: resolveCommercialScope(user),
      login,
      logout,
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
