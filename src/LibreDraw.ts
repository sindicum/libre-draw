import type { Map as MaplibreMap } from 'maplibre-gl';
import type {
  LibreDrawFeature,
  FeatureCollection,
  LibreDrawEventMap,
  LibreDrawOptions,
  ToolbarOptions,
  SnapConfig,
  StyleConfig,
  PartialStyleConfig,
} from './types';
import { mergeStyleConfig } from './types/style';
import type { Action } from './types/features';
import {
  DeleteAction,
  CreateAction,
  UpdateAction,
  SplitAction,
  SetbackAction,
  BatchAction,
} from './types/features';
import { EventBus } from './core/EventBus';
import { FeatureStore } from './core/FeatureStore';
import { HistoryManager } from './core/HistoryManager';
import { ModeManager } from './core/ModeManager';
import type { ModeContext } from './core/ModeContext';
import type { ModeName } from './types/mode';
import { LibreDrawError } from './core/errors';
import { validateGeoJSON, validateFeature } from './validation/geojson';
import { IdleMode } from './modes/IdleMode';
import { DrawMode } from './modes/DrawMode';
import { DrawPointMode } from './modes/DrawPointMode';
import { DrawLineMode } from './modes/DrawLineMode';
import { SelectMode } from './modes/SelectMode';
import { SplitMode } from './modes/SplitMode';
import { SetbackMode } from './modes/SetbackMode';
import type { MapInteractionConfig } from './modes/Mode';
import { isDraftCapableMode } from './modes/Mode';
import { InputHandler } from './input/InputHandler';
import { SourceManager } from './rendering/SourceManager';
import { RenderManager } from './rendering/RenderManager';
import { Toolbar } from './ui/Toolbar';
import { cloneFeature } from './utils/featureSnapshot';

/**
 * LibreDraw - A MapLibre GL JS polygon drawing and editing library.
 *
 * This is the main facade class that wires together all internal modules
 * (event bus, feature store, history, modes, input, rendering, toolbar)
 * and exposes a clean public API.
 *
 * @example
 * ```ts
 * const draw = new LibreDraw(map, { toolbar: true });
 * draw.setMode('draw');
 * draw.on('create', (e) => console.log('Created:', e.feature));
 * ```
 */
export class LibreDraw {
  private map: MaplibreMap;
  private eventBus: EventBus;
  private featureStore: FeatureStore;
  private historyManager: HistoryManager;
  private modeManager: ModeManager;
  private inputHandler: InputHandler;
  private sourceManager: SourceManager;
  private renderManager: RenderManager;
  private toolbar: Toolbar | null = null;
  private selectMode: SelectMode;
  private setbackMode: SetbackMode;
  private snapConfig: SnapConfig;
  private destroyed = false;
  private inputEnabled = false;

  private handleStyleData = (): void => {
    if (this.destroyed || !this.map.isStyleLoaded()) return;
    if (this.renderManager.isReadyForCurrentStyle()) return;

    this.renderManager.initialize();
    this.renderAllFeatures();

    if (this.modeManager.getMode() === 'select') {
      this.selectMode.refreshVertexHandles();
    } else {
      this.renderManager.clearVertices();
    }
  };

  /**
   * Create a new LibreDraw instance attached to a MapLibre GL JS map.
   *
   * Initializes all internal modules and sets up map integration.
   * The instance is ready to use once the map's style is loaded.
   *
   * @param map - The MapLibre GL JS map instance to draw on.
   * @param options - Configuration options. Defaults to toolbar enabled,
   *   100-action history limit, and snap enabled with 10px threshold.
   *
   * @example
   * ```ts
   * const draw = new LibreDraw(map);
   * // Or with options:
   * const draw = new LibreDraw(map, {
   *   toolbar: { position: 'top-right' },
   *   historyLimit: 50,
   *   snap: { threshold: 15 },
   * });
   * // Disable snapping:
   * const draw = new LibreDraw(map, { snap: false });
   * ```
   */
  constructor(map: MaplibreMap, options: LibreDrawOptions = {}) {
    this.map = map;

    // Core modules
    this.eventBus = new EventBus();
    this.featureStore = new FeatureStore();
    this.historyManager = new HistoryManager(options.historyLimit ?? 100);
    this.modeManager = new ModeManager();

    // Snap configuration
    this.snapConfig = this.normalizeSnapConfig(options.snap);

    // Rendering
    this.sourceManager = new SourceManager(map);
    this.renderManager = new RenderManager(
      map,
      this.sourceManager,
      options.style,
    );

    // Mode setup
    const modeContext: ModeContext = {
      store: {
        add: (feature) => this.featureStore.add(feature),
        update: (id, feature) => this.featureStore.update(id, feature),
        remove: (id) => this.featureStore.remove(id),
        getById: (id) => this.featureStore.getById(id),
        getAll: () => this.featureStore.getAll(),
      },
      history: {
        push: (action) => {
          this.historyManager.push(action);
          this.updateToolbarHistoryState();
        },
      },
      events: {
        emit: (type, payload) => this.eventBus.emit(type, payload),
      },
      render: {
        renderFeatures: () => this.renderAllFeatures(),
        renderPreview: (coords) => this.renderManager.renderPreview(coords),
        clearPreview: () => this.renderManager.clearPreview(),
        renderEdgeHighlight: (coords) =>
          this.renderManager.renderEdgeHighlight(coords),
        clearEdgeHighlight: () => this.renderManager.clearEdgeHighlight(),
        renderVertices: (vertices, midpoints, highlightIndex, midpointHighlightIndex) =>
          this.renderManager.renderVertices(vertices, midpoints, highlightIndex, midpointHighlightIndex),
        clearVertices: () => this.renderManager.clearVertices(),
        setSelectedIds: (ids) => this.renderManager.setSelectedIds(ids),
        renderSnapIndicator: (pos) =>
          this.renderManager.renderSnapIndicator(pos),
        clearSnapIndicator: () => this.renderManager.clearSnapIndicator(),
      },
      getScreenPoint: (lngLat) => {
        const pt = map.project([lngLat.lng, lngLat.lat]);
        return { x: pt.x, y: pt.y };
      },
      setDragPan: (enabled) => {
        if (enabled) {
          map.dragPan.enable();
        } else {
          map.dragPan.disable();
        }
      },
      getSetbackDistance: () => this.toolbar?.getSetbackDistance() ?? 10,
      getSnapConfig: () => this.snapConfig,
      getViewportBounds: () => {
        const bounds = map.getBounds();
        return {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        };
      },
    };

    const drawPointMode = new DrawPointMode(modeContext);
    const drawLineMode = new DrawLineMode(modeContext);
    const drawMode = new DrawMode(modeContext);
    this.selectMode = new SelectMode(modeContext);
    const splitMode = new SplitMode(modeContext);
    this.setbackMode = new SetbackMode(modeContext);

    // Register modes
    this.modeManager.registerMode('idle', new IdleMode());
    this.modeManager.registerMode('draw-point', drawPointMode);
    this.modeManager.registerMode('draw-line', drawLineMode);
    this.modeManager.registerMode('draw', drawMode);
    this.modeManager.registerMode('select', this.selectMode);
    this.modeManager.registerMode('split', splitMode);
    this.modeManager.registerMode('setback', this.setbackMode);

    // Mode change event
    this.modeManager.setOnModeChange((mode, previousMode) => {
      this.eventBus.emit('modechange', { mode, previousMode });
      if (this.toolbar) {
        this.toolbar.setActiveMode(mode);
      }

      const currentMode = this.modeManager.getCurrentMode();
      if (currentMode) {
        this.applyMapInteractions(currentMode.mapInteractions());
      }
    });

    const initialMode = this.modeManager.getCurrentMode();
    if (initialMode) {
      this.applyMapInteractions(initialMode.mapInteractions());
    }

    // Input handling
    this.inputHandler = new InputHandler(
      map,
      () => this.modeManager.getCurrentMode(),
    );

    // Toolbar
    if (options.toolbar !== false) {
      const toolbarOpts: ToolbarOptions =
        typeof options.toolbar === 'object' ? options.toolbar : {};
      this.createToolbar(toolbarOpts);
    }

    // Initialize when map is ready
    map.on('styledata', this.handleStyleData);
    if (map.isStyleLoaded()) {
      this.initialize();
    } else {
      map.once('load', () => {
        this.initialize();
      });
    }
  }

  /**
   * Set the active drawing mode.
   *
   * Switching modes deactivates the current mode (clearing any
   * in-progress state) and activates the new mode. A `'modechange'`
   * event is emitted on every transition.
   *
   * @param mode - `'idle'` (no interaction), `'draw'` (create polygons),
   *   or `'select'` (select/edit existing polygons).
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.setMode('draw');
   * draw.on('modechange', (e) => {
   *   console.log(`${e.previousMode} -> ${e.mode}`);
   * });
   * ```
   */
  setMode(mode: ModeName): void {
    this.assertNotDestroyed();
    this.modeManager.setMode(mode);
  }

  /**
   * Get the current drawing mode.
   *
   * @returns The active mode name: `'idle'`, `'draw'`, or `'select'`.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * if (draw.getMode() === 'draw') {
   *   console.log('Currently drawing');
   * }
   * ```
   */
  getMode(): ModeName {
    this.assertNotDestroyed();
    return this.modeManager.getMode();
  }

  /**
   * Get all features as an array.
   *
   * Returns a snapshot of all polygon features currently in the store.
   *
   * @returns An array of all {@link LibreDrawFeature} objects.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const features = draw.getFeatures();
   * console.log(`${features.length} polygons on the map`);
   * ```
   */
  getFeatures(): LibreDrawFeature[] {
    this.assertNotDestroyed();
    return this.featureStore.getAll();
  }

  /**
   * Export all features as a GeoJSON FeatureCollection.
   *
   * Returns a standard GeoJSON FeatureCollection containing all polygon
   * features currently in the store.
   *
   * @returns A GeoJSON {@link FeatureCollection}.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const geojson = draw.toGeoJSON();
   * console.log(JSON.stringify(geojson));
   * // { "type": "FeatureCollection", "features": [...] }
   * ```
   */
  toGeoJSON(): FeatureCollection {
    this.assertNotDestroyed();
    return this.featureStore.toGeoJSON();
  }

  /**
   * Replace all features in the store with the given GeoJSON FeatureCollection.
   *
   * Validates the input, clears the current store and history, and
   * re-renders the map. Undo/redo history is reset after this call.
   *
   * @param geojson - A GeoJSON FeatureCollection containing Polygon features.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   * @throws {LibreDrawError} If the input is not a valid FeatureCollection
   *   or contains invalid polygon geometries.
   *
   * @example
   * ```ts
   * draw.setFeatures({
   *   type: 'FeatureCollection',
   *   features: [{
   *     type: 'Feature',
   *     geometry: {
   *       type: 'Polygon',
   *       coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]]
   *     },
   *     properties: {}
   *   }]
   * });
   * ```
   */
  setFeatures(geojson: unknown): void {
    this.assertNotDestroyed();
    const validated = validateGeoJSON(geojson);
    this.featureStore.setAll(validated.features);
    this.resetSelectionState();
    this.historyManager.clear();
    this.renderAllFeatures();
    this.updateToolbarHistoryState();
  }

  /**
   * Add features to the store from an array of GeoJSON Feature objects.
   *
   * All features are validated before any of them is added, so an invalid
   * entry leaves the store untouched. Unlike {@link setFeatures}, this does
   * not clear existing features or history: the whole call is recorded as
   * a single undoable step (one `undo()` removes every feature added by
   * this call), and a `'create'` event fires for each added feature.
   *
   * @param features - An array of GeoJSON Feature objects with Point,
   *   LineString, or Polygon geometry. Features without an `id` get a
   *   generated UUID.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   * @throws {LibreDrawError} If any feature has invalid geometry.
   * @throws {LibreDrawError} If a feature `id` already exists in the store
   *   or appears more than once in the array.
   *
   * @example
   * ```ts
   * draw.addFeatures([{
   *   type: 'Feature',
   *   geometry: {
   *     type: 'Polygon',
   *     coordinates: [[[0,0],[5,0],[5,5],[0,5],[0,0]]]
   *   },
   *   properties: { name: 'Zone A' }
   * }]);
   * draw.undo(); // removes the feature added above
   * ```
   */
  addFeatures(features: unknown[]): void {
    this.assertNotDestroyed();
    if (features.length === 0) return;

    // Validate everything first so a bad entry cannot leave a partial add
    // behind (the call must map to exactly one history step or none).
    const validated = features.map((feature) => validateFeature(feature));

    // FeatureStore.add() silently overwrites an existing id. Recording that
    // as a CreateAction would make undo remove the pre-existing feature, so
    // duplicates are rejected up front.
    const seenIds = new Set<string>();
    for (const feature of validated) {
      if (!feature.id) continue;
      if (seenIds.has(feature.id) || this.featureStore.getById(feature.id)) {
        throw new LibreDrawError(`Feature already exists: ${feature.id}`);
      }
      seenIds.add(feature.id);
    }

    const added = validated.map((feature) => this.featureStore.add(feature));
    this.historyManager.push(
      new BatchAction(added.map((feature) => new CreateAction(feature))),
    );
    for (const feature of added) {
      this.eventBus.emit('create', { feature: cloneFeature(feature) });
    }
    this.renderAllFeatures();
    this.updateToolbarHistoryState();
  }

  /**
   * Get the IDs of currently selected features.
   *
   * Returns selected IDs in select mode. In other modes, returns
   * an empty array since selection is cleared on mode transition.
   *
   * @returns An array of selected feature IDs.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.on('selectionchange', (e) => {
   *   const ids = draw.getSelectedFeatureIds();
   *   console.log('Selected:', ids);
   * });
   * ```
   */
  getSelectedFeatureIds(): string[] {
    this.assertNotDestroyed();
    return this.selectMode.getSelectedIds();
  }

  /**
   * Get a feature by its ID.
   *
   * @param id - The unique identifier of the feature.
   * @returns The feature, or `undefined` if not found.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const feature = draw.getFeatureById('abc-123');
   * if (feature) {
   *   console.log(feature.geometry.coordinates);
   * }
   * ```
   */
  getFeatureById(id: string): LibreDrawFeature | undefined {
    this.assertNotDestroyed();
    return this.featureStore.getById(id);
  }

  /**
   * Delete a feature by its ID.
   *
   * Removes the feature from the store, records a {@link DeleteAction}
   * in the history (making it undoable), and emits a `'delete'` event.
   * If the feature is currently selected, the selection is also cleared.
   *
   * @param id - The unique identifier of the feature to delete.
   * @returns The deleted feature, or `undefined` if not found.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const deleted = draw.deleteFeature('abc-123');
   * if (deleted) {
   *   draw.undo(); // restores the deleted feature
   * }
   * ```
   */
  deleteFeature(id: string): LibreDrawFeature | undefined {
    this.assertNotDestroyed();

    const feature = this.featureStore.getById(id);
    if (!feature) return undefined;

    // Clear selection if the feature is selected
    const selectedIds = this.selectMode.getSelectedIds();
    if (selectedIds.includes(id)) {
      this.selectMode.clearSelection();
    }

    this.featureStore.remove(id);
    const action = new DeleteAction(feature);
    this.historyManager.push(action);
    this.eventBus.emit('delete', { feature: cloneFeature(feature) });
    this.renderAllFeatures();
    this.updateToolbarHistoryState();

    return feature;
  }

  /**
   * Programmatically select a feature by its ID.
   *
   * Switches to select mode if not already active. The feature
   * must exist in the store.
   *
   * @param id - The unique identifier of the feature to select.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   * @throws {LibreDrawError} If no feature with the given ID exists.
   *
   * @example
   * ```ts
   * draw.selectFeature('abc-123');
   * console.log(draw.getSelectedFeatureIds()); // ['abc-123']
   * console.log(draw.getMode()); // 'select'
   * ```
   */
  selectFeature(id: string): void {
    this.assertNotDestroyed();

    const feature = this.featureStore.getById(id);
    if (!feature) {
      throw new LibreDrawError(`Feature not found: ${id}`);
    }

    if (this.modeManager.getMode() !== 'select') {
      this.modeManager.setMode('select');
    }

    this.selectMode.selectFeature(id);
  }

  /**
   * Clear the current feature selection.
   *
   * Deselects all features, removes vertex handles, and emits
   * a `'selectionchange'` event. No-op if nothing is selected.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.selectFeature('abc-123');
   * draw.clearSelection();
   * console.log(draw.getSelectedFeatureIds()); // []
   * ```
   */
  clearSelection(): void {
    this.assertNotDestroyed();
    this.selectMode.clearSelection();
  }

  /**
   * Finalize the in-progress draft of the active drawing mode.
   *
   * Applies to `'draw'` (polygon) and `'draw-line'` (linestring) modes.
   * On success, a feature is added to the store, a `'create'` event fires,
   * and a `'draftchange'` event with `vertexCount: 0` is emitted. The mode
   * remains active so the user can start a new draft.
   *
   * @returns `true` if the draft was finalized, `false` if it could not be
   *   (non-drawing mode, insufficient vertices, or a polygon whose closing
   *   would produce a self-intersection).
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.setMode('draw');
   * // ... user clicks to add vertices ...
   * if (draw.finishDrawing()) {
   *   draw.setMode('idle');
   * }
   * ```
   */
  finishDrawing(): boolean {
    this.assertNotDestroyed();
    const mode = this.modeManager.getCurrentMode();
    if (!isDraftCapableMode(mode)) return false;
    return mode.finishDrawing();
  }

  /**
   * Discard the in-progress draft of the active drawing mode.
   *
   * Applies to `'draw'` and `'draw-line'` modes. Clears the preview,
   * resets the vertex list, and emits a `'draftchange'` event with
   * `vertexCount: 0`. The mode remains active; to exit drawing use
   * {@link setMode} afterwards.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.cancelDrawing(); // discard in-progress polygon
   * ```
   */
  cancelDrawing(): void {
    this.assertNotDestroyed();
    const mode = this.modeManager.getCurrentMode();
    if (!isDraftCapableMode(mode)) return;
    mode.cancelDrawing();
  }

  /**
   * Get the number of vertices in the current draft.
   *
   * @returns The draft vertex count for the active drawing mode,
   *   or `0` when no drawing mode is active.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.on('draftchange', () => {
   *   const count = draw.getDraftVertexCount();
   *   console.log(`draft has ${count} vertices`);
   * });
   * ```
   */
  getDraftVertexCount(): number {
    this.assertNotDestroyed();
    const mode = this.modeManager.getCurrentMode();
    if (!isDraftCapableMode(mode)) return 0;
    return mode.getDraftVertexCount();
  }

  /**
   * Update the global render style at runtime.
   *
   * Merges the given partial overrides with the current style and
   * applies changes to all map layers immediately.
   *
   * @param style - Partial style overrides to apply.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.setStyle({ fill: { color: '#ff0000', opacity: 0.5 } });
   * ```
   */
  setStyle(style: PartialStyleConfig): void {
    this.assertNotDestroyed();
    const merged = mergeStyleConfig(style);
    this.renderManager.updateStyle(merged);
  }

  /**
   * Get the current global render style.
   *
   * @returns The full style configuration currently in use.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   */
  getStyle(): StyleConfig {
    this.assertNotDestroyed();
    return this.renderManager.getStyle();
  }

  /**
   * Undo the last action.
   *
   * Reverts the most recent action (create, update, or delete) and
   * updates the map rendering. If a feature is selected and its
   * geometry changes, vertex handles are refreshed.
   *
   * @returns `true` if an action was undone, `false` if nothing to undo.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * if (draw.undo()) {
   *   console.log('Action undone');
   * }
   * ```
   */
  undo(): boolean {
    this.assertNotDestroyed();
    const action = this.historyManager.undo(this.featureStore);
    if (action) {
      this.renderAllFeatures();
      this.selectMode.refreshVertexHandles();
      this.updateToolbarHistoryState();
      this.emitUndoEvent(action);
    }
    return action !== null;
  }

  /**
   * Redo the last undone action.
   *
   * Re-applies the most recently undone action. The redo stack is
   * cleared whenever a new action is performed.
   *
   * @returns `true` if an action was redone, `false` if nothing to redo.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.undo();
   * draw.redo(); // re-applies the undone action
   * ```
   */
  redo(): boolean {
    this.assertNotDestroyed();
    const action = this.historyManager.redo(this.featureStore);
    if (action) {
      this.renderAllFeatures();
      this.selectMode.refreshVertexHandles();
      this.updateToolbarHistoryState();
      this.emitRedoEvent(action);
    }
    return action !== null;
  }

  /**
   * Register an event listener.
   *
   * Supported events: `'create'`, `'update'`, `'delete'`, `'split'`,
   * `'splitfailed'`, `'setback'`, `'setbackfailed'`, `'selectionchange'`,
   * `'modechange'`, `'draftchange'`.
   *
   * @param type - The event type to listen for.
   * @param listener - The callback to invoke when the event fires.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.on('create', (e) => console.log('Created:', e.feature.id));
   * draw.on('update', (e) => console.log('Updated:', e.feature.id));
   * draw.on('delete', (e) => console.log('Deleted:', e.feature.id));
   * draw.on('split', (e) => console.log('Split:', e.originalFeature.id));
   * draw.on('splitfailed', (e) => console.log('Split failed:', e.reason));
   * draw.on('selectionchange', (e) => console.log('Selected:', e.selectedIds));
   * draw.on('modechange', (e) => console.log(`${e.previousMode} -> ${e.mode}`));
   * draw.on('draftchange', (e) => console.log('Draft vertices:', e.vertexCount));
   * ```
   */
  on<K extends keyof LibreDrawEventMap>(
    type: K,
    listener: (payload: LibreDrawEventMap[K]) => void,
  ): void {
    this.assertNotDestroyed();
    this.eventBus.on(type, listener);
  }

  /**
   * Remove an event listener.
   *
   * The listener must be the same function reference passed to {@link on}.
   *
   * @param type - The event type to stop listening for.
   * @param listener - The callback to remove.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const handler = (e: CreateEvent) => console.log(e.feature);
   * draw.on('create', handler);
   * draw.off('create', handler);
   * ```
   */
  off<K extends keyof LibreDrawEventMap>(
    type: K,
    listener: (payload: LibreDrawEventMap[K]) => void,
  ): void {
    this.assertNotDestroyed();
    this.eventBus.off(type, listener);
  }

  /**
   * Destroy the LibreDraw instance, cleaning up all resources.
   *
   * Switches to idle mode, removes all map layers/sources, clears
   * the event bus, history, and feature store, and removes the toolbar.
   * After calling destroy, all other methods will throw
   * {@link LibreDrawError}. Calling destroy on an already-destroyed
   * instance is a no-op.
   *
   * @example
   * ```ts
   * draw.destroy();
   * // draw.getFeatures(); // throws LibreDrawError
   * ```
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.map.off('styledata', this.handleStyleData);
    this.modeManager.setMode('idle');
    this.inputHandler.destroy();
    this.renderManager.destroy();
    this.eventBus.removeAllListeners();
    this.historyManager.clear();
    this.featureStore.clear();

    if (this.toolbar) {
      this.toolbar.destroy();
      this.toolbar = null;
    }
  }

  /**
   * Initialize rendering and input handling after the map is ready.
   */
  private initialize(): void {
    if (this.destroyed) return;
    this.renderManager.initialize();
    if (!this.inputEnabled) {
      this.inputHandler.enable();
      this.inputEnabled = true;
    }
    this.renderAllFeatures();
  }

  /**
   * Render all features from the store to the map.
   */
  private renderAllFeatures(): void {
    const features = this.featureStore.getAll();
    this.renderManager.render(features);
  }

  /**
   * Create the toolbar UI.
   */
  private createToolbar(options: ToolbarOptions): void {
    this.toolbar = new Toolbar(
      this.map,
      {
        onDrawPointClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(
            current === 'draw-point' ? 'idle' : 'draw-point',
          );
        },
        onDrawLineClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(
            current === 'draw-line' ? 'idle' : 'draw-line',
          );
        },
        onDrawClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'draw' ? 'idle' : 'draw');
        },
        onSelectClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(
            current === 'select' ? 'idle' : 'select',
          );
        },
        onSplitClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'split' ? 'idle' : 'split');
        },
        onSetbackClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(
            current === 'setback' ? 'idle' : 'setback',
          );
        },
        onSetbackExecute: (distance) => {
          this.setbackMode.executeFromUi(distance);
        },
        onSetbackDistanceChange: (distance) => {
          this.setbackMode.onDistanceChange(distance);
        },
        onStyleChange: (style) => {
          this.setStyle(style);
        },
        onDeleteClick: () => {
          if (this.modeManager.getMode() === 'select') {
            const selectedIds = this.selectMode.getSelectedIds();
            for (const id of selectedIds) {
              this.deleteFeature(id);
            }
          }
        },
        onUndoClick: () => {
          this.undo();
        },
        onRedoClick: () => {
          this.redo();
        },
      },
      options,
    );

    // Set initial states
    this.toolbar.setActiveMode(this.modeManager.getMode());
    this.toolbar.setHistoryState(
      this.historyManager.canUndo(),
      this.historyManager.canRedo(),
    );
  }

  /**
   * Apply map interaction settings declared by the active mode.
   */
  private applyMapInteractions(config: MapInteractionConfig): void {
    if (config.dragPan) {
      this.map.dragPan.enable();
    } else {
      this.map.dragPan.disable();
    }

    if (config.doubleClickZoom) {
      this.map.doubleClickZoom.enable();
    } else {
      this.map.doubleClickZoom.disable();
    }
  }

  /**
   * Update toolbar undo/redo button states.
   */
  private updateToolbarHistoryState(): void {
    if (this.toolbar) {
      this.toolbar.setHistoryState(
        this.historyManager.canUndo(),
        this.historyManager.canRedo(),
      );
    }
  }

  /**
   * Clear selection-related rendering and state.
   */
  private resetSelectionState(): void {
    this.selectMode.clearSelection();
    this.renderManager.setSelectedIds([]);
    this.renderManager.clearVertices();
    this.renderManager.clearEdgeHighlight();
    this.renderManager.clearPreview();
  }

  /**
   * Normalize the snap option into a SnapConfig object.
   */
  private normalizeSnapConfig(snap?: boolean | SnapConfig): SnapConfig {
    if (snap === false) return { enabled: false, threshold: 10 };
    if (snap === undefined || snap === true) return { enabled: true, threshold: 10 };
    return {
      enabled: snap.enabled ?? true,
      threshold: Math.max(1, snap.threshold ?? 10),
    };
  }

  /**
   * Emit the appropriate event after an undo (revert) operation.
   * Undo reverses the action, so create→delete, delete→create, etc.
   */
  private emitUndoEvent(action: Action): void {
    if (action instanceof BatchAction) {
      // Children were reverted in reverse order; report them the same way.
      for (let i = action.actions.length - 1; i >= 0; i--) {
        this.emitUndoEvent(action.actions[i]);
      }
    } else if (action instanceof CreateAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.feature) });
    } else if (action instanceof DeleteAction) {
      this.eventBus.emit('create', { feature: cloneFeature(action.feature) });
    } else if (action instanceof UpdateAction) {
      this.eventBus.emit('update', {
        feature: cloneFeature(action.oldFeature),
        oldFeature: cloneFeature(action.newFeature),
      });
    } else if (action instanceof SplitAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.featureA) });
      this.eventBus.emit('delete', { feature: cloneFeature(action.featureB) });
      this.eventBus.emit('create', { feature: cloneFeature(action.originalFeature) });
    } else if (action instanceof SetbackAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.resultFeature) });
      this.eventBus.emit('create', { feature: cloneFeature(action.originalFeature) });
    }
  }

  /**
   * Emit the appropriate event after a redo (re-apply) operation.
   * Redo re-applies the action, so create→create, delete→delete, etc.
   */
  private emitRedoEvent(action: Action): void {
    if (action instanceof BatchAction) {
      for (const child of action.actions) {
        this.emitRedoEvent(child);
      }
    } else if (action instanceof CreateAction) {
      this.eventBus.emit('create', { feature: cloneFeature(action.feature) });
    } else if (action instanceof DeleteAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.feature) });
    } else if (action instanceof UpdateAction) {
      this.eventBus.emit('update', {
        feature: cloneFeature(action.newFeature),
        oldFeature: cloneFeature(action.oldFeature),
      });
    } else if (action instanceof SplitAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.originalFeature) });
      this.eventBus.emit('split', {
        originalFeature: cloneFeature(action.originalFeature),
        features: [cloneFeature(action.featureA), cloneFeature(action.featureB)],
      });
    } else if (action instanceof SetbackAction) {
      // edgeIndex and distance are not preserved in SetbackAction,
      // so we emit placeholder values for redo events
      this.eventBus.emit('setback', {
        originalFeature: cloneFeature(action.originalFeature),
        feature: cloneFeature(action.resultFeature),
        edgeIndex: -1,
        distance: 0,
      });
    }
  }

  /**
   * Assert that this instance has not been destroyed.
   * @throws LibreDrawError if destroyed.
   */
  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new LibreDrawError(
        'This LibreDraw instance has been destroyed.',
      );
    }
  }
}
