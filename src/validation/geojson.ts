import type { LibreDrawFeature, Position } from '../types/features';
import { LibreDrawError } from '../core/errors';
import { hasRingSelfIntersection } from './intersection';
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
 * Validate that a coordinate is within valid geographic bounds.
 * @param position - The coordinate to validate.
 */
function validateCoordinate(position: Position): void {
  const [lng, lat] = position;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new LibreDrawError(
      `Invalid coordinate: expected [number, number], got [${typeof lng}, ${typeof lat}]`,
    );
  }
  if (lng < -180 || lng > 180) {
    throw new LibreDrawError(
      `Invalid longitude: ${lng}. Must be between -180 and 180.`,
    );
  }
  if (lat < -90 || lat > 90) {
    throw new LibreDrawError(
      `Invalid latitude: ${lat}. Must be between -90 and 90.`,
    );
  }
}

/**
 * Validate that a ring (array of positions) is a valid linear ring.
 * A valid ring must have at least 4 positions and be closed
 * (first position equals last position).
 * @param ring - The ring to validate.
 */
function validateRing(ring: Position[]): void {
  if (!Array.isArray(ring)) {
    throw new LibreDrawError('Ring must be an array of positions.');
  }
  if (ring.length < 4) {
    throw new LibreDrawError(
      `Ring must have at least 4 positions (got ${ring.length}). A valid polygon ring requires 3 unique vertices plus a closing vertex.`,
    );
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!positionsEqual(first, last)) {
    throw new LibreDrawError(
      'Ring is not closed. The first and last positions must be identical.',
    );
  }

  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2) {
      throw new LibreDrawError(
        'Each position in a ring must be an array of at least 2 numbers.',
      );
    }
    validateCoordinate(pos as Position);
  }

  if (hasRingSelfIntersection(ring as Position[])) {
    throw new LibreDrawError(
      'Ring has self-intersections. Polygon edges must not cross each other.',
    );
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
  if (
    feature === null ||
    feature === undefined ||
    typeof feature !== 'object'
  ) {
    throw new LibreDrawError('Feature must be a non-null object.');
  }

  const f = feature as Record<string, unknown>;

  if (f.type !== 'Feature') {
    throw new LibreDrawError(
      `Feature.type must be "Feature", got "${String(f.type)}".`,
    );
  }

  if (
    f.geometry === null ||
    f.geometry === undefined ||
    typeof f.geometry !== 'object'
  ) {
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
  properties: Record<string, unknown>,
): LibreDrawFeature {
  if (!Array.isArray(geom.coordinates)) {
    throw new LibreDrawError(
      'Feature.geometry.coordinates must be an array.',
    );
  }

  const coords = geom.coordinates as unknown[];
  if (coords.length < 2 || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    throw new LibreDrawError(
      'Point coordinates must be [longitude, latitude].',
    );
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
 * Validate a Polygon geometry and return a LibreDrawFeature.
 */
function validatePolygonFeature(
  geom: Record<string, unknown>,
  id: string,
  properties: Record<string, unknown>,
): LibreDrawFeature {
  if (!Array.isArray(geom.coordinates)) {
    throw new LibreDrawError(
      'Feature.geometry.coordinates must be an array.',
    );
  }

  const coordinates = geom.coordinates as Position[][];
  if (coordinates.length === 0) {
    throw new LibreDrawError(
      'Polygon must have at least one ring (outer ring).',
    );
  }

  for (const ring of coordinates) {
    validateRing(ring);
  }

  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coordinates.map((ring) =>
        ring.map((position) => [position[0], position[1]] as Position),
      ),
    },
    properties,
  };
}

/**
 * Validate a single GeoJSON-like object as a valid LibreDraw Feature
 * with Point or Polygon geometry.
 * @param feature - The object to validate.
 * @returns The validated feature.
 * @throws LibreDrawError if the feature is invalid.
 */
export function validateFeature(feature: unknown): LibreDrawFeature {
  const { geom, id, properties } = validateFeatureEnvelope(feature);

  if (geom.type === 'Point') {
    return validatePointFeature(geom, id, properties);
  }

  if (geom.type === 'Polygon') {
    return validatePolygonFeature(geom, id, properties);
  }

  throw new LibreDrawError(
    `Feature.geometry.type must be "Point" or "Polygon", got "${String(geom.type)}".`,
  );
}

/**
 * Validate that an unknown value is a valid GeoJSON FeatureCollection
 * containing only valid Polygon features.
 * @param geojson - The value to validate.
 * @returns The validated FeatureCollection.
 * @throws LibreDrawError if the value is invalid.
 */
export function validateGeoJSON(geojson: unknown): {
  type: 'FeatureCollection';
  features: LibreDrawFeature[];
} {
  if (
    geojson === null ||
    geojson === undefined ||
    typeof geojson !== 'object'
  ) {
    throw new LibreDrawError('GeoJSON must be a non-null object.');
  }

  const obj = geojson as Record<string, unknown>;

  if (obj.type !== 'FeatureCollection') {
    throw new LibreDrawError(
      `GeoJSON.type must be "FeatureCollection", got "${String(obj.type)}".`,
    );
  }

  if (!Array.isArray(obj.features)) {
    throw new LibreDrawError('GeoJSON.features must be an array.');
  }

  const fc = geojson as FeatureCollectionLike;
  const validatedFeatures: LibreDrawFeature[] = [];

  for (let i = 0; i < fc.features.length; i++) {
    try {
      validatedFeatures.push(validateFeature(fc.features[i]));
    } catch (err) {
      if (err instanceof LibreDrawError) {
        throw new LibreDrawError(
          `Invalid feature at index ${i}: ${err.message}`,
        );
      }
      throw err;
    }
  }

  return {
    type: 'FeatureCollection',
    features: validatedFeatures,
  };
}
