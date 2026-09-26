/**
 * Built-in UI languages.
 */
export type Locale = 'en' | 'ja';

/**
 * Every user-visible string in the toolbar and its popups.
 *
 * All keys are required so that a bundled locale cannot silently miss one;
 * consumers override a subset through `LibreDrawOptions.messages`.
 */
export interface Messages {
  // Toolbar button titles (also used as aria-label)
  toolbarDrawPoint: string;
  toolbarDrawLine: string;
  toolbarDrawPolygon: string;
  toolbarDrawRectangle: string;
  toolbarDrawAngledRectangle: string;
  /** Toggle between tap input and the center reticle. */
  toolbarInputMethod: string;
  toolbarSelect: string;
  toolbarSplit: string;
  toolbarUnion: string;
  toolbarSetback: string;
  toolbarRotate: string;
  toolbarCut: string;
  toolbarSettings: string;
  toolbarDelete: string;
  toolbarUndo: string;
  toolbarRedo: string;

  // Setback distance popup
  /** aria-label of the distance field. */
  setbackDistanceInput: string;
  /** Visible text of the execute button. */
  setbackExecute: string;
  /** aria-label of the execute button. */
  setbackExecuteLabel: string;

  // Rotation angle popup
  /** aria-label of the angle field. */
  rotateAngleInput: string;
  /** Visible text of the execute button. */
  rotateExecute: string;
  /** aria-label of the execute button. */
  rotateExecuteLabel: string;

  // Union execute popup
  /** Visible text of the execute button. */
  unionExecute: string;
  /** aria-label of the execute button. */
  unionExecuteLabel: string;

  // Center reticle action bar
  /** Visible text and aria-label of the button that places a point at the reticle. */
  reticleAddPoint: string;
  /** Visible text and aria-label of the button that takes back the last point. */
  reticleUndoVertex: string;
  /** Visible text and aria-label of the button that finishes the line or polygon. */
  reticleFinish: string;

  // Style settings panel: section headers
  styleFeatureSection: string;
  styleSelectedSection: string;
  styleGuideSection: string;

  // Style settings panel: feature style fields
  styleOutlineColor: string;
  styleOutlineWidth: string;
  styleFillColor: string;
  styleFillOpacity: string;
  stylePointColor: string;
  stylePointRadius: string;
  stylePointHoverColor: string;

  // Style settings panel: selected style fields
  styleVertexColor: string;
  styleVertexRadius: string;
  styleMidpointColor: string;
  styleMidpointRadius: string;
  styleVertexHoverColor: string;
  styleSelectedOutlineColor: string;
  styleSelectedFillColor: string;
  styleSelectedFillOpacity: string;

  // Style settings panel: guide line fields
  stylePreviewColor: string;
  stylePreviewWidth: string;
}
