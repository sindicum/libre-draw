import { describe, it, expect, vi } from 'vitest';
import { ModeManager } from '../../../src/core/ModeManager';
import type { Mode } from '../../../src/modes/Mode';

function createMockMode(): Mode {
  return {
    mapInteractions: vi.fn(() => ({
      dragPan: true,
      doubleClickZoom: true,
    })),
    activate: vi.fn(),
    deactivate: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onDoubleClick: vi.fn(),
    onLongPress: vi.fn(),
    onKeyDown: vi.fn(),
  };
}

describe('ModeManager', () => {
  it('should start in idle mode', () => {
    const manager = new ModeManager();
    expect(manager.getMode()).toBe('idle');
  });

  it('should register and switch modes', () => {
    const manager = new ModeManager();
    const idle = createMockMode();
    const draw = createMockMode();

    manager.registerMode('idle', idle);
    manager.registerMode('draw-polygon', draw);

    manager.setMode('draw-polygon');

    expect(manager.getMode()).toBe('draw-polygon');
    expect(idle.deactivate).toHaveBeenCalledOnce();
    expect(draw.activate).toHaveBeenCalledOnce();
  });

  it('should not switch if already in the same mode', () => {
    const manager = new ModeManager();
    const idle = createMockMode();

    manager.registerMode('idle', idle);

    manager.setMode('idle');

    expect(idle.deactivate).not.toHaveBeenCalled();
    expect(idle.activate).not.toHaveBeenCalled();
  });

  it('should invoke the onModeChange callback', () => {
    const manager = new ModeManager();
    const draw = createMockMode();
    const callback = vi.fn();

    manager.registerMode('idle', createMockMode());
    manager.registerMode('draw-polygon', draw);
    manager.setOnModeChange(callback);

    manager.setMode('draw-polygon');

    expect(callback).toHaveBeenCalledWith('draw-polygon', 'idle');
  });

  it('should return the current mode implementation', () => {
    const manager = new ModeManager();
    const idle = createMockMode();

    manager.registerMode('idle', idle);

    expect(manager.getCurrentMode()).toBe(idle);
  });

  it('should return undefined if mode is not registered', () => {
    const manager = new ModeManager();
    // idle is the default mode but not registered
    expect(manager.getCurrentMode()).toBeUndefined();
  });
});
