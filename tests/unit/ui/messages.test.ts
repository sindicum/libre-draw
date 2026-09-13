import { describe, expect, it } from 'vitest';
import {
  MESSAGES_EN,
  MESSAGES_JA,
  getBuiltinMessages,
  isBuiltinLocale,
  resolveMessages,
} from '../../../src/ui/messages';
import type { Messages } from '../../../src/types/messages';

describe('messages', () => {
  describe('bundled tables', () => {
    it('en and ja define exactly the same keys', () => {
      expect(Object.keys(MESSAGES_JA).sort()).toEqual(Object.keys(MESSAGES_EN).sort());
    });

    it('every bundled string is non-empty', () => {
      for (const table of [MESSAGES_EN, MESSAGES_JA]) {
        for (const [key, value] of Object.entries(table)) {
          expect(value, key).toBeTypeOf('string');
          expect(value.trim().length, key).toBeGreaterThan(0);
        }
      }
    });

    it('getBuiltinMessages returns the table for each locale', () => {
      expect(getBuiltinMessages('en')).toBe(MESSAGES_EN);
      expect(getBuiltinMessages('ja')).toBe(MESSAGES_JA);
    });
  });

  describe('isBuiltinLocale', () => {
    it('accepts en and ja only', () => {
      expect(isBuiltinLocale('en')).toBe(true);
      expect(isBuiltinLocale('ja')).toBe(true);
      expect(isBuiltinLocale('fr')).toBe(false);
      expect(isBuiltinLocale('')).toBe(false);
      expect(isBuiltinLocale(undefined)).toBe(false);
      expect(isBuiltinLocale(42)).toBe(false);
    });

    it('does not treat Object.prototype members as locales', () => {
      expect(isBuiltinLocale('toString')).toBe(false);
      expect(isBuiltinLocale('constructor')).toBe(false);
    });
  });

  describe('resolveMessages', () => {
    it('returns a copy equal to the base when there are no overrides', () => {
      const resolved = resolveMessages(MESSAGES_EN);

      expect(resolved).toEqual(MESSAGES_EN);
      expect(resolved).not.toBe(MESSAGES_EN);
    });

    it('overrides only the given keys', () => {
      const resolved = resolveMessages(MESSAGES_EN, { setbackExecute: 'Run', toolbarUndo: 'Back' });

      expect(resolved.setbackExecute).toBe('Run');
      expect(resolved.toolbarUndo).toBe('Back');
      expect(resolved.toolbarRedo).toBe(MESSAGES_EN.toolbarRedo);
      expect(resolved.styleFillColor).toBe(MESSAGES_EN.styleFillColor);
    });

    it('keeps the base value for undefined overrides', () => {
      const resolved = resolveMessages(MESSAGES_JA, { setbackExecute: undefined });

      expect(resolved.setbackExecute).toBe(MESSAGES_JA.setbackExecute);
    });

    it('ignores keys that are not part of Messages', () => {
      const overrides = { unknownKey: 'x' } as unknown as Partial<Messages>;
      const resolved = resolveMessages(MESSAGES_EN, overrides);

      expect(resolved).toEqual(MESSAGES_EN);
      expect('unknownKey' in resolved).toBe(false);
    });

    it('does not mutate the base table or the overrides', () => {
      const base = { ...MESSAGES_EN };
      const overrides = { toolbarUndo: 'Back' };
      const baseSnapshot = JSON.stringify(base);
      const overridesSnapshot = JSON.stringify(overrides);

      resolveMessages(base, overrides);

      expect(JSON.stringify(base)).toBe(baseSnapshot);
      expect(JSON.stringify(overrides)).toBe(overridesSnapshot);
    });
  });
});
