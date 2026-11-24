import {
  type AppArea,
  type AppLocation,
  build,
  canonicalize,
  leafId,
  parentLocation,
  parse,
} from './appLocation';
import {
  type HistoryCommand,
  type Session,
  bootSession,
  followAppUrl,
  followBrowser,
  marker,
} from './historySession';

export type HistoryApi = {
  readonly length: number;
  readonly url: string;
  readonly state: unknown;
  pushState: (state: unknown, title: string, url: string) => void;
  replaceState: (state: unknown, title: string, url: string) => void;
  back: () => void;
  onPop: (cb: () => void) => () => void;
};

export type HistoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type HistoryBridge = {
  getLocation: () => AppLocation;
  applyLocation: (loc: AppLocation) => void;
  getArea: () => AppArea;
};

const STORAGE_KEY = 'rfa-web-history';

export type HistoryController = {
  notify: () => void;
  requestInAppBack: () => boolean;
  dispose: () => void;
};

function readSaved(storage: HistoryStorage | null): { urls: string[]; index: number } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { urls?: unknown; index?: unknown };
    if (!Array.isArray(parsed.urls) || typeof parsed.index !== 'number') return null;
    const urls = parsed.urls.filter((item): item is string => typeof item === 'string');
    if (!urls.length || parsed.index < 0 || parsed.index >= urls.length) return null;
    return { urls, index: parsed.index };
  } catch {
    return null;
  }
}

function writeSaved(storage: HistoryStorage | null, session: Session) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ urls: session.urls, index: session.index }));
  } catch {
    /* navigation privée : l'historique de l'onglet suffit */
  }
}

export function createHistoryController(
  history: HistoryApi,
  bridge: HistoryBridge,
  storage: HistoryStorage | null = null,
  sid = `rfa-${Date.now().toString(36)}`,
): HistoryController {
  let disposed = false;
  let historyDriven = false;
  let pendingSkipApply = false;
  const area = () => bridge.getArea();
  const browserUrl = () => canonicalize(history.url || '/', area());

  let session: Session = bootSession(sid, browserUrl(), readSaved(storage));
  // Le boot réécrit l'identifiant de session : les entrées d'avant rechargement
  // restent dans urls[], le marqueur courant est neuf.
  history.replaceState(marker(session), '', session.urls[session.index]);
  writeSaved(storage, session);

  const shownLoc = bridge.getLocation();
  const shown = build(shownLoc);
  if (shown !== session.urls[session.index]) {
    const fromUrl = parse(session.urls[session.index], area());
    if (leafId(shownLoc) === leafId(fromUrl)) {
      // L'écran a déjà ouvert une couche (modale) avant l'installation : on l'empile.
      const followed = followAppUrl(session, shown);
      session = followed.session;
      writeSaved(storage, session);
      if (followed.command.op === 'push') history.pushState(followed.command.state, '', followed.command.url);
    } else {
      historyDriven = true;
      bridge.applyLocation(fromUrl);
      if (build(bridge.getLocation()) === session.urls[session.index]) historyDriven = false;
    }
  }

  const run = (command: HistoryCommand) => {
    if (command.op === 'push') history.pushState(command.state, '', command.url);
    if (command.op === 'replace') history.replaceState(command.state, '', command.url);
  };

  const adopt = (url: string, apply: boolean) => {
    const canonical = canonicalize(url, area());
    const followed = followBrowser(session, canonical, history.state);
    session = followed.session;
    const loc = parse(followed.applyUrl, area());
    const stable = build(loc);
    if (stable !== session.urls[session.index]) {
      session = { ...session, urls: [...session.urls.slice(0, session.index), stable], index: session.index };
      history.replaceState(marker(session), '', stable);
    }
    writeSaved(storage, session);
    if (!apply) return;
    if (build(bridge.getLocation()) === stable) return;
    historyDriven = true;
    bridge.applyLocation(loc);
  };

  const unsub = history.onPop(() => {
    if (disposed) return;
    if (pendingSkipApply) {
      pendingSkipApply = false;
      const landed = browserUrl();
      if (landed !== session.urls[session.index]) adopt(landed, true);
      else writeSaved(storage, session);
      return;
    }
    adopt(browserUrl(), true);
  });

  const alignCurrent = (actual: string) => {
    session = {
      ...session,
      urls: [...session.urls.slice(0, session.index), actual],
      index: session.index,
    };
    history.replaceState(marker(session), '', actual);
    writeSaved(storage, session);
  };

  const notify = () => {
    if (disposed) return;
    const actual = build(bridge.getLocation());
    if (actual === session.urls[session.index]) {
      historyDriven = false;
      return;
    }
    if (historyDriven) {
      historyDriven = false;
      alignCurrent(actual);
      return;
    }
    const followed = followAppUrl(session, actual);
    session = followed.session;
    writeSaved(storage, session);
    if (followed.command.op === 'back') {
      pendingSkipApply = true;
      history.back();
      return;
    }
    run(followed.command);
  };

  const requestInAppBack = (): boolean => {
    if (disposed) return false;
    if (session.index > 0) {
      history.back();
      return true;
    }
    const parent = parentLocation(bridge.getLocation());
    if (!parent) return false;
    const url = build(parent);
    if (url === build(bridge.getLocation())) return false;
    session = { sid: session.sid, urls: [url], index: 0 };
    history.replaceState(marker(session), '', url);
    writeSaved(storage, session);
    historyDriven = true;
    bridge.applyLocation(parent);
    return true;
  };

  return {
    notify,
    requestInAppBack,
    dispose: () => {
      disposed = true;
      unsub();
    },
  };
}
