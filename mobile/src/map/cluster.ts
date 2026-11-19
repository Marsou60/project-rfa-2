export type ClusterInput = { lat: number; lng: number };

export type Cluster<T extends ClusterInput> = {
  lat: number;
  lng: number;
  items: T[];
};

/** À partir de ce zoom, chaque adhérent a son propre point. */
export const SEPARATE_ZOOM = 13;

function project(lat: number, lng: number, zoom: number) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(sin, -0.9999), 0.9999);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Regroupe les points proches en cases écran. Plus on zoome, plus les cases
 * rétrécissent : les bulles se séparent.
 */
export function clusterItems<T extends ClusterInput>(
  items: T[],
  zoom: number,
  radiusPx = 48,
): Cluster<T>[] {
  if (zoom >= SEPARATE_ZOOM) {
    return items.map((item) => ({ lat: item.lat, lng: item.lng, items: [item] }));
  }
  const buckets = new Map<string, T[]>();
  items.forEach((item) => {
    const { x, y } = project(item.lat, item.lng, zoom);
    const key = `${Math.floor(x / radiusPx)}:${Math.floor(y / radiusPx)}`;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  });
  return Array.from(buckets.values()).map((group) => {
    const lat = group.reduce((sum, item) => sum + item.lat, 0) / group.length;
    const lng = group.reduce((sum, item) => sum + item.lng, 0) / group.length;
    return { lat, lng, items: group };
  });
}
