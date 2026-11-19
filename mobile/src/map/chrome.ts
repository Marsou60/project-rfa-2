import { ClusterPreview, ColorMode } from './markerStyle';
import { MapPoint } from './types';

export type BasemapId = 'light' | 'dark';
export type FitTarget = 'france' | 'points';

export type FranceMapProps = {
  points: MapPoint[];
  selectedCode?: string | null;
  onSelect: (code: string) => void;
  onBackgroundPress?: () => void;
  onCluster?: (preview: ClusterPreview) => void;
  colorMode?: ColorMode;
  basemap?: BasemapId;
  showDepartments?: boolean;
  locateRequest?: number;
  fitRequest?: number;
  fitTarget?: FitTarget;
  zoomRequest?: number;
  zoomCodes?: string[];
  dockBottom?: number;
  onLocateMessage?: (message: string | null) => void;
  onDepartmentMessage?: (message: string | null) => void;
};
