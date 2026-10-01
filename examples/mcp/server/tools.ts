import { z } from 'zod';
import type { ToolName } from '../page/dispatch';

/**
 * The MCP tools, one per LibreDraw method the bridge exposes (the queries
 * and the editing operations; mode, style and lifecycle calls stay with the
 * page). The names are those of `TOOL_NAMES` in the page, which the
 * `satisfies` below enforces. Input schemas only shape the arguments;
 * GeoJSON is validated by LibreDraw itself so that the failure reasons come
 * from one place.
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
      'Merge two or more touching Polygons into one. The merged polygon gets a new id and keeps the properties of the first id in ids. Fails without changes if any polygon does not connect to the others. Returns an OperationResult.',
    inputSchema: z.object({ ids: z.array(z.string()) }),
  },
  cut: {
    description:
      'Cut the area of a ring out of a Polygon. cutter needs three or more distinct positions and must not cross itself; the closing position may be omitted. A cutter inside the polygon makes a hole, one across its boundary makes a notch, and one that cuts it apart leaves several pieces (one piece keeps the id; several get fresh ids and a copy of the properties each). Returns an OperationResult.',
    inputSchema: z.object({ id: z.string(), cutter: z.array(position).min(3) }),
  },
  reshape: {
    description:
      "Replace part of a Polygon's outer ring with a line of two or more positions. The line must cross the outer ring exactly twice; the stretch of the ring between the crossings is replaced by the line (outside adds area, inside removes it). Holes are kept and must still fit. Returns an OperationResult.",
    inputSchema: z.object({ id: z.string(), line: z.array(position).min(2) }),
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
} as const satisfies Record<ToolName, { description: string; inputSchema: z.ZodType }>;

export type { ToolName };
