import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

export type SupplierLogo = {
  id: number;
  supplier_key: string;
  supplier_name?: string;
  image_url: string;
  is_active?: boolean;
};

/** Map supplier_key UPPER -> absolute image URL */
export type LogoMap = Record<string, string>;

export function getApiOrigin(): string {
  return (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
}

export function resolveImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = getApiOrigin();
  if (path.startsWith('/api/')) return `${origin}${path}`;
  if (path.startsWith('/')) return `${origin}${path}`;
  return `${origin}/${path}`;
}

/** Normalize GLOBAL_ACR / ACR / alliance → ACR */
export function logoKeyFromPlatform(raw: string): string {
  return (raw || '')
    .replace(/^GLOBAL_/i, '')
    .replace(/^TRI_/i, '')
    .split('_')[0]
    .trim()
    .toUpperCase();
}

export async function getSupplierLogos(): Promise<SupplierLogo[]> {
  const { data } = await api.get('/supplier-logos');
  return data || [];
}

export async function loadLogoMap(): Promise<LogoMap> {
  const list = await getSupplierLogos();
  const map: LogoMap = {};
  for (const logo of list) {
    if (!logo?.supplier_key || !logo.image_url) continue;
    const url = resolveImageUrl(logo.image_url);
    if (!url) continue;
    map[logo.supplier_key.toUpperCase()] = url;
  }
  return map;
}

export function useSupplierLogos() {
  const [logos, setLogos] = useState<LogoMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setLogos(await loadLogoMap());
    } catch {
      setLogos({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { logos, loading, reload };
}
