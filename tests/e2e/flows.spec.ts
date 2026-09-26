import { test, expect } from '@playwright/test';
import {
  Pointer,
  addPolygonFromScreen,
  featureCount,
  getEvents,
  lastDraftVertexCount,
  openMap,
  recordEvents,
  setMode,
} from './helpers';

declare global {
  interface Window {
    __frameTimes?: number[];
  }
}

// Screen positions are chosen to fit the narrowest project (Pixel 7: 412 px wide).

test.beforeEach(async ({ page }) => {
  await openMap(page);
});

test('draw-polygon: tapping the first vertex finishes the polygon', async ({ page, hasTouch }) => {
  const pointer = new Pointer(page, hasTouch);
  await recordEvents(page, ['create', 'draftchange']);
  await setMode(page, 'draw-polygon');

  // Each tap is confirmed through the draft before the next one. A tap that
  // reached the mode twice (touch + compatibility mouse) would stack vertices
  // or finish early, so the count must step 1 → 2 → 3.
  await pointer.tap(100, 100);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(1);
  await pointer.tap(220, 100);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(2);
  await pointer.tap(160, 220);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(3);

  await pointer.tap(100, 100);

  await expect.poll(() => featureCount(page)).toBe(1);
  expect(await getEvents(page, 'create')).toHaveLength(1);
  expect(await lastDraftVertexCount(page)).toBe(0);

  // The `?e2e` page also carries the frame-time probe (no threshold, just presence).
  expect(await page.evaluate(() => Array.isArray(window.__frameTimes))).toBe(true);
});

test('draw-polygon: a long press removes the last vertex', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'long press is a touch gesture');
  const pointer = new Pointer(page, hasTouch);
  await recordEvents(page, ['draftchange', 'create']);
  await setMode(page, 'draw-polygon');

  await pointer.tap(100, 100);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(1);
  await pointer.tap(220, 100);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(2);

  await pointer.longPress(160, 220);

  await expect.poll(() => lastDraftVertexCount(page)).toBe(1);
  expect(await getEvents(page, 'create')).toHaveLength(0);
  expect(await featureCount(page)).toBe(0);
});

test('draw-angled-rectangle: three taps create a tilted rectangle', async ({ page, hasTouch }) => {
  const pointer = new Pointer(page, hasTouch);
  await recordEvents(page, ['create', 'draftchange']);
  await setMode(page, 'draw-angled-rectangle');

  // A diagonal base edge, then a width point off to one side. The count
  // must step 1 → 2 so a doubled tap cannot finish the rectangle early.
  await pointer.tap(100, 250);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(1);
  await pointer.tap(250, 150);
  await expect.poll(() => lastDraftVertexCount(page)).toBe(2);
  await pointer.tap(250, 300);

  await expect.poll(() => featureCount(page)).toBe(1);
  expect(await lastDraftVertexCount(page)).toBe(0);
  const [create] = await getEvents<{
    feature: { geometry: { type: string; coordinates: number[][][] } };
  }>(page, 'create');
  expect(create.feature.geometry.type).toBe('Polygon');
  expect(create.feature.geometry.coordinates[0]).toHaveLength(5);

  // The base edge is tilted, so the rectangle is not aligned to lng / lat.
  const ring = create.feature.geometry.coordinates[0];
  const lngs = new Set(ring.slice(0, 4).map((p) => p[0].toFixed(9)));
  expect(lngs.size).toBe(4);
});

test('rotate: dragging on the selected rectangle rotates it', async ({ page, hasTouch }) => {
  const pointer = new Pointer(page, hasTouch);
  await addPolygonFromScreen(page, [
    [200, 200],
    [400, 200],
    [400, 300],
    [200, 300],
  ]);
  await recordEvents(page, ['rotate', 'selectionchange']);
  await setMode(page, 'rotate');

  // First tap selects; the drag then has to start on the selected shape.
  await pointer.tap(300, 250);
  await expect
    .poll(async () => {
      const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
      return events.at(-1)?.selectedIds.length ?? 0;
    })
    .toBe(1);

  // From the right edge upward: a quarter turn around the centre (300, 250).
  await pointer.drag([380, 250], [380, 150]);

  await expect.poll(async () => (await getEvents(page, 'rotate')).length).toBe(1);
  const [rotate] = await getEvents<{ angle: number }>(page, 'rotate');
  expect(rotate.angle).not.toBe(0);
  expect(await featureCount(page)).toBe(1);
});

test('union: tapping polygons adds them to the selection and the execute button merges them', async ({
  page,
  hasTouch,
}) => {
  const pointer = new Pointer(page, hasTouch);
  await addPolygonFromScreen(page, [
    [100, 100],
    [250, 100],
    [250, 250],
    [100, 250],
  ]);
  await addPolygonFromScreen(page, [
    [200, 200],
    [350, 200],
    [350, 350],
    [200, 350],
  ]);
  expect(await featureCount(page)).toBe(2);
  await recordEvents(page, ['union', 'unionfailed', 'selectionchange']);
  await setMode(page, 'union');

  const lastSelectionSize = async () => {
    const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
    return events.at(-1)?.selectedIds.length ?? 0;
  };
  const execute = page.getByRole('button', { name: 'Merge selected polygons' });

  // Taps toggle without a modifier key; nothing merges until the button.
  await pointer.tap(150, 150);
  await expect.poll(lastSelectionSize).toBe(1);
  await expect(execute).toBeHidden();
  await pointer.tap(300, 300);
  await expect.poll(lastSelectionSize).toBe(2);
  expect(await getEvents(page, 'union')).toHaveLength(0);

  // On touch the button is the only trigger, so it keeps the 44px target size.
  const box = await execute.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  if (hasTouch) {
    await execute.tap();
  } else {
    await execute.click();
  }

  await expect.poll(async () => (await getEvents(page, 'union')).length).toBe(1);
  expect(await getEvents(page, 'unionfailed')).toHaveLength(0);
  expect(await featureCount(page)).toBe(1);
  await expect(execute).toBeHidden();
});

test('union: Enter merges the selected polygons', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Enter needs a keyboard');
  await addPolygonFromScreen(page, [
    [100, 100],
    [250, 100],
    [250, 250],
    [100, 250],
  ]);
  await addPolygonFromScreen(page, [
    [200, 200],
    [350, 200],
    [350, 350],
    [200, 350],
  ]);
  await recordEvents(page, ['union']);
  await setMode(page, 'union');

  await page.mouse.click(150, 150);
  await page.mouse.click(300, 300);
  // The click focused the map canvas, so the key reaches LibreDraw.
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await getEvents(page, 'union')).length).toBe(1);
  expect(await featureCount(page)).toBe(1);
});

test('select: Shift + click selects two polygons and Delete removes both in one step', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'adding to the selection needs a keyboard modifier');
  await addPolygonFromScreen(page, [
    [60, 100],
    [180, 100],
    [180, 220],
    [60, 220],
  ]);
  await addPolygonFromScreen(page, [
    [240, 100],
    [360, 100],
    [360, 220],
    [240, 220],
  ]);
  await recordEvents(page, ['selectionchange', 'delete']);
  await setMode(page, 'select');

  await page.mouse.click(120, 160);
  await page.keyboard.down('Shift');
  await page.mouse.click(300, 160);
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => {
      const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
      return events.at(-1)?.selectedIds.length ?? 0;
    })
    .toBe(2);

  // The click focused the map canvas, so the key reaches LibreDraw.
  await page.keyboard.press('Delete');

  await expect.poll(async () => (await getEvents(page, 'delete')).length).toBe(2);
  expect(await featureCount(page)).toBe(0);
  await page.evaluate(() => (window as unknown as { draw: { undo(): boolean } }).draw.undo());
  expect(await featureCount(page)).toBe(2);
});

test('select: Shift + click that lands a few pixels off does not zoom the map', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'adding to the selection needs a keyboard modifier');
  await addPolygonFromScreen(page, [
    [60, 100],
    [180, 100],
    [180, 220],
    [60, 220],
  ]);
  await addPolygonFromScreen(page, [
    [240, 100],
    [360, 100],
    [360, 220],
    [240, 220],
  ]);
  await recordEvents(page, ['selectionchange']);
  await setMode(page, 'select');
  const zoomBefore = await page.evaluate(() =>
    (window as unknown as { map: { getZoom(): number } }).map.getZoom()
  );

  await page.mouse.click(120, 160);
  // A shaky Shift + click: the button is released 2px away from the press.
  await page.keyboard.down('Shift');
  await page.mouse.move(300, 160);
  await page.mouse.down();
  await page.mouse.move(302, 161);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect
    .poll(async () => {
      const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
      return events.at(-1)?.selectedIds.length ?? 0;
    })
    .toBe(2);
  // Give a box zoom animation time to start if it were going to.
  await page.waitForTimeout(300);
  const zoomAfter = await page.evaluate(() =>
    (window as unknown as { map: { getZoom(): number } }).map.getZoom()
  );
  expect(zoomAfter).toBe(zoomBefore);
});
test('union: Shift + click that lands a few pixels off does not zoom the map', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'Shift is a keyboard modifier');
  await addPolygonFromScreen(page, [
    [60, 100],
    [180, 100],
    [180, 220],
    [60, 220],
  ]);
  await addPolygonFromScreen(page, [
    [240, 100],
    [360, 100],
    [360, 220],
    [240, 220],
  ]);
  await recordEvents(page, ['selectionchange']);
  await setMode(page, 'union');
  const zoomBefore = await page.evaluate(() =>
    (window as unknown as { map: { getZoom(): number } }).map.getZoom()
  );

  await page.mouse.click(120, 160);
  // Shift means nothing in union mode, but users hold it out of habit from
  // select mode. A shaky Shift + click: released 2px away from the press.
  await page.keyboard.down('Shift');
  await page.mouse.move(300, 160);
  await page.mouse.down();
  await page.mouse.move(302, 161);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect
    .poll(async () => {
      const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
      return events.at(-1)?.selectedIds.length ?? 0;
    })
    .toBe(2);
  // Give a box zoom animation time to start if it were going to.
  await page.waitForTimeout(300);
  const zoomAfter = await page.evaluate(() =>
    (window as unknown as { map: { getZoom(): number } }).map.getZoom()
  );
  expect(zoomAfter).toBe(zoomBefore);
});
