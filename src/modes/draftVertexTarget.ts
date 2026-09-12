import type { InputType } from '../types/input';
import type { Position } from '../types/features';
import { TOUCH_TAP_TOLERANCE_PX, pointerTravel } from '../input/gestures';

/**
 * A draft vertex (first or last placed vertex) hit by the pointer.
 */
export interface DraftVertexTarget {
  /** Index of the vertex within the draft. */
  index: number;
  /** Geographic position of the vertex. */
  position: Position;
  /** Screen distance in pixels from the pointer to the vertex. */
  distance: number;
}

/**
 * Options for {@link findDraftVertexTarget}.
 */
export interface DraftVertexTargetOptions {
  /** Whether the first vertex is a candidate (polygon closing). */
  includeFirst: boolean;
}

/**
 * Radius in pixels within which a click or tap counts as landing on a draft
 * vertex, which is how a line or polygon draft is finished.
 *
 * The radius follows the snap threshold so that the visual snap indicator
 * and the finish judgement agree. Touch gets the tap tolerance added on top
 * because a finger lands a few pixels off its target even on a deliberate tap.
 */
export function finishRadius(inputType: InputType, snapThreshold: number | undefined): number {
  const base = snapThreshold ?? 10;
  return inputType === 'touch' ? base + TOUCH_TAP_TOLERANCE_PX : base;
}

/**
 * Find the draft vertex under the pointer.
 *
 * Only the last placed vertex and, when `includeFirst` is set, the first
 * vertex are candidates: clicking either one is the position-based finish
 * gesture. When both are within `radius` the nearer one wins.
 *
 * @param point - Pointer position in screen pixels.
 * @param vertices - The draft vertices placed so far.
 * @param getScreenPoint - Converts geographic coordinates to screen pixels.
 * @param radius - Hit radius in pixels (see {@link finishRadius}).
 * @param options - Which vertices are candidates.
 * @returns The hit vertex, or `null` when the pointer is not on one.
 */
export function findDraftVertexTarget(
  point: { x: number; y: number },
  vertices: Position[],
  getScreenPoint: (lngLat: { lng: number; lat: number }) => { x: number; y: number },
  radius: number,
  options: DraftVertexTargetOptions
): DraftVertexTarget | null {
  if (vertices.length === 0) return null;

  const candidates = new Set<number>([vertices.length - 1]);
  if (options.includeFirst) candidates.add(0);

  let best: DraftVertexTarget | null = null;
  for (const index of candidates) {
    const vertex = vertices[index];
    const distance = pointerTravel(point, getScreenPoint({ lng: vertex[0], lat: vertex[1] }));
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { index, position: [vertex[0], vertex[1]], distance };
    }
  }
  return best;
}
