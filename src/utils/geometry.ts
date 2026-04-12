import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';

/**
 * Assert that the feature has Polygon geometry and return it narrowed.
 */
function assertPolygon(feature: LibreDrawFeature): PolygonGeometry {
  if (feature.geometry.type !== 'Polygon') {
    throw new Error(
      `Expected Polygon geometry, got ${feature.geometry.type}`,
    );
  }
  return feature.geometry;
}

/**
 * Get the unique vertices (excluding the closing point) of a polygon.
 * @param feature - Must have Polygon geometry.
 */
export function getVertices(feature: LibreDrawFeature): Position[] {
  const geom = assertPolygon(feature);
  const ring = geom.coordinates[0];
  return ring.slice(0, ring.length - 1);
}

/**
 * Compute midpoints for each edge of a polygon.
 */
export function computeMidpoints(vertices: Position[]): Position[] {
  const midpoints: Position[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    midpoints.push([
      (vertices[i][0] + vertices[next][0]) / 2,
      (vertices[i][1] + vertices[next][1]) / 2,
    ]);
  }
  return midpoints;
}

/**
 * Create a new feature with a vertex moved to a new position.
 */
export function moveVertex(
  feature: LibreDrawFeature,
  vertexIndex: number,
  newPos: Position,
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const ring = [...geom.coordinates[0]];
  ring[vertexIndex] = newPos;

  // If moving first vertex, also update closing point.
  if (vertexIndex === 0) {
    ring[ring.length - 1] = newPos;
  }
  // If moving the closing point, also update first vertex.
  if (vertexIndex === ring.length - 1) {
    ring[0] = newPos;
  }

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

/**
 * Create a new feature with all vertices translated by the given delta.
 */
export function movePolygon(
  feature: LibreDrawFeature,
  dLng: number,
  dLat: number,
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const ring = geom.coordinates[0].map(
    (pos): Position => [pos[0] + dLng, pos[1] + dLat],
  );

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

/**
 * Create a new feature with a vertex inserted at the given index.
 */
export function insertVertex(
  feature: LibreDrawFeature,
  insertIndex: number,
  pos: Position,
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const ring = [...geom.coordinates[0]];
  ring.splice(insertIndex, 0, pos);

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

/**
 * Create a new feature with a vertex removed at the given index.
 */
export function removeVertex(
  feature: LibreDrawFeature,
  vertexIndex: number,
): LibreDrawFeature {
  const vertices = getVertices(feature);
  const newVertices = vertices.filter((_, i) => i !== vertexIndex);
  const ring: Position[] = [...newVertices, [...newVertices[0]] as Position];

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}
