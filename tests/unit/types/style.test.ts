import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_CONFIG, mergeStyleConfig } from '../../../src/types/style';

describe('mergeStyleConfig', () => {
  it('should return defaults when overrides are omitted', () => {
    const merged = mergeStyleConfig();
    expect(merged).toEqual(DEFAULT_STYLE_CONFIG);
    expect(merged).not.toBe(DEFAULT_STYLE_CONFIG);
    expect(merged.preview.dasharray).not.toBe(DEFAULT_STYLE_CONFIG.preview.dasharray);
  });

  it('should merge partial overrides while preserving other defaults', () => {
    const merged = mergeStyleConfig({
      fill: { color: '#111111' },
      preview: { dasharray: [4, 1] },
      editVertex: { highlightedColor: '#00ff00' },
    });

    expect(merged.fill.color).toBe('#111111');
    expect(merged.fill.selectedColor).toBe(DEFAULT_STYLE_CONFIG.fill.selectedColor);
    expect(merged.preview.dasharray).toEqual([4, 1]);
    expect(merged.editVertex.highlightedColor).toBe('#00ff00');
    expect(merged.editVertex.strokeColor).toBe(DEFAULT_STYLE_CONFIG.editVertex.strokeColor);
  });

  it('should clone preview dasharray so caller mutation does not leak', () => {
    const overrides = { preview: { dasharray: [8, 2] } };
    const merged = mergeStyleConfig(overrides);

    overrides.preview.dasharray[0] = 99;
    expect(merged.preview.dasharray).toEqual([8, 2]);
  });
});
