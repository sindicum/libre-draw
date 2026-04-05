import type { LibreDrawFeature, Position } from '../types/features';

/**
 * A snap candidate found by the snap engine.
 */
export interface SnapTarget {
  /** The geographic position to snap to. */
  position: Position;
  /** Whether the snap is to a vertex or to an edge. */
  type: 'vertex' | 'edge';
  /** The ID of the feature being snapped to. */
  featureId: string;
  /** The pixel distance from the input point to the snap target. */
  distance: number;
}

/**
 * Options for snap target search.
 */
export interface SnapOptions {
  /** Snap distance threshold in screen pixels. */
  threshold: number;
  /** Feature ID to exclude from snap candidates (self-snap prevention). */
  excludeFeatureId?: string;
  /** Viewport bounds for pre-filtering features outside the visible area. */
  viewportBounds?: ViewportBounds;
}

/**
 * Geographic bounds of the current map viewport.
 */
export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

type ScreenPoint = { x: number; y: number };
type GetScreenPointFn = (lngLat: { lng: number; lat: number }) => ScreenPoint;

/**
 * Find the best snap target for a given geographic position.
 *
 * Search priority: vertex snap > edge snap.
 * Features outside the viewport bounds are skipped (if bounds are provided).
 *
 * @param lngLat - The geographic position to snap from.
 * @param features - All features to search for snap candidates.
 * @param getScreenPoint - Function to convert geographic coordinates to screen pixels.
 * @param options - Snap search options.
 * @returns The best snap target, or null if no candidate is within threshold.
 */
export function findSnapTarget(
  lngLat: { lng: number; lat: number },
  features: LibreDrawFeature[],
  getScreenPoint: GetScreenPointFn,
  options: SnapOptions,
): SnapTarget | null {
  const candidates = filterFeatures(features, options);
  if (candidates.length === 0) return null;

  const screenPoint = getScreenPoint(lngLat);

  // Vertex snap has priority over edge snap
  const vertexTarget = findNearestVertex(
    screenPoint,
    candidates,
    getScreenPoint,
    options.threshold,
  );
  if (vertexTarget) return vertexTarget;

  return findNearestEdge(
    screenPoint,
    lngLat,
    candidates,
    getScreenPoint,
    options.threshold,
  );
}

/**
 * Filter features by excludeFeatureId and viewport bounds.
 */
function filterFeatures(
  features: LibreDrawFeature[],
  options: SnapOptions,
): LibreDrawFeature[] {
  let result = features;

  if (options.excludeFeatureId) {
    result = result.filter((f) => f.id !== options.excludeFeatureId);
  }

  if (options.viewportBounds) {
    result = result.filter((f) =>
      isFeatureInBounds(f, options.viewportBounds!),
    );
  }

  return result;
}

/**
 * Check whether a feature's bounding box intersects the given viewport bounds.
 *
 * Uses a fast min/max scan over the outer ring coordinates.
 * No map.project() calls are needed.
 */
export function isFeatureInBounds(
  feature: LibreDrawFeature,
  bounds: ViewportBounds,
): boolean {
  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length === 0) return false;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const coord of ring) {
    if (coord[0] < minLng) minLng = coord[0];
    if (coord[0] > maxLng) maxLng = coord[0];
    if (coord[1] < minLat) minLat = coord[1];
    if (coord[1] > maxLat) maxLat = coord[1];
  }

  // AABB intersection test
  return (
    maxLng >= bounds.west &&
    minLng <= bounds.east &&
    maxLat >= bounds.south &&
    minLat <= bounds.north
  );
}

/**
 * Find the nearest vertex across all candidate features.
 */
function findNearestVertex(
  screenPoint: ScreenPoint,
  features: LibreDrawFeature[],
  getScreenPoint: GetScreenPointFn,
  threshold: number,
): SnapTarget | null {
  let best: SnapTarget | null = null;

  for (const feature of features) {
    const ring = feature.geometry.coordinates[0];
    // Exclude closing point (same as first vertex)
    const vertexCount = ring.length - 1;

    for (let i = 0; i < vertexCount; i++) {
      const vertexScreen = getScreenPoint({
        lng: ring[i][0],
        lat: ring[i][1],
      });
      const dist = pixelDistance(screenPoint, vertexScreen);

      if (dist <= threshold && (!best || dist < best.distance)) {
        best = {
          position: [ring[i][0], ring[i][1]],
          type: 'vertex',
          featureId: feature.id,
          distance: dist,
        };
      }
    }
  }

  return best;
}

/**
 * Find the nearest edge point across all candidate features.
 */
function findNearestEdge(
  screenPoint: ScreenPoint,
  lngLat: { lng: number; lat: number },
  features: LibreDrawFeature[],
  getScreenPoint: GetScreenPointFn,
  threshold: number,
): SnapTarget | null {
  let best: SnapTarget | null = null;

  for (const feature of features) {
    const ring = feature.geometry.coordinates[0];
    const vertexCount = ring.length - 1;

    for (let i = 0; i < vertexCount; i++) {
      const nextIdx = (i + 1) % vertexCount;
      const aScreen = getScreenPoint({ lng: ring[i][0], lat: ring[i][1] });
      const bScreen = getScreenPoint({
        lng: ring[nextIdx][0],
        lat: ring[nextIdx][1],
      });

      const projected = projectPointOnSegment(screenPoint, aScreen, bScreen);
      const dist = pixelDistance(screenPoint, projected);

      if (dist <= threshold && (!best || dist < best.distance)) {
        // Convert the projected screen point back to geographic coordinates.
        // We interpolate between the two edge endpoints using the parametric t.
        const aGeo = ring[i];
        const bGeo = ring[nextIdx];
        const t = computeParametricT(aScreen, bScreen, projected);
        const snapLng = aGeo[0] + t * (bGeo[0] - aGeo[0]);
        const snapLat = aGeo[1] + t * (bGeo[1] - aGeo[1]);

        best = {
          position: [snapLng, snapLat],
          type: 'edge',
          featureId: feature.id,
          distance: dist,
        };
      }
    }
  }

  return best;
}

/**
 * Project a point onto a line segment and return the closest point on the segment.
 *
 * Works in screen pixel coordinates.
 * If the projection falls outside the segment, it is clamped to the nearest endpoint.
 */
export function projectPointOnSegment(
  point: ScreenPoint,
  segStart: ScreenPoint,
  segEnd: ScreenPoint,
): ScreenPoint {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment (zero length)
  if (lenSq === 0) return { x: segStart.x, y: segStart.y };

  // Parametric position along the segment [0, 1]
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq),
  );

  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };
}

/**
 * Compute the parametric t value for a projected point on a segment.
 * Returns 0 at segStart and 1 at segEnd.
 */
function computeParametricT(
  segStart: ScreenPoint,
  segEnd: ScreenPoint,
  projected: ScreenPoint,
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((projected.x - segStart.x) * dx + (projected.y - segStart.y) * dy) / lenSq;
}

/**
 * Euclidean distance between two screen points.
 */
function pixelDistance(a: ScreenPoint, b: ScreenPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
