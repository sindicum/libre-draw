import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { ReticleOverlay } from '../../../src/ui/ReticleOverlay';
import { MESSAGES_JA } from '../../../src/ui/messages';

function createOverlay(messages?: typeof MESSAGES_JA) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = { getContainer: () => container } as unknown as MaplibreMap;
  const callbacks = { onAddPoint: vi.fn(), onUndoVertex: vi.fn(), onFinish: vi.fn() };
  const overlay = new ReticleOverlay(map, callbacks, messages);
  const reticle = container.querySelector<HTMLDivElement>('.libre-draw-reticle')!;
  const bar = container.querySelector<HTMLDivElement>('.libre-draw-reticle-bar')!;
  const buttons = Array.from(bar.querySelectorAll('button'));
  const [undo, button, finish] = buttons;
  return { container, overlay, callbacks, reticle, bar, buttons, undo, button, finish };
}

describe('ReticleOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a reticle and an action bar on the map container, hidden', () => {
    const { reticle, bar } = createOverlay();

    expect(reticle).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(reticle.style.display).toBe('none');
    expect(bar.style.display).toBe('none');
  });

  it('centers a reticle that lets pointer input through to the map', () => {
    const { reticle } = createOverlay();

    expect(reticle.style.left).toBe('50%');
    expect(reticle.style.top).toBe('50%');
    expect(reticle.style.transform).toBe('translate(-50%, -50%)');
    expect(reticle.style.pointerEvents).toBe('none');
    expect(reticle.getAttribute('aria-hidden')).toBe('true');
    expect(reticle.querySelector('svg')).not.toBeNull();
  });

  it('puts the action bar at the bottom center', () => {
    const { bar } = createOverlay();

    expect(bar.style.left).toBe('50%');
    expect(bar.style.bottom).not.toBe('');
    expect(bar.style.top).toBe('');
  });

  it('shows and hides both parts together', () => {
    const { overlay, reticle, bar } = createOverlay();

    overlay.setVisible(true);
    expect(reticle.style.display).toBe('block');
    expect(bar.style.display).toBe('flex');

    overlay.setVisible(false);
    expect(reticle.style.display).toBe('none');
    expect(bar.style.display).toBe('none');
  });

  it('has an "Add point" button with a 44px touch target', () => {
    const { button } = createOverlay();

    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Add point');
    expect(button.getAttribute('aria-label')).toBe('Add point');
    expect(button.style.height).toBe('44px');
    expect(button.style.minWidth).toBe('44px');
  });

  it('uses the given messages', () => {
    const { button } = createOverlay(MESSAGES_JA);

    expect(button.textContent).toBe('点を追加');
    expect(button.getAttribute('aria-label')).toBe('点を追加');
  });

  it('calls onAddPoint on click without letting the click reach the map', () => {
    const { container, button, callbacks } = createOverlay();
    const mapClick = vi.fn();
    container.addEventListener('click', mapClick);

    button.click();

    expect(callbacks.onAddPoint).toHaveBeenCalledOnce();
    expect(mapClick).not.toHaveBeenCalled();
  });

  it('orders the buttons undo, add point, finish, each a 44px touch target', () => {
    const { buttons } = createOverlay();

    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Undo point',
      'Add point',
      'Finish',
    ]);
    for (const b of buttons) {
      expect(b.type).toBe('button');
      expect(b.textContent).toBe(b.getAttribute('aria-label'));
      expect(b.style.height).toBe('44px');
      expect(b.style.minWidth).toBe('44px');
    }
  });

  it('labels all three buttons from the given messages', () => {
    const { buttons } = createOverlay(MESSAGES_JA);

    expect(buttons.map((b) => b.textContent)).toEqual(['1 つ戻す', '点を追加', '完了']);
  });

  it('starts with undo and finish disabled and add point enabled', () => {
    const { undo, button, finish } = createOverlay();

    expect(undo.disabled).toBe(true);
    expect(finish.disabled).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('enables undo and finish independently from the action state', () => {
    const { overlay, undo, button, finish } = createOverlay();

    overlay.setActionState({ canUndo: true, canFinish: false });
    expect(undo.disabled).toBe(false);
    expect(undo.style.opacity).toBe('1');
    expect(finish.disabled).toBe(true);
    expect(finish.style.opacity).toBe('0.4');

    overlay.setActionState({ canUndo: false, canFinish: true });
    expect(undo.disabled).toBe(true);
    expect(finish.disabled).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('calls onUndoVertex and onFinish on click without reaching the map', () => {
    const { container, overlay, undo, finish, callbacks } = createOverlay();
    const mapClick = vi.fn();
    container.addEventListener('click', mapClick);
    overlay.setActionState({ canUndo: true, canFinish: true });

    undo.click();
    finish.click();

    expect(callbacks.onUndoVertex).toHaveBeenCalledOnce();
    expect(callbacks.onFinish).toHaveBeenCalledOnce();
    expect(callbacks.onAddPoint).not.toHaveBeenCalled();
    expect(mapClick).not.toHaveBeenCalled();
  });

  it('does not call a disabled button', () => {
    const { undo, finish, callbacks } = createOverlay();

    undo.click();
    finish.click();

    expect(callbacks.onUndoVertex).not.toHaveBeenCalled();
    expect(callbacks.onFinish).not.toHaveBeenCalled();
  });

  it('removes its elements and stops listening on destroy', () => {
    const { container, overlay, buttons, callbacks } = createOverlay();
    overlay.setActionState({ canUndo: true, canFinish: true });

    overlay.destroy();
    buttons.forEach((b) => b.click());

    expect(container.querySelector('.libre-draw-reticle')).toBeNull();
    expect(container.querySelector('.libre-draw-reticle-bar')).toBeNull();
    expect(callbacks.onAddPoint).not.toHaveBeenCalled();
    expect(callbacks.onUndoVertex).not.toHaveBeenCalled();
    expect(callbacks.onFinish).not.toHaveBeenCalled();
  });

  it('tints every action bar button under the mouse, but not a disabled one', () => {
    const { overlay, buttons, undo, button } = createOverlay();
    overlay.setActionState({ canUndo: true, canFinish: true });
    for (const b of buttons) {
      b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      expect(b.style.backgroundColor).toBe('#d4dfee');
    }

    // Disabled while the mouse is over it: the tint goes away.
    overlay.setActionState({ canUndo: false, canFinish: true });
    expect(undo.style.backgroundColor).toBe('#ffffff');
    expect(button.style.backgroundColor).toBe('#d4dfee');
  });
});
