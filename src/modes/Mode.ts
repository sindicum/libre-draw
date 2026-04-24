import type { NormalizedInputEvent } from '../types/input';

/**
 * Map interaction settings that a mode requires while active.
 */
export interface MapInteractionConfig {
  dragPan: boolean;
  doubleClickZoom: boolean;
}

/**
 * Interface that all drawing modes must implement.
 *
 * Each mode handles user input differently and can maintain
 * its own internal state. Modes are activated and deactivated
 * by the ModeManager during transitions.
 */
export interface Mode {
  /** Map interaction settings required by this mode. */
  mapInteractions(): MapInteractionConfig;

  /** Called when the mode becomes active. */
  activate(): void;

  /** Called when the mode is deactivated. */
  deactivate(): void;

  /** Handle a pointer down (mouse click or touch start). */
  onPointerDown(event: NormalizedInputEvent): void;

  /** Handle pointer movement. */
  onPointerMove(event: NormalizedInputEvent): void;

  /** Handle pointer up (mouse release or touch end). */
  onPointerUp(event: NormalizedInputEvent): void;

  /** Handle a double-click or double-tap. */
  onDoubleClick(event: NormalizedInputEvent): void;

  /** Handle a long press (touch hold). */
  onLongPress(event: NormalizedInputEvent): void;

  /** Handle a key down event. */
  onKeyDown(key: string, event: KeyboardEvent): void;
}

/**
 * Marker interface for modes that maintain an in-progress draft
 * of vertices (polygon/line drawing).
 *
 * Modes implementing this interface expose programmatic control
 * over the draft lifecycle, enabling external UIs (buttons, etc.)
 * to finalize or cancel drawing without relying on pointer gestures.
 */
export interface DraftCapableMode extends Mode {
  /**
   * Finalize the current draft into a feature.
   * @returns `true` on success, `false` when the draft cannot be
   *   finalized (insufficient vertices, self-intersection, inactive).
   */
  finishDrawing(): boolean;

  /**
   * Discard the current draft without creating a feature.
   * Mode stays active so the user can start a new draft.
   */
  cancelDrawing(): void;

  /**
   * @returns The number of vertices in the current draft.
   *   `0` when the mode is inactive.
   */
  getDraftVertexCount(): number;
}

/**
 * Type guard that checks whether a mode implements DraftCapableMode.
 */
export function isDraftCapableMode(
  mode: Mode | undefined,
): mode is DraftCapableMode {
  if (!mode) return false;
  const candidate = mode as Partial<DraftCapableMode>;
  return (
    typeof candidate.finishDrawing === 'function' &&
    typeof candidate.cancelDrawing === 'function' &&
    typeof candidate.getDraftVertexCount === 'function'
  );
}
