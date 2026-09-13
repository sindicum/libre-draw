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

describe('mergeStyleConfig with a base style', () => {
  const base = mergeStyleConfig({
    outline: { color: '#ff0000', width: 4 },
    preview: { dasharray: [6, 3] },
  });

  it('should apply overrides on top of the base instead of the defaults', () => {
    const merged = mergeStyleConfig({ fill: { color: '#00ff00' } }, base);

    expect(merged.fill.color).toBe('#00ff00');
    expect(merged.outline.color).toBe('#ff0000');
    expect(merged.outline.width).toBe(4);
    expect(merged.preview.dasharray).toEqual([6, 3]);
  });

  it('should let overrides win over base values', () => {
    const merged = mergeStyleConfig({ outline: { color: '#0000ff' } }, base);

    expect(merged.outline.color).toBe('#0000ff');
    expect(merged.outline.width).toBe(4);
  });

  it('should not mutate the base and should not share section objects or arrays', () => {
    const merged = mergeStyleConfig({ fill: { color: '#00ff00' } }, base);

    expect(base.fill.color).toBe(DEFAULT_STYLE_CONFIG.fill.color);
    expect(merged).not.toBe(base);
    expect(merged.fill).not.toBe(base.fill);
    expect(merged.preview.dasharray).not.toBe(base.preview.dasharray);
    merged.preview.dasharray[0] = 99;
    expect(base.preview.dasharray).toEqual([6, 3]);
  });

  it('should return a copy of the base when overrides are omitted', () => {
    const merged = mergeStyleConfig(undefined, base);

    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });

  it('should still merge onto the defaults when base is omitted', () => {
    const merged = mergeStyleConfig({ fill: { color: '#00ff00' } });

    expect(merged.outline.color).toBe(DEFAULT_STYLE_CONFIG.outline.color);
  });
});
