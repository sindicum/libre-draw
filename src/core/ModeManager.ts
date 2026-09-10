import type { Mode } from '../modes/Mode';
import type { ModeName } from '../types/mode';
export type { ModeName } from '../types/mode';

/**
 * Manages the active drawing mode and handles transitions between modes.
 *
 * When switching modes, the current mode is deactivated and the new mode
 * is activated. A callback is invoked on mode changes so the LibreDraw
 * facade can emit the appropriate event.
 */
export class ModeManager {
  private modes: Map<ModeName, Mode> = new Map();
  private currentModeName: ModeName = 'idle';
  private onModeChange?: (mode: ModeName, previousMode: ModeName) => void;

  /**
   * Register a mode implementation.
   * @param name - The mode name.
   * @param mode - The mode implementation.
   */
  registerMode(name: ModeName, mode: Mode): void {
    this.modes.set(name, mode);
  }

  /**
   * Set a callback to be invoked on mode changes.
   * @param callback - The callback receiving (newMode, previousMode).
   */
  setOnModeChange(callback: (mode: ModeName, previousMode: ModeName) => void): void {
    this.onModeChange = callback;
  }

  /**
   * Switch to a new mode.
   * Deactivates the current mode and activates the new one.
   * @param name - The mode to switch to.
   */
  setMode(name: ModeName): void {
    if (name === this.currentModeName) {
      return;
    }

    const previousMode = this.currentModeName;
    const current = this.modes.get(this.currentModeName);
    if (current) {
      current.deactivate();
    }

    this.currentModeName = name;
    const next = this.modes.get(name);
    if (next) {
      next.activate();
    }

    if (this.onModeChange) {
      this.onModeChange(name, previousMode);
    }
  }

  /**
   * Get the current mode name.
   * @returns The active mode name.
   */
  getMode(): ModeName {
    return this.currentModeName;
  }

  /**
   * Get the current mode implementation.
   * @returns The active Mode object, or undefined.
   */
  getCurrentMode(): Mode | undefined {
    return this.modes.get(this.currentModeName);
  }
}
