import React, { useEffect, useRef, useState } from 'react';
import { clusterItems } from '../map/cluster';
import { FranceMapProps } from '../map/chrome';
import {
  HIT_PX,
  caExtent,
  clusterPreview,
  commercialPalette,
  markerDiameter,
  pointColor,
} from '../map/markerStyle';
import { MapPoint } from '../map/types';

const FRANCE_BOUNDS: [[number, number], [number, number]] = [[41.2, -5.2], [51.15, 8.4]];

// Carto Positron renvoie désormais une tuile « API KEY REQUIRED ».
// Esri Light/Dark Gray est le fond sobre gratuit équivalent, avec attribution.
// L'ordre Esri est {z}/{y}/{x}.
const TILES = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
};

const ATTRIBUTION = '&copy; Esri, HERE, Garmin, FAO, NOAA, USGS';

let departmentsData: unknown = null;
let departmentsPromise: Promise<unknown> | null = null;

function loadDepartments() {
  if (departmentsData) return Promise.resolve(departmentsData);
  if (!departmentsPromise) {
    departmentsPromise = fetch('/departements.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => {
        departmentsData = data;
        return data;
      })
      .catch((error) => {
        departmentsPromise = null;
        throw error;
      });
  }
  return departmentsPromise;
}

function departmentStyle(dark: boolean) {
  return {
    color: dark ? '#cbd5e1' : '#1e293b',
    weight: 1.1,
    opacity: dark ? 0.7 : 0.75,
    fillOpacity: 0,
  };
}

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
      padding: 0; margin: 0; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .adh-hit { width: ${HIT_PX}px; height: ${HIT_PX}px; }
    .adh-dot {
      display: block; border-radius: 50%; border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, .55), 0 1px 3px rgba(0, 0, 0, .35);
    }
    .adh-hit.is-selected .adh-dot { box-shadow: 0 0 0 3px #F97316, 0 0 0 5px #fff; }
    .adh-bubble {
      width: 44px; height: 44px; border-radius: 22px; background: #F97316; color: #fff;
      font: 800 15px/1 system-ui, sans-serif;
      border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35);
    }
    .adh-me {
      display: block; width: 16px; height: 16px; border-radius: 50%;
      background: #2563EB; border: 2px solid #fff;
      box-shadow: 0 0 0 6px rgba(37, 99, 235, .28);
    }
    .leaflet-control-zoom a {
      width: 44px !important; height: 44px !important;
      line-height: 44px !important; font-size: 20px !important;
    }
    .leaflet-container.adh-map { font-family: system-ui, sans-serif; background: #e4e4e4; z-index: 1; }
    .leaflet-container.adh-map.is-dark { background: #2b2b2b; }
    .leaflet-bottom.leaflet-right { margin: 0 8px var(--adh-dock, 12px) 0 !important; }
    .leaflet-bottom.leaflet-left { margin: 0 0 var(--adh-dock, 12px) 8px !important; }
    .leaflet-control-attribution { font-size: 11px; background: rgba(255,255,255,.85); }
  `;
  document.head.appendChild(style);
}

function pointLabel(point: MapPoint) {
  return point.ville ? `${point.nom}, ${point.ville}` : point.nom;
}

export function FranceMap({
  points,
  selectedCode,
  onSelect,
  onBackgroundPress,
  onCluster,
  colorMode = 'plateforme',
  basemap = 'light',
  showDepartments = false,
  locateRequest = 0,
  fitRequest = 0,
  fitTarget = 'france',
  zoomRequest = 0,
  zoomCodes = [],
  dockBottom = 12,
  onLocateMessage,
  onDepartmentMessage,
}: FranceMapProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const mapRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const tilesRef = useRef<any>(null);
  const deptRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const onBackgroundRef = useRef(onBackgroundPress);
  const onClusterRef = useRef(onCluster);
  const onLocateMessageRef = useRef(onLocateMessage);
  const onDepartmentMessageRef = useRef(onDepartmentMessage);
  const pointsRef = useRef(points);
  const basemapRef = useRef(basemap);
  const dockRef = useRef(dockBottom);
  onSelectRef.current = onSelect;
  onBackgroundRef.current = onBackgroundPress;
  onClusterRef.current = onCluster;
  onLocateMessageRef.current = onLocateMessage;
  onDepartmentMessageRef.current = onDepartmentMessage;
  pointsRef.current = points;
  basemapRef.current = basemap;
  dockRef.current = dockBottom;

  useEffect(() => {
    if (!host || mapRef.current) return undefined;
    let cancelled = false;
    let map: any = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      ensureMapStyles();
      const leaflet = await import('leaflet');
      if (cancelled) return;
      const L = leaflet.default;
      host.classList.add('adh-map');
      map = L.map(host, {
        zoomControl: false,
        attributionControl: true,
        zoomSnap: 0.5,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const kind = basemapRef.current === 'dark' ? 'dark' : 'light';
      host.classList.toggle('is-dark', kind === 'dark');
      tilesRef.current = L.tileLayer(TILES[kind], {
        maxZoom: 18,
        maxNativeZoom: 16,
        attribution: ATTRIBUTION,
      }).addTo(map);
      map.setView([46.6, 2.5], 5.5);
      groupRef.current = L.layerGroup().addTo(map);
      map.on('click', (event: any) => {
        const target = event?.originalEvent?.target as HTMLElement | undefined;
        if (target?.closest?.('.leaflet-control, .adh-hit, .adh-bubble')) return;
        onBackgroundRef.current?.();
      });
      mapRef.current = map;
      let fitted = false;
      const kick = () => {
        if (!map) return;
        map.invalidateSize();
        if (fitted) return;
        fitted = true;
        map.fitBounds(FRANCE_BOUNDS, {
          paddingTopLeft: [16, 88],
          paddingBottomRight: [16, Math.max(28, dockRef.current)],
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
      tilesRef.current = null;
      deptRef.current = null;
      userRef.current = null;
    };
  }, [host]);

  useEffect(() => {
    if (host) host.style.setProperty('--adh-dock', `${Math.max(0, dockBottom)}px`);
  }, [host, dockBottom]);

  useEffect(() => {
    let detach: (() => void) | null = null;
    let generation = 0;

    const draw = async () => {
      const map = mapRef.current;
      const group = groupRef.current;
      if (!map || !group) return;
      const gen = ++generation;
      const leaflet = await import('leaflet');
      if (gen !== generation) return;
      const L = leaflet.default;
      group.clearLayers();
      const palette = commercialPalette(points.map((point) => point.commercial));
      const extent = caExtent(points.map((point) => point.ca));
      const zoom = map.getZoom();
      clusterItems(points, zoom).forEach((cluster) => {
        if (cluster.items.length === 1) {
          const point = cluster.items[0];
          const selected = point.code_union === selectedCode;
          const size = markerDiameter(point.ca, extent);
          const color = pointColor(point, colorMode, palette);
          const icon = L.divIcon({
            className: 'leaflet-div-icon adh-icon',
            iconSize: [HIT_PX, HIT_PX],
            iconAnchor: [HIT_PX / 2, HIT_PX / 2],
            html: `<button type="button" class="adh-hit${selected ? ' is-selected' : ''}" aria-label="${esc(pointLabel(point))}"><span class="adh-dot" style="width:${size}px;height:${size}px;background:${color}"></span></button>`,
          });
          const marker = L.marker([point.lat, point.lng], { icon });
          marker.on('click', (event: any) => {
            event?.originalEvent?.stopPropagation?.();
            onSelectRef.current(point.code_union);
          });
          group.addLayer(marker);
          return;
        }
        const preview = clusterPreview(cluster.items);
        const icon = L.divIcon({
          className: 'leaflet-div-icon adh-icon',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          html: `<button type="button" class="adh-bubble" aria-label="${preview.count} adhérents, voir le détail avant de zoomer">${preview.count}</button>`,
        });
        const marker = L.marker([cluster.lat, cluster.lng], { icon });
        marker.on('click', (event: any) => {
          event?.originalEvent?.stopPropagation?.();
          if (onClusterRef.current) onClusterRef.current(preview);
          else {
            const bounds = L.latLngBounds(cluster.items.map((item) => [item.lat, item.lng]));
            map.fitBounds(bounds.pad(0.6), { maxZoom: Math.min(map.getZoom() + 3, 16), animate: true });
          }
        });
        group.addLayer(marker);
      });
    };

    const bind = () => {
      const map = mapRef.current;
      if (!map) return;
      const onZoom = () => { draw(); };
      map.on('zoomend', onZoom);
      detach = () => map.off('zoomend', onZoom);
      draw();
    };

    if (mapRef.current) bind();
    else if (host) host.addEventListener('adh-map-ready', bind);

    return () => {
      generation += 1;
      detach?.();
      host?.removeEventListener('adh-map-ready', bind);
    };
  }, [host, points, selectedCode, colorMode]);

  useEffect(() => {
    let cancel = false;
    const apply = async () => {
      const map = mapRef.current;
      if (!map || !host) return;
      const leaflet = await import('leaflet');
      if (cancel) return;
      const L = leaflet.default;
      const kind = basemap === 'dark' ? 'dark' : 'light';
      host.classList.toggle('is-dark', kind === 'dark');
      if (!tilesRef.current) {
        tilesRef.current = L.tileLayer(TILES[kind], {
          maxZoom: 18,
          maxNativeZoom: 16,
          attribution: ATTRIBUTION,
        }).addTo(map);
      } else {
        tilesRef.current.setUrl(TILES[kind]);
      }
      if (deptRef.current) deptRef.current.setStyle(departmentStyle(kind === 'dark'));
    };
    if (mapRef.current) apply();
    else if (host) host.addEventListener('adh-map-ready', apply);
    return () => {
      cancel = true;
      host?.removeEventListener('adh-map-ready', apply);
    };
  }, [basemap, host]);

  useEffect(() => {
    let cancel = false;
    const apply = async () => {
      const map = mapRef.current;
      if (!map) return;
      if (!showDepartments) {
        if (deptRef.current) {
          map.removeLayer(deptRef.current);
          deptRef.current = null;
        }
        onDepartmentMessageRef.current?.(null);
        return;
      }
      onDepartmentMessageRef.current?.('Chargement des contours…');
      try {
        const data = await loadDepartments();
        if (cancel || !mapRef.current) return;
        const leaflet = await import('leaflet');
        const L = leaflet.default;
        if (deptRef.current) map.removeLayer(deptRef.current);
        deptRef.current = L.geoJSON(data as any, {
          style: departmentStyle(basemapRef.current === 'dark'),
          interactive: false,
        }).addTo(map);
        deptRef.current.bringToBack();
        tilesRef.current?.bringToBack?.();
        onDepartmentMessageRef.current?.(null);
      } catch {
        if (!cancel) onDepartmentMessageRef.current?.('Contours des départements indisponibles.');
      }
    };
    if (mapRef.current) apply();
    else if (host) host.addEventListener('adh-map-ready', apply);
    return () => {
      cancel = true;
      host?.removeEventListener('adh-map-ready', apply);
    };
  }, [showDepartments, host]);

  useEffect(() => {
    if (!locateRequest) return undefined;
    let cancel = false;
    const run = async () => {
      const map = mapRef.current;
      if (!map || cancel) return;
      const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
      if (!geo) {
        onLocateMessageRef.current?.('La géolocalisation n’est pas disponible dans ce navigateur.');
        return;
      }
      geo.getCurrentPosition(
        async (position) => {
          if (cancel || !mapRef.current) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const leaflet = await import('leaflet');
          const L = leaflet.default;
          mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 12));
          if (userRef.current) mapRef.current.removeLayer(userRef.current);
          const icon = L.divIcon({
            className: 'leaflet-div-icon adh-icon',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            html: '<span class="adh-me" aria-label="Votre position"></span>',
          });
          userRef.current = L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(mapRef.current);
          onLocateMessageRef.current?.(null);
        },
        (error) => {
          if (cancel) return;
          const denied = error.code === 1 || /denied|permission|refus/i.test(error.message || '');
          if (denied) {
            onLocateMessageRef.current?.('Localisation refusée. Autorisez la position du navigateur pour afficher où vous êtes.');
            return;
          }
          onLocateMessageRef.current?.('Position indisponible pour le moment.');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    };
    if (mapRef.current) run();
    else if (host) host.addEventListener('adh-map-ready', run);
    return () => {
      cancel = true;
      host?.removeEventListener('adh-map-ready', run);
    };
  }, [locateRequest, host]);

  useEffect(() => {
    if (!fitRequest) return undefined;
    const run = () => {
      const map = mapRef.current;
      if (!map) return;
      const target = fitTarget;
      const current = pointsRef.current;
      if (target === 'points' && current.length > 0) {
        if (current.length === 1) {
          map.setView([current[0].lat, current[0].lng], 11);
          return;
        }
        let south = 90;
        let north = -90;
        let west = 180;
        let east = -180;
        current.forEach((point) => {
          south = Math.min(south, point.lat);
          north = Math.max(north, point.lat);
          west = Math.min(west, point.lng);
          east = Math.max(east, point.lng);
        });
        map.fitBounds([[south, west], [north, east]], {
          paddingTopLeft: [28, 88],
          paddingBottomRight: [28, Math.max(36, dockRef.current)],
          maxZoom: 12,
          animate: true,
        });
        return;
      }
      map.fitBounds(FRANCE_BOUNDS, {
        paddingTopLeft: [16, 88],
        paddingBottomRight: [16, Math.max(28, dockRef.current)],
        animate: true,
      });
    };
    if (mapRef.current) run();
    else if (host) host.addEventListener('adh-map-ready', run);
    return () => host?.removeEventListener('adh-map-ready', run);
  }, [fitRequest, fitTarget, host]);

  useEffect(() => {
    if (!zoomRequest || zoomCodes.length === 0) return undefined;
    const run = () => {
      const map = mapRef.current;
      if (!map) return;
      const wanted = new Set(zoomCodes);
      const items = pointsRef.current.filter((point) => wanted.has(point.code_union));
      if (!items.length) return;
      if (items.length === 1) {
        map.setView([items[0].lat, items[0].lng], Math.min(map.getZoom() + 3, 14));
        return;
      }
      let south = 90;
      let north = -90;
      let west = 180;
      let east = -180;
      items.forEach((point) => {
        south = Math.min(south, point.lat);
        north = Math.max(north, point.lat);
        west = Math.min(west, point.lng);
        east = Math.max(east, point.lng);
      });
      map.fitBounds([[south, west], [north, east]], {
        padding: [48, 48],
        maxZoom: Math.min(map.getZoom() + 3, 16),
        animate: true,
      });
    };
    if (mapRef.current) run();
    else if (host) host.addEventListener('adh-map-ready', run);
    return () => host?.removeEventListener('adh-map-ready', run);
  }, [zoomRequest, zoomCodes, host]);

  return React.createElement('div', {
    ref: setHost,
    style: { position: 'absolute', inset: 0 },
  });
}
