import { useEffect, useState } from 'react';
import { getNetworkDashboard, getNetworkKpis, NetworkDashboard } from './consultation';
import { mergeRankRowsByKey } from '../utils/mergeRankRows';

/**
 * Dashboard réseau partagé entre les onglets Union.
 * Une seule requête `full=true` (+ filtre commercial si scopé) alimente
 * Accueil / Adhérents / Analyses / Alertes.
 */
const TTL_MS = 5 * 60 * 1000;

type State = {
  data: NetworkDashboard | null;
  loading: boolean;
  error: string | null;
  loadedAt: number;
  /** true une fois le dashboard complet (alertes, classements) reçu */
  complete: boolean;
  /** Clé de cache : commercial forcé ou '' pour réseau entier */
  scopeKey: string;
};

let commercialFilter: string | null = null;
let state: State = { data: null, loading: false, error: null, loadedAt: 0, complete: false, scopeKey: '' };
let requestSeq = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function errorMessage(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return String(detail || (e as { message?: string })?.message || 'Erreur dashboard');
}

function normalizeDash(data: NetworkDashboard): NetworkDashboard {
  return {
    ...data,
    commerciaux: mergeRankRowsByKey(data.commerciaux),
    regions: mergeRankRowsByKey(data.regions),
    groupes: mergeRankRowsByKey(data.groupes),
    marques: mergeRankRowsByKey(data.marques),
    top_marques: mergeRankRowsByKey(data.top_marques),
    familles: mergeRankRowsByKey(data.familles),
    top_familles: mergeRankRowsByKey(data.top_familles),
    sous_familles: mergeRankRowsByKey(data.sous_familles),
  };
}

/** Appelé au login / logout pour basculer le périmètre portefeuille. */
export function setNetworkCommercialFilter(commercial: string | null) {
  const next = commercial?.trim() || null;
  const prev = commercialFilter;
  commercialFilter = next;
  if (prev !== next) {
    state = { data: null, loading: false, error: null, loadedAt: 0, complete: false, scopeKey: next || '' };
    listeners.forEach((l) => l());
  }
}

export function refreshNetworkDashboard(force = false): Promise<void> {
  const scopeKey = commercialFilter || '';
  const fresh =
    state.complete &&
    state.data &&
    state.scopeKey === scopeKey &&
    Date.now() - state.loadedAt < TTL_MS;
  if (!force && fresh) return Promise.resolve();
  if (inflight && !force) return inflight;

  const seq = ++requestSeq;
  set({ loading: true, error: null });
  const kpi = getNetworkKpis({ commercial: commercialFilter })
    .then((partial) => {
      if (seq !== requestSeq) return;
      set({
        data: partial,
        loading: false,
        error: null,
        scopeKey,
      });
    })
    .catch(() => {
      /* le dashboard complet reste le filet */
    });
  inflight = getNetworkDashboard({
    full: true,
    commercial: commercialFilter,
  })
    .then((data) => {
      if (seq !== requestSeq) return;
      set({
        data: normalizeDash(data),
        loading: false,
        error: null,
        loadedAt: Date.now(),
        complete: true,
        scopeKey,
      });
    })
    .catch((e: unknown) => {
      if (seq !== requestSeq) return;
      set({ loading: false, error: errorMessage(e) });
    })
    .finally(() => {
      inflight = null;
    });
  return Promise.all([kpi, inflight]).then(() => undefined);
}

export function clearNetworkDashboard() {
  commercialFilter = null;
  state = { data: null, loading: false, error: null, loadedAt: 0, complete: false, scopeKey: '' };
  listeners.forEach((l) => l());
}

export function useNetworkDashboard() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    refreshNetworkDashboard();
  }, []);

  return {
    dash: state.data,
    loading: state.loading,
    error: state.error,
    refresh: () => refreshNetworkDashboard(true),
  };
}
