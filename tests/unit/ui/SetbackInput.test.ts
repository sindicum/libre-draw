import { describe, it, expect, vi } from 'vitest';
import { SetbackInput } from '../../../src/ui/SetbackInput';

describe('SetbackInput', () => {
  function createInput() {
    const callbacks = {
      onSubmit: vi.fn(),
      onDistanceChange: vi.fn(),
    };
    const input = new SetbackInput(callbacks);
    return { input, callbacks };
  }

  function getHTMLInput(input: SetbackInput): HTMLInputElement {
    return input.getElement().querySelector('input')!;
  }

  describe('parseDistance via callbacks', () => {
    it('should fire onDistanceChange for valid positive numbers', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '5';
      htmlInput.dispatchEvent(new Event('input'));

      expect(callbacks.onDistanceChange).toHaveBeenCalledWith(5);
    });

    it('should not fire onDistanceChange for empty input', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '';
      htmlInput.dispatchEvent(new Event('input'));

      expect(callbacks.onDistanceChange).not.toHaveBeenCalled();
    });

    it('should not fire onDistanceChange for zero', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '0';
      htmlInput.dispatchEvent(new Event('input'));

      expect(callbacks.onDistanceChange).not.toHaveBeenCalled();
    });

    it('should not fire onDistanceChange for negative values', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '-5';
      htmlInput.dispatchEvent(new Event('input'));

      expect(callbacks.onDistanceChange).not.toHaveBeenCalled();
    });

    it('should not fire onDistanceChange for non-numeric values', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = 'abc';
      htmlInput.dispatchEvent(new Event('input'));

      expect(callbacks.onDistanceChange).not.toHaveBeenCalled();
    });

    it('should not fire onSubmit on Enter for invalid input', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '';
      htmlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });

    it('should fire onSubmit on Enter for valid input', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '15';
      htmlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(callbacks.onSubmit).toHaveBeenCalledWith(15);
    });

    it('should not fire onSubmit via execute button for invalid input', () => {
      const { input, callbacks } = createInput();
      const htmlInput = getHTMLInput(input);
      const button = input.getElement().querySelector('button')!;

      htmlInput.value = '0';
      button.click();

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('setPosition', () => {
    it('should position to the left when side is left', () => {
      const { input } = createInput();
      input.setPosition('left');
      const el = input.getElement();

      expect(el.style.right).toBe('100%');
      expect(el.style.left).toBe('');
      expect(el.style.marginRight).toBe('8px');
      expect(el.style.marginLeft).toBe('');
    });

    it('should position to the right when side is right', () => {
      const { input } = createInput();
      input.setPosition('right');
      const el = input.getElement();

      expect(el.style.left).toBe('100%');
      expect(el.style.right).toBe('');
      expect(el.style.marginLeft).toBe('8px');
      expect(el.style.marginRight).toBe('');
    });
  });

  describe('getDistance', () => {
    it('should return default distance for invalid input', () => {
      const { input } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '';
      expect(input.getDistance()).toBe(10);
    });

    it('should return parsed distance for valid input', () => {
      const { input } = createInput();
      const htmlInput = getHTMLInput(input);

      htmlInput.value = '25';
      expect(input.getDistance()).toBe(25);
    });
  });
});
