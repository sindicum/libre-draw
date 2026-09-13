import type { Locale, Messages } from '../types/messages';

/**
 * Bundled English strings (the default locale).
 */
export const MESSAGES_EN: Messages = {
  toolbarDrawPoint: 'Draw point',
  toolbarDrawLine: 'Draw line',
  toolbarDrawPolygon: 'Draw polygon',
  toolbarDrawRectangle: 'Draw rectangle',
  toolbarSelect: 'Select feature',
  toolbarSplit: 'Split feature',
  toolbarUnion: 'Union polygons',
  toolbarSetback: 'Setback edge',
  toolbarRotate: 'Rotate feature',
  toolbarSettings: 'Style settings',
  toolbarDelete: 'Delete selected',
  toolbarUndo: 'Undo',
  toolbarRedo: 'Redo',

  setbackDistanceInput: 'Setback distance in meters',
  setbackExecute: 'Apply',
  setbackExecuteLabel: 'Execute setback',

  rotateAngleInput: 'Rotation angle in degrees',
  rotateExecute: 'Apply',
  rotateExecuteLabel: 'Execute rotation',

  styleFeatureSection: 'Feature style',
  styleSelectedSection: 'Selected style',
  styleGuideSection: 'Guide lines',

  styleOutlineColor: 'Line color',
  styleOutlineWidth: 'Line width',
  styleFillColor: 'Polygon color',
  styleFillOpacity: 'Polygon opacity',
  stylePointColor: 'Point color',
  stylePointRadius: 'Point size',
  stylePointHoverColor: 'Point hover color',

  styleVertexColor: 'Vertex color',
  styleVertexRadius: 'Vertex size',
  styleMidpointColor: 'Midpoint color',
  styleMidpointRadius: 'Midpoint size',
  styleVertexHoverColor: 'Hover color',
  styleSelectedOutlineColor: 'Line color',
  styleSelectedFillColor: 'Polygon color',
  styleSelectedFillOpacity: 'Polygon opacity',

  stylePreviewColor: 'Dash color',
  stylePreviewWidth: 'Dash width',
};

/**
 * Bundled Japanese strings.
 */
export const MESSAGES_JA: Messages = {
  toolbarDrawPoint: 'ポイントを描く',
  toolbarDrawLine: 'ラインを描く',
  toolbarDrawPolygon: 'ポリゴンを描く',
  toolbarDrawRectangle: '矩形を描く',
  toolbarSelect: '地物を選択',
  toolbarSplit: '地物を分割',
  toolbarUnion: 'ポリゴンを統合',
  toolbarSetback: '辺をセットバック',
  toolbarRotate: '地物を回転',
  toolbarSettings: 'スタイル設定',
  toolbarDelete: '選択を削除',
  toolbarUndo: '元に戻す',
  toolbarRedo: 'やり直す',

  setbackDistanceInput: 'セットバック距離（m）',
  setbackExecute: '実行',
  setbackExecuteLabel: 'セットバックを実行',

  rotateAngleInput: '回転角度（度）',
  rotateExecute: '実行',
  rotateExecuteLabel: '回転を実行',

  styleFeatureSection: '地物スタイル',
  styleSelectedSection: '選択時スタイル',
  styleGuideSection: 'ガイドライン',

  styleOutlineColor: 'ライン色',
  styleOutlineWidth: 'ライン太さ',
  styleFillColor: 'ポリゴン色',
  styleFillOpacity: 'ポリゴン透明度',
  stylePointColor: '点の色',
  stylePointRadius: '点の大きさ',
  stylePointHoverColor: '点のhover色',

  styleVertexColor: '頂点の色',
  styleVertexRadius: '頂点の大きさ',
  styleMidpointColor: '中間点の色',
  styleMidpointRadius: '中間点の大きさ',
  styleVertexHoverColor: 'hover色',
  styleSelectedOutlineColor: 'ライン色',
  styleSelectedFillColor: 'ポリゴン色',
  styleSelectedFillOpacity: 'ポリゴン透明度',

  stylePreviewColor: '破線の色',
  stylePreviewWidth: '破線の太さ',
};

const BUILTIN_MESSAGES: Record<Locale, Messages> = {
  en: MESSAGES_EN,
  ja: MESSAGES_JA,
};

/**
 * Whether `locale` names a bundled language. Narrows the type so callers
 * can validate arbitrary input before resolving.
 */
export function isBuiltinLocale(locale: unknown): locale is Locale {
  return (
    typeof locale === 'string' && Object.prototype.hasOwnProperty.call(BUILTIN_MESSAGES, locale)
  );
}

/**
 * The bundled strings for a locale.
 */
export function getBuiltinMessages(locale: Locale): Messages {
  return BUILTIN_MESSAGES[locale];
}

/**
 * Merge partial overrides onto a base table.
 *
 * Returns a new object; neither input is mutated. Keys whose override
 * value is `undefined` keep the base value, so `{ setbackExecute: undefined }`
 * does not blank out a label.
 */
export function resolveMessages(base: Messages, overrides?: Partial<Messages>): Messages {
  const resolved: Messages = { ...base };
  if (!overrides) return resolved;

  for (const key of Object.keys(base) as (keyof Messages)[]) {
    const value = overrides[key];
    if (typeof value === 'string') {
      resolved[key] = value;
    }
  }
  return resolved;
}
