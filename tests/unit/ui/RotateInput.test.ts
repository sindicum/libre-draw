import { describe, expect, it, vi } from 'vitest';
import { RotateInput } from '../../../src/ui/RotateInput';
import { MESSAGES_EN, MESSAGES_JA } from '../../../src/ui/messages';

describe('RotateInput', () => {
  function createInput() {
    const callbacks = {
      onSubmit: vi.fn(),
      onAngleChange: vi.fn(),
    };
    const input = new RotateInput(callbacks);
    return { input, callbacks };
  }

  function getHTMLInput(input: RotateInput): HTMLInputElement {
    return input.getElement().querySelector('input')!;
  }

  function getExecuteButton(input: RotateInput): HTMLButtonElement {
    return input.getElement().querySelector('button')!;
  }

  function typeValue(input: RotateInput, value: string): void {
    const htmlInput = getHTMLInput(input);
    htmlInput.value = value;
    htmlInput.dispatchEvent(new Event('input'));
  }

  describe('initial state', () => {
    it('is hidden, defaults to 90 and constrains the field to ±360', () => {
      const { input } = createInput();
      const htmlInput = getHTMLInput(input);

      expect(input.getElement().style.display).toBe('none');
      expect(htmlInput.value).toBe('90');
      expect(htmlInput.min).toBe('-360');
      expect(htmlInput.max).toBe('360');
      expect(input.getAngle()).toBe(90);
    });
  });

  describe('parseAngle via callbacks', () => {
    it('fires onAngleChange for values inside the range', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '45');
      typeValue(input, '-45');
      typeValue(input, '360');
      typeValue(input, '-360');

      expect(callbacks.onAngleChange.mock.calls.map((c) => c[0])).toEqual([45, -45, 360, -360]);
    });

    it('fires onAngleChange for 0 so the preview can reset', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '0');

      expect(callbacks.onAngleChange).toHaveBeenCalledWith(0);
    });

    it('accepts fractional angles', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '22.5');

      expect(callbacks.onAngleChange).toHaveBeenCalledWith(22.5);
    });

    it('does not fire for values outside the range', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '361');
      typeValue(input, '-361');

      expect(callbacks.onAngleChange).not.toHaveBeenCalled();
      expect(input.getAngle()).toBeNull();
    });

    it('does not fire for empty or non-numeric input', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '');
      typeValue(input, 'abc');

      expect(callbacks.onAngleChange).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('fires onSubmit on Enter with the current value', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '30');
      getHTMLInput(input).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(callbacks.onSubmit).toHaveBeenCalledWith(30);
    });

    it('ignores other keys', () => {
      const { input, callbacks } = createInput();

      getHTMLInput(input).dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });

    it('fires onSubmit on the execute button', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '-15');
      getExecuteButton(input).click();

      expect(callbacks.onSubmit).toHaveBeenCalledWith(-15);
    });

    it('does not submit an invalid value', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '999');
      getExecuteButton(input).click();
      getHTMLInput(input).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });

    it('keeps the value after a submit so it can be repeated', () => {
      const { input, callbacks } = createInput();

      typeValue(input, '30');
      getExecuteButton(input).click();
      getExecuteButton(input).click();

      expect(getHTMLInput(input).value).toBe('30');
      expect(callbacks.onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  describe('visibility and position', () => {
    it('toggles display', () => {
      const { input } = createInput();

      input.setVisible(true);
      expect(input.getElement().style.display).toBe('inline-flex');
      input.setVisible(false);
      expect(input.getElement().style.display).toBe('none');
    });

    it('positions to the left or right of the button', () => {
      const { input } = createInput();

      input.setPosition('left');
      expect(input.getElement().style.right).toBe('100%');
      expect(input.getElement().style.marginRight).toBe('8px');

      input.setPosition('right');
      expect(input.getElement().style.left).toBe('100%');
      expect(input.getElement().style.marginLeft).toBe('8px');
    });
  });

  describe('destroy', () => {
    it('removes the element and stops firing callbacks', () => {
      const { input, callbacks } = createInput();
      const element = input.getElement();
      document.body.appendChild(element);

      input.destroy();

      expect(document.body.contains(element)).toBe(false);
      typeValue(input, '10');
      expect(callbacks.onAngleChange).not.toHaveBeenCalled();
    });
  });

  describe('messages', () => {
    it('uses the English strings by default', () => {
      const { input } = createInput();
      const button = input.getElement().querySelector('button')!;

      expect(button.textContent).toBe(MESSAGES_EN.rotateExecute);
      expect(button.getAttribute('aria-label')).toBe(MESSAGES_EN.rotateExecuteLabel);
      expect(getHTMLInput(input).getAttribute('aria-label')).toBe(MESSAGES_EN.rotateAngleInput);
    });

    it('renders the injected strings', () => {
      const input = new RotateInput({ onSubmit: vi.fn(), onAngleChange: vi.fn() }, MESSAGES_JA);
      const button = input.getElement().querySelector('button')!;

      expect(button.textContent).toBe(MESSAGES_JA.rotateExecute);
      expect(button.getAttribute('aria-label')).toBe(MESSAGES_JA.rotateExecuteLabel);
      expect(getHTMLInput(input).getAttribute('aria-label')).toBe(MESSAGES_JA.rotateAngleInput);
    });
  });
});
