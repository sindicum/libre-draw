import { describe, it, expect, vi } from 'vitest';
import { isDraftCapableMode } from '../../../src/modes/Mode';
import type { Mode } from '../../../src/modes/Mode';
import { IdleMode } from '../../../src/modes/IdleMode';

describe('isDraftCapableMode', () => {
  const draftMethods = {
    finishDrawing: vi.fn(),
    cancelDrawing: vi.fn(),
    getDraftVertexCount: vi.fn(),
    undoLastVertex: vi.fn(),
    canFinishDrawing: vi.fn(),
  };

  it('is false without a mode and for a mode without a draft', () => {
    expect(isDraftCapableMode(undefined)).toBe(false);
    expect(isDraftCapableMode(new IdleMode())).toBe(false);
  });

  it('requires every draft method, including undoLastVertex and canFinishDrawing', () => {
    const base = new IdleMode() as unknown as Record<string, unknown>;
    expect(isDraftCapableMode({ ...base, ...draftMethods } as unknown as Mode)).toBe(true);

    const { undoLastVertex: _u, ...withoutUndo } = draftMethods;
    expect(isDraftCapableMode({ ...base, ...withoutUndo } as unknown as Mode)).toBe(false);
    const { canFinishDrawing: _c, ...withoutCanFinish } = draftMethods;
    expect(isDraftCapableMode({ ...base, ...withoutCanFinish } as unknown as Mode)).toBe(false);
  });
});
