import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFeatureId } from '../../../src/utils/id';

/** RFC 4122 v4: version nibble is 4, variant nibble is 8, 9, a or b. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Run `fn` with `crypto.randomUUID` removed, as on a plain-HTTP origin where
 * the method is not defined because it requires a secure context.
 */
function withoutRandomUUID<T>(fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) {
      Object.defineProperty(crypto, 'randomUUID', original);
    } else {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  }
}

describe('createFeatureId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use crypto.randomUUID when it is available', () => {
    const spy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('3c8da699-670c-4c77-a52b-3baf0c365c5a');

    expect(createFeatureId()).toBe('3c8da699-670c-4c77-a52b-3baf0c365c5a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should return a v4 UUID when crypto.randomUUID is available', () => {
    expect(createFeatureId()).toMatch(UUID_V4);
  });

  it('should still return a v4 UUID when crypto.randomUUID is undefined', () => {
    // A plain-HTTP origin: randomUUID needs a secure context, getRandomValues does not.
    const id = withoutRandomUUID(() => createFeatureId());

    expect(id).toMatch(UUID_V4);
  });

  it('should not throw when crypto.randomUUID is undefined', () => {
    expect(() => withoutRandomUUID(() => createFeatureId())).not.toThrow();
  });

  it('should derive the fallback from crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');

    withoutRandomUUID(() => createFeatureId());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(16);
  });

  it('should set the version and variant bits on the fallback path', () => {
    // All-zero bytes isolate the bit fiddling from the randomness.
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.fill(0);
      return array;
    }) as typeof crypto.getRandomValues);

    const id = withoutRandomUUID(() => createFeatureId());

    expect(id).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('should keep every byte position when bytes are at their maximum', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    }) as typeof crypto.getRandomValues);

    const id = withoutRandomUUID(() => createFeatureId());

    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(id).toMatch(UUID_V4);
  });

  it('should generate unique ids on the fallback path', () => {
    const ids = withoutRandomUUID(() => {
      const generated = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        generated.add(createFeatureId());
      }
      return generated;
    });

    expect(ids.size).toBe(1000);
  });
});
