import type { Messages } from '../types/messages';
import { MESSAGES_EN } from './messages';

export interface UnionExecuteCallbacks {
  onExecute(): void;
}

/**
 * Inline execute button used by union mode.
 *
 * Laid out like RotateInput (a popup beside the mode button) but without a
 * field: the polygons to merge are the selection, so the button only
 * triggers the merge. It is the way to run a union where there is no
 * Enter key, such as on touch devices.
 */
export class UnionExecute {
  private container: HTMLDivElement;
  private executeButton: HTMLButtonElement;
  private callbacks: UnionExecuteCallbacks;

  constructor(callbacks: UnionExecuteCallbacks, messages: Messages = MESSAGES_EN) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'libre-draw-union-execute';
    this.applyContainerStyles();

    this.executeButton = document.createElement('button');
    this.executeButton.type = 'button';
    this.executeButton.textContent = messages.unionExecute;
    this.executeButton.setAttribute('aria-label', messages.unionExecuteLabel);
    this.applyButtonStyles();

    this.container.appendChild(this.executeButton);
    this.executeButton.addEventListener('click', this.handleExecute);

    this.setVisible(false);
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'inline-flex' : 'none';
  }

  /**
   * Set the popup position relative to the union button.
   * @param side - 'left' to appear on the left, 'right' to appear on the right.
   */
  setPosition(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.container.style.right = '100%';
      this.container.style.left = '';
      this.container.style.marginRight = '8px';
      this.container.style.marginLeft = '';
    } else {
      this.container.style.left = '100%';
      this.container.style.right = '';
      this.container.style.marginLeft = '8px';
      this.container.style.marginRight = '';
    }
  }

  destroy(): void {
    this.executeButton.removeEventListener('click', this.handleExecute);
    this.container.remove();
  }

  private handleExecute = (): void => {
    this.callbacks.onExecute();
  };

  private applyContainerStyles(): void {
    const s = this.container.style;
    s.position = 'absolute';
    s.top = '0';
    s.display = 'inline-flex';
    s.alignItems = 'center';
    s.padding = '4px 6px';
    s.background = 'rgba(255, 255, 255, 0.95)';
    s.border = '1px solid #d0d7de';
    s.borderRadius = '4px';
    s.pointerEvents = 'auto';
    s.whiteSpace = 'nowrap';
  }

  private applyButtonStyles(): void {
    const s = this.executeButton.style;
    // The toolbar's touch target size: on touch devices this button is the
    // only way to run a union, so it must be as easy to hit as the toolbar.
    s.minWidth = '44px';
    s.height = '44px';
    s.border = '1px solid #c8c8c8';
    s.borderRadius = '4px';
    s.background = '#fff';
    s.padding = '0 8px';
    s.cursor = 'pointer';
    s.fontSize = '14px';
  }
}
