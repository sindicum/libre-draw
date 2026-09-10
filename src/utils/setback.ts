import destination from '@turf/destination';
import { point as turfPoint } from '@turf/helpers';
import type { Position } from '../types/features';

const EPSILON = 1e-10;

export interface EdgeHit {
  edgeIndex: number;
  distance: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

function pointToSegmentDistance(
  point: ScreenPoint,
  segmentStart: ScreenPoint,
  segmentEnd: ScreenPoint
): number {
  const abX = segmentEnd.x - segmentStart.x;
  const abY = segmentEnd.y - segmentStart.y;
  const apX = point.x - segmentStart.x;
  const apY = point.y - segmentStart.y;

  const denom = abX * abX + abY * abY;
  if (denom < EPSILON) {
    const dx = point.x - segmentStart.x;
    const dy = point.y - segmentStart.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / denom));
  const closestX = segmentStart.x + abX * t;
  const closestY = segmentStart.y + abY * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

function signedArea(vertices: Position[]): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    area += vertices[i][0] * vertices[next][1] - vertices[next][0] * vertices[i][1];
  }
  return area / 2;
}

/**
 * Find nearest polygon edge in screen space.
 */
export function findNearestEdge(
  vertices: Position[],
  clickPoint: ScreenPoint,
  threshold: number,
  getScreenPoint: (lngLat: { lng: number; lat: number }) => ScreenPoint
): EdgeHit | null {
  if (vertices.length < 2) return null;

  let minDistance = Infinity;
  let minIndex = -1;

  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;

    const a = getScreenPoint({ lng: vertices[i][0], lat: vertices[i][1] });
    const b = getScreenPoint({ lng: vertices[next][0], lat: vertices[next][1] });

    const dist = pointToSegmentDistance(clickPoint, a, b);
    if (dist <= threshold && dist < minDistance) {
      minDistance = dist;
      minIndex = i;
    }
  }

  if (minIndex < 0) return null;
  return {
    edgeIndex: minIndex,
    distance: minDistance,
  };
}

/**
 * Compute inward unit normal for a CCW polygon edge.
 */
export function computeInwardNormal(
  edgeStart: Position,
  edgeEnd: Position,
  polygonVertices?: Position[]
): Position {
  const dX = edgeEnd[0] - edgeStart[0];
  const dY = edgeEnd[1] - edgeStart[1];
  const length = Math.sqrt(dX * dX + dY * dY);

  if (length < EPSILON) {
    throw new Error('Edge length is too small to compute normal');
  }

  // For CCW winding, inward normal is (-dy, dx).
  // For CW winding, inward normal is the opposite direction.
  const base: Position = [-dY / length, dX / length];
  if (!polygonVertices || polygonVertices.length < 3) {
    return base;
  }

  const area = signedArea(polygonVertices);
  if (Math.abs(area) < EPSILON) {
    return base;
  }

  return area > 0 ? base : ([-base[0], -base[1]] as Position);
}

/**
 * Offset both endpoints of an edge by a distance (meters) along inward normal.
 */
export function computeOffsetLine(
  edgeStart: Position,
  edgeEnd: Position,
  distanceMeters: number,
  inwardNormal: Position
): [Position, Position] {
  const bearing = (Math.atan2(inwardNormal[0], inwardNormal[1]) * 180) / Math.PI;
  const distanceKm = distanceMeters / 1000;

  const startOffset = destination(turfPoint(edgeStart), distanceKm, bearing, {
    units: 'kilometers',
  });
  const endOffset = destination(turfPoint(edgeEnd), distanceKm, bearing, { units: 'kilometers' });

  return [startOffset.geometry.coordinates as Position, endOffset.geometry.coordinates as Position];
}

/**
 * Extend a line in both directions by a ratio of its own length.
 */
export function extendLine(start: Position, end: Position, ratio: number): [Position, Position] {
  const dX = end[0] - start[0];
  const dY = end[1] - start[1];

  return [
    [start[0] - dX * ratio, start[1] - dY * ratio],
    [end[0] + dX * ratio, end[1] + dY * ratio],
  ];
}
