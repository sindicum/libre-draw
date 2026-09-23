import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../../examples/mcp/server/origin';

describe('isAllowedOrigin', () => {
  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:4181',
    'https://localhost',
    'http://[::1]:5173',
  ])('accepts the local page %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it('accepts a client that sends no Origin header (not a browser)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });

  it.each(['https://example.com', 'http://localhost.evil.com', 'http://192.168.1.10:5173', 'null'])(
    'rejects %s',
    (origin) => {
      expect(isAllowedOrigin(origin)).toBe(false);
    }
  );
});
