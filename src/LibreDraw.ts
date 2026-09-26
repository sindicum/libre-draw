import type { Map as MaplibreMap } from 'maplibre-gl';
import type {
  LibreDrawFeature,
  FeatureCollection,
  LibreDrawEventMap,
  LibreDrawOptions,
  ToolbarOptions,
  SnapConfig,
  KeyboardOptions,
  InputMethod,
  StyleConfig,
  PartialStyleConfig,
  Messages,
  EventOrigin,
  AddFeatureResult,
  FeatureValidationResult,
  OperationResult,
  UpdateFeaturePatch,
  EdgeRef,
  Position,
} from './types';
import { mergeStyleConfig } from './types/style';
import type { Action } from './types/features';
import {
  DeleteAction,
  CreateAction,
  UpdateAction,
  SplitAction,
  SetbackAction,
  UnionAction,
  BatchAction,
} from './types/features';
import { EventBus } from './core/EventBus';
import { FeatureStore } from './core/FeatureStore';
import { HistoryManager } from './core/HistoryManager';
import { ModeManager } from './core/ModeManager';
import { SelectionManager } from './core/SelectionManager';
import type { ModeContext } from './core/ModeContext';
import type { ModeName } from './types/mode';
import { LibreDrawError } from './core/errors';
import { tryValidateFeature, tryValidateGeoJSON } from './validation/geojson';
import { updateFeature as updateFeatureOperation } from './operations/updateFeature';
import { rotate as rotateOperation } from './operations/rotate';
import { split as splitOperation } from './operations/split';
import { setback as setbackOperation } from './operations/setback';
import { union as unionOperation } from './operations/union';
import { IdleMode } from './modes/IdleMode';
import { DrawPolygonMode } from './modes/DrawPolygonMode';
import { DrawRectangleMode } from './modes/DrawRectangleMode';
import { DrawAngledRectangleMode } from './modes/DrawAngledRectangleMode';
import { DrawPointMode } from './modes/DrawPointMode';
import { DrawLineMode } from './modes/DrawLineMode';
import { SelectMode } from './modes/SelectMode';
import { SplitMode } from './modes/SplitMode';
import { SetbackMode } from './modes/SetbackMode';
import { UnionMode } from './modes/UnionMode';
import { RotateMode } from './modes/RotateMode';
import type { MapInteractionConfig } from './modes/Mode';
import { isDraftCapableMode } from './modes/Mode';
import { InputHandler } from './input/InputHandler';
import { ReticleInput } from './input/ReticleInput';
import { SourceManager } from './rendering/SourceManager';
import { RenderManager } from './rendering/RenderManager';
import { Toolbar } from './ui/Toolbar';
import { ReticleOverlay } from './ui/ReticleOverlay';
import { getBuiltinMessages, isBuiltinLocale, resolveMessages } from './ui/messages';
import { cloneFeature } from './utils/featureSnapshot';

/**
 * Modes that place points, and so the modes the center reticle drives.
 */
const DRAWING_MODES: ReadonlySet<ModeName> = new Set<ModeName>([
  'draw-point',
  'draw-line',
  'draw-polygon',
  'draw-rectangle',
  'draw-angled-rectangle',
]);

/**
 * Runtime check for values that bypass the type (plain JS callers, casts).
 */
function isInputMethod(value: unknown): value is InputMethod {
  return value === 'tap' || value === 'reticle';
}

/**
 * The `id` an input object declares, if it is a string. Used to label a
 * rejected `addFeatures` entry without trusting anything else about it.
 */
function readInputId(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  const id = (input as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

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
 * draw.setMode('draw-polygon');
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
  private reticleInput: ReticleInput;
  private reticleOverlay: ReticleOverlay;
  private inputMethod: InputMethod;
  /** Dependencies handed to modes; also the OperationContext for operations. */
  private modeContext: ModeContext;
  private selection: SelectionManager;
  private selectMode: SelectMode;
  private setbackMode: SetbackMode;
  private rotateMode: RotateMode;
  private unionMode: UnionMode;
  private snapConfig: SnapConfig;
  private messages: Messages;
  private destroyed = false;
  private inputEnabled = false;
  /** Box zoom state of the map when LibreDraw was created; restored by modes that do not use Shift. */
  private mapBoxZoomEnabled: boolean;
  /**
   * Origin stamped on every event emitted while a public method runs.
   * `'user'` at rest; `asApi()` switches it to `'api'` for the duration of
   * a call so modes and the toolbar never have to know who triggered them.
   */
  private eventOrigin: EventOrigin = 'user';

  private handleStyleData = (): void => {
    if (this.destroyed || !this.map.isStyleLoaded()) return;
    if (this.renderManager.isReadyForCurrentStyle()) return;

    this.renderManager.initialize();
    this.renderAllFeatures();

    // The style swap rebuilt the sources empty: the active mode redraws its
    // own overlays (vertex handles, the rotation pivot).
    this.renderManager.clearVertices();
    this.modeManager.getCurrentMode()?.refreshFromStore?.();
  };

  /**
   * Create a new LibreDraw instance attached to a MapLibre GL JS map.
   *
   * Initializes all internal modules and sets up map integration.
   * The instance is ready to use once the map's style is loaded.
   *
   * @param map - The MapLibre GL JS map instance to draw on.
   * @param options - Configuration options. Defaults to toolbar enabled,
   *   100-action history limit, snap enabled with 10px threshold,
   *   keyboard shortcuts enabled, and English UI strings.
   *
   * @throws {LibreDrawError} If `options.locale` is not a bundled locale.
   * @throws {LibreDrawError} If `options.inputMethod` is not `'tap'` or `'reticle'`.
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
   * // Disable the undo / redo keyboard shortcuts:
   * const draw = new LibreDraw(map, { keyboard: false });
   * // Japanese UI, with one label overridden:
   * const draw = new LibreDraw(map, { locale: 'ja' });
   * // Place points with the center reticle instead of taps:
   * const draw = new LibreDraw(map, { inputMethod: 'reticle' });
   * // Override individual strings (merged onto the selected locale):
   * const draw = new LibreDraw(map, { messages: { setbackExecute: 'Run' } });
   * ```
   */
  constructor(map: MaplibreMap, options: LibreDrawOptions = {}) {
    this.map = map;
    this.mapBoxZoomEnabled = map.boxZoom.isEnabled();

    // Core modules
    this.eventBus = new EventBus(() => this.eventOrigin);
    this.featureStore = new FeatureStore();
    this.historyManager = new HistoryManager(options.historyLimit ?? 100);
    this.modeManager = new ModeManager();

    // Snap configuration
    this.snapConfig = this.normalizeSnapConfig(options.snap);

    // UI strings (validated even in headless mode so a typo surfaces early)
    // Only an omitted locale falls back to English; null and other values are rejected.
    const locale = options.locale === undefined ? 'en' : options.locale;
    if (!isBuiltinLocale(locale)) {
      throw new LibreDrawError(`Unsupported locale: ${String(locale)}. Use 'en' or 'ja'.`);
    }
    this.messages = resolveMessages(getBuiltinMessages(locale), options.messages);

    const inputMethod = options.inputMethod === undefined ? 'tap' : options.inputMethod;
    if (!isInputMethod(inputMethod)) {
      throw new LibreDrawError(
        `Unsupported input method: ${String(inputMethod)}. Use 'tap' or 'reticle'.`
      );
    }
    this.inputMethod = inputMethod;

    // Rendering
    this.sourceManager = new SourceManager(map);
    this.renderManager = new RenderManager(map, this.sourceManager, options.style);

    // The one selection every mode reads and writes. Each change redraws the
    // highlight, emits 'selectionchange', updates the rotate angle input and
    // the union execute button, and lets the active mode adjust; modes never
    // repeat these side effects.
    this.selection = new SelectionManager((selectedIds) => {
      this.renderManager.setSelectedIds(selectedIds);
      this.renderAllFeatures();
      this.eventBus.emit('selectionchange', { selectedIds });
      this.toolbar?.setRotateSelection(
        this.modeManager.getMode() === 'rotate' && selectedIds.length > 0
      );
      this.toolbar?.setUnionSelectionCount(selectedIds.length);
      this.modeManager.getCurrentMode()?.onSelectionChange?.(selectedIds);
    });

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
      selection: this.selection,
      events: {
        emit: (type, payload) => this.eventBus.emit(type, payload),
      },
      render: {
        renderFeatures: () => this.renderAllFeatures(),
        renderPreview: (coords) => this.renderManager.renderPreview(coords),
        clearPreview: () => this.renderManager.clearPreview(),
        renderEdgeHighlight: (coords) => this.renderManager.renderEdgeHighlight(coords),
        clearEdgeHighlight: () => this.renderManager.clearEdgeHighlight(),
        renderVertices: (vertices, midpoints, highlightIndex, midpointHighlightIndex) =>
          this.renderManager.renderVertices(
            vertices,
            midpoints,
            highlightIndex,
            midpointHighlightIndex
          ),
        clearVertices: () => this.renderManager.clearVertices(),
        setSelectedIds: (ids) => this.renderManager.setSelectedIds(ids),
        renderSnapIndicator: (pos) => this.renderManager.renderSnapIndicator(pos),
        clearSnapIndicator: () => this.renderManager.clearSnapIndicator(),
        renderRotationCenter: (pos) => this.renderManager.renderRotationCenter(pos),
        clearRotationCenter: () => this.renderManager.clearRotationCenter(),
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

    this.modeContext = modeContext;

    const drawPointMode = new DrawPointMode(modeContext);
    const drawLineMode = new DrawLineMode(modeContext);
    const drawPolygonMode = new DrawPolygonMode(modeContext);
    const drawRectangleMode = new DrawRectangleMode(modeContext);
    const drawAngledRectangleMode = new DrawAngledRectangleMode(modeContext);
    this.selectMode = new SelectMode(modeContext);
    const splitMode = new SplitMode(modeContext);
    this.unionMode = new UnionMode(modeContext);
    this.setbackMode = new SetbackMode(modeContext);
    this.rotateMode = new RotateMode(modeContext);

    // Register modes
    this.modeManager.registerMode('idle', new IdleMode());
    this.modeManager.registerMode('draw-point', drawPointMode);
    this.modeManager.registerMode('draw-line', drawLineMode);
    this.modeManager.registerMode('draw-polygon', drawPolygonMode);
    this.modeManager.registerMode('draw-rectangle', drawRectangleMode);
    this.modeManager.registerMode('draw-angled-rectangle', drawAngledRectangleMode);
    this.modeManager.registerMode('select', this.selectMode);
    this.modeManager.registerMode('split', splitMode);
    this.modeManager.registerMode('union', this.unionMode);
    this.modeManager.registerMode('setback', this.setbackMode);
    this.modeManager.registerMode('rotate', this.rotateMode);

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
      this.syncReticle();
    });

    const initialMode = this.modeManager.getCurrentMode();
    if (initialMode) {
      this.applyMapInteractions(initialMode.mapInteractions());
    }

    // Input handling. Shortcuts are a thin adapter over undo / redo; they
    // call the internal variants so the resulting events are stamped
    // origin: 'user'. They are wired only when enabled so KeyboardInput
    // never has to consult configuration. The boolean result lets the key
    // event fall through to the host page when there is nothing to undo.
    const keyboard = this.normalizeKeyboardConfig(options.keyboard);
    this.inputHandler = new InputHandler(
      map,
      () => this.modeManager.getCurrentMode(),
      keyboard.undoRedo
        ? {
            onUndo: () => this.performUndo(),
            onRedo: () => this.performRedo(),
          }
        : undefined,
      () => this.isReticleActive()
    );

    // Center reticle: while it drives a drawing mode, map movement and the
    // "Add point" button feed the mode instead of the pointer. The overlay
    // does not depend on the toolbar, so it also works with toolbar: false.
    this.reticleInput = new ReticleInput(
      map,
      () => this.modeManager.getCurrentMode(),
      () => this.isReticleActive()
    );
    this.reticleOverlay = new ReticleOverlay(
      map,
      { onAddPoint: () => this.reticleInput.addPoint() },
      this.messages
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
   * @param mode - `'idle'` (no interaction), `'draw-point'` / `'draw-line'` /
   *   `'draw-polygon'` / `'draw-rectangle'` / `'draw-angled-rectangle'` (create features),
   *   `'select'` (select/edit existing features), `'split'`, `'union'`,
   *   `'setback'`, or `'rotate'`.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   * @throws {LibreDrawError} If `mode` is not one of the names above
   *   (`Unknown mode: <name>`). The current mode stays active and no
   *   `'modechange'` is emitted.
   *
   * @example
   * ```ts
   * draw.setMode('draw-polygon');
   * draw.on('modechange', (e) => {
   *   console.log(`${e.previousMode} -> ${e.mode}`);
   * });
   * ```
   */
  setMode(mode: ModeName): void {
    this.assertNotDestroyed();
    this.asApi(() => this.modeManager.setMode(mode));
  }

  /**
   * Get the current drawing mode.
   *
   * @returns The active mode name (e.g. `'idle'`, `'draw-polygon'`, `'draw-rectangle'`, `'select'`).
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * if (draw.getMode() === 'draw-polygon') {
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
   * Validates the whole input first (all or nothing), then clears the
   * store, the selection, and the history, and re-renders the map. No
   * `'create'` / `'delete'` events are emitted for the replaced features:
   * this is a reload, not an edit. Undo/redo history is reset after this
   * call.
   *
   * @param geojson - A GeoJSON FeatureCollection containing Point,
   *   LineString, or Polygon features.
   * @returns `{ ok: true, created, deleted }` with the new features in
   *   `created` and the previous ones in `deleted`, or `{ ok: false, reason }`
   *   when the input is not a FeatureCollection or one of its features
   *   fails validation (`Invalid feature at index i: …`). Nothing changes
   *   on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const result = draw.setFeatures({
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
   * if (!result.ok) console.warn(result.reason);
   * ```
   */
  setFeatures(geojson: unknown): OperationResult {
    this.assertNotDestroyed();
    const validated = tryValidateGeoJSON(geojson);
    if (!validated.valid) {
      return { ok: false, reason: validated.reason };
    }
    // getAll() already returns clones, so the result cannot alias the store.
    const previous = this.featureStore.getAll();
    const created = this.asApi(() => {
      // Cleared before the swap so that a mode restoring an uncommitted
      // preview (rotate) writes into the old data, never over the new.
      this.resetSelectionState();
      this.featureStore.setAll(validated.features);
      this.historyManager.clear();
      this.renderAllFeatures();
      this.updateToolbarHistoryState();
      return this.featureStore.getAll();
    });
    return { ok: true, created, updated: [], deleted: previous };
  }

  /**
   * Add features to the store from an array of GeoJSON Feature objects.
   *
   * Every feature is validated first and reported individually: invalid
   * entries (bad geometry, or an `id` that already exists in the store or
   * appears earlier in the array) come back as `{ valid: false, reason }`
   * and only the valid ones are added. Nothing is thrown for the input.
   * The added features form a **single undoable step** (one `undo()`
   * removes every feature added by this call), and a `'create'` event
   * fires for each added feature. Unlike {@link setFeatures}, existing
   * features and history are kept. There is no all-or-nothing option: to
   * get one, check each input with {@link validateFeature} and its id with
   * {@link getFeatureById} (and against the other inputs) before calling.
   *
   * @param features - An array of GeoJSON Feature objects with Point,
   *   LineString, or Polygon geometry. Features without an `id` get a
   *   generated UUID.
   * @returns One {@link AddFeatureResult} per input feature, in input order.
   *   Valid entries carry the id the feature has in the store.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const results = draw.addFeatures([{
   *   type: 'Feature',
   *   geometry: {
   *     type: 'Polygon',
   *     coordinates: [[[0,0],[5,0],[5,5],[0,5],[0,0]]]
   *   },
   *   properties: { name: 'Zone A' }
   * }]);
   * results.forEach((r, i) => {
   *   if (!r.valid) console.warn(`feature ${i} rejected: ${r.reason}`);
   * });
   * draw.undo(); // removes every feature added above
   * ```
   */
  addFeatures(features: unknown[]): AddFeatureResult[] {
    this.assertNotDestroyed();

    // Validate everything first so the valid entries can be added as
    // exactly one history step (or none when nothing passed).
    const results: AddFeatureResult[] = [];
    const accepted: { index: number; feature: LibreDrawFeature }[] = [];
    // FeatureStore.add() silently overwrites an existing id. Recording that
    // as a CreateAction would make undo remove the pre-existing feature, so
    // duplicates are rejected up front, in every mode.
    const seenIds = new Set<string>();
    features.forEach((input, index) => {
      const validation = tryValidateFeature(input);
      if (!validation.valid) {
        results.push({ valid: false, id: readInputId(input), reason: validation.reason });
        return;
      }
      const { feature } = validation;
      if (feature.id && (seenIds.has(feature.id) || this.featureStore.getById(feature.id))) {
        results.push({
          valid: false,
          id: feature.id,
          reason: `Feature already exists: ${feature.id}`,
        });
        return;
      }
      if (feature.id) seenIds.add(feature.id);
      // Placeholder; the id is filled in once the store has assigned one.
      results.push({ valid: true, id: feature.id });
      accepted.push({ index, feature });
    });

    if (accepted.length === 0) return results;

    this.asApi(() => {
      const added = accepted.map(({ index, feature }) => {
        const stored = this.featureStore.add(feature);
        results[index] = { valid: true, id: stored.id };
        return stored;
      });
      this.historyManager.push(new BatchAction(added.map((feature) => new CreateAction(feature))));
      for (const feature of added) {
        this.eventBus.emit('create', { feature: cloneFeature(feature) });
      }
      this.renderAllFeatures();
      this.updateToolbarHistoryState();
    });
    return results;
  }

  /**
   * Check whether an object would be accepted by {@link addFeatures} /
   * {@link setFeatures}, without adding it and without throwing.
   *
   * Applies the same rules (Feature envelope, geometry type, coordinate
   * ranges, ring closure, self-intersection). Duplicate ids are not
   * checked here because they depend on the store's contents at add time.
   *
   * @param feature - The object to validate.
   * @returns `{ valid: true, feature }` with a normalized copy, or
   *   `{ valid: false, reason }` with the same message `addFeatures` would
   *   report for it.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const result = draw.validateFeature(candidate);
   * if (!result.valid) {
   *   showError(result.reason);
   * }
   * ```
   */
  validateFeature(feature: unknown): FeatureValidationResult {
    this.assertNotDestroyed();
    return tryValidateFeature(feature);
  }

  /**
   * Get the IDs of currently selected features.
   *
   * Every mode shares one selection: select mode may hold several
   * features, rotate / split / setback / union at most their one target,
   * and drawing modes none (switching modes clears the selection).
   * IDs are returned in the order they were selected.
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
    return this.selection.getSelectedIds();
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
    return this.asApi(() => this.removeFeature(id));
  }

  /**
   * Replace a feature's geometry and/or properties.
   *
   * The change is validated like {@link addFeatures} input, recorded as
   * one undoable step, and reported with an `'update'` event
   * (`origin: 'api'`). `properties` is a full replacement, not a merge.
   * A feature that is selected keeps its selection; vertex handles and the
   * rotation base follow the new shape.
   *
   * @param id - The feature to change.
   * @param patch - `{ geometry?, properties? }`; see {@link UpdateFeaturePatch}.
   * @returns `{ ok: true, updated: [feature] }`, or `{ ok: false, reason }`
   *   with `'not-found'`, `'geometry-type-mismatch'`, `'empty-patch'`, or the
   *   validation message. Nothing changes on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const result = draw.updateFeature('abc-123', { properties: { crop: 'wheat' } });
   * if (!result.ok) console.warn(result.reason);
   * ```
   */
  updateFeature(id: string, patch: UpdateFeaturePatch): OperationResult {
    this.assertNotDestroyed();
    const result = this.asApi(() => updateFeatureOperation(this.modeContext, id, patch));
    if (result.ok) this.syncAfterExternalChange();
    return result;
  }

  /**
   * Rotate a Polygon or LineString around its area centroid.
   *
   * Same computation as the rotate mode (screen-space rotation in Web
   * Mercator, positive angles clockwise). Recorded as one undoable step and
   * reported with a `'rotate'` event (`origin: 'api'`); undo / redo report
   * `'update'`. If the feature is selected in rotate mode, the next
   * interactive rotation starts from the new shape.
   *
   * @param id - The feature to rotate.
   * @param angleDeg - Relative angle in degrees, positive clockwise.
   * @returns `{ ok: true, updated: [feature] }`, or `{ ok: false, reason }`
   *   with `'not-found'`, `'not-rotatable'` (Point), `'no-rotation'`
   *   (0, a multiple of 360, or a non-finite angle), or the validation
   *   message when the rotated shape leaves the coordinate range (near the
   *   antimeridian or the poles). Nothing changes on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.rotate('abc-123', 90);
   * draw.undo(); // back to the original orientation
   * ```
   */
  rotate(id: string, angleDeg: number): OperationResult {
    this.assertNotDestroyed();
    const result = this.asApi(() => rotateOperation(this.modeContext, id, angleDeg));
    if (result.ok) this.syncAfterExternalChange();
    return result;
  }

  /**
   * Split a Polygon or LineString along the line through two points.
   *
   * Same computation as the [`split` mode]: a Polygon is cut where the
   * extended line crosses its outer ring exactly twice, a LineString at its
   * first crossing. The two parts get fresh ids and a copy of the original's
   * properties. Recorded as one undoable step and reported with a `'split'`
   * event (`origin: 'api'`); a geometric failure also emits `'splitfailed'`
   * as the mode does. If the original is selected, the selection is dropped.
   *
   * @param id - The feature to split.
   * @param line - Two positions `[start, end]` defining the split line.
   * @returns `{ ok: true, created: [a, b], deleted: [original] }`, or
   *   `{ ok: false, reason }` with `'not-found'`, `'not-splittable'` (a
   *   Point), a {@link SplitFailReason}, or a validation message. Nothing
   *   changes on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const result = draw.split('abc-123', [
   *   [139.70, 35.65],
   *   [139.72, 35.67],
   * ]);
   * if (result.ok) console.log(result.created.map((f) => f.id)); // two new ids
   * ```
   */
  split(id: string, line: [Position, Position]): OperationResult {
    this.assertNotDestroyed();
    const result = this.asApi(() => splitOperation(this.modeContext, id, line));
    if (result.ok) this.syncAfterExternalChange();
    return result;
  }

  /**
   * Move one edge of a Polygon inward by a distance in meters.
   *
   * Same computation as the [`setback` mode]: the ring is split along the
   * offset line and the band on the edge's side is discarded. The result
   * gets a fresh id and a copy of the original's properties. Recorded as
   * one undoable step and reported with a `'setback'` event
   * (`origin: 'api'`); a geometric failure also emits `'setbackfailed'` as
   * the mode does. Works without the toolbar: the distance is a parameter,
   * not the input field's value.
   *
   * @param id - The Polygon to set back.
   * @param edge - The edge to move; see {@link EdgeRef}. Only the outer
   *   ring is supported for now.
   * @param distanceMeters - Offset distance in meters, greater than zero.
   * @returns `{ ok: true, created: [result], deleted: [original] }`, or
   *   `{ ok: false, reason }` with `'not-found'`, `'not-polygon'`,
   *   `'invalid-edge'`, `'invalid-distance'`, `'has-holes'`, or
   *   `'invalid-split'`. Nothing changes on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.setback('abc-123', { index: 2 }, 10); // edge 2, 10 m inward
   * draw.undo();
   * ```
   */
  setback(id: string, edge: EdgeRef, distanceMeters: number): OperationResult {
    this.assertNotDestroyed();
    const result = this.asApi(() => setbackOperation(this.modeContext, id, edge, distanceMeters));
    if (result.ok) this.syncAfterExternalChange();
    return result;
  }

  /**
   * Merge two or more Polygons into one.
   *
   * Same computation as the [`union` mode]: all polygons are merged at
   * once, the merged polygon gets a fresh id and a copy of the first
   * polygon's properties, and only a single Polygon without holes counts as
   * success. If any polygon does not connect to the others, nothing is
   * merged. Recorded as one undoable step and reported with a `'union'`
   * event (`origin: 'api'`); a geometric failure also emits `'unionfailed'`
   * as the mode does.
   *
   * @param ids - Two or more distinct feature ids (duplicates are ignored),
   *   in the order that decides whose properties survive.
   * @returns `{ ok: true, created: [merged], deleted: [...sources] }`, or
   *   `{ ok: false, reason }` with `'unsupported-count'`, `'not-found'`, or a
   *   {@link UnionFailReason}. Nothing changes on failure.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * const result = draw.union(['a', 'b', 'c']);
   * if (!result.ok) console.warn(result.reason); // e.g. 'disjoint'
   * ```
   */
  union(ids: string[]): OperationResult {
    this.assertNotDestroyed();
    const result = this.asApi(() => unionOperation(this.modeContext, ids));
    if (result.ok) this.syncAfterExternalChange();
    return result;
  }

  /**
   * Programmatically select a feature by its ID.
   *
   * Switches to select mode if not already active. When no feature has
   * that id nothing happens: the mode and the selection stay as they are
   * and no event is emitted.
   *
   * @param id - The unique identifier of the feature to select.
   * @returns `true` if the feature was selected, `false` if no feature
   *   has that id.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * if (draw.selectFeature('abc-123')) {
   *   console.log(draw.getSelectedFeatureIds()); // ['abc-123']
   *   console.log(draw.getMode()); // 'select'
   * }
   * ```
   */
  selectFeature(id: string): boolean {
    this.assertNotDestroyed();

    // Checked before entering select mode so an unknown id changes nothing.
    if (!this.featureStore.getById(id)) {
      return false;
    }

    this.asApi(() => {
      if (this.modeManager.getMode() !== 'select') {
        this.modeManager.setMode('select');
      }
      this.selectMode.selectFeature(id);
    });
    return true;
  }

  /**
   * Programmatically select several features at once.
   *
   * Switches to select mode if not already active and replaces the
   * selection with `ids` (duplicates are ignored). Point, LineString and
   * Polygon features can be mixed. With more than one feature selected no
   * vertex handles are shown; a drag moves them all and Delete removes them
   * all. When `ids` is empty or any id is unknown nothing happens: the mode
   * and the selection stay as they are and no event is emitted.
   *
   * @param ids - The unique identifiers of the features to select.
   * @returns `true` if the features were selected, `false` if `ids` is
   *   empty or contains an id with no feature.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * if (draw.selectFeatures(['a', 'b'])) {
   *   console.log(draw.getSelectedFeatureIds()); // ['a', 'b']
   * }
   * ```
   */
  selectFeatures(ids: string[]): boolean {
    this.assertNotDestroyed();

    // Checked before entering select mode so a bad list changes nothing.
    if (ids.length === 0 || ids.some((id) => !this.featureStore.getById(id))) {
      return false;
    }

    this.asApi(() => {
      if (this.modeManager.getMode() !== 'select') {
        this.modeManager.setMode('select');
      }
      this.selectMode.selectFeatures(ids);
    });
    return true;
  }

  /**
   * Clear the current feature selection.
   *
   * Deselects all features, removes vertex handles, and emits
   * a `'selectionchange'` event. In rotate mode this also discards any
   * uncommitted rotation preview, and in split / setback mode the
   * half-finished operation on the target. No-op if nothing is selected.
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
    this.asApi(() => this.selection.clear());
  }

  /**
   * Finalize the in-progress draft of the active drawing mode.
   *
   * Applies to `'draw-polygon'` and `'draw-line'` (linestring) modes.
   * On success, a feature is added to the store, a `'create'` event fires,
   * and a `'draftchange'` event with `vertexCount: 0` is emitted. The mode
   * remains active so the user can start a new draft.
   *
   * In `'draw-rectangle'` and `'draw-angled-rectangle'` modes this always
   * returns `false`: the rectangle is only defined once its last point
   * (the second corner, or the third point that sets the width) is clicked.
   *
   * @returns `true` if the draft was finalized, `false` if it could not be
   *   (non-drawing mode, insufficient vertices, or a polygon whose closing
   *   would produce a self-intersection).
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   *
   * @example
   * ```ts
   * draw.setMode('draw-polygon');
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
    return this.asApi(() => mode.finishDrawing());
  }

  /**
   * Discard the in-progress draft of the active drawing mode.
   *
   * Applies to `'draw-polygon'`, `'draw-line'`, `'draw-rectangle'`, and
   * `'draw-angled-rectangle'` modes.
   * Clears the preview, resets the vertex list, and emits a `'draftchange'` event with
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
    this.asApi(() => mode.cancelDrawing());
  }

  /**
   * Get the number of vertices in the current draft.
   *
   * @returns The draft vertex count for the active drawing mode
   *   (`1` while a rectangle's first corner is placed),
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
   * Choose how the drawing modes take a point.
   *
   * - `'tap'` (default): a click or tap on the map places the point.
   * - `'reticle'`: while a drawing mode (`'draw-point'`, `'draw-line'`,
   *   `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`) is
   *   active, a crosshair is shown at the center of the map and an
   *   "Add point" button at the bottom. The map pans freely, clicks and taps
   *   on it place nothing, and the button places a point at the crosshair
   *   under the same rules as a tap (snapping; the first or last vertex
   *   finishes). Other modes keep working with taps and clicks.
   *
   * The setting is kept across mode changes. Changing it while drawing keeps
   * the draft.
   *
   * @param method - `'tap'` or `'reticle'`.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   * @throws {LibreDrawError} If `method` is not `'tap'` or `'reticle'`
   *   (`Unsupported input method: <value>`). The current method stays.
   *
   * @example
   * ```ts
   * draw.setInputMethod('reticle');
   * draw.setMode('draw-polygon');
   * ```
   */
  setInputMethod(method: InputMethod): void {
    this.assertNotDestroyed();
    if (!isInputMethod(method)) {
      throw new LibreDrawError(
        `Unsupported input method: ${String(method)}. Use 'tap' or 'reticle'.`
      );
    }
    if (method === this.inputMethod) return;
    this.inputMethod = method;

    const mode = this.modeManager.getCurrentMode();
    if (mode) this.applyMapInteractions(mode.mapInteractions());
    this.syncReticle();
  }

  /**
   * Get how the drawing modes take a point.
   *
   * @returns `'tap'` or `'reticle'`.
   *
   * @throws {LibreDrawError} If this instance has been destroyed.
   */
  getInputMethod(): InputMethod {
    this.assertNotDestroyed();
    return this.inputMethod;
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
   * // Later calls accumulate: outline changes, fill keeps '#ff0000'.
   * draw.setStyle({ outline: { width: 3 } });
   * ```
   */
  setStyle(style: PartialStyleConfig): void {
    this.assertNotDestroyed();
    // Merge onto the current style, not the defaults, so a partial update
    // never silently resets sections the caller did not mention.
    const merged = mergeStyleConfig(style, this.renderManager.getStyle());
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
    return this.asApi(() => this.performUndo());
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
    return this.asApi(() => this.performRedo());
  }

  /**
   * Register an event listener.
   *
   * Supported events: `'create'`, `'update'`, `'delete'`, `'split'`,
   * `'splitfailed'`, `'setback'`, `'setbackfailed'`, `'union'`, `'unionfailed'`, `'rotate'`,
   * `'selectionchange'`, `'modechange'`, `'draftchange'`.
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
   * draw.on('union', (e) => console.log('Merged into:', e.feature.id));
   * draw.on('unionfailed', (e) => console.log('Union failed:', e.reason));
   * draw.on('selectionchange', (e) => console.log('Selected:', e.selectedIds));
   * draw.on('modechange', (e) => console.log(`${e.previousMode} -> ${e.mode}`));
   * draw.on('draftchange', (e) => console.log('Draft vertices:', e.vertexCount));
   * ```
   */
  on<K extends keyof LibreDrawEventMap>(
    type: K,
    listener: (payload: LibreDrawEventMap[K]) => void
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
    listener: (payload: LibreDrawEventMap[K]) => void
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
    this.asApi(() => this.modeManager.setMode('idle'));
    this.inputHandler.destroy();
    this.reticleInput.destroy();
    this.reticleOverlay.destroy();
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
   * Run `fn` with events stamped `origin: 'api'`.
   *
   * The previous value is restored afterwards (also on throw) so the call
   * is re-entrant: a public method invoked from inside a `'user'` event
   * listener stamps only its own events, and the remaining user-originated
   * events keep `'user'` once it returns.
   */
  private asApi<T>(fn: () => T): T {
    const previous = this.eventOrigin;
    this.eventOrigin = 'api';
    try {
      return fn();
    } finally {
      this.eventOrigin = previous;
    }
  }

  /**
   * Delete a feature without touching the event origin. The public
   * {@link deleteFeature} wraps this in `asApi`; the toolbar calls it
   * directly so its `'delete'` events stay `'user'`.
   */
  private removeFeature(id: string): LibreDrawFeature | undefined {
    if (!this.featureStore.getById(id)) return undefined;

    // Deselected first so a mode cancelling a drag or preview puts the
    // committed shape back; the feature is read only after that, so the
    // history, the event, and the return value never carry a preview.
    this.selection.remove(id);
    const feature = this.featureStore.getById(id);
    if (!feature) return undefined;

    this.featureStore.remove(id);
    const action = new DeleteAction(feature);
    this.historyManager.push(action);
    this.eventBus.emit('delete', { feature: cloneFeature(feature) });
    this.renderAllFeatures();
    this.updateToolbarHistoryState();

    return feature;
  }

  /**
   * Undo without touching the event origin (see {@link removeFeature}).
   * Shared by the public `undo()`, the toolbar button, and the shortcut.
   */
  private performUndo(): boolean {
    const action = this.historyManager.undo(this.featureStore);
    if (action) {
      this.syncAfterExternalChange();
      this.updateToolbarHistoryState();
      this.emitUndoEvent(action);
    }
    return action !== null;
  }

  /**
   * Redo without touching the event origin (see {@link removeFeature}).
   */
  private performRedo(): boolean {
    const action = this.historyManager.redo(this.featureStore);
    if (action) {
      this.syncAfterExternalChange();
      this.updateToolbarHistoryState();
      this.emitRedoEvent(action);
    }
    return action !== null;
  }

  /**
   * Bring the screen and the active selection in line with the store after
   * it changed behind the modes' back (undo / redo, an operation called
   * from the API). Selection bases are re-read, never written back.
   */
  private syncAfterExternalChange(): void {
    this.renderAllFeatures();
    this.selection.retain((id) => this.featureStore.getById(id) !== undefined);
    this.modeManager.getCurrentMode()?.refreshFromStore?.();
  }

  /**
   * Initialize rendering and input handling after the map is ready.
   */
  private initialize(): void {
    if (this.destroyed) return;
    this.renderManager.initialize();
    if (!this.inputEnabled) {
      this.inputHandler.enable();
      this.reticleInput.enable();
      this.inputEnabled = true;
    }
    this.renderAllFeatures();
    this.syncReticle();
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
          this.modeManager.setMode(current === 'draw-point' ? 'idle' : 'draw-point');
        },
        onDrawLineClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'draw-line' ? 'idle' : 'draw-line');
        },
        onDrawPolygonClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'draw-polygon' ? 'idle' : 'draw-polygon');
        },
        onDrawRectangleClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'draw-rectangle' ? 'idle' : 'draw-rectangle');
        },
        onDrawAngledRectangleClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(
            current === 'draw-angled-rectangle' ? 'idle' : 'draw-angled-rectangle'
          );
        },
        onSelectClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'select' ? 'idle' : 'select');
        },
        onSplitClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'split' ? 'idle' : 'split');
        },
        onUnionClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'union' ? 'idle' : 'union');
        },
        onUnionExecute: () => {
          this.unionMode.execute();
        },
        onSetbackClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'setback' ? 'idle' : 'setback');
        },
        onSetbackExecute: (distance) => {
          this.setbackMode.executeFromUi(distance);
        },
        onSetbackDistanceChange: (distance) => {
          this.setbackMode.onDistanceChange(distance);
        },
        onRotateClick: () => {
          const current = this.modeManager.getMode();
          this.modeManager.setMode(current === 'rotate' ? 'idle' : 'rotate');
        },
        onRotateExecute: (angle) => {
          this.rotateMode.executeFromUi(angle);
        },
        onRotateAngleChange: (angle) => {
          this.rotateMode.onAngleChange(angle);
        },
        onStyleChange: (style) => {
          this.setStyle(style);
        },
        // Toolbar buttons call the internal variants (not the public
        // methods) so their events are stamped origin: 'user'.
        onDeleteClick: () => {
          // One history step for the whole selection; no-op outside select mode.
          this.selectMode.deleteSelected();
        },
        onUndoClick: () => {
          this.performUndo();
        },
        onRedoClick: () => {
          this.performRedo();
        },
      },
      options,
      this.messages
    );

    // Set initial states
    this.toolbar.setActiveMode(this.modeManager.getMode());
    this.toolbar.setHistoryState(this.historyManager.canUndo(), this.historyManager.canRedo());
  }

  /**
   * Apply map interaction settings declared by the active mode.
   */
  private applyMapInteractions(config: MapInteractionConfig): void {
    // The reticle is aimed by moving the map, so the map always pans.
    if (config.dragPan || this.isReticleActive()) {
      this.map.dragPan.enable();
    } else {
      this.map.dragPan.disable();
    }

    if (config.doubleClickZoom) {
      this.map.doubleClickZoom.enable();
    } else {
      this.map.doubleClickZoom.disable();
    }

    // Only switched off by modes that give Shift a meaning; everywhere else
    // (and after destroy(), which goes back to idle) the host's choice stands.
    if (config.boxZoom ?? this.mapBoxZoomEnabled) {
      this.map.boxZoom.enable();
    } else {
      this.map.boxZoom.disable();
    }
  }

  /**
   * Whether the center reticle drives the active mode: the reticle input
   * method is chosen and a drawing mode is active.
   */
  private isReticleActive(): boolean {
    return this.inputMethod === 'reticle' && DRAWING_MODES.has(this.modeManager.getMode());
  }

  /**
   * Show or hide the reticle UI for the current mode and input method, and
   * move the preview to the reticle when it takes over.
   */
  private syncReticle(): void {
    const active = this.isReticleActive();
    this.reticleOverlay.setVisible(active);
    if (active) this.reticleInput.syncPreview();
  }

  /**
   * Update toolbar undo/redo button states.
   */
  private updateToolbarHistoryState(): void {
    if (this.toolbar) {
      this.toolbar.setHistoryState(this.historyManager.canUndo(), this.historyManager.canRedo());
    }
  }

  /**
   * Clear selection-related rendering and state.
   */
  private resetSelectionState(): void {
    this.selection.clear();
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
   * Normalize the keyboard option into a fully-resolved configuration.
   */
  private normalizeKeyboardConfig(keyboard?: boolean | KeyboardOptions): Required<KeyboardOptions> {
    if (keyboard === false) return { undoRedo: false };
    if (keyboard === undefined || keyboard === true) return { undoRedo: true };
    return { undoRedo: keyboard.undoRedo ?? true };
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
    } else if (action instanceof UnionAction) {
      this.eventBus.emit('delete', { feature: cloneFeature(action.resultFeature) });
      for (const feature of action.originalFeatures) {
        this.eventBus.emit('create', { feature: cloneFeature(feature) });
      }
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
      this.eventBus.emit('setback', {
        originalFeature: cloneFeature(action.originalFeature),
        feature: cloneFeature(action.resultFeature),
        edgeIndex: action.edgeIndex,
        distance: action.distance,
      });
    } else if (action instanceof UnionAction) {
      this.eventBus.emit('union', {
        originalFeatures: action.originalFeatures.map(cloneFeature),
        feature: cloneFeature(action.resultFeature),
      });
    }
  }

  /**
   * Assert that this instance has not been destroyed.
   * @throws LibreDrawError if destroyed.
   */
  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new LibreDrawError('This LibreDraw instance has been destroyed.');
    }
  }
}
