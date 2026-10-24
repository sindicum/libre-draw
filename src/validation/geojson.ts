import type { CoordinateRounder, LibreDrawFeature, Position } from '../types/features';
import type { FeatureValidationResult } from '../types/operations';
import { LibreDrawError } from '../core/errors';
import {
  findPolygonRingError,
  findRingRelationError,
  hasRingSelfIntersection,
  isCollinearRing,
} from './intersection';
import type { PolygonRingError } from './intersection';
import { deepCloneValue } from '../utils/featureSnapshot';

/**
 * A GeoJSON FeatureCollection type for validation purposes.
 */
interface FeatureCollectionLike {
  type: 'FeatureCollection';
  features: unknown[];
}

/**
 * Check if two positions are equal.
 */
function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Validate that a coordinate is a pair of finite numbers within geographic
 * bounds (longitude -180..180, latitude -90..90, both ends inclusive).
 * @param position - The coordinate to validate.
 */
function validateCoordinate(position: Position): void {
  const [lng, lat] = position;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new LibreDrawError(
      `Invalid coordinate: expected [number, number], got [${typeof lng}, ${typeof lat}]`
    );
  }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new LibreDrawError(`Invalid coordinate: [${lng}, ${lat}] must contain finite numbers.`);
  }
  if (lng < -180 || lng > 180) {
    throw new LibreDrawError(`Invalid longitude: ${lng}. Must be between -180 and 180.`);
  }
  if (lat < -90 || lat > 90) {
    throw new LibreDrawError(`Invalid latitude: ${lat}. Must be between -90 and 90.`);
  }
}

/**
 * The rejection text for each ring problem. It becomes the `message` of a
 * rejected `validateFeature` / `addFeatures` / `updateFeature` call.
 */
const RING_ERROR_MESSAGES: Record<PolygonRingError, string> = {
  'self-intersection': 'Ring has self-intersections. Polygon edges must not cross each other.',
  'ring-intersection':
    'Polygon rings intersect. A hole must not cross or overlap the outer ring or another hole.',
  'hole-outside': 'Polygon hole lies outside the outer ring. Every hole must be inside it.',
  'hole-nested': 'Polygon hole lies inside another hole. Holes must not be nested.',
};

/**
 * Validate that a ring (array of positions) is a valid linear ring:
 * at least 4 positions, each a valid coordinate (see `validateCoordinate`),
 * closed (first position equals last), with at least 3 distinct vertices
 * that are not all on one line, and no self-intersections.
 *
 * Every element is type-checked before the closing test so that malformed
 * input (`null`, a string) is reported as a `LibreDrawError` rather than
 * surfacing as a `TypeError`.
 * @param ring - The ring to validate.
 */
function validateRing(ring: Position[]): void {
  if (!Array.isArray(ring)) {
    throw new LibreDrawError('Ring must be an array of positions.');
  }
  if (ring.length < 4) {
    throw new LibreDrawError(
      `Ring must have at least 4 positions (got ${ring.length}). A valid polygon ring requires 3 unique vertices plus a closing vertex.`
    );
  }

  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2) {
      throw new LibreDrawError('Each position in a ring must be an array of at least 2 numbers.');
    }
    validateCoordinate(pos as Position);
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!positionsEqual(first, last)) {
    throw new LibreDrawError('Ring is not closed. The first and last positions must be identical.');
  }

  // Checked before self-intersection: a collinear ring of 5+ positions also
  // has overlapping edges, and the degenerate shape is the more direct cause.
  if (isCollinearRing(ring)) {
    throw new LibreDrawError(
      'Ring is degenerate: its positions are identical or collinear. A valid polygon ring requires 3 unique vertices that do not lie on one line.'
    );
  }

  if (hasRingSelfIntersection(ring)) {
    throw new LibreDrawError(RING_ERROR_MESSAGES['self-intersection']);
  }
}

/**
 * Extract and validate common feature envelope (type, geometry, id, properties).
 */
function validateFeatureEnvelope(feature: unknown): {
  geom: Record<string, unknown>;
  id: string;
  properties: Record<string, unknown>;
} {
  if (feature === null || feature === undefined || typeof feature !== 'object') {
    throw new LibreDrawError('Feature must be a non-null object.');
  }

  const f = feature as Record<string, unknown>;

  if (f.type !== 'Feature') {
    throw new LibreDrawError(`Feature.type must be "Feature", got "${String(f.type)}".`);
  }

  if (f.geometry === null || f.geometry === undefined || typeof f.geometry !== 'object') {
    throw new LibreDrawError('Feature.geometry must be a non-null object.');
  }

  const geom = f.geometry as Record<string, unknown>;

  const id = typeof f.id === 'string' ? f.id : '';
  const propertiesRaw = f.properties;
  const properties =
    propertiesRaw !== null &&
    propertiesRaw !== undefined &&
    typeof propertiesRaw === 'object' &&
    !Array.isArray(propertiesRaw)
      ? deepCloneValue(propertiesRaw as Record<string, unknown>)
      : {};

  return { geom, id, properties };
}

/**
 * Validate a Point geometry and return a LibreDrawFeature.
 */
function validatePointFeature(
  geom: Record<string, unknown>,
  id: string,
  properties: Record<string, unknown>
): LibreDrawFeature {
  if (!Array.isArray(geom.coordinates)) {
    throw new LibreDrawError('Feature.geometry.coordinates must be an array.');
  }

  const coords = geom.coordinates as unknown[];
  if (coords.length < 2 || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    throw new LibreDrawError('Point coordinates must be [longitude, latitude].');
  }

  const position: Position = [coords[0] as number, coords[1] as number];
  validateCoordinate(position);

  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: position,
    },
    properties,
  };
}

/**
 * Validate a LineString geometry and return a LibreDrawFeature.
 */
function validateLineStringFeature(
  geom: Record<string, unknown>,
  id: string,
  properties: Record<string, unknown>
): LibreDrawFeature {
  if (!Array.isArray(geom.coordinates)) {
    throw new LibreDrawError('Feature.geometry.coordinates must be an array.');
  }

  const coordinates = geom.coordinates as unknown[];
  if (coordinates.length < 2) {
    throw new LibreDrawError(
      `LineString must have at least 2 positions (got ${coordinates.length}).`
    );
  }

  const validatedCoords: Position[] = [];
  for (const pos of coordinates) {
    if (!Array.isArray(pos) || pos.length < 2) {
      throw new LibreDrawError(
        'Each position in a LineString must be an array of at least 2 numbers.'
      );
    }
    const position: Position = [pos[0] as number, pos[1] as number];
    if (typeof position[0] !== 'number' || typeof position[1] !== 'number') {
      throw new LibreDrawError('Each position in a LineString must contain numeric coordinates.');
    }
    validateCoordinate(position);
    validatedCoords.push(position);
  }

  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: validatedCoords,
    },
    properties,
  };
}

/**
 * Validate a Polygon geometry and return a LibreDrawFeature.
 */
function validatePolygonFeature(
  geom: Record<string, unknown>,
  id: string,
  properties: Record<string, unknown>
): LibreDrawFeature {
  if (!Array.isArray(geom.coordinates)) {
    throw new LibreDrawError('Feature.geometry.coordinates must be an array.');
  }

  const coordinates = geom.coordinates as Position[][];
  if (coordinates.length === 0) {
    throw new LibreDrawError('Polygon must have at least one ring (outer ring).');
  }

  for (const ring of coordinates) {
    validateRing(ring);
  }

  // Each ring is valid on its own; now check the holes against the outer
  // ring and each other.
  const ringError = coordinates.length > 1 ? findRingRelationError(coordinates) : null;
  if (ringError !== null) {
    throw new LibreDrawError(RING_ERROR_MESSAGES[ringError]);
  }

  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coordinates.map((ring) =>
        ring.map((position) => [position[0], position[1]] as Position)
      ),
    },
    properties,
  };
}

/**
 * Validate a single GeoJSON-like object as a valid LibreDraw Feature
 * with Point, LineString, or Polygon geometry.
 *
 * The result is a normalized copy: a non-string `id` becomes `''` (the
 * store assigns one), a `properties` value that is not a plain object
 * becomes `{}`, and any coordinate dimension beyond `[lng, lat]` is dropped.
 * @param feature - The object to validate.
 * @returns The validated feature.
 * @throws LibreDrawError if the feature is invalid.
 */
export function validateFeature(feature: unknown): LibreDrawFeature {
  const { geom, id, properties } = validateFeatureEnvelope(feature);

  if (geom.type === 'Point') {
    return validatePointFeature(geom, id, properties);
  }

  if (geom.type === 'LineString') {
    return validateLineStringFeature(geom, id, properties);
  }

  if (geom.type === 'Polygon') {
    return validatePolygonFeature(geom, id, properties);
  }

  throw new LibreDrawError(
    `Feature.geometry.type must be "Point", "LineString", or "Polygon", got "${String(geom.type)}".`
  );
}

/** Prefix of the message when a feature is valid but its rounded shape is not. */
const ROUNDED_PREFIX = 'Invalid after rounding the coordinates: ';

/**
 * Validate a feature and, with a rounder, round the validated copy and
 * validate the rounded shape too. Input that is invalid before rounding is
 * rejected even if rounding would repair it.
 */
function validateRoundedFeature(feature: unknown, round?: CoordinateRounder): LibreDrawFeature {
  const validated = validateFeature(feature);
  if (!round) return validated;
  try {
    return validateFeature(round.feature(validated));
  } catch (err) {
    if (err instanceof LibreDrawError) {
      throw new LibreDrawError(`${ROUNDED_PREFIX}${err.message}`);
    }
    throw err;
  }
}

/**
 * Validate a single GeoJSON-like object without throwing.
 *
 * Wraps {@link validateFeature}: a `LibreDrawError` becomes
 * `{ valid: false, reason: 'invalid-feature', message }` carrying the same
 * message as the throwing path. Any other exception is a bug and propagates.
 * With `round`, the feature is also rounded and the rounded shape must pass
 * the same validation; the returned feature is the rounded one.
 * @param feature - The object to validate.
 * @param round - Rounds the validated copy before it is validated again.
 * @returns The normalized feature, or the failure code and message.
 */
export function tryValidateFeature(
  feature: unknown,
  round?: CoordinateRounder
): FeatureValidationResult {
  try {
    return { valid: true, feature: validateRoundedFeature(feature, round) };
  } catch (err) {
    if (err instanceof LibreDrawError) {
      return { valid: false, reason: 'invalid-feature', message: err.message };
    }
    throw err;
  }
}

/**
 * Validate that an unknown value is a valid GeoJSON FeatureCollection
 * whose features all pass {@link validateFeature} (Point, LineString, or
 * Polygon). With `round`, each feature is rounded and validated again as in
 * {@link tryValidateFeature}.
 * @param geojson - The value to validate.
 * @param round - Rounds each validated feature before it is validated again.
 * @returns The validated FeatureCollection.
 * @throws LibreDrawError if the value is invalid.
 */
export function validateGeoJSON(
  geojson: unknown,
  round?: CoordinateRounder
): {
  type: 'FeatureCollection';
  features: LibreDrawFeature[];
} {
  if (geojson === null || geojson === undefined || typeof geojson !== 'object') {
    throw new LibreDrawError('GeoJSON must be a non-null object.');
  }

  const obj = geojson as Record<string, unknown>;

  if (obj.type !== 'FeatureCollection') {
    throw new LibreDrawError(
      `GeoJSON.type must be "FeatureCollection", got "${String(obj.type)}".`
    );
  }

  if (!Array.isArray(obj.features)) {
    throw new LibreDrawError('GeoJSON.features must be an array.');
  }

  const fc = geojson as FeatureCollectionLike;
  const validatedFeatures: LibreDrawFeature[] = [];

  for (let i = 0; i < fc.features.length; i++) {
    try {
      validatedFeatures.push(validateRoundedFeature(fc.features[i], round));
    } catch (err) {
      if (err instanceof LibreDrawError) {
        throw new LibreDrawError(`Invalid feature at index ${i}: ${err.message}`);
      }
      throw err;
    }
  }

  return {
    type: 'FeatureCollection',
    features: validatedFeatures,
  };
}

/**
 * Outcome of {@link tryValidateGeoJSON}.
 */
export type GeoJSONValidationResult =
  | { valid: true; features: LibreDrawFeature[] }
  | { valid: false; reason: 'invalid-geojson'; message: string };

/**
 * Validate a FeatureCollection without throwing.
 *
 * Wraps {@link validateGeoJSON}: a `LibreDrawError` becomes
 * `{ valid: false, reason: 'invalid-geojson', message }` with the same
 * message (including the `Invalid feature at index i:` prefix), and any
 * other exception propagates.
 * @param geojson - The value to validate.
 * @param round - Rounds each validated feature before it is validated again.
 * @returns The normalized features, or the failure code and message.
 */
export function tryValidateGeoJSON(
  geojson: unknown,
  round?: CoordinateRounder
): GeoJSONValidationResult {
  try {
    return { valid: true, features: validateGeoJSON(geojson, round).features };
  } catch (err) {
    if (err instanceof LibreDrawError) {
      return { valid: false, reason: 'invalid-geojson', message: err.message };
    }
    throw err;
  }
}

/**
 * Why a shape built by an edit failed validation, as reported by
 * `editrejected` and the `rotate()` result.
 */
export type RejectedShapeReason = 'out-of-range' | PolygonRingError | 'invalid-result';

/**
 * Classify a shape that failed validation. An edit keeps the shape on the
 * screen, but back in longitude / latitude it can leave the coordinate
 * range, bend a ring across another near the poles, or (after rounding)
 * collapse onto a line.
 */
export function rejectedShapeReason(shape: LibreDrawFeature): RejectedShapeReason {
  const { geometry } = shape;
  const positions: Position[] =
    geometry.type === 'Polygon'
      ? geometry.coordinates.flat()
      : geometry.type === 'LineString'
        ? geometry.coordinates
        : [geometry.coordinates];
  const inRange = ([lng, lat]: Position) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  if (!positions.every(inRange)) return 'out-of-range';
  if (geometry.type === 'Polygon') {
    return findPolygonRingError(geometry.coordinates) ?? 'invalid-result';
  }
  return 'invalid-result';
}

/**
 * Why rounding made a valid shape invalid, or `undefined` when it did not
 * (the rounded shape is valid, or the shape was invalid before rounding).
 * Edits on the map use this to refuse a commit that only rounding breaks,
 * such as a polygon smaller than the precision collapsing onto a line.
 */
export function roundingRejection(
  shape: LibreDrawFeature,
  round: CoordinateRounder
): { reason: RejectedShapeReason; message: string } | undefined {
  if (!tryValidateFeature(shape).valid) return undefined;
  const rounded = round.feature(shape);
  const validation = tryValidateFeature(rounded);
  if (validation.valid) return undefined;
  return { reason: rejectedShapeReason(rounded), message: validation.message };
}
