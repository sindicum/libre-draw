import { describe, it, expect, vi } from 'vitest';
import { StylePanel } from '../../../src/ui/StylePanel';
import { MESSAGES_EN } from '../../../src/ui/messages';
import { DEFAULT_STYLE_CONFIG } from '../../../src/types/style';
import type { PartialStyleConfig } from '../../../src/types/style';

function createPanel(): { panel: StylePanel; onStyleChange: ReturnType<typeof vi.fn> } {
  const onStyleChange = vi.fn();
  const panel = new StylePanel({ onStyleChange });
  return { panel, onStyleChange };
}

function field(panel: StylePanel, label: string): HTMLInputElement {
  const input = panel.getElement().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`No field labelled "${label}"`);
  return input;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function lastStyle(onStyleChange: ReturnType<typeof vi.fn>): PartialStyleConfig {
  return onStyleChange.mock.calls[onStyleChange.mock.calls.length - 1][0] as PartialStyleConfig;
}

describe('StylePanel', () => {
  it('should report a valid number as the new value, including the min and max', () => {
    const { panel, onStyleChange } = createPanel();
    const width = field(panel, MESSAGES_EN.styleOutlineWidth);
    const opacity = field(panel, MESSAGES_EN.styleFillOpacity);

    type(width, '3');
    expect(onStyleChange).toHaveBeenCalledTimes(1);
    expect(lastStyle(onStyleChange).outline?.width).toBe(3);

    // The ends of the range (line width 1..10, opacity 0..1) are valid too.
    type(width, '1');
    expect(lastStyle(onStyleChange).outline?.width).toBe(1);
    type(width, '10');
    expect(lastStyle(onStyleChange).outline?.width).toBe(10);
    type(opacity, '0');
    expect(lastStyle(onStyleChange).fill?.opacity).toBe(0);
    type(opacity, '1');
    expect(lastStyle(onStyleChange).fill?.opacity).toBe(1);
  });

  it('should leave an emptied number field out so the current value stays', () => {
    const { panel, onStyleChange } = createPanel();

    type(field(panel, MESSAGES_EN.styleFillOpacity), '');

    const style = lastStyle(onStyleChange);
    expect(style.fill).not.toHaveProperty('opacity');
    expect(style.fill?.color).toBe(DEFAULT_STYLE_CONFIG.fill.color);
  });

  it('should leave a number outside its min / max out', () => {
    const { panel, onStyleChange } = createPanel();
    const width = field(panel, MESSAGES_EN.styleOutlineWidth);

    type(width, '-5');
    expect(lastStyle(onStyleChange).outline).not.toHaveProperty('width');

    type(width, '15');
    expect(lastStyle(onStyleChange).outline).not.toHaveProperty('width');
  });
});
