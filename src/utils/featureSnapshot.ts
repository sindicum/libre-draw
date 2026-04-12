import type {
  FeatureCollection,
  FeatureProperties,
  LibreDrawFeature,
  Position,
} from '../types/features';

/**
 * Deep-clone JSON-like values to prevent shared mutable references.
 */
export function deepCloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneValue(item)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const cloned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      cloned[key] = deepCloneValue(item);
    }
    return cloned as T;
  }

  return value;
}

/**
 * Clone coordinates deeply ([lng, lat][][]).
 */
export function cloneCoordinates(
  coordinates: Position[][],
): Position[][] {
  return coordinates.map((ring) =>
    ring.map((position) => [position[0], position[1]] as Position),
  );
}

/**
 * Clone arbitrary feature properties deeply.
 */
export function cloneProperties(
  properties: FeatureProperties,
): FeatureProperties {
  return deepCloneValue(properties);
}

/**
 * Create a deep snapshot of a feature.
 */
export function cloneFeature(feature: LibreDrawFeature): LibreDrawFeature {
  let geometry: LibreDrawFeature['geometry'];
  if (feature.geometry.type === 'Point') {
    geometry = {
      type: 'Point',
      coordinates: [
        feature.geometry.coordinates[0],
        feature.geometry.coordinates[1],
      ] as Position,
    };
  } else if (feature.geometry.type === 'LineString') {
    geometry = {
      type: 'LineString',
      coordinates: feature.geometry.coordinates.map(
        (pos) => [pos[0], pos[1]] as Position,
      ),
    };
  } else {
    geometry = {
      type: 'Polygon',
      coordinates: cloneCoordinates(feature.geometry.coordinates),
    };
  }

  return {
    id: feature.id,
    type: 'Feature',
    geometry,
    properties: cloneProperties(feature.properties),
  };
}

/**
 * Create a deep snapshot of a FeatureCollection.
 */
export function cloneFeatureCollection(
  collection: FeatureCollection,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature) => cloneFeature(feature)),
  };
}
