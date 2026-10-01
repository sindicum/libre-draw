import { describe, expect, it } from 'vitest';
import * as api from '../../src';

describe('package root exports', () => {
  it('should expose the documented runtime exports', () => {
    expect(typeof api.LibreDraw).toBe('function');
    expect(typeof api.LibreDrawError).toBe('function');
    expect(typeof api.mergeStyleConfig).toBe('function');
    expect(api.DEFAULT_STYLE_CONFIG.fill).toBeDefined();
    for (const name of [
      'BatchAction',
      'SplitAction',
      'SetbackAction',
      'UnionAction',
      'CutAction',
    ] as const) {
      expect(typeof api[name]).toBe('function');
    }
  });
});
