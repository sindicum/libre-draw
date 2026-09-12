import { describe, it, expect } from 'vitest';
import {
  MOUSE_CLICK_TOLERANCE_PX,
  TOUCH_TAP_TOLERANCE_PX,
  clickTolerance,
  pointerTravel,
} from '../../../src/input/gestures';

describe('clickTolerance', () => {
  it('should return the touch tolerance for touch input', () => {
    expect(clickTolerance('touch')).toBe(TOUCH_TAP_TOLERANCE_PX);
  });

  it('should return the mouse tolerance for mouse input', () => {
    expect(clickTolerance('mouse')).toBe(MOUSE_CLICK_TOLERANCE_PX);
  });

  it('should allow a finger to travel further than a mouse', () => {
    // A deliberate tap always wobbles a few pixels, a click rarely does.
    expect(clickTolerance('touch')).toBeGreaterThan(clickTolerance('mouse'));
  });
});

describe('pointerTravel', () => {
  it('should return 0 for the same position', () => {
    expect(pointerTravel({ x: 12, y: 34 }, { x: 12, y: 34 })).toBe(0);
  });

  it('should measure horizontal distance', () => {
    expect(pointerTravel({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5);
  });

  it('should measure vertical distance', () => {
    expect(pointerTravel({ x: 0, y: 0 }, { x: 0, y: -7 })).toBe(7);
  });

  it('should measure diagonal distance', () => {
    expect(pointerTravel({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('should be symmetric', () => {
    const a = { x: -3, y: 8 };
    const b = { x: 6, y: -2 };
    expect(pointerTravel(a, b)).toBe(pointerTravel(b, a));
  });

  it('should treat travel equal to the tolerance as within tolerance', () => {
    // Modes compare with `>`, so a travel of exactly the tolerance is a click.
    const travel = pointerTravel({ x: 0, y: 0 }, { x: MOUSE_CLICK_TOLERANCE_PX, y: 0 });
    expect(travel > clickTolerance('mouse')).toBe(false);
  });

  it('should treat travel just past the tolerance as a drag', () => {
    const travel = pointerTravel({ x: 0, y: 0 }, { x: MOUSE_CLICK_TOLERANCE_PX + 1, y: 0 });
    expect(travel > clickTolerance('mouse')).toBe(true);
  });
});
