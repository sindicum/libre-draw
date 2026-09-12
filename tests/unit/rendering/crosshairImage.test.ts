import { describe, expect, it } from 'vitest';
import { createCrosshairImage, CROSSHAIR_PIXEL_RATIO } from '../../../src/rendering/crosshairImage';

function pixel(image: ReturnType<typeof createCrosshairImage>, x: number, y: number) {
  const o = (y * image.width + x) * 4;
  return Array.from(image.data.slice(o, o + 4));
}

describe('createCrosshairImage', () => {
  const image = createCrosshairImage();
  const center = (image.width - 1) / 2;

  it('is square, sized for the declared pixel ratio, and RGBA', () => {
    expect(image.width).toBe(image.height);
    expect(image.width % CROSSHAIR_PIXEL_RATIO).toBe(0);
    expect(image.data.length).toBe(image.width * image.height * 4);
  });

  it('paints the arms opaque in the accent colour', () => {
    expect(pixel(image, Math.floor(center), 0)).toEqual([0x3b, 0xb2, 0xd0, 255]);
    expect(pixel(image, 0, Math.floor(center))).toEqual([0x3b, 0xb2, 0xd0, 255]);
  });

  it('surrounds the arms with a white halo', () => {
    const haloOffset = CROSSHAIR_PIXEL_RATIO + 1; // just outside the arm, inside the halo
    expect(pixel(image, Math.floor(center) + haloOffset, 0)).toEqual([255, 255, 255, 255]);
  });

  it('leaves the quadrants transparent', () => {
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(image, image.width - 1, image.height - 1)).toEqual([0, 0, 0, 0]);
  });
});
