import { Platform } from 'react-native';

/** Télécharge un binaire dans le navigateur (PWA / iPhone Safari). No-op sur natif. */
export function downloadBlob(data: ArrayBuffer, filename: string, mime = 'application/pdf'): boolean {
  if (Platform.OS !== 'web') return false;
  const w = globalThis as typeof globalThis & {
    Blob: typeof Blob;
    URL: typeof URL;
    document: Document;
  };
  const blob = new w.Blob([new Uint8Array(data)], { type: mime });
  const url = w.URL.createObjectURL(blob);
  const a = w.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  w.document.body.appendChild(a);
  a.click();
  a.remove();
  w.setTimeout(() => w.URL.revokeObjectURL(url), 60_000);
  return true;
}
