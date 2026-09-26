import { describe, it, expect } from 'vitest';
import { addHover, paintHover, HOVER_COLOR } from '../../../src/ui/hover';
import { BRAND_COLOR } from '../../../src/types/style';

function pointer(el: HTMLElement, type: 'pointerenter' | 'pointerleave', pointerType: string) {
  el.dispatchEvent(new PointerEvent(type, { pointerType }));
}

function createButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.style.background = '#fff';
  addHover(button);
  return button;
}

describe('hover colors', () => {
  it('are MapLibre brand blue and a pale tint of it', () => {
    expect(BRAND_COLOR).toBe('#285daa');
    expect(HOVER_COLOR).toBe('#d4dfee');
  });
});

describe('addHover', () => {
  it('tints the button under the mouse and restores white when it leaves', () => {
    const button = createButton();

    pointer(button, 'pointerenter', 'mouse');
    expect(button.style.backgroundColor).toBe(HOVER_COLOR);
    pointer(button, 'pointerleave', 'mouse');
    expect(button.style.backgroundColor).toBe('#ffffff');
  });

  it('ignores touch and pen, so a tap leaves no tint behind', () => {
    const button = createButton();

    pointer(button, 'pointerenter', 'touch');
    pointer(button, 'pointerenter', 'pen');

    expect(button.style.backgroundColor).not.toBe(HOVER_COLOR);
  });

  it('shows no hover on a disabled button', () => {
    const button = createButton();
    button.disabled = true;

    pointer(button, 'pointerenter', 'mouse');

    expect(button.style.backgroundColor).toBe('#ffffff');
  });
});

describe('paintHover', () => {
  it('drops and restores the hover as the button is disabled and enabled under the mouse', () => {
    const button = createButton();
    pointer(button, 'pointerenter', 'mouse');

    button.disabled = true;
    paintHover(button);
    expect(button.style.backgroundColor).toBe('#ffffff');

    button.disabled = false;
    paintHover(button);
    expect(button.style.backgroundColor).toBe(HOVER_COLOR);
  });
});
