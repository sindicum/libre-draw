import { difference } from '@turf/difference';
import { featureCollection, polygon as turfPolygon } from '@turf/helpers';
import type { LibreDrawFeature, Position } from '../types/features';
import type { CutFailReason } from '../types/events';
import { hasRingSelfIntersection } from '../validation/intersection';
import { cloneProperties } from './featureSnapshot';
import { createFeatureId } from './id';

/**
 * Relative area difference below which a cut is taken to have removed
 * nothing (the cutter only touches the target, or misses it).
 */
const AREA_EPSILON = 1e-9;

/**
 * Outcome of {@link cutPolygon}: the pieces that remain, or why the cut
 * could not be made.
 *
 * `keepsId` is true when one piece remains; it then carries the target's
 * id, while several pieces get fresh ids.
 */
export type CutResult =
  | { type: 'success'; features: LibreDrawFeature[]; keepsId: boolean }
  | { type: 'error'; reason: CutFailReason };

/**
 * Check a cutter ring and close it: at least three distinct vertices and
 * no self-intersection. The closing position may be omitted.
 * @returns The closed ring, or `null` if it is not a usable polygon ring.
 */
export function normalizeCutterRing(ring: readonly Position[]): Position[] | null {
  if (!Array.isArray(ring)) return null;
  for (const position of ring) {
    if (
      !Array.isArray(position) ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
      return null;
    }
  }

  const closed: Position[] = ring.map((position) => [position[0], position[1]]);
  const first = closed[0];
  const last = closed[closed.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    closed.push([first[0], first[1]]);
  }

  const distinct = new Set(closed.slice(0, -1).map((position) => `${position[0]},${position[1]}`));
  if (distinct.size < 3 || hasRingSelfIntersection(closed)) return null;
  return closed;
}

/** Copy a ring into fresh `Position` tuples, closing it if the engine left it open. */
function normalizeRing(ring: number[][]): Position[] {
  const positions: Position[] = ring.map((coordinate) => [coordinate[0], coordinate[1]]);
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    positions.push([first[0], first[1]]);
  }
  return positions;
}

/**
 * Planar shoelace area of a closed ring, in squared degrees (only compared).
 * Computed relative to the ring's first vertex: cross products of absolute
 * longitudes and latitudes lose the area of a small ring far from the
 * origin to rounding (as the setback orientation test once did).
 */
function ringArea(ring: readonly number[][]): number {
  if (ring.length < 4) return 0;
  const [originX, originY] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i][0] - originX;
    const ay = ring[i][1] - originY;
    const bx = ring[i + 1][0] - originX;
    const by = ring[i + 1][1] - originY;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}

/** Area of a polygon: its outer ring minus its holes. */
function polygonArea(rings: readonly (readonly number[][])[]): number {
  return rings.reduce((area, ring, i) => area + (i === 0 ? 1 : -1) * ringArea(ring), 0);
}

/**
 * Remove the area of `cutterRing` from a polygon.
 *
 * Depending on how the cutter lies over the target, the result is the
 * target with a new hole (cutter fully inside), a target with a notch in
 * its outer ring (cutter across the boundary), or several pieces (cutter
 * cutting it apart). Existing holes are kept, and the engine's result is
 * taken as is where the cutter meets them (a hole grows, or holes merge).
 * One piece keeps the target's id; several pieces get fresh ids and a copy
 * of its properties each. A MultiPolygon is never produced.
 *
 * The cutter must already be a valid closed ring (see
 * {@link normalizeCutterRing}). Never throws: an engine failure is
 * `invalid-result`.
 */
export function cutPolygon(target: LibreDrawFeature, cutterRing: Position[]): CutResult {
  if (target.geometry.type !== 'Polygon') {
    return { type: 'error', reason: 'invalid-result' };
  }
  const targetRings = target.geometry.coordinates;

  let result: ReturnType<typeof difference>;
  try {
    result = difference(featureCollection([turfPolygon(targetRings), turfPolygon([cutterRing])]));
  } catch {
    return { type: 'error', reason: 'invalid-result' };
  }

  if (!result) {
    return { type: 'error', reason: 'empty-result' };
  }

  const polygons: number[][][][] =
    result.geometry.type === 'Polygon'
      ? [result.geometry.coordinates]
      : result.geometry.coordinates;
  if (polygons.length === 0) {
    return { type: 'error', reason: 'empty-result' };
  }

  const before = polygonArea(targetRings);
  const after = polygons.reduce((area, rings) => area + polygonArea(rings), 0);
  if (Math.abs(before - after) <= AREA_EPSILON * before) {
    return { type: 'error', reason: 'no-overlap' };
  }

  const keepsId = polygons.length === 1;
  const features: LibreDrawFeature[] = polygons.map((rings) => ({
    id: keepsId ? target.id : createFeatureId(),
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings.map(normalizeRing) },
    properties: cloneProperties(target.properties),
  }));
  return { type: 'success', features, keepsId };
}
