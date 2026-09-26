import { BRAND_COLOR } from '../types/style';
import { HOVER_COLOR } from './hover';

/**
 * Options for creating a toolbar button.
 */
export interface ToolbarButtonOptions {
  /** The unique identifier for this button. */
  id: string;
  /** The SVG icon string to display. */
  icon: string;
  /** Tooltip text for the button. */
  title: string;
  /** Click handler callback. */
  onClick: () => void;
  /** Whether this is a toggle button (draw/select) vs. action button (delete/undo/redo). */
  isToggle?: boolean;
}

/**
 * Creates and manages a single toolbar button DOM element.
 *
 * Supports active and disabled states for visual feedback.
 * All DOM creation uses createElement for security (no innerHTML).
 */
export class ToolbarButton {
  private element: HTMLButtonElement;
  private iconContainer: HTMLSpanElement;
  private options: ToolbarButtonOptions;
  private isActive = false;
  private isHovered = false;

  constructor(options: ToolbarButtonOptions) {
    this.options = options;
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.title = options.title;
    this.element.setAttribute('aria-label', options.title);
    this.element.dataset.libreDrawButton = options.id;

    // Apply base styles
    this.applyStyles();

    // Create icon container
    this.iconContainer = document.createElement('span');
    this.iconContainer.style.display = 'flex';
    this.iconContainer.style.alignItems = 'center';
    this.iconContainer.style.justifyContent = 'center';
    this.setIcon(options.icon);
    this.element.appendChild(this.iconContainer);

    // Hover feedback for the mouse only: a touch device fires pointer
    // events for a tap too, and the tint would stay after the finger lifts.
    this.element.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.isHovered = true;
      this.applyColors();
    });
    this.element.addEventListener('pointerleave', () => {
      this.isHovered = false;
      this.applyColors();
    });

    // Attach click handler
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.element.disabled) {
        options.onClick();
      }
    });
  }

  /**
   * Get the DOM element for this button.
   */
  getElement(): HTMLButtonElement {
    return this.element;
  }

  /**
   * Set the active state of the button.
   * @param active - Whether the button should appear active.
   */
  setActive(active: boolean): void {
    this.isActive = active;
    this.applyColors();
    this.element.setAttribute('aria-pressed', String(active));
  }

  /**
   * Set the disabled state of the button.
   * @param disabled - Whether the button should be disabled.
   */
  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
    this.element.style.opacity = disabled ? '0.4' : '1';
    this.element.style.cursor = disabled ? 'not-allowed' : 'pointer';
    this.applyColors();
  }

  /**
   * Clean up the button element.
   */
  destroy(): void {
    this.element.remove();
  }

  /**
   * Color the button for its state: MapLibre's brand blue while active, a
   * pale tint of it under the mouse. An active button keeps its
   * blue under the mouse so the current mode stays readable; a disabled one
   * shows no hover because clicking it does nothing.
   */
  private applyColors(): void {
    const s = this.element.style;
    if (this.isActive) {
      s.backgroundColor = BRAND_COLOR;
      s.color = '#ffffff';
    } else {
      s.backgroundColor = this.isHovered && !this.element.disabled ? HOVER_COLOR : '#ffffff';
      s.color = '#333333';
    }
  }

  /**
   * Set the icon SVG content using DOM parsing (no innerHTML).
   */
  private setIcon(svgString: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svg = doc.documentElement;
    // Clear existing children
    while (this.iconContainer.firstChild) {
      this.iconContainer.removeChild(this.iconContainer.firstChild);
    }
    this.iconContainer.appendChild(document.importNode(svg, true));
  }

  /**
   * Apply the base CSS styles to the button.
   */
  private applyStyles(): void {
    const s = this.element.style;
    s.display = 'flex';
    s.alignItems = 'center';
    s.justifyContent = 'center';
    // 44px minimum for mobile touch targets
    s.width = '44px';
    s.height = '44px';
    s.padding = '0';
    s.margin = '0';
    s.border = '1px solid #ddd';
    s.borderRadius = '4px';
    s.backgroundColor = '#ffffff';
    s.color = '#333333';
    s.cursor = 'pointer';
    s.outline = 'none';
    s.transition = 'background-color 0.15s, color 0.15s';
    s.boxSizing = 'border-box';
  }
}
