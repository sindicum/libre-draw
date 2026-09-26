import type {
  LibreDrawFeature,
  LineStringGeometry,
  PolygonGeometry,
  Position,
} from '../types/features';

/**
 * Assert that the feature has LineString geometry and return it narrowed.
 */
function assertLineString(feature: LibreDrawFeature): LineStringGeometry {
  if (feature.geometry.type !== 'LineString') {
    throw new Error(`Expected LineString geometry, got ${feature.geometry.type}`);
  }
  return feature.geometry;
}

/**
 * Assert that the feature has Polygon geometry and return it narrowed.
 */
function assertPolygon(feature: LibreDrawFeature): PolygonGeometry {
  if (feature.geometry.type !== 'Polygon') {
    throw new Error(`Expected Polygon geometry, got ${feature.geometry.type}`);
  }
  return feature.geometry;
}

/**
 * Get the unique vertices (excluding the closing point) of a polygon's
 * outer ring.
 * @param feature - Must have Polygon geometry.
 */
export function getVertices(feature: LibreDrawFeature): Position[] {
  return getRingVertices(feature)[0];
}

/**
 * Get the unique vertices (excluding the closing point) of every ring of a
 * polygon: the outer ring first, then the holes in their stored order.
 * @param feature - Must have Polygon geometry.
 */
export function getRingVertices(feature: LibreDrawFeature): Position[][] {
  const geom = assertPolygon(feature);
  return geom.coordinates.map((ring) => ring.slice(0, ring.length - 1));
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
 * Build a polygon feature whose ring `ringIndex` is replaced; the other
 * rings are kept as they are.
 */
function withRing(
  feature: LibreDrawFeature,
  geom: PolygonGeometry,
  ringIndex: number,
  ring: Position[]
): LibreDrawFeature {
  const coordinates = geom.coordinates.map((r, i) => (i === ringIndex ? ring : r));
  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates,
    },
  };
}

/**
 * Create a new feature with a vertex moved to a new position.
 * @param ringIndex - The ring holding the vertex (`0`, the outer ring, by default).
 */
export function moveVertex(
  feature: LibreDrawFeature,
  vertexIndex: number,
  newPos: Position,
  ringIndex = 0
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const ring = [...geom.coordinates[ringIndex]];
  ring[vertexIndex] = newPos;

  // If moving first vertex, also update closing point.
  if (vertexIndex === 0) {
    ring[ring.length - 1] = newPos;
  }
  // If moving the closing point, also update first vertex.
  if (vertexIndex === ring.length - 1) {
    ring[0] = newPos;
  }

  return withRing(feature, geom, ringIndex, ring);
}

/**
 * Create a new feature with every ring translated by the given delta.
 */
export function movePolygon(
  feature: LibreDrawFeature,
  dLng: number,
  dLat: number
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const coordinates = geom.coordinates.map((ring) =>
    ring.map((pos): Position => [pos[0] + dLng, pos[1] + dLat])
  );

  return {
    ...feature,
    geometry: {
      type: 'Polygon',
      coordinates,
    },
  };
}

/**
 * Create a new feature with a vertex inserted at the given index.
 * @param ringIndex - The ring to insert into (`0`, the outer ring, by default).
 */
export function insertVertex(
  feature: LibreDrawFeature,
  insertIndex: number,
  pos: Position,
  ringIndex = 0
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const ring = [...geom.coordinates[ringIndex]];
  ring.splice(insertIndex, 0, pos);

  return withRing(feature, geom, ringIndex, ring);
}

/**
 * Create a new feature with a vertex removed at the given index.
 * @param ringIndex - The ring to remove from (`0`, the outer ring, by default).
 */
export function removeVertex(
  feature: LibreDrawFeature,
  vertexIndex: number,
  ringIndex = 0
): LibreDrawFeature {
  const geom = assertPolygon(feature);
  const vertices = getRingVertices(feature)[ringIndex];
  const newVertices = vertices.filter((_, i) => i !== vertexIndex);
  const ring: Position[] = [...newVertices, [...newVertices[0]] as Position];

  return withRing(feature, geom, ringIndex, ring);
}

// ── LineString utility functions ──

/**
 * Get all vertices of a LineString.
 * @param feature - Must have LineString geometry.
 */
export function getLineVertices(feature: LibreDrawFeature): Position[] {
  const geom = assertLineString(feature);
  return geom.coordinates.map((pos) => [pos[0], pos[1]] as Position);
}

/**
 * Compute midpoints for each segment of a LineString (open, not closed).
 */
export function computeLineMidpoints(vertices: Position[]): Position[] {
  const midpoints: Position[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    midpoints.push([
      (vertices[i][0] + vertices[i + 1][0]) / 2,
      (vertices[i][1] + vertices[i + 1][1]) / 2,
    ]);
  }
  return midpoints;
}

/**
 * Create a new LineString feature with a vertex moved to a new position.
 */
export function moveLineVertex(
  feature: LibreDrawFeature,
  vertexIndex: number,
  newPos: Position
): LibreDrawFeature {
  const geom = assertLineString(feature);
  const coords = [...geom.coordinates];
  coords[vertexIndex] = newPos;

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

/**
 * Create a new LineString feature with all vertices translated by the given delta.
 */
export function moveLine(feature: LibreDrawFeature, dLng: number, dLat: number): LibreDrawFeature {
  const geom = assertLineString(feature);
  const coords = geom.coordinates.map((pos): Position => [pos[0] + dLng, pos[1] + dLat]);

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

/**
 * Create a new LineString feature with a vertex inserted at the given index.
 */
export function insertLineVertex(
  feature: LibreDrawFeature,
  insertIndex: number,
  pos: Position
): LibreDrawFeature {
  const geom = assertLineString(feature);
  const coords = [...geom.coordinates];
  coords.splice(insertIndex, 0, pos);

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

/**
 * Create a new LineString feature with a vertex removed at the given index.
 * Maintains a minimum of 2 vertices.
 */
export function removeLineVertex(feature: LibreDrawFeature, vertexIndex: number): LibreDrawFeature {
  const geom = assertLineString(feature);
  if (geom.coordinates.length <= 2) {
    throw new Error('Cannot remove vertex: LineString must maintain at least 2 vertices.');
  }
  const coords = geom.coordinates.filter((_, i) => i !== vertexIndex);

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}
