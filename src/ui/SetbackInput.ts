export interface SetbackInputCallbacks {
  onSubmit(distance: number): void;
  onDistanceChange(distance: number): void;
}

const DEFAULT_DISTANCE_METERS = 10;
const EXECUTE_BUTTON_LABEL = '実行';

/**
 * Inline distance input used by setback mode.
 */
export class SetbackInput {
  private container: HTMLDivElement;
  private input: HTMLInputElement;
  private executeButton: HTMLButtonElement;
  private callbacks: SetbackInputCallbacks;

  constructor(callbacks: SetbackInputCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.className = 'libre-draw-setback-input';
    this.applyContainerStyles();

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.min = '0.1';
    this.input.step = '0.1';
    this.input.value = String(DEFAULT_DISTANCE_METERS);
    this.input.setAttribute('aria-label', 'Setback distance in meters');
    this.applyInputStyles();

    const unit = document.createElement('span');
    unit.textContent = 'm';
    unit.style.fontSize = '12px';
    unit.style.color = '#333';

    this.executeButton = document.createElement('button');
    this.executeButton.type = 'button';
    this.executeButton.textContent = EXECUTE_BUTTON_LABEL;
    this.executeButton.setAttribute('aria-label', 'Execute setback');
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

  getDistance(): number {
    return this.parseDistance() ?? DEFAULT_DISTANCE_METERS;
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'inline-flex' : 'none';
  }

  destroy(): void {
    this.input.removeEventListener('input', this.handleInput);
    this.input.removeEventListener('keydown', this.handleKeyDown);
    this.executeButton.removeEventListener('click', this.handleExecute);
    this.container.remove();
  }

  private handleInput = (): void => {
    const distance = this.parseDistance();
    if (distance !== null) {
      this.callbacks.onDistanceChange(distance);
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;

    const distance = this.parseDistance();
    if (distance !== null) {
      this.callbacks.onSubmit(distance);
    }
  };

  private handleExecute = (): void => {
    const distance = this.parseDistance();
    if (distance !== null) {
      this.callbacks.onSubmit(distance);
    }
  };

  private parseDistance(): number | null {
    const value = Number(this.input.value);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }

  private applyContainerStyles(): void {
    const s = this.container.style;
    s.display = 'inline-flex';
    s.alignItems = 'center';
    s.gap = '6px';
    s.marginLeft = '8px';
    s.padding = '4px 6px';
    s.background = 'rgba(255, 255, 255, 0.95)';
    s.border = '1px solid #d0d7de';
    s.borderRadius = '4px';
    s.pointerEvents = 'auto';
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
