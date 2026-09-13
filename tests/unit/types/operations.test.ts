import { describe, expect, it } from 'vitest';
import type {
  AddFeatureResult,
  FeatureValidationResult,
  LibreDrawFeature,
  OperationResult,
} from '../../../src/types';

const feature: LibreDrawFeature = {
  id: 'f1',
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [1, 2] },
  properties: {},
};

/**
 * These are type-only contracts; the runtime assertions exist so that
 * vitest's transform (and `npm run typecheck`) fail if the discriminants
 * stop narrowing the way the public API documents.
 */
describe('OperationResult', () => {
  it('narrows to the success shape on ok: true', () => {
    const result: OperationResult = { ok: true, created: [], updated: [feature], deleted: [] };
    if (result.ok) {
      expect(result.updated).toEqual([feature]);
      expect(result.created).toEqual([]);
      expect(result.deleted).toEqual([]);
    } else {
      throw new Error('expected success');
    }
  });

  it('narrows to the failure shape on ok: false', () => {
    const result: OperationResult = { ok: false, reason: 'has-holes' };
    if (!result.ok) {
      expect(result.reason).toBe('has-holes');
    } else {
      throw new Error('expected failure');
    }
  });

  it('accepts an existing failure reason union as the reason', () => {
    const reason: 'disjoint' | 'has-holes' = 'disjoint';
    const result: OperationResult = { ok: false, reason };
    expect(result.ok).toBe(false);
  });
});

describe('AddFeatureResult', () => {
  it('carries the stored id when valid and the reason when invalid', () => {
    const results: AddFeatureResult[] = [
      { valid: true, id: 'a' },
      { valid: false, id: 'b', reason: 'Ring is not closed.' },
      { valid: false, reason: 'Feature must be a non-null object.' },
    ];
    const rejected = results.filter((r) => !r.valid);
    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => (r.valid ? undefined : r.reason))).toEqual([
      'Ring is not closed.',
      'Feature must be a non-null object.',
    ]);
    expect(results[0].valid && results[0].id).toBe('a');
  });
});

describe('FeatureValidationResult', () => {
  it('exposes the normalized feature only when valid', () => {
    const ok: FeatureValidationResult = { valid: true, feature };
    const bad: FeatureValidationResult = { valid: false, reason: 'Invalid longitude: 200.' };
    expect(ok.valid && ok.feature.id).toBe('f1');
    expect(!bad.valid && bad.reason).toContain('longitude');
  });
});
