import React, { useEffect, useRef, useState } from 'react';
import { clusterItems } from '../map/cluster';
import { MapPoint } from '../map/types';

type Props = {
  points: MapPoint[];
  selectedCode?: string | null;
  onSelect: (code: string) => void;
};

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => void;
  getZoom: () => number;
  on: (event: string, fn: () => void) => void;
  off: (event: string, fn: () => void) => void;
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
};

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function ensureMapStyles() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (document.getElementById('adh-map-style')) return;
  const style = document.createElement('style');
  style.id = 'adh-map-style';
  style.textContent = `
    .leaflet-div-icon.adh-icon { background: transparent; border: none; }
    .adh-hit, .adh-bubble {
      width: 44px; height: 44px; padding: 0; margin: 0; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .adh-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #0B1F3A; border: 3px solid #F97316;
      box-shadow: 0 1px 4px rgba(0,0,0,.45);
    }
    .adh-hit.is-selected .adh-dot { background: #F97316; border-color: #fff; }
    .adh-bubble {
      border-radius: 22px; background: #F97316; color: #fff;
      font: 800 15px/1 system-ui, sans-serif;
      border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35);
    }
    .leaflet-control-zoom a {
      width: 44px !important; height: 44px !important;
      line-height: 44px !important; font-size: 20px !important;
    }
    .leaflet-container { font-family: system-ui, sans-serif; background: #dbe7f3; z-index: 1; }
    .leaflet-bottom.leaflet-right { margin: 0 12px 20px 0 !important; }
  `;
  document.head.appendChild(style);
}

export function FranceMap({ points, selectedCode, onSelect }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!host || mapRef.current) return undefined;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      ensureMapStyles();
      const leaflet = await import('leaflet');
      if (cancelled) return;
      const L = leaflet.default;
      map = L.map(host, {
        zoomControl: false,
        attributionControl: true,
        zoomSnap: 0.5,
      }) as unknown as LeafletMap;
      L.control.zoom({ position: 'bottomright' }).addTo(map as unknown as L.Map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map as unknown as L.Map);
      // Zoom 5.5 : la métropole tient dans un téléphone, les villes proches restent groupées.
      map.setView([46.6, 2.5], 5.5);
      groupRef.current = L.layerGroup().addTo(map as unknown as L.Map);
      mapRef.current = map;
      let fitted = false;
      const kick = () => {
        if (!map) return;
        map.invalidateSize();
        if (fitted) return;
        fitted = true;
        map.fitBounds([[41.2, -5.2], [51.15, 8.4]] as unknown as L.LatLngBoundsExpression, {
          padding: [18, 18],
          animate: false,
        });
      };
      requestAnimationFrame(kick);
      observer = new ResizeObserver(kick);
      observer.observe(host);
      host.dispatchEvent(new Event('adh-map-ready'));
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
  }, [host]);

  useEffect(() => {
    let detach: (() => void) | null = null;

    const draw = async () => {
      const map = mapRef.current;
      const group = groupRef.current;
      if (!map || !group) return;
      const leaflet = await import('leaflet');
      const L = leaflet.default;
      group.clearLayers();
      const zoom = map.getZoom();
      clusterItems(points, zoom).forEach((cluster) => {
        if (cluster.items.length === 1) {
          const point = cluster.items[0];
          const selected = point.code_union === selectedCode;
          const label = point.ville ? `${point.nom}, ${point.ville}` : point.nom;
          const icon = L.divIcon({
            className: 'leaflet-div-icon adh-icon',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            html: `<button type="button" class="adh-hit${selected ? ' is-selected' : ''}" data-code="${esc(point.code_union)}" aria-label="${esc(label)}"><span class="adh-dot"></span></button>`,
          });
          const marker = L.marker([point.lat, point.lng], { icon });
          marker.on('click', () => onSelectRef.current(point.code_union));
          group.addLayer(marker);
          return;
        }
        const icon = L.divIcon({
          className: 'leaflet-div-icon adh-icon',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          html: `<button type="button" class="adh-bubble" aria-label="${cluster.items.length} adhérents, zoomer pour les séparer">${cluster.items.length}</button>`,
        });
        const marker = L.marker([cluster.lat, cluster.lng], { icon });
        marker.on('click', () => {
          const bounds = L.latLngBounds(cluster.items.map((item) => [item.lat, item.lng] as [number, number]));
          map.fitBounds(bounds.pad(0.6), { maxZoom: Math.min(map.getZoom() + 3, 16), animate: true });
        });
        group.addLayer(marker);
      });
    };

    const bind = () => {
      const map = mapRef.current;
      if (!map) return;
      const onZoom = () => {
        draw();
      };
      map.on('zoomend', onZoom);
      detach = () => map.off('zoomend', onZoom);
      draw();
    };

    if (mapRef.current) bind();
    else if (host) host.addEventListener('adh-map-ready', bind);

    return () => {
      detach?.();
      host?.removeEventListener('adh-map-ready', bind);
    };
  }, [host, points, selectedCode]);

  return React.createElement('div', {
    ref: setHost,
    style: { position: 'absolute', inset: 0 },
  });
}
