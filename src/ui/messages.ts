import type { Locale, Messages } from '../types/messages';

/**
 * Bundled English strings (the default locale).
 */
export const MESSAGES_EN: Messages = {
  toolbarDrawPoint: 'Draw point',
  toolbarDrawLine: 'Draw line',
  toolbarDrawPolygon: 'Draw polygon',
  toolbarDrawRectangle: 'Draw rectangle',
  toolbarDrawAngledRectangle: 'Draw angled rectangle',
  toolbarInputMethod: 'Place points with the center reticle',
  toolbarSelect: 'Select feature',
  toolbarSplit: 'Split feature',
  toolbarUnion: 'Union polygons',
  toolbarSetback: 'Setback edge',
  toolbarRotate: 'Rotate feature',
  toolbarCut: 'Cut out an area',
  toolbarReshape: 'Reshape a boundary',
  toolbarDelete: 'Delete selected',
  toolbarUndo: 'Undo',
  toolbarRedo: 'Redo',

  setbackDistanceInput: 'Setback distance in meters',
  setbackExecute: 'Apply',
  setbackExecuteLabel: 'Execute setback',

  rotateAngleInput: 'Rotation angle in degrees',
  rotateExecute: 'Apply',
  rotateExecuteLabel: 'Execute rotation',

  unionExecute: 'Merge',
  unionExecuteLabel: 'Merge selected polygons',

  reticleAddPoint: 'Add point',
  reticleUndoVertex: 'Undo point',
  reticleFinish: 'Finish',
};

/**
 * Bundled Japanese strings.
 */
export const MESSAGES_JA: Messages = {
  toolbarDrawPoint: 'ポイントを描く',
  toolbarDrawLine: 'ラインを描く',
  toolbarDrawPolygon: 'ポリゴンを描く',
  toolbarDrawRectangle: '矩形を描く',
  toolbarDrawAngledRectangle: '角度付き矩形を描く',
  toolbarInputMethod: '中央十字で打点',
  toolbarSelect: '地物を選択',
  toolbarSplit: '地物を分割',
  toolbarUnion: 'ポリゴンを統合',
  toolbarSetback: '辺をセットバック',
  toolbarRotate: '地物を回転',
  toolbarCut: '領域を切り抜く',
  toolbarReshape: '境界を引き直す',
  toolbarDelete: '選択を削除',
  toolbarUndo: '元に戻す',
  toolbarRedo: 'やり直す',

  setbackDistanceInput: 'セットバック距離（m）',
  setbackExecute: '実行',
  setbackExecuteLabel: 'セットバックを実行',

  rotateAngleInput: '回転角度（度）',
  rotateExecute: '実行',
  rotateExecuteLabel: '回転を実行',

  unionExecute: '統合',
  unionExecuteLabel: '選択したポリゴンを統合',

  reticleAddPoint: '点を追加',
  reticleUndoVertex: '1 つ戻す',
  reticleFinish: '完了',
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
