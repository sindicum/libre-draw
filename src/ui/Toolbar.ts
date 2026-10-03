import type { Map as MaplibreMap } from 'maplibre-gl';
import type { ToolbarOptions, ToolbarControls, InputMethod } from '../types/options';
import type { PartialStyleConfig } from '../types/style';
import type { Messages } from '../types/messages';
import { MESSAGES_EN } from './messages';
import { ToolbarButton } from './ToolbarButton';
import { drawPointIcon } from './icons/draw-point';
import { drawLineIcon } from './icons/draw-line';
import { drawPolygonIcon } from './icons/draw-polygon';
import { drawRectangleIcon } from './icons/draw-rectangle';
import { drawAngledRectangleIcon } from './icons/draw-angled-rectangle';
import { inputMethodIcon } from './icons/input-method';
import { selectIcon } from './icons/select';
import { splitIcon } from './icons/split';
import { cutIcon } from './icons/cut';
import { reshapeIcon } from './icons/reshape';
import { unionIcon } from './icons/union';
import { setbackIcon } from './icons/setback';
import { rotateIcon } from './icons/rotate';
import { settingsIcon } from './icons/settings';
import { deleteIcon } from './icons/delete';
import { undoIcon } from './icons/undo';
import { redoIcon } from './icons/redo';
import { SetbackInput } from './SetbackInput';
import { RotateInput } from './RotateInput';
import { UnionExecute } from './UnionExecute';
import { StylePanel } from './StylePanel';

/**
 * Default toolbar control visibility.
 */
const DEFAULT_CONTROLS: Required<ToolbarControls> = {
  drawPoint: true,
  drawLine: true,
  drawPolygon: true,
  drawRectangle: true,
  drawAngledRectangle: true,
  inputMethod: true,
  select: true,
  split: true,
  cut: true,
  reshape: true,
  union: true,
  setback: true,
  rotate: true,
  settings: true,
  delete: true,
  undo: true,
  redo: true,
};

/**
 * Callbacks that the Toolbar needs from the host application.
 */
export interface ToolbarCallbacks {
  onDrawPointClick(): void;
  onDrawLineClick(): void;
  onDrawPolygonClick(): void;
  onDrawRectangleClick(): void;
  onDrawAngledRectangleClick(): void;
  onInputMethodClick(): void;
  onSelectClick(): void;
  onSplitClick(): void;
  onCutClick(): void;
  onReshapeClick(): void;
  onUnionClick(): void;
  onUnionExecute(): void;
  onSetbackClick(): void;
  onSetbackExecute(distance: number): void;
  onSetbackDistanceChange(distance: number): void;
  onRotateClick(): void;
  onRotateExecute(angle: number): void;
  onRotateAngleChange(angle: number): void;
  onStyleChange(style: PartialStyleConfig): void;
  onDeleteClick(): void;
  onUndoClick(): void;
  onRedoClick(): void;
}

/**
 * Creates and manages the drawing toolbar UI.
 *
 * The toolbar is positioned on the map using MapLibre's control
 * container system. It creates one button per control enabled in
 * `ToolbarControls`. Button states are updated externally to reflect the
 * current mode and history state.
 */
export class Toolbar {
  private map: MaplibreMap;
  private container: HTMLDivElement;
  private buttonList: HTMLDivElement;
  private mountedInControlContainer = false;
  private popupAnchors: { row: HTMLElement; popup: HTMLElement }[] = [];
  private buttons: Map<string, ToolbarButton> = new Map();
  private setbackInput: SetbackInput | null = null;
  private rotateInput: RotateInput | null = null;
  private activeMode = 'idle';
  private rotateHasSelection = false;
  private unionExecute: UnionExecute | null = null;
  private unionSelectionCount = 0;
  private stylePanel: StylePanel | null = null;
  private stylePanelVisible = false;
  private handleOutsideClick: ((e: PointerEvent) => void) | null = null;
  private callbacks: ToolbarCallbacks;
  private options: ToolbarOptions;
  private messages: Messages;

  constructor(
    map: MaplibreMap,
    callbacks: ToolbarCallbacks,
    options: ToolbarOptions = {},
    messages: Messages = MESSAGES_EN
  ) {
    this.map = map;
    this.callbacks = callbacks;
    this.options = options;
    this.messages = messages;

    this.container = document.createElement('div');
    this.container.className = 'libre-draw-toolbar';
    this.applyContainerStyles();

    this.buttonList = document.createElement('div');
    this.buttonList.className = 'libre-draw-toolbar-buttons';
    this.applyButtonListStyles();
    this.buttonList.addEventListener('scroll', this.positionPopups, { passive: true });
    this.container.appendChild(this.buttonList);

    this.createButtons();
    this.mount();
    this.updateMaxHeight();
    this.map.on('resize', this.updateMaxHeight);
  }

  /**
   * Update the active mode displayed in the toolbar.
   * @param mode - The active mode name ('idle', 'draw-point', 'draw-line', 'draw-polygon',
   *   'draw-rectangle', 'draw-angled-rectangle', 'select', 'split', 'cut', 'reshape', 'union',
   *   'setback', 'rotate').
   */
  setActiveMode(mode: string): void {
    this.activeMode = mode;
    const drawPointBtn = this.buttons.get('draw-point');
    const drawLineBtn = this.buttons.get('draw-line');
    const drawPolygonBtn = this.buttons.get('draw-polygon');
    const drawRectangleBtn = this.buttons.get('draw-rectangle');
    const drawAngledRectangleBtn = this.buttons.get('draw-angled-rectangle');
    const selectBtn = this.buttons.get('select');
    const splitBtn = this.buttons.get('split');
    const cutBtn = this.buttons.get('cut');
    const reshapeBtn = this.buttons.get('reshape');
    const unionBtn = this.buttons.get('union');
    const setbackBtn = this.buttons.get('setback');
    const rotateBtn = this.buttons.get('rotate');

    if (drawPointBtn) {
      drawPointBtn.setActive(mode === 'draw-point');
    }
    if (drawLineBtn) {
      drawLineBtn.setActive(mode === 'draw-line');
    }
    if (drawPolygonBtn) {
      drawPolygonBtn.setActive(mode === 'draw-polygon');
    }
    if (drawRectangleBtn) {
      drawRectangleBtn.setActive(mode === 'draw-rectangle');
    }
    if (drawAngledRectangleBtn) {
      drawAngledRectangleBtn.setActive(mode === 'draw-angled-rectangle');
    }
    if (selectBtn) {
      selectBtn.setActive(mode === 'select');
    }
    if (splitBtn) {
      splitBtn.setActive(mode === 'split');
    }
    if (cutBtn) {
      cutBtn.setActive(mode === 'cut');
    }
    if (reshapeBtn) {
      reshapeBtn.setActive(mode === 'reshape');
    }
    if (unionBtn) {
      unionBtn.setActive(mode === 'union');
    }
    if (setbackBtn) {
      setbackBtn.setActive(mode === 'setback');
    }
    if (rotateBtn) {
      rotateBtn.setActive(mode === 'rotate');
    }
    if (this.setbackInput) {
      this.setbackInput.setVisible(mode === 'setback');
    }
    this.updateRotateInputVisibility();
    this.updateUnionExecuteVisibility();
    this.positionPopups();
  }

  /**
   * Show the input method on the toggle: pressed while the center reticle
   * is chosen. The facade calls this for every change, from the toggle or
   * from the public API, so the toolbar holds no state of its own.
   */
  setInputMethod(method: InputMethod): void {
    this.buttons.get('input-method')?.setActive(method === 'reticle');
  }

  /**
   * Tell the toolbar how many features are selected, for union mode. The
   * execute button is only shown while union mode is active and at least
   * two features are selected, the minimum a union needs.
   * @param count - Number of selected features.
   */
  setUnionSelectionCount(count: number): void {
    this.unionSelectionCount = count;
    this.updateUnionExecuteVisibility();
    this.positionPopups();
  }

  /**
   * Tell the toolbar whether rotate mode currently has a target selected.
   * The angle input is only shown while rotate mode is active and a feature
   * is selected, so both `setActiveMode` and this method funnel into the same
   * visibility check.
   * @param hasSelection - Whether a feature is selected in rotate mode.
   */
  setRotateSelection(hasSelection: boolean): void {
    this.rotateHasSelection = hasSelection;
    this.updateRotateInputVisibility();
    this.positionPopups();
  }

  /**
   * Update the undo/redo button states.
   * @param canUndo - Whether undo is available.
   * @param canRedo - Whether redo is available.
   */
  setHistoryState(canUndo: boolean, canRedo: boolean): void {
    const undoBtn = this.buttons.get('undo');
    const redoBtn = this.buttons.get('redo');

    if (undoBtn) {
      undoBtn.setDisabled(!canUndo);
    }
    if (redoBtn) {
      redoBtn.setDisabled(!canRedo);
    }
  }

  /**
   * Remove the toolbar from the map and clean up.
   */
  destroy(): void {
    this.map.off('resize', this.updateMaxHeight);
    if (this.setbackInput) {
      this.setbackInput.destroy();
      this.setbackInput = null;
    }
    if (this.rotateInput) {
      this.rotateInput.destroy();
      this.rotateInput = null;
    }
    if (this.unionExecute) {
      this.unionExecute.destroy();
      this.unionExecute = null;
    }
    if (this.handleOutsideClick) {
      document.removeEventListener('pointerdown', this.handleOutsideClick);
      this.handleOutsideClick = null;
    }
    if (this.stylePanel) {
      this.stylePanel.destroy();
      this.stylePanel = null;
    }
    for (const button of this.buttons.values()) {
      button.destroy();
    }
    this.buttons.clear();
    this.popupAnchors = [];
    this.container.remove();
  }

  /**
   * Show a setback distance set elsewhere (the public API) in the input
   * field. No-op when the setback control is hidden.
   * @param meters - Distance in meters.
   */
  setSetbackDistance(meters: number): void {
    this.setbackInput?.setDistance(meters);
  }

  /**
   * Create all toolbar buttons based on the configured controls.
   */
  private createButtons(): void {
    const controls: Required<ToolbarControls> = {
      ...DEFAULT_CONTROLS,
      ...this.options.controls,
    };

    if (controls.drawPoint) {
      this.addButton(
        'draw-point',
        drawPointIcon,
        this.messages.toolbarDrawPoint,
        () => {
          this.callbacks.onDrawPointClick();
        },
        true
      );
    }

    if (controls.drawLine) {
      this.addButton(
        'draw-line',
        drawLineIcon,
        this.messages.toolbarDrawLine,
        () => {
          this.callbacks.onDrawLineClick();
        },
        true
      );
    }

    if (controls.drawPolygon) {
      this.addButton(
        'draw-polygon',
        drawPolygonIcon,
        this.messages.toolbarDrawPolygon,
        () => {
          this.callbacks.onDrawPolygonClick();
        },
        true
      );
    }

    if (controls.drawRectangle) {
      this.addButton(
        'draw-rectangle',
        drawRectangleIcon,
        this.messages.toolbarDrawRectangle,
        () => {
          this.callbacks.onDrawRectangleClick();
        },
        true
      );
    }

    if (controls.drawAngledRectangle) {
      this.addButton(
        'draw-angled-rectangle',
        drawAngledRectangleIcon,
        this.messages.toolbarDrawAngledRectangle,
        () => {
          this.callbacks.onDrawAngledRectangleClick();
        },
        true
      );
    }

    if (controls.inputMethod) {
      this.addButton(
        'input-method',
        inputMethodIcon,
        this.messages.toolbarInputMethod,
        () => {
          this.callbacks.onInputMethodClick();
        },
        true
      );
    }

    if (controls.select) {
      this.addButton(
        'select',
        selectIcon,
        this.messages.toolbarSelect,
        () => {
          this.callbacks.onSelectClick();
        },
        true
      );
    }

    if (controls.split) {
      this.addButton(
        'split',
        splitIcon,
        this.messages.toolbarSplit,
        () => {
          this.callbacks.onSplitClick();
        },
        true
      );
    }

    if (controls.cut) {
      this.addButton(
        'cut',
        cutIcon,
        this.messages.toolbarCut,
        () => {
          this.callbacks.onCutClick();
        },
        true
      );
    }

    if (controls.reshape) {
      this.addButton(
        'reshape',
        reshapeIcon,
        this.messages.toolbarReshape,
        () => {
          this.callbacks.onReshapeClick();
        },
        true
      );
    }

    if (controls.union) {
      this.addUnionControl();
    }

    if (controls.setback) {
      this.addSetbackControl();
    }

    if (controls.rotate) {
      this.addRotateControl();
    }

    if (controls.delete) {
      this.addButton('delete', deleteIcon, this.messages.toolbarDelete, () => {
        this.callbacks.onDeleteClick();
      });
    }

    if (controls.undo) {
      this.addButton('undo', undoIcon, this.messages.toolbarUndo, () => {
        this.callbacks.onUndoClick();
      });
    }

    if (controls.redo) {
      this.addButton('redo', redoIcon, this.messages.toolbarRedo, () => {
        this.callbacks.onRedoClick();
      });
    }

    // Settings button is always last in the toolbar
    if (controls.settings) {
      this.addSettingsControl();
    }
  }

  /**
   * Create a button and add it to the toolbar.
   */
  private addButton(
    id: string,
    icon: string,
    title: string,
    onClick: () => void,
    isToggle?: boolean
  ): void {
    const button = new ToolbarButton({ id, icon, title, onClick, isToggle });
    this.buttons.set(id, button);
    const row = this.createControlRow();
    row.appendChild(button.getElement());
    this.buttonList.appendChild(row);
  }

  /**
   * Create setback toggle button + popup distance input.
   */
  private addSetbackControl(): void {
    const row = this.createControlRow();

    const button = new ToolbarButton({
      id: 'setback',
      icon: setbackIcon,
      title: this.messages.toolbarSetback,
      onClick: () => this.callbacks.onSetbackClick(),
      isToggle: true,
    });
    this.buttons.set('setback', button);
    row.appendChild(button.getElement());

    this.setbackInput = new SetbackInput(
      {
        onSubmit: (distance) => this.callbacks.onSetbackExecute(distance),
        onDistanceChange: (distance) => this.callbacks.onSetbackDistanceChange(distance),
      },
      this.messages
    );

    const position = this.options.position || 'top-right';
    const isRight = position === 'top-right' || position === 'bottom-right';
    this.setbackInput.setPosition(isRight ? 'left' : 'right');

    this.buttonList.appendChild(row);
    this.addPopup(row, this.setbackInput.getElement());
  }

  /**
   * Create rotate toggle button + popup angle input.
   */
  private addRotateControl(): void {
    const row = this.createControlRow();

    const button = new ToolbarButton({
      id: 'rotate',
      icon: rotateIcon,
      title: this.messages.toolbarRotate,
      onClick: () => this.callbacks.onRotateClick(),
      isToggle: true,
    });
    this.buttons.set('rotate', button);
    row.appendChild(button.getElement());

    this.rotateInput = new RotateInput(
      {
        onSubmit: (angle) => this.callbacks.onRotateExecute(angle),
        onAngleChange: (angle) => this.callbacks.onRotateAngleChange(angle),
      },
      this.messages
    );

    const position = this.options.position || 'top-right';
    const isRight = position === 'top-right' || position === 'bottom-right';
    this.rotateInput.setPosition(isRight ? 'left' : 'right');

    this.buttonList.appendChild(row);
    this.addPopup(row, this.rotateInput.getElement());
  }

  /**
   * Create union toggle button + popup execute button.
   */
  private addUnionControl(): void {
    const row = this.createControlRow();

    const button = new ToolbarButton({
      id: 'union',
      icon: unionIcon,
      title: this.messages.toolbarUnion,
      onClick: () => this.callbacks.onUnionClick(),
      isToggle: true,
    });
    this.buttons.set('union', button);
    row.appendChild(button.getElement());

    this.unionExecute = new UnionExecute(
      { onExecute: () => this.callbacks.onUnionExecute() },
      this.messages
    );

    const position = this.options.position || 'top-right';
    const isRight = position === 'top-right' || position === 'bottom-right';
    this.unionExecute.setPosition(isRight ? 'left' : 'right');

    this.buttonList.appendChild(row);
    this.addPopup(row, this.unionExecute.getElement());
  }

  /** Show the union execute button only while union mode has two or more selected. */
  private updateUnionExecuteVisibility(): void {
    if (!this.unionExecute) return;
    this.unionExecute.setVisible(this.activeMode === 'union' && this.unionSelectionCount >= 2);
  }

  /** Show the angle input only while rotate mode is active with a selection. */
  private updateRotateInputVisibility(): void {
    if (!this.rotateInput) return;
    this.rotateInput.setVisible(this.activeMode === 'rotate' && this.rotateHasSelection);
  }

  /**
   * Create settings toggle button + popup style panel.
   * The panel is attached to the toolbar container (not the button row)
   * so that its top edge aligns with the toolbar's top edge.
   */
  private addSettingsControl(): void {
    const row = this.createControlRow();
    const button = new ToolbarButton({
      id: 'settings',
      icon: settingsIcon,
      title: this.messages.toolbarSettings,
      onClick: () => {
        this.stylePanelVisible = !this.stylePanelVisible;
        if (this.stylePanel) {
          this.stylePanel.setVisible(this.stylePanelVisible);
        }
      },
    });
    this.buttons.set('settings', button);
    row.appendChild(button.getElement());
    this.buttonList.appendChild(row);

    this.stylePanel = new StylePanel(
      {
        onStyleChange: (style) => this.callbacks.onStyleChange(style),
      },
      this.messages
    );

    const position = this.options.position || 'top-right';
    const isRight = position === 'top-right' || position === 'bottom-right';
    this.stylePanel.setPosition(isRight ? 'left' : 'right');

    // Attach panel to toolbar container so top aligns with toolbar top
    this.container.appendChild(this.stylePanel.getElement());

    // Close panel when clicking outside of it and the settings button
    this.handleOutsideClick = (e: PointerEvent): void => {
      if (!this.stylePanelVisible || !this.stylePanel) return;
      const target = e.target as Node;
      const panelEl = this.stylePanel.getElement();
      const btnEl = button.getElement();
      if (!panelEl.contains(target) && !btnEl.contains(target)) {
        this.stylePanelVisible = false;
        this.stylePanel.setVisible(false);
      }
    };
    document.addEventListener('pointerdown', this.handleOutsideClick);
  }

  /**
   * Attach a popup to the toolbar container rather than to its button row:
   * the button list scrolls, and a scrolling element clips everything that
   * sticks out of it sideways, so the popup lives outside it and follows its
   * row through {@link positionPopups}.
   */
  private addPopup(row: HTMLElement, popup: HTMLElement): void {
    this.container.appendChild(popup);
    this.popupAnchors.push({ row, popup });
    this.positionPopups();
  }

  /**
   * Align each visible popup with the top of its button row, kept inside the
   * toolbar while the row is scrolled out of view.
   */
  private positionPopups = (): void => {
    const scrollTop = this.buttonList.scrollTop;
    const height = this.container.clientHeight;
    for (const { row, popup } of this.popupAnchors) {
      if (popup.style.display === 'none') continue;
      const top = row.offsetTop - scrollTop;
      const maxTop = Math.max(0, height - popup.offsetHeight);
      popup.style.top = `${Math.min(Math.max(top, 0), maxTop)}px`;
    }
  };

  /**
   * Cap the toolbar at the map height left over by the other controls in
   * the same corner, so the button list scrolls instead of running off the
   * map. Layout sizes (`offset*` / `client*`) are used rather than
   * `getBoundingClientRect`, which a CSS `transform: scale()` would skew.
   */
  private updateMaxHeight = (): void => {
    const mapHeight = this.map.getContainer().clientHeight;
    const parent = this.container.parentElement;
    if (mapHeight === 0 || !parent) return;
    const above = this.container.offsetTop;
    const below = this.mountedInControlContainer
      ? parent.clientHeight - above - this.container.offsetHeight
      : 0;
    this.container.style.maxHeight = `${Math.max(0, mapHeight - above - below)}px`;
    this.positionPopups();
  };

  /**
   * Create a single control row container.
   */
  private createControlRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    return row;
  }

  /**
   * Mount the toolbar container to the map's control container.
   */
  private mount(): void {
    const position = this.options.position || 'top-right';

    // MapLibre organizes controls into positioned containers
    const mapContainer = this.map.getContainer();
    const controlContainer = mapContainer.querySelector(`.maplibregl-ctrl-${position}`);

    if (controlContainer) {
      controlContainer.appendChild(this.container);
      this.mountedInControlContainer = true;
    } else {
      // Fallback: append to the map container directly
      mapContainer.appendChild(this.container);
    }
  }

  /**
   * Apply CSS styles to the toolbar container.
   */
  private applyContainerStyles(): void {
    const s = this.container.style;
    // The positioning context for the popups beside the button list.
    s.position = 'relative';
    s.display = 'flex';
    s.flexDirection = 'column';
    s.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    s.borderRadius = '4px';
    s.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.3)';
    s.zIndex = '1';
    // MapLibre's control containers have pointer-events: none;
    // controls need pointer-events: auto to receive clicks
    s.pointerEvents = 'auto';
  }

  /**
   * Apply CSS styles to the scrolling button list inside the container.
   */
  private applyButtonListStyles(): void {
    const s = this.buttonList.style;
    s.display = 'flex';
    s.flexDirection = 'column';
    s.gap = '4px';
    s.padding = '4px';
    // Lets the list shrink below its content height inside the capped container.
    s.minHeight = '0';
    s.overflowX = 'hidden';
    s.overflowY = 'auto';
    // Scrolling past either end does not carry over to the page.
    s.overscrollBehavior = 'contain';
  }
}
