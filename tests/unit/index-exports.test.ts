import { describe, expect, it } from 'vitest';
import type {
  AddFeatureResult,
  EventOrigin,
  FeatureStoreInterface,
  FeatureValidationResult,
  OperationResult,
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
    const origin: EventOrigin = 'api';
    const failed: SplitFailedEvent = { reason, featureId: 'f1', origin };
    const operation: OperationResult = { ok: false, reason };
    const added: AddFeatureResult = { valid: true, id: 'f1' };
    const validation: FeatureValidationResult = { valid: false, reason: 'nope' };
    const store: FeatureStoreInterface = {
      add: () => {},
      update: () => {},
      remove: () => {},
      getById: () => undefined,
    };

    expect(snap.threshold).toBe(10);
    expect(failed.reason).toBe('has-holes');
    expect(failed.origin).toBe('api');
    expect(operation.ok).toBe(false);
    expect(added.valid).toBe(true);
    expect(validation.valid).toBe(false);
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
