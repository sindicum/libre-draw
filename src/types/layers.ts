import type { LayerSpecification } from 'maplibre-gl';

/**
 * A MapLibre layer definition that draws one of LibreDraw's sources (see
 * `SOURCE_IDS`). Passed to the `layers` option and to `setLayers()`.
 *
 * LibreDraw adds the definitions as given, on top of the map's layers in
 * array order; MapLibre validates them and reports a bad one with its
 * `error` event.
 */
export type LibreDrawLayer = LayerSpecification;
