/**
 * Shared gesture thresholds for normalized input.
 *
 * These live outside `TouchInput` / `MouseInput` because modes need the same
 * values to classify the normalized events they receive: a pointer up that
 * arrives after {@link LONG_PRESS_MS} belongs to a long press, not to a tap,
 * and one that arrives beyond {@link clickTolerance} belongs to a drag,
 * not to a click.
 */

import type { InputType } from '../types/input';

/**
 * Long press detection threshold in milliseconds.
 */
export const LONG_PRESS_MS = 500;

/**
 * Maximum movement (in pixels) allowed during a long press.
 */
export const LONG_PRESS_TOLERANCE = 15;

/**
 * Maximum pointer travel, in pixels, between pointer down and pointer up
 * that still counts as a mouse click rather than a drag.
 */
export const MOUSE_CLICK_TOLERANCE_PX = 3;

/**
 * Maximum finger travel, in pixels, between touch start and touch end that
 * still counts as a tap. Larger than the mouse tolerance because a finger
 * always wobbles a few pixels on a deliberate tap.
 */
export const TOUCH_TAP_TOLERANCE_PX = 12;

/**
 * Click/tap travel tolerance for an input type.
 *
 * Modes that finalize on pointer up share this so that "how far the pointer
 * may move and still count as a click" stays consistent across the library.
 */
export function clickTolerance(inputType: InputType): number {
  return inputType === 'touch' ? TOUCH_TAP_TOLERANCE_PX : MOUSE_CLICK_TOLERANCE_PX;
}

/**
 * Screen-space distance in pixels between two pointer positions.
 */
export function pointerTravel(
  from: { x: number; y: number },
  to: { x: number; y: number }
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}
