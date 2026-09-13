import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { KeyboardInput, resolveShortcut, isEditableTarget } from '../../../src/input/KeyboardInput';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

/** A map double that only exposes the container the keyboard handler listens on. */
function createMapMock(container: HTMLElement): MaplibreMap {
  return { getContainer: () => container } as unknown as MaplibreMap;
}

describe('resolveShortcut', () => {
  it.each([
    ['Ctrl+Z', { key: 'z', ctrlKey: true }, 'undo'],
    ['Cmd+Z', { key: 'z', metaKey: true }, 'undo'],
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }, 'redo'],
    ['Cmd+Shift+Z', { key: 'Z', metaKey: true, shiftKey: true }, 'redo'],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }, 'redo'],
    ['Ctrl+Shift+Y', { key: 'Y', ctrlKey: true, shiftKey: true }, 'redo'],
  ])('should resolve %s', (_label, init, expected) => {
    expect(resolveShortcut(keydown(init))).toBe(expected);
  });

  it.each([
    ['plain z', { key: 'z' }],
    ['Shift+Z without modifier', { key: 'Z', shiftKey: true }],
    ['Ctrl+Alt+Z', { key: 'z', ctrlKey: true, altKey: true }],
    ['Cmd+Alt+Z', { key: 'z', metaKey: true, altKey: true }],
    ['Ctrl+A', { key: 'a', ctrlKey: true }],
    ['Escape', { key: 'Escape', ctrlKey: true }],
    // macOS browsers reserve Cmd+Y for the history page
    ['Cmd+Y', { key: 'y', metaKey: true }],
    ['Cmd+Shift+Y', { key: 'Y', metaKey: true, shiftKey: true }],
    ['Ctrl+Cmd+Y', { key: 'y', ctrlKey: true, metaKey: true }],
  ])('should return null for %s', (_label, init) => {
    expect(resolveShortcut(keydown(init))).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it.each(['input', 'textarea', 'select'])('should treat <%s> as editable', (tag) => {
    expect(isEditableTarget(document.createElement(tag))).toBe(true);
  });

  it('should treat contenteditable elements as editable', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', '');
    expect(isEditableTarget(div)).toBe(true);

    div.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(div)).toBe(true);
  });

  it('should not treat contenteditable="false" as editable', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'false');
    expect(isEditableTarget(div)).toBe(false);
  });

  it('should not treat plain elements, document or null as editable', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('KeyboardInput shortcuts', () => {
  let container: HTMLElement;
  let canvas: HTMLElement;
  let onKeyDown: ReturnType<typeof vi.fn>;
  let onUndo: ReturnType<typeof vi.fn>;
  let onRedo: ReturnType<typeof vi.fn>;
  let keyboardInput: KeyboardInput;

  beforeEach(() => {
    // map container > canvas, as MapLibre lays it out; the canvas is what gets focus
    container = document.createElement('div');
    canvas = document.createElement('div');
    container.appendChild(canvas);
    document.body.appendChild(container);

    onKeyDown = vi.fn();
    onUndo = vi.fn(() => true);
    onRedo = vi.fn(() => true);
    keyboardInput = new KeyboardInput(createMapMock(container), { onKeyDown }, { onUndo, onRedo });
    keyboardInput.enable();
  });

  afterEach(() => {
    keyboardInput.destroy();
    document.body.replaceChildren();
  });

  it('should call onUndo for Ctrl+Z and Cmd+Z pressed on the map', () => {
    canvas.dispatchEvent(keydown({ key: 'z', ctrlKey: true }));
    canvas.dispatchEvent(keydown({ key: 'z', metaKey: true }));

    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('should call onRedo for Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y', () => {
    canvas.dispatchEvent(keydown({ key: 'Z', ctrlKey: true, shiftKey: true }));
    canvas.dispatchEvent(keydown({ key: 'Z', metaKey: true, shiftKey: true }));
    canvas.dispatchEvent(keydown({ key: 'y', ctrlKey: true }));

    expect(onRedo).toHaveBeenCalledTimes(3);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('should leave Cmd+Y to the browser (macOS history shortcut)', () => {
    const event = keydown({ key: 'y', metaKey: true });
    canvas.dispatchEvent(event);

    expect(onRedo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('should prevent the browser default when the callback reports success', () => {
    const event = keydown({ key: 'z', ctrlKey: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('should leave the browser default alone when the callback reports nothing to do', () => {
    onUndo.mockReturnValue(false);
    onRedo.mockReturnValue(false);

    const undo = keydown({ key: 'z', ctrlKey: true });
    const redo = keydown({ key: 'y', ctrlKey: true });
    canvas.dispatchEvent(undo);
    canvas.dispatchEvent(redo);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(undo.defaultPrevented).toBe(false);
    expect(redo.defaultPrevented).toBe(false);
  });

  it('should not prevent default or fire callbacks for non-shortcut keys', () => {
    const plain = keydown({ key: 'z' });
    const alt = keydown({ key: 'z', ctrlKey: true, altKey: true });
    canvas.dispatchEvent(plain);
    canvas.dispatchEvent(alt);

    expect(plain.defaultPrevented).toBe(false);
    expect(alt.defaultPrevented).toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('should ignore keys pressed outside the map container', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    const event = keydown({ key: 'z', ctrlKey: true });
    outside.dispatchEvent(event);
    document.dispatchEvent(keydown({ key: 'z', ctrlKey: true }));
    document.dispatchEvent(keydown({ key: 'Escape' }));

    expect(onUndo).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('should not route shortcuts to the mode callback', () => {
    canvas.dispatchEvent(keydown({ key: 'z', ctrlKey: true }));

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('should keep dispatching Escape / Delete / Backspace to the mode', () => {
    const escape = keydown({ key: 'Escape' });
    canvas.dispatchEvent(escape);
    canvas.dispatchEvent(keydown({ key: 'Delete' }));
    canvas.dispatchEvent(keydown({ key: 'Backspace' }));

    expect(onKeyDown).toHaveBeenCalledTimes(3);
    expect(onKeyDown).toHaveBeenCalledWith('Escape', escape);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it.each(['input', 'textarea', 'select'])(
    'should ignore shortcuts while a <%s> inside the map has focus',
    (tag) => {
      const el = document.createElement(tag);
      container.appendChild(el);

      const event = keydown({ key: 'z', ctrlKey: true });
      el.dispatchEvent(event);

      expect(onUndo).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  );

  it('should ignore shortcuts while a contenteditable element has focus', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    container.appendChild(el);

    el.dispatchEvent(keydown({ key: 'y', ctrlKey: true }));

    expect(onRedo).not.toHaveBeenCalled();
  });

  it('should handle shortcuts bubbling from a focused control inside the map', () => {
    // e.g. a toolbar button that kept focus after being clicked
    const button = document.createElement('button');
    container.appendChild(button);

    button.dispatchEvent(keydown({ key: 'z', metaKey: true }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('should not fire after disable', () => {
    keyboardInput.disable();
    canvas.dispatchEvent(keydown({ key: 'z', ctrlKey: true }));

    expect(onUndo).not.toHaveBeenCalled();
  });

  it('should not fire after destroy', () => {
    keyboardInput.destroy();
    canvas.dispatchEvent(keydown({ key: 'y', ctrlKey: true }));

    expect(onRedo).not.toHaveBeenCalled();
  });
});

describe('KeyboardInput without shortcut callbacks', () => {
  it('should ignore shortcut combinations and leave the default untouched', () => {
    const container = document.createElement('div');
    const onKeyDown = vi.fn();
    const keyboardInput = new KeyboardInput(createMapMock(container), { onKeyDown });
    keyboardInput.enable();

    const event = keydown({ key: 'z', ctrlKey: true });
    container.dispatchEvent(event);

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    const escape = keydown({ key: 'Escape' });
    container.dispatchEvent(escape);
    expect(onKeyDown).toHaveBeenCalledWith('Escape', escape);

    keyboardInput.destroy();
  });
});
