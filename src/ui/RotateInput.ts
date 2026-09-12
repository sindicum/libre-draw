export interface RotateInputCallbacks {
  onSubmit(angle: number): void;
  onAngleChange(angle: number): void;
}

/**
 * Default relative angle in degrees. A quarter turn is the most common
 * correction for a rectangle drawn axis-aligned.
 */
const DEFAULT_ANGLE_DEG = 90;
/** Largest absolute angle accepted: one full turn in either direction. */
const MAX_ANGLE_DEG = 360;
const EXECUTE_BUTTON_LABEL = '実行';

/**
 * Inline relative-angle input used by rotate mode.
 *
 * Mirrors SetbackInput: the value is validated on every input event, a valid
 * change previews via `onAngleChange`, and Enter / the execute button commit
 * via `onSubmit`. The value is kept after a commit so the same angle can be
 * applied repeatedly.
 */
export class RotateInput {
  private container: HTMLDivElement;
  private input: HTMLInputElement;
  private executeButton: HTMLButtonElement;
  private callbacks: RotateInputCallbacks;

  constructor(callbacks: RotateInputCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'libre-draw-rotate-input';
    this.applyContainerStyles();

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.min = String(-MAX_ANGLE_DEG);
    this.input.max = String(MAX_ANGLE_DEG);
    this.input.step = '1';
    this.input.value = String(DEFAULT_ANGLE_DEG);
    this.input.setAttribute('aria-label', 'Rotation angle in degrees');
    this.applyInputStyles();

    const unit = document.createElement('span');
    unit.textContent = '°';
    unit.style.fontSize = '12px';
    unit.style.color = '#333';

    this.executeButton = document.createElement('button');
    this.executeButton.type = 'button';
    this.executeButton.textContent = EXECUTE_BUTTON_LABEL;
    this.executeButton.setAttribute('aria-label', 'Execute rotation');
    this.applyButtonStyles();

    this.container.appendChild(this.input);
    this.container.appendChild(unit);
    this.container.appendChild(this.executeButton);

    this.input.addEventListener('input', this.handleInput);
    this.input.addEventListener('keydown', this.handleKeyDown);
    this.executeButton.addEventListener('click', this.handleExecute);

    this.setVisible(false);
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  /**
   * Current angle, or `null` when the field holds no acceptable value.
   */
  getAngle(): number | null {
    return this.parseAngle();
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'inline-flex' : 'none';
  }

  /**
   * Set the popup position relative to the rotate button.
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
    this.input.removeEventListener('input', this.handleInput);
    this.input.removeEventListener('keydown', this.handleKeyDown);
    this.executeButton.removeEventListener('click', this.handleExecute);
    this.container.remove();
  }

  private handleInput = (): void => {
    const angle = this.parseAngle();
    if (angle !== null) {
      this.callbacks.onAngleChange(angle);
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;

    const angle = this.parseAngle();
    if (angle !== null) {
      this.callbacks.onSubmit(angle);
    }
  };

  private handleExecute = (): void => {
    const angle = this.parseAngle();
    if (angle !== null) {
      this.callbacks.onSubmit(angle);
    }
  };

  /**
   * Parse the field. Empty, non-numeric and out-of-range values are `null`
   * so that nothing is previewed or committed from them. Zero is a valid
   * value: previewing it shows the unrotated shape.
   */
  private parseAngle(): number | null {
    if (this.input.value.trim() === '') return null;
    const value = Number(this.input.value);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ANGLE_DEG) {
      return null;
    }
    return value;
  }

  private applyContainerStyles(): void {
    const s = this.container.style;
    s.position = 'absolute';
    s.top = '0';
    s.display = 'inline-flex';
    s.alignItems = 'center';
    s.gap = '6px';
    s.padding = '4px 6px';
    s.background = 'rgba(255, 255, 255, 0.95)';
    s.border = '1px solid #d0d7de';
    s.borderRadius = '4px';
    s.pointerEvents = 'auto';
    s.whiteSpace = 'nowrap';
  }

  private applyInputStyles(): void {
    const s = this.input.style;
    s.width = '64px';
    s.height = '28px';
    s.border = '1px solid #c8c8c8';
    s.borderRadius = '4px';
    s.padding = '0 6px';
    s.fontSize = '12px';
  }

  private applyButtonStyles(): void {
    const s = this.executeButton.style;
    s.height = '28px';
    s.border = '1px solid #c8c8c8';
    s.borderRadius = '4px';
    s.background = '#fff';
    s.padding = '0 8px';
    s.cursor = 'pointer';
    s.fontSize = '12px';
  }
}
