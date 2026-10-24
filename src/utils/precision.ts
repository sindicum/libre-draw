import type { CoordinateRounder, LibreDrawFeature, Position } from '../types/features';

/** Largest number of decimal places `coordinatePrecision` accepts. */
export const MAX_COORDINATE_PRECISION = 15;

/**
 * Whether a value is a valid `coordinatePrecision`: `false`, or an integer
 * from 0 to {@link MAX_COORDINATE_PRECISION}.
 */
export function isCoordinatePrecision(value: unknown): value is number | false {
  return (
    value === false ||
    (Number.isInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= MAX_COORDINATE_PRECISION)
  );
}

/**
 * Build the rounder for a precision. `false` returns positions and
 * features unchanged.
 *
 * Rounding goes through `toFixed`, which rounds the exact binary value of
 * the number in decimal, so rounding an already rounded value returns it
 * unchanged. Scaling by `10 ** precision` instead would leave the exactly
 * representable range at high precisions and could move such a value by
 * one unit in the last place. A negative zero becomes `0`.
 */
export function createCoordinateRounder(precision: number | false): CoordinateRounder {
  if (precision === false) {
    return { position: (position) => position, feature: (feature) => feature };
  }
  const roundValue = (value: number): number => Number(value.toFixed(precision)) + 0;
  const position = ([lng, lat]: Position): Position => [roundValue(lng), roundValue(lat)];
  return { position, feature: (feature) => roundFeatureCoordinates(feature, position) };
}

function roundFeatureCoordinates(
  feature: LibreDrawFeature,
  round: (position: Position) => Position
): LibreDrawFeature {
  const { geometry } = feature;
  if (geometry.type === 'Point') {
    return { ...feature, geometry: { type: 'Point', coordinates: round(geometry.coordinates) } };
  }
  if (geometry.type === 'LineString') {
    return {
      ...feature,
      geometry: { type: 'LineString', coordinates: geometry.coordinates.map(round) },
    };
  }
  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => ring.map(round)),
    },
  };
}
