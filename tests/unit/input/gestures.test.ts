import { describe, it, expect } from 'vitest';
import { bodyHitThreshold, clickTolerance, pointerTravel } from '../../../src/input/gestures';

describe('clickTolerance', () => {
  it('should allow a finger to travel further than a mouse', () => {
    // A deliberate tap always wobbles a few pixels, a click rarely does.
    expect(clickTolerance('touch')).toBeGreaterThan(clickTolerance('mouse'));
  });
});

describe('bodyHitThreshold', () => {
  it('gives a finger the touch target of a vertex handle and a mouse 20px', () => {
    expect(bodyHitThreshold('touch')).toBe(24);
    expect(bodyHitThreshold('mouse')).toBe(20);
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
});
