import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { ReticleOverlay } from '../../../src/ui/ReticleOverlay';
import { MESSAGES_JA } from '../../../src/ui/messages';

function createOverlay(messages?: typeof MESSAGES_JA) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = { getContainer: () => container } as unknown as MaplibreMap;
  const callbacks = { onAddPoint: vi.fn() };
  const overlay = new ReticleOverlay(map, callbacks, messages);
  const reticle = container.querySelector<HTMLDivElement>('.libre-draw-reticle')!;
  const bar = container.querySelector<HTMLDivElement>('.libre-draw-reticle-bar')!;
  const button = bar.querySelector('button')!;
  return { container, overlay, callbacks, reticle, bar, button };
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

  it('removes its elements and stops listening on destroy', () => {
    const { container, overlay, button, callbacks } = createOverlay();

    overlay.destroy();
    button.click();

    expect(container.querySelector('.libre-draw-reticle')).toBeNull();
    expect(container.querySelector('.libre-draw-reticle-bar')).toBeNull();
    expect(callbacks.onAddPoint).not.toHaveBeenCalled();
  });
});
