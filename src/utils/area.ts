import turfArea from '@turf/area';
import type { LibreDrawFeature, PolygonGeometry } from '../types/features';

/** Computes the area of a polygon in square meters. */
export type AreaMeasure = (geometry: PolygonGeometry) => number;

/**
 * Area on a sphere with the mean Earth radius (6,371,008.8 m), holes
 * subtracted (`@turf/area`).
 */
export const sphericalArea: AreaMeasure = (geometry) => turfArea(geometry);

/**
 * Area of a feature in square meters, or `undefined` when there is no
 * feature or it is not a Polygon. Whatever `measure` returns or throws
 * reaches the caller unchanged.
 */
export function featureArea(
  feature: LibreDrawFeature | undefined,
  measure: AreaMeasure
): number | undefined {
  if (feature?.geometry.type !== 'Polygon') return undefined;
  return measure(feature.geometry);
}
