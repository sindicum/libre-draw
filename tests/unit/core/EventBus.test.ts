import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import type { LibreDrawFeature } from '../../../src/types/features';

const mockFeature: LibreDrawFeature = {
  id: 'test-1',
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ],
    ],
  },
  properties: {},
};

describe('EventBus', () => {
  it('should register and invoke a listener', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('create', listener);
    bus.emit('create', { feature: mockFeature });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ feature: mockFeature, origin: 'user' });
  });

  it('should support multiple listeners for the same event', () => {
    const bus = new EventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.on('create', listener1);
    bus.on('create', listener2);
    bus.emit('create', { feature: mockFeature });

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('should remove a listener with off', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('create', listener);
    bus.off('create', listener);
    bus.emit('create', { feature: mockFeature });

    expect(listener).not.toHaveBeenCalled();
  });

  it('should not fail when removing a listener that was not registered', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    expect(() => bus.off('create', listener)).not.toThrow();
  });

  it('should not invoke listeners for different event types', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('create', listener);
    bus.emit('delete', { feature: mockFeature });

    expect(listener).not.toHaveBeenCalled();
  });

  it('should remove all listeners with removeAllListeners', () => {
    const bus = new EventBus();
    const createListener = vi.fn();
    const deleteListener = vi.fn();

    bus.on('create', createListener);
    bus.on('delete', deleteListener);
    bus.removeAllListeners();

    bus.emit('create', { feature: mockFeature });
    bus.emit('delete', { feature: mockFeature });

    expect(createListener).not.toHaveBeenCalled();
    expect(deleteListener).not.toHaveBeenCalled();
  });

  it('should handle modechange events', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('modechange', listener);
    bus.emit('modechange', { mode: 'draw-polygon', previousMode: 'idle' });

    expect(listener).toHaveBeenCalledWith({
      mode: 'draw-polygon',
      previousMode: 'idle',
      origin: 'user',
    });
  });

  it('should handle selectionchange events', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('selectionchange', listener);
    bus.emit('selectionchange', { selectedIds: ['a', 'b'] });

    expect(listener).toHaveBeenCalledWith({ selectedIds: ['a', 'b'], origin: 'user' });
  });

  describe('origin', () => {
    it('should stamp origin: user when no provider is given', () => {
      const bus = new EventBus();
      const listener = vi.fn();

      bus.on('draftchange', listener);
      bus.emit('draftchange', { vertexCount: 2 });

      expect(listener).toHaveBeenCalledWith({ vertexCount: 2, origin: 'user' });
    });

    it('should read the provider on every emit', () => {
      let origin: 'api' | 'user' = 'user';
      const bus = new EventBus(() => origin);
      const listener = vi.fn();

      bus.on('delete', listener);
      bus.emit('delete', { feature: mockFeature });
      origin = 'api';
      bus.emit('delete', { feature: mockFeature });

      expect(listener).toHaveBeenNthCalledWith(1, { feature: mockFeature, origin: 'user' });
      expect(listener).toHaveBeenNthCalledWith(2, { feature: mockFeature, origin: 'api' });
    });

    it('should not mutate the payload passed by the emitter', () => {
      const bus = new EventBus(() => 'api');
      const listener = vi.fn();
      const payload = { selectedIds: ['a'] };

      bus.on('selectionchange', listener);
      bus.emit('selectionchange', payload);

      expect(payload).toEqual({ selectedIds: ['a'] });
      expect(listener.mock.calls[0][0]).not.toBe(payload);
    });

    it('should not call the provider when nobody is listening', () => {
      const provider = vi.fn(() => 'api' as const);
      const bus = new EventBus(provider);

      bus.emit('modechange', { mode: 'idle', previousMode: 'select' });

      expect(provider).not.toHaveBeenCalled();
    });
  });
});
