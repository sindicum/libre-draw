/**
 * A pale tint of `BRAND_COLOR` (`types/style`, 20% on white): the hover
 * background of every button in the toolbar and its popups.
 */
export const HOVER_COLOR = '#d4dfee';

/** Background of a button at rest. */
const REST_COLOR = '#ffffff';

/** Buttons the mouse is currently over. */
const hovered = new WeakSet<HTMLButtonElement>();

/**
 * Give a white button the pale blue hover background.
 *
 * Only the mouse hovers: a touch device fires pointer events for a tap
 * too, and the tint would stay after the finger lifts. A disabled button
 * shows no hover because clicking it does nothing; call
 * {@link paintHover} after changing `disabled`.
 */
export function addHover(button: HTMLButtonElement): void {
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered.add(button);
    paintHover(button);
  });
  button.addEventListener('pointerleave', () => {
    hovered.delete(button);
    paintHover(button);
  });
}

/**
 * Paint the background of a button set up with {@link addHover} for its
 * current hover and disabled state.
 */
export function paintHover(button: HTMLButtonElement): void {
  button.style.backgroundColor = hovered.has(button) && !button.disabled ? HOVER_COLOR : REST_COLOR;
}
