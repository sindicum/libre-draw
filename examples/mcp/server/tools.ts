import { z } from 'zod';

/**
 * The MCP tools, one per LibreDraw public method. Input schemas only shape
 * the arguments; GeoJSON is validated by LibreDraw itself so that the
 * failure reasons come from one place.
 */

const geometry = z.record(z.string(), z.unknown()).describe('GeoJSON geometry object');
const feature = z.record(z.string(), z.unknown()).describe('GeoJSON Feature object');
const position = z.tuple([z.number(), z.number()]).describe('[longitude, latitude]');

export const TOOLS = {
  get_features: {
    description: 'Return every feature on the map as a GeoJSON FeatureCollection.',
    inputSchema: z.object({}),
  },
  get_feature: {
    description: 'Return one feature by id, or null when there is none.',
    inputSchema: z.object({ id: z.string() }),
  },
  add_features: {
    description:
      'Add GeoJSON features as one undo step. Returns one { valid, id, reason? } per feature; invalid features are reported there and the valid ones are still added.',
    inputSchema: z.object({ features: z.array(feature) }),
  },
  update_feature: {
    description:
      "Replace a feature's geometry and/or properties (full replacement, same geometry type). Returns an OperationResult.",
    inputSchema: z.object({
      id: z.string(),
      geometry: geometry.optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  delete_feature: {
    description: 'Delete a feature by id (undoable). Returns the deleted feature, or null.',
    inputSchema: z.object({ id: z.string() }),
  },
  split: {
    description:
      'Split a Polygon or LineString along the line through two positions. Returns an OperationResult with created (two parts) and deleted (the original).',
    inputSchema: z.object({ id: z.string(), line: z.tuple([position, position]) }),
  },
  setback: {
    description:
      'Move one edge of a Polygon inward by a distance in meters. edge.index counts edges from vertex 0; ring is 0 (outer) or omitted. Returns an OperationResult.',
    inputSchema: z.object({
      id: z.string(),
      edge: z.object({ ring: z.number().int().optional(), index: z.number().int() }),
      distanceMeters: z.number(),
    }),
  },
  rotate: {
    description:
      'Rotate a Polygon or LineString around its centroid by angleDeg (positive clockwise). Returns an OperationResult.',
    inputSchema: z.object({ id: z.string(), angleDeg: z.number() }),
  },
  union: {
    description:
      'Merge two Polygons into one (ids in the order that decides whose properties survive). Returns an OperationResult.',
    inputSchema: z.object({ ids: z.array(z.string()) }),
  },
  select_feature: {
    description:
      'Select a feature on the map (switches to select mode). Returns { ok: true }, or { ok: false, reason: "not-found" } when no feature has that id.',
    inputSchema: z.object({ id: z.string() }),
  },
  undo: {
    description: 'Undo the last change. Returns true when something was undone.',
    inputSchema: z.object({}),
  },
  redo: {
    description: 'Redo the last undone change. Returns true when something was redone.',
    inputSchema: z.object({}),
  },
} as const;

export type ToolName = keyof typeof TOOLS;
