import type { Map as MaplibreMap } from 'maplibre-gl';
import type { Messages } from '../types/messages';
import { MESSAGES_EN } from './messages';
import { addHover, paintHover } from './hover';

export interface ReticleOverlayCallbacks {
  onAddPoint(): void;
  onUndoVertex(): void;
  onFinish(): void;
}

/**
 * Which action bar buttons can do something right now.
 */
export interface ReticleActionState {
  canUndo: boolean;
  canFinish: boolean;
}

/**
 * Reticle size in CSS pixels (arm to arm). Much larger than the rotation
 * center marker (17px) so the two are not confused.
 */
const RETICLE_SIZE_PX = 80;

/**
 * A scope sight: a ring (radius 32) broken at the four compass points, a
 * short tick across each break, and a small dot on the exact point, all
 * black on a white halo. Nothing but the dot is drawn near the center, so
 * what is under the point stays visible; the ring and the colors keep it
 * apart from the small blue rotation center marker.
 */
const RETICLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${RETICLE_SIZE_PX}" height="${RETICLE_SIZE_PX}" fill="none" stroke-linecap="round"><g stroke="#ffffff" stroke-width="5"><path d="M71.41 46.11A32 32 0 0 1 46.11 71.41M33.89 71.41A32 32 0 0 1 8.59 46.11M8.59 33.89A32 32 0 0 1 33.89 8.59M46.11 8.59A32 32 0 0 1 71.41 33.89"/><path d="M40 3v12M40 65v12M3 40h12M65 40h12"/></g><g stroke="#1f2328" stroke-width="3"><path d="M71.41 46.11A32 32 0 0 1 46.11 71.41M33.89 71.41A32 32 0 0 1 8.59 46.11M8.59 33.89A32 32 0 0 1 33.89 8.59M46.11 8.59A32 32 0 0 1 71.41 33.89"/><path d="M40 3v12M40 65v12M3 40h12M65 40h12"/></g><circle cx="40" cy="40" r="2" fill="#1f2328" stroke="#ffffff" stroke-width="1"/></svg>`;

/**
 * The on-map UI of the center reticle input method: a crosshair fixed at
 * the center of the map and an action bar at the bottom center with the
 * "Undo point", "Add point" and "Finish" buttons (the main action in the
 * middle).
 *
 * Mounted directly on the map container rather than in the toolbar, so it
 * is available with `toolbar: false` too. The action bar sits at the bottom
 * center, away from the corners where the toolbar and the attribution live,
 * and below the reticle so the thumb that presses it does not cover the
 * point being placed.
 */
export class ReticleOverlay {
  private reticle: HTMLDivElement;
  private bar: HTMLDivElement;
  private undoButton: HTMLButtonElement;
  private addPointButton: HTMLButtonElement;
  private finishButton: HTMLButtonElement;
  private callbacks: ReticleOverlayCallbacks;

  constructor(
    map: MaplibreMap,
    callbacks: ReticleOverlayCallbacks,
    messages: Messages = MESSAGES_EN
  ) {
    this.callbacks = callbacks;

    this.reticle = document.createElement('div');
    this.reticle.className = 'libre-draw-reticle';
    this.reticle.setAttribute('aria-hidden', 'true');
    this.applyReticleStyles();
    const doc = new DOMParser().parseFromString(RETICLE_SVG, 'image/svg+xml');
    this.reticle.appendChild(document.importNode(doc.documentElement, true));

    this.bar = document.createElement('div');
    this.bar.className = 'libre-draw-reticle-bar';
    this.applyBarStyles();

    this.undoButton = this.createButton(messages.reticleUndoVertex, this.handleUndoVertex);
    this.addPointButton = this.createButton(messages.reticleAddPoint, this.handleAddPoint);
    this.finishButton = this.createButton(messages.reticleFinish, this.handleFinish);
    this.setActionState({ canUndo: false, canFinish: false });

    const container = map.getContainer();
    container.appendChild(this.reticle);
    container.appendChild(this.bar);

    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.reticle.style.display = visible ? 'block' : 'none';
    this.bar.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Enable or disable the buttons whose action depends on the draft.
   * "Add point" is always enabled while the bar is shown.
   */
  setActionState(state: ReticleActionState): void {
    this.setDisabled(this.undoButton, !state.canUndo);
    this.setDisabled(this.finishButton, !state.canFinish);
  }

  destroy(): void {
    this.undoButton.removeEventListener('click', this.handleUndoVertex);
    this.addPointButton.removeEventListener('click', this.handleAddPoint);
    this.finishButton.removeEventListener('click', this.handleFinish);
    this.reticle.remove();
    this.bar.remove();
  }

  private handleUndoVertex = (e: MouseEvent): void => {
    this.handleClick(e, () => this.callbacks.onUndoVertex());
  };

  private handleAddPoint = (e: MouseEvent): void => {
    this.handleClick(e, () => this.callbacks.onAddPoint());
  };

  private handleFinish = (e: MouseEvent): void => {
    this.handleClick(e, () => this.callbacks.onFinish());
  };

  private handleClick(e: MouseEvent, action: () => void): void {
    e.preventDefault();
    e.stopPropagation();
    action();
  }

  private createButton(label: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);
    this.applyButtonStyles(button);
    addHover(button);
    button.addEventListener('click', onClick);
    this.bar.appendChild(button);
    return button;
  }

  private setDisabled(button: HTMLButtonElement, disabled: boolean): void {
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.4' : '1';
    button.style.cursor = disabled ? 'not-allowed' : 'pointer';
    paintHover(button);
  }

  private applyReticleStyles(): void {
    const s = this.reticle.style;
    s.position = 'absolute';
    s.left = '50%';
    s.top = '50%';
    s.width = `${RETICLE_SIZE_PX}px`;
    s.height = `${RETICLE_SIZE_PX}px`;
    s.transform = 'translate(-50%, -50%)';
    // Purely visual: pans and pinches must reach the map through it.
    s.pointerEvents = 'none';
    s.zIndex = '2';
  }

  private applyBarStyles(): void {
    const s = this.bar.style;
    s.position = 'absolute';
    s.left = '50%';
    s.bottom = '36px';
    s.transform = 'translateX(-50%)';
    s.alignItems = 'center';
    s.gap = '8px';
    s.padding = '6px';
    s.background = 'rgba(255, 255, 255, 0.95)';
    s.border = '1px solid #d0d7de';
    s.borderRadius = '8px';
    s.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.2)';
    s.pointerEvents = 'auto';
    s.whiteSpace = 'nowrap';
    // Above the map canvas, level with MapLibre's control corners.
    s.zIndex = '2';
  }

  private applyButtonStyles(button: HTMLButtonElement): void {
    const s = button.style;
    // The touch target size (F-014): these are the only way to place,
    // take back and finish points while the reticle is in use.
    s.minWidth = '44px';
    s.height = '44px';
    s.padding = '0 16px';
    s.border = '1px solid #c8c8c8';
    s.borderRadius = '4px';
    s.background = '#fff';
    s.color = '#333';
    s.cursor = 'pointer';
    s.fontSize = '15px';
  }
}
