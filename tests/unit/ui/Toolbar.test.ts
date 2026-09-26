import { describe, it, expect, vi } from 'vitest';
import { ToolbarButton } from '../../../src/ui/ToolbarButton';

// We test ToolbarButton directly since Toolbar requires a MapLibre map instance.
// Toolbar integration is tested by verifying ToolbarButton DOM generation and state management.

describe('ToolbarButton', () => {
  it('should create a button element', () => {
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick: vi.fn(),
    });

    const el = btn.getElement();
    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');
    expect(el.title).toBe('Draw polygon');
    expect(el.getAttribute('aria-label')).toBe('Draw polygon');
    expect(el.dataset.libreDrawButton).toBe('draw');
  });

  it('should have 44px touch target size', () => {
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick: vi.fn(),
    });

    const el = btn.getElement();
    expect(el.style.width).toBe('44px');
    expect(el.style.height).toBe('44px');
  });

  it('should call onClick when clicked', () => {
    const onClick = vi.fn();
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick,
    });

    btn.getElement().click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('should not call onClick when disabled', () => {
    const onClick = vi.fn();
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick,
    });

    btn.setDisabled(true);
    btn.getElement().click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should update active state', () => {
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick: vi.fn(),
      isToggle: true,
    });

    btn.setActive(true);
    const el = btn.getElement();
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.style.backgroundColor).toBe('#285daa');

    btn.setActive(false);
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(el.style.backgroundColor).toBe('#ffffff');
  });

  it('should update disabled state', () => {
    const btn = new ToolbarButton({
      id: 'undo',
      icon: '<svg><path d="M0 0"/></svg>',
      title: 'Undo',
      onClick: vi.fn(),
    });

    btn.setDisabled(true);
    expect(btn.getElement().disabled).toBe(true);
    expect(btn.getElement().style.opacity).toBe('0.4');
    expect(btn.getElement().style.cursor).toBe('not-allowed');

    btn.setDisabled(false);
    expect(btn.getElement().disabled).toBe(false);
    expect(btn.getElement().style.opacity).toBe('1');
    expect(btn.getElement().style.cursor).toBe('pointer');
  });

  it('should remove element on destroy', () => {
    const btn = new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick: vi.fn(),
    });

    const parent = document.createElement('div');
    parent.appendChild(btn.getElement());
    expect(parent.children).toHaveLength(1);

    btn.destroy();
    expect(parent.children).toHaveLength(0);
  });
});

describe('ToolbarButton hover', () => {
  function createButton() {
    return new ToolbarButton({
      id: 'draw',
      icon: '<svg><circle r="5"/></svg>',
      title: 'Draw polygon',
      onClick: vi.fn(),
    });
  }

  function pointer(el: HTMLElement, type: 'pointerenter' | 'pointerleave', pointerType: string) {
    el.dispatchEvent(new PointerEvent(type, { pointerType }));
  }

  it('turns pale blue under the mouse and back to white when it leaves', () => {
    const el = createButton().getElement();

    pointer(el, 'pointerenter', 'mouse');
    expect(el.style.backgroundColor).toBe('#d4dfee');

    pointer(el, 'pointerleave', 'mouse');
    expect(el.style.backgroundColor).toBe('#ffffff');
  });

  it('shows no hover for touch or pen, so a tap leaves no tint behind', () => {
    const el = createButton().getElement();

    pointer(el, 'pointerenter', 'touch');
    expect(el.style.backgroundColor).toBe('#ffffff');
    pointer(el, 'pointerenter', 'pen');
    expect(el.style.backgroundColor).toBe('#ffffff');
  });

  it('keeps an active button blue under the mouse, and pale blue again once deactivated', () => {
    const btn = createButton();
    const el = btn.getElement();
    btn.setActive(true);

    pointer(el, 'pointerenter', 'mouse');
    expect(el.style.backgroundColor).toBe('#285daa');

    btn.setActive(false);
    expect(el.style.backgroundColor).toBe('#d4dfee');
  });

  it('shows no hover while disabled, and the hover once enabled under the mouse', () => {
    const btn = createButton();
    const el = btn.getElement();
    btn.setDisabled(true);

    pointer(el, 'pointerenter', 'mouse');
    expect(el.style.backgroundColor).toBe('#ffffff');

    btn.setDisabled(false);
    expect(el.style.backgroundColor).toBe('#d4dfee');
  });

  it('drops the hover when disabled under the mouse and stays white after it leaves', () => {
    const btn = createButton();
    const el = btn.getElement();
    pointer(el, 'pointerenter', 'mouse');
    expect(el.style.backgroundColor).toBe('#d4dfee');

    btn.setDisabled(true);
    expect(el.style.backgroundColor).toBe('#ffffff');
    pointer(el, 'pointerleave', 'mouse');
    btn.setDisabled(false);
    expect(el.style.backgroundColor).toBe('#ffffff');
  });

  it('turns blue when activated under the mouse and stays blue after it leaves', () => {
    const btn = createButton();
    const el = btn.getElement();
    pointer(el, 'pointerenter', 'mouse');

    btn.setActive(true);
    expect(el.style.backgroundColor).toBe('#285daa');
    pointer(el, 'pointerleave', 'mouse');
    expect(el.style.backgroundColor).toBe('#285daa');
  });
});
