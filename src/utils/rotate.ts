import type { LibreDrawFeature, Position } from '../types/features';

/**
 * A point in screen or Web Mercator space (x right, y down).
 */
export interface PlanarPoint {
  x: number;
  y: number;
}

/**
 * Convert a geographic position to normalized Web Mercator coordinates.
 *
 * x grows east and y grows south, so the frame has the same orientation as
 * the screen. Mercator is conformal, so rotating here keeps the on-screen
 * shape of a feature intact at any zoom, unlike rotating in lng/lat space,
 * which squashes shapes away from the equator.
 */
export function toMercator(position: Position): PlanarPoint {
  const lng = position[0];
  const lat = position[1];
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

/**
 * Convert normalized Web Mercator coordinates back to a geographic position.
 */
export function fromMercator(point: PlanarPoint): Position {
  const lng = point.x * 360 - 180;
  const lat = (Math.atan(Math.exp((0.5 - point.y) * 2 * Math.PI)) * 360) / Math.PI - 90;
  return [lng, lat];
}

/** Plain average of points; the fallback for degenerate (zero-area / zero-length) shapes. */
function meanPoint(points: PlanarPoint[]): PlanarPoint {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Area centroid of a closed ring (shoelace formula).
 * Falls back to the vertex mean when the ring encloses no area.
 */
function ringCentroid(ring: PlanarPoint[]): PlanarPoint {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (twiceArea === 0) {
    return meanPoint(ring.slice(0, ring.length - 1));
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/**
 * Length-weighted centroid of an open polyline.
 * Falls back to the vertex mean when every segment has zero length.
 */
function polylineCentroid(points: PlanarPoint[]): PlanarPoint {
  let total = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    total += length;
    cx += ((a.x + b.x) / 2) * length;
    cy += ((a.y + b.y) / 2) * length;
  }
  if (total === 0) {
    return meanPoint(points);
  }
  return { x: cx / total, y: cy / total };
}

/**
 * Centroid of the feature in Mercator space: the area centroid of a polygon's
 * outer ring, or the length-weighted centroid of a line.
 *
 * A centroid is used rather than the bounding box center because it is
 * invariant under rotation about itself, so the pivot stays put no matter
 * how many times an irregular shape is turned. A bounding box is always
 * axis-aligned and its center wanders as the shape rotates. Measured in
 * Mercator (visual) space so the axis sits where the user sees the shape.
 */
function getMercatorCenter(feature: LibreDrawFeature): PlanarPoint {
  if (feature.geometry.type === 'Polygon') {
    return ringCentroid(feature.geometry.coordinates[0].map(toMercator));
  }
  if (feature.geometry.type === 'LineString') {
    return polylineCentroid(feature.geometry.coordinates.map(toMercator));
  }
  throw new Error(`Expected Polygon or LineString geometry, got ${feature.geometry.type}`);
}

/**
 * Rotation axis of a feature as a geographic position (its centroid).
 * @throws Error when the feature is a Point.
 */
export function getRotationCenter(feature: LibreDrawFeature): { lng: number; lat: number } {
  const [lng, lat] = fromMercator(getMercatorCenter(feature));
  return { lng, lat };
}

/**
 * Create a new feature rotated around its centroid.
 *
 * @param feature - Polygon or LineString feature.
 * @param angleDeg - Rotation angle in degrees; positive turns clockwise on screen.
 * @returns A new feature with every vertex rotated. Properties and id are kept.
 * @throws Error when the feature is a Point.
 */
export function rotateFeature(feature: LibreDrawFeature, angleDeg: number): LibreDrawFeature {
  const center = getMercatorCenter(feature);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // With y pointing down, this matrix turns clockwise for a positive angle,
  // matching the map bearing convention used by the numeric input.
  const rotate = (position: Position): Position => {
    const { x, y } = toMercator(position);
    const dx = x - center.x;
    const dy = y - center.y;
    return fromMercator({
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    });
  };

  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        type: 'Polygon',
        coordinates: feature.geometry.coordinates.map((ring) => ring.map(rotate)),
      },
    };
  }

  if (feature.geometry.type === 'LineString') {
    return {
      ...feature,
      geometry: {
        type: 'LineString',
        coordinates: feature.geometry.coordinates.map(rotate),
      },
    };
  }

  throw new Error(`Expected Polygon or LineString geometry, got ${feature.geometry.type}`);
}

/**
 * Signed angle in degrees from the ray `center -> from` to the ray `center -> to`.
 *
 * Works in a y-down frame (screen or Mercator), so a positive result means the
 * pointer moved clockwise around the center. Normalized to (-180, 180].
 */
export function angleBetween(center: PlanarPoint, from: PlanarPoint, to: PlanarPoint): number {
  const fromAngle = Math.atan2(from.y - center.y, from.x - center.x);
  const toAngle = Math.atan2(to.y - center.y, to.x - center.x);
  return normalizeAngle(((toAngle - fromAngle) * 180) / Math.PI);
}

/**
 * Normalize an angle in degrees to the range (-180, 180].
 */
export function normalizeAngle(angleDeg: number): number {
  let angle = angleDeg % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

/**
 * Round an angle to the nearest multiple of `stepDeg`.
 */
export function snapAngle(angleDeg: number, stepDeg: number): number {
  return Math.round(angleDeg / stepDeg) * stepDeg;
}

/**
 * Whether rotating by this angle leaves the shape unchanged (a multiple of 360°).
 * Such angles are ignored by the mode so that they never reach the history.
 */
export function isNoRotation(angleDeg: number): boolean {
  return angleDeg % 360 === 0;
}
