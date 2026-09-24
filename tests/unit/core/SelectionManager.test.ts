import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionManager } from '../../../src/core/SelectionManager';

describe('SelectionManager', () => {
  let onChange: ReturnType<typeof vi.fn>;
  let selection: SelectionManager;

  beforeEach(() => {
    onChange = vi.fn();
    selection = new SelectionManager(onChange);
  });

  it('starts empty', () => {
    expect(selection.getSelectedIds()).toEqual([]);
    expect(selection.size).toBe(0);
    expect(selection.getSingleId()).toBeUndefined();
  });

  describe('set', () => {
    it('replaces the selection, keeps the given order, and notifies once', () => {
      expect(selection.set(['b', 'a'])).toBe(true);

      expect(selection.getSelectedIds()).toEqual(['b', 'a']);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(['b', 'a']);
    });

    it('collapses duplicate ids', () => {
      selection.set(['a', 'b', 'a']);
      expect(selection.getSelectedIds()).toEqual(['a', 'b']);
    });

    it('does not notify when the selection is the same', () => {
      selection.set(['a', 'b']);
      onChange.mockClear();

      expect(selection.set(['a', 'b'])).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('treats a different order as a change', () => {
      selection.set(['a', 'b']);
      onChange.mockClear();

      expect(selection.set(['b', 'a'])).toBe(true);
      expect(onChange).toHaveBeenCalledWith(['b', 'a']);
    });

    it('with an empty list clears a non-empty selection', () => {
      selection.set(['a']);
      expect(selection.set([])).toBe(true);
      expect(selection.getSelectedIds()).toEqual([]);
    });
  });

  describe('toggle', () => {
    it('adds an absent id at the end', () => {
      selection.set(['a']);
      selection.toggle('b');
      expect(selection.getSelectedIds()).toEqual(['a', 'b']);
      expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
    });

    it('removes a present id', () => {
      selection.set(['a', 'b']);
      selection.toggle('a');
      expect(selection.getSelectedIds()).toEqual(['b']);
      expect(onChange).toHaveBeenLastCalledWith(['b']);
    });
  });

  describe('remove', () => {
    it('removes the id and notifies', () => {
      selection.set(['a', 'b']);
      onChange.mockClear();

      expect(selection.remove('a')).toBe(true);
      expect(selection.getSelectedIds()).toEqual(['b']);
      expect(onChange).toHaveBeenCalledWith(['b']);
    });

    it('does nothing for an id that is not selected', () => {
      selection.set(['a']);
      onChange.mockClear();

      expect(selection.remove('x')).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('empties the selection and notifies with []', () => {
      selection.set(['a', 'b']);
      onChange.mockClear();

      expect(selection.clear()).toBe(true);
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('does not notify when already empty', () => {
      expect(selection.clear()).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('retain', () => {
    it('drops the ids the predicate rejects and notifies', () => {
      selection.set(['a', 'b', 'c']);
      onChange.mockClear();

      expect(selection.retain((id) => id !== 'b')).toBe(true);
      expect(selection.getSelectedIds()).toEqual(['a', 'c']);
      expect(onChange).toHaveBeenCalledWith(['a', 'c']);
    });

    it('does not notify when every id is kept', () => {
      selection.set(['a']);
      onChange.mockClear();

      expect(selection.retain(() => true)).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('getSingleId returns the id only while exactly one is selected', () => {
      selection.set(['a']);
      expect(selection.getSingleId()).toBe('a');

      selection.toggle('b');
      expect(selection.getSingleId()).toBeUndefined();
    });

    it('has and size reflect the current set', () => {
      selection.set(['a', 'b']);
      expect(selection.has('a')).toBe(true);
      expect(selection.has('x')).toBe(false);
      expect(selection.size).toBe(2);
    });

    it('returns a copy that callers cannot use to mutate the selection', () => {
      selection.set(['a']);
      selection.getSelectedIds().push('x');
      expect(selection.getSelectedIds()).toEqual(['a']);
    });
  });
});
