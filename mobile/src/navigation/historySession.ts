/** Réducteur d'historique, sans window : push, retour, recharge. */

export type HistoryCommand =
  | { op: 'replace'; url: string; state: HistoryMarker }
  | { op: 'push'; url: string; state: HistoryMarker }
  | { op: 'back' }
  | { op: 'none' };

export type HistoryMarker = { rfaSid: string; rfa: number };

export type Session = {
  sid: string;
  urls: string[];
  index: number;
};

export function createSession(sid: string, url: string): Session {
  return { sid, urls: [url], index: 0 };
}

export function marker(session: Session): HistoryMarker {
  return { rfaSid: session.sid, rfa: session.index };
}

export function followAppUrl(session: Session, nextUrl: string): { session: Session; command: HistoryCommand } {
  if (nextUrl === session.urls[session.index]) return { session, command: { op: 'none' } };
  if (session.index > 0 && nextUrl === session.urls[session.index - 1]) {
    return {
      session: { ...session, index: session.index - 1 },
      command: { op: 'back' },
    };
  }
  const urls = session.urls.slice(0, session.index + 1);
  urls.push(nextUrl);
  const index = urls.length - 1;
  const next = { ...session, urls, index };
  return { session: next, command: { op: 'push', url: nextUrl, state: marker(next) } };
}

export function followBrowser(
  session: Session,
  browserUrl: string,
  histState: unknown,
): { session: Session; applyUrl: string } {
  const state = histState as Partial<HistoryMarker> | null;
  if (state?.rfaSid === session.sid && typeof state.rfa === 'number' && session.urls[state.rfa] === browserUrl) {
    return { session: { ...session, index: state.rfa }, applyUrl: browserUrl };
  }
  const idx = session.urls.lastIndexOf(browserUrl);
  if (idx >= 0) return { session: { ...session, index: idx }, applyUrl: browserUrl };
  return { session: { ...session, urls: [browserUrl], index: 0 }, applyUrl: browserUrl };
}

export function bootSession(
  sid: string,
  browserUrl: string,
  saved: { urls: string[]; index: number } | null,
): Session {
  if (saved && saved.urls[saved.index] === browserUrl && saved.index >= 0 && saved.index < saved.urls.length) {
    return { sid, urls: saved.urls, index: saved.index };
  }
  return createSession(sid, browserUrl);
}
