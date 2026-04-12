import { cloneFeature } from '../utils/featureSnapshot';

/**
 * A geographic coordinate pair [longitude, latitude].
 */
export type Position = [number, number];

/**
 * GeoJSON Point geometry.
 */
export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}

/**
 * GeoJSON Polygon geometry.
 */
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

/**
 * Union of supported GeoJSON geometry types.
 */
export type LibreDrawGeometry = PointGeometry | PolygonGeometry;

/**
 * Arbitrary key-value properties attached to a feature.
 */
export interface FeatureProperties {
  [key: string]: unknown;
}

/**
 * A GeoJSON Feature used internally by LibreDraw.
 * Supports Point and Polygon geometry types.
 */
export interface LibreDrawFeature {
  id: string;
  type: 'Feature';
  geometry: LibreDrawGeometry;
  properties: FeatureProperties;
}

/**
 * A GeoJSON FeatureCollection containing LibreDraw polygons.
 */
export interface FeatureCollection {
  type: 'FeatureCollection';
  features: LibreDrawFeature[];
}

/**
 * The type of history action.
 */
export type ActionType = 'create' | 'update' | 'delete' | 'split' | 'setback';

/**
 * A reversible action that can be applied and reverted on a FeatureStore.
 */
export interface Action {
  type: ActionType;
  apply(store: FeatureStoreInterface): void;
  revert(store: FeatureStoreInterface): void;
}

/**
 * Minimal interface for the FeatureStore used by actions.
 * This avoids circular imports between types and core modules.
 */
export interface FeatureStoreInterface {
  add(feature: LibreDrawFeature): void;
  update(id: string, feature: LibreDrawFeature): void;
  remove(id: string): void;
  getById(id: string): LibreDrawFeature | undefined;
}

/**
 * Action that represents the creation of a new feature.
 */
export class CreateAction implements Action {
  public readonly type: ActionType = 'create';
  public readonly feature: LibreDrawFeature;

  constructor(feature: LibreDrawFeature) {
    this.feature = cloneFeature(feature);
  }

  apply(store: FeatureStoreInterface): void {
    store.add(this.feature);
  }

  revert(store: FeatureStoreInterface): void {
    store.remove(this.feature.id);
  }
}

/**
 * Action that represents the update of an existing feature.
 */
export class UpdateAction implements Action {
  public readonly type: ActionType = 'update';
  public readonly id: string;
  public readonly oldFeature: LibreDrawFeature;
  public readonly newFeature: LibreDrawFeature;

  constructor(
    id: string,
    oldFeature: LibreDrawFeature,
    newFeature: LibreDrawFeature,
  ) {
    this.id = id;
    this.oldFeature = cloneFeature(oldFeature);
    this.newFeature = cloneFeature(newFeature);
  }

  apply(store: FeatureStoreInterface): void {
    store.update(this.id, this.newFeature);
  }

  revert(store: FeatureStoreInterface): void {
    store.update(this.id, this.oldFeature);
  }
}

/**
 * Action that represents the deletion of a feature.
 */
export class DeleteAction implements Action {
  public readonly type: ActionType = 'delete';
  public readonly feature: LibreDrawFeature;

  constructor(feature: LibreDrawFeature) {
    this.feature = cloneFeature(feature);
  }

  apply(store: FeatureStoreInterface): void {
    store.remove(this.feature.id);
  }

  revert(store: FeatureStoreInterface): void {
    store.add(this.feature);
  }
}

/**
 * Action that represents splitting one feature into two features.
 */
export class SplitAction implements Action {
  public readonly type: ActionType = 'split';
  public readonly originalFeature: LibreDrawFeature;
  public readonly featureA: LibreDrawFeature;
  public readonly featureB: LibreDrawFeature;

  constructor(
    originalFeature: LibreDrawFeature,
    featureA: LibreDrawFeature,
    featureB: LibreDrawFeature,
  ) {
    this.originalFeature = cloneFeature(originalFeature);
    this.featureA = cloneFeature(featureA);
    this.featureB = cloneFeature(featureB);
  }

  apply(store: FeatureStoreInterface): void {
    store.remove(this.originalFeature.id);
    store.add(this.featureA);
    store.add(this.featureB);
  }

  revert(store: FeatureStoreInterface): void {
    store.remove(this.featureA.id);
    store.remove(this.featureB.id);
    store.add(this.originalFeature);
  }
}

/**
 * Action that represents applying setback to one feature (1 -> 1 replacement).
 */
export class SetbackAction implements Action {
  public readonly type: ActionType = 'setback';
  public readonly originalFeature: LibreDrawFeature;
  public readonly resultFeature: LibreDrawFeature;

  constructor(
    originalFeature: LibreDrawFeature,
    resultFeature: LibreDrawFeature,
  ) {
    this.originalFeature = cloneFeature(originalFeature);
    this.resultFeature = cloneFeature(resultFeature);
  }

  apply(store: FeatureStoreInterface): void {
    store.remove(this.originalFeature.id);
    store.add(this.resultFeature);
  }

  revert(store: FeatureStoreInterface): void {
    store.remove(this.resultFeature.id);
    store.add(this.originalFeature);
  }
}
