import type { LibreDrawEventMap } from '../types/events';
import type { Action, LibreDrawFeature, Position } from '../types/features';
import type { SnapConfig } from '../types/options';
import type { ViewportBounds } from '../utils/snap';

/**
 * Shared dependencies injected into modes.
 */
export interface ModeContext {
  store: {
    add(feature: LibreDrawFeature): LibreDrawFeature;
    update(id: string, feature: LibreDrawFeature): void;
    remove(id: string): LibreDrawFeature | undefined;
    getById(id: string): LibreDrawFeature | undefined;
    getAll(): LibreDrawFeature[];
  };
  history: {
    push(action: Action): void;
  };
  events: {
    emit<K extends keyof LibreDrawEventMap>(
      type: K,
      payload: LibreDrawEventMap[K],
    ): void;
  };
  render: {
    renderFeatures(): void;
    renderPreview(coordinates: Position[]): void;
    clearPreview(): void;
    renderEdgeHighlight(coordinates: Position[]): void;
    clearEdgeHighlight(): void;
    renderVertices(
      vertices: Position[],
      midpoints: Position[],
      highlightIndex?: number,
    ): void;
    clearVertices(): void;
    setSelectedIds(ids: string[]): void;
    renderSnapIndicator(position: Position): void;
    clearSnapIndicator(): void;
  };
  getScreenPoint(lngLat: { lng: number; lat: number }): { x: number; y: number };
  setDragPan(enabled: boolean): void;
  getSetbackDistance(): number;
  getSnapConfig(): SnapConfig;
  getViewportBounds(): ViewportBounds;
}
