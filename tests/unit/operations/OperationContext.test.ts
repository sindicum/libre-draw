import { describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../../../src/core/ModeContext';
import type { OperationContext } from '../../../src/operations/OperationContext';

/**
 * Operations receive a `ModeContext` from modes and the facade without any
 * adapter. This test fails to compile if `OperationContext` ever asks for
 * something `ModeContext` does not provide (or with a different shape).
 */
describe('OperationContext', () => {
  it('is satisfied structurally by ModeContext', () => {
    const modeContext: ModeContext = {
      store: {
        add: vi.fn((f) => f),
        update: vi.fn(),
        remove: vi.fn(),
        getById: vi.fn(),
        getAll: vi.fn(() => []),
      },
      history: { push: vi.fn() },
      events: { emit: vi.fn() },
      render: {
        renderFeatures: vi.fn(),
        renderPreview: vi.fn(),
        clearPreview: vi.fn(),
        renderEdgeHighlight: vi.fn(),
        clearEdgeHighlight: vi.fn(),
        renderVertices: vi.fn(),
        clearVertices: vi.fn(),
        setSelectedIds: vi.fn(),
        renderSnapIndicator: vi.fn(),
        clearSnapIndicator: vi.fn(),
        renderRotationCenter: vi.fn(),
        clearRotationCenter: vi.fn(),
      },
      getScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
      setDragPan: vi.fn(),
      getSetbackDistance: vi.fn(() => 10),
      getSnapConfig: vi.fn(() => ({ enabled: true, threshold: 10 })),
      getViewportBounds: vi.fn(() => ({ west: 0, south: 0, east: 1, north: 1 })),
    };

    const operationContext: OperationContext = modeContext;

    expect(operationContext.store).toBe(modeContext.store);
    expect(operationContext.history).toBe(modeContext.history);
    expect(operationContext.events).toBe(modeContext.events);
  });
});
