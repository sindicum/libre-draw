import type { LibreDraw } from '../../../src';
import type { EdgeRef, LibreDrawGeometry, FeatureProperties, Position } from '../../../src';

/**
 * The LibreDraw surface the bridge needs. Narrowed to the methods that map
 * to MCP tools so a test can pass a plain object.
 */
export type DrawApi = Pick<
  LibreDraw,
  | 'toGeoJSON'
  | 'getFeatureById'
  | 'addFeatures'
  | 'updateFeature'
  | 'deleteFeature'
  | 'split'
  | 'setback'
  | 'rotate'
  | 'union'
  | 'selectFeature'
  | 'undo'
  | 'redo'
>;

/** Tool names, identical on the server and in the page. */
export const TOOL_NAMES = [
  'get_features',
  'get_feature',
  'add_features',
  'update_feature',
  'delete_feature',
  'split',
  'setback',
  'rotate',
  'union',
  'select_feature',
  'undo',
  'redo',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

type Args = Record<string, unknown>;

/**
 * Run one tool against LibreDraw and return a JSON-serializable result.
 *
 * Operation tools return the `OperationResult` untouched, and `select_feature`
 * maps its boolean onto the same `{ ok, reason }` shape. LibreDraw only
 * throws for misuse of the instance (a call after `destroy()`), never for
 * the data a tool passes; the catch below is the safety net for that case
 * so the caller on the other side of the wire never sees an exception.
 */
export function dispatch(draw: DrawApi, tool: string, args: unknown): unknown {
  const a = (args ?? {}) as Args;
  try {
    switch (tool as ToolName) {
      case 'get_features':
        return draw.toGeoJSON();
      case 'get_feature':
        return draw.getFeatureById(String(a.id)) ?? null;
      case 'add_features':
        return draw.addFeatures(a.features as Parameters<DrawApi['addFeatures']>[0]);
      case 'update_feature':
        return draw.updateFeature(String(a.id), {
          geometry: a.geometry as LibreDrawGeometry | undefined,
          properties: a.properties as FeatureProperties | undefined,
        });
      case 'delete_feature':
        return draw.deleteFeature(String(a.id)) ?? null;
      case 'split':
        return draw.split(String(a.id), a.line as [Position, Position]);
      case 'setback':
        return draw.setback(String(a.id), a.edge as EdgeRef, Number(a.distanceMeters));
      case 'rotate':
        return draw.rotate(String(a.id), Number(a.angleDeg));
      case 'union':
        return draw.union(a.ids as string[]);
      case 'select_feature':
        return draw.selectFeature(String(a.id)) ? { ok: true } : { ok: false, reason: 'not-found' };
      case 'undo':
        return draw.undo();
      case 'redo':
        return draw.redo();
      default:
        return { ok: false, reason: 'unknown-tool' };
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
