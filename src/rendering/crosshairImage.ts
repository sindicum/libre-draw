/**
 * Pixel data for the rotation center marker: a crosshair.
 *
 * Built from raw RGBA bytes rather than a canvas so it works without a DOM
 * canvas (unit tests) and without depending on glyphs in the map style. A
 * crosshair is used instead of a circle because circles already mean
 * "vertex" or "point feature" in this library.
 */

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Device-pixel ratio the image is rendered at; keeps the marker crisp on HiDPI screens. */
export const CROSSHAIR_PIXEL_RATIO = 2;
/** Marker size in CSS pixels (arm to arm). */
const CROSSHAIR_SIZE_CSS_PX = 17;
/** Stroke width of the arms in CSS pixels. */
const ARM_WIDTH_CSS_PX = 2;
/** Width of the white halo around the arms in CSS pixels; keeps the marker readable on any basemap. */
const HALO_WIDTH_CSS_PX = 1;

const ARM_COLOR: [number, number, number] = [0x3b, 0xb2, 0xd0];
const HALO_COLOR: [number, number, number] = [0xff, 0xff, 0xff];

/**
 * Build the crosshair image at {@link CROSSHAIR_PIXEL_RATIO}.
 */
export function createCrosshairImage(): RasterImage {
  const size = CROSSHAIR_SIZE_CSS_PX * CROSSHAIR_PIXEL_RATIO;
  const armHalf = (ARM_WIDTH_CSS_PX * CROSSHAIR_PIXEL_RATIO) / 2;
  const haloHalf = armHalf + HALO_WIDTH_CSS_PX * CROSSHAIR_PIXEL_RATIO;
  const center = (size - 1) / 2;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance from the pixel center to the vertical and horizontal arms.
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      const onArm = dx <= armHalf || dy <= armHalf;
      const onHalo = dx <= haloHalf || dy <= haloHalf;
      if (!onHalo) continue;

      const [r, g, b] = onArm ? ARM_COLOR : HALO_COLOR;
      const offset = (y * size + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}
