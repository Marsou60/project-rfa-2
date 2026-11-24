import { Platform } from 'react-native';
import { AppArea, AppLocation } from './appLocation';
import { HistoryController, createHistoryController } from './historyController';

type Bridge = {
  getLocation: () => AppLocation;
  applyLocation: (loc: AppLocation) => void;
  getArea: () => AppArea;
};

let active: HistoryController | null = null;

function browserHistory() {
  const win = window;
  return {
    get length() {
      return win.history.length;
    },
    get url() {
      return `${win.location.pathname}${win.location.search}`;
    },
    get state() {
      return win.history.state;
    },
    pushState: (state: unknown, _title: string, url: string) => {
      win.history.pushState(state, '', url);
    },
    replaceState: (state: unknown, _title: string, url: string) => {
      win.history.replaceState(state, '', url);
    },
    back: () => {
      win.history.back();
    },
    onPop: (cb: () => void) => {
      const fn = () => cb();
      win.addEventListener('popstate', fn);
      return () => win.removeEventListener('popstate', fn);
    },
  };
}

export function installWebHistory(bridge: Bridge): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  active?.dispose();
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  const controller = createHistoryController(browserHistory(), bridge, storage);
  active = controller;
  return () => {
    if (active === controller) active = null;
    controller.dispose();
  };
}

export function notifyWebHistory() {
  active?.notify();
}

/** Retour d'un cran via l'historique du navigateur. false = racine de l'app. */
export function requestInAppBack(): boolean {
  if (!active) return false;
  return active.requestInAppBack();
}
