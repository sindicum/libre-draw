import { describe, expect, it } from 'vitest';
import type {
  FeatureStoreInterface,
  SnapConfig,
  SplitFailReason,
  SplitFailedEvent,
} from '../../src';
import * as api from '../../src';

/**
 * The API reference (docs/api) lists these as importable from the package
 * root. Type-only exports cannot be checked at runtime, so the `import type`
 * lines above make `npm run typecheck` / vitest's transform fail if one of
 * them disappears; the runtime assertions below cover the value exports.
 */
describe('package root exports', () => {
  it('should expose the documented type-only exports', () => {
    const snap: SnapConfig = { enabled: true, threshold: 10 };
    const reason: SplitFailReason = 'has-holes';
    const failed: SplitFailedEvent = { reason, featureId: 'f1' };
    const store: FeatureStoreInterface = {
      add: () => {},
      update: () => {},
      remove: () => {},
      getById: () => undefined,
    };

    expect(snap.threshold).toBe(10);
    expect(failed.reason).toBe('has-holes');
    expect(store.getById('x')).toBeUndefined();
  });

  it('should expose the documented runtime exports', () => {
    expect(typeof api.LibreDraw).toBe('function');
    expect(typeof api.LibreDrawError).toBe('function');
    expect(typeof api.mergeStyleConfig).toBe('function');
    expect(api.DEFAULT_STYLE_CONFIG.fill).toBeDefined();
    for (const name of ['BatchAction', 'SplitAction', 'SetbackAction', 'UnionAction'] as const) {
      expect(typeof api[name]).toBe('function');
    }
  });
});
