import { describe, expect, it, vi } from 'vitest';
import { UnionExecute } from '../../../src/ui/UnionExecute';
import { MESSAGES_JA } from '../../../src/ui/messages';

describe('UnionExecute', () => {
  function createExecute() {
    const callbacks = { onExecute: vi.fn() };
    const execute = new UnionExecute(callbacks);
    return { execute, callbacks };
  }

  function getButton(execute: UnionExecute): HTMLButtonElement {
    return execute.getElement().querySelector('button')!;
  }

  it('is hidden initially and labelled in English by default', () => {
    const { execute } = createExecute();
    const button = getButton(execute);

    expect(execute.getElement().style.display).toBe('none');
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Merge');
    expect(button.getAttribute('aria-label')).toBe('Merge selected polygons');
  });

  it('has a 44px touch target, the size of the toolbar buttons', () => {
    const { execute } = createExecute();
    const style = getButton(execute).style;

    expect(style.height).toBe('44px');
    expect(style.minWidth).toBe('44px');
  });

  it('uses the given messages', () => {
    const execute = new UnionExecute({ onExecute: vi.fn() }, MESSAGES_JA);
    const button = getButton(execute);

    expect(button.textContent).toBe('統合');
    expect(button.getAttribute('aria-label')).toBe('選択したポリゴンを統合');
  });

  it('calls onExecute when the button is clicked', () => {
    const { execute, callbacks } = createExecute();

    getButton(execute).click();

    expect(callbacks.onExecute).toHaveBeenCalledOnce();
  });

  it('toggles visibility', () => {
    const { execute } = createExecute();

    execute.setVisible(true);
    expect(execute.getElement().style.display).toBe('inline-flex');
    execute.setVisible(false);
    expect(execute.getElement().style.display).toBe('none');
  });

  it('positions itself on either side of the union button', () => {
    const { execute } = createExecute();
    const style = execute.getElement().style;

    execute.setPosition('left');
    expect(style.right).toBe('100%');
    expect(style.left).toBe('');

    execute.setPosition('right');
    expect(style.left).toBe('100%');
    expect(style.right).toBe('');
  });

  it('stops calling back and leaves the DOM after destroy', () => {
    const { execute, callbacks } = createExecute();
    const parent = document.createElement('div');
    parent.appendChild(execute.getElement());
    const button = getButton(execute);

    execute.destroy();
    button.click();

    expect(parent.children).toHaveLength(0);
    expect(callbacks.onExecute).not.toHaveBeenCalled();
  });
});
