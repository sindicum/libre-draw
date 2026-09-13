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

test('union: tapping two overlapping polygons merges them', async ({ page, hasTouch }) => {
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

  // First tap picks the first partner (observed via selectionchange), second merges.
  await pointer.tap(150, 150);
  await expect
    .poll(async () => {
      const events = await getEvents<{ selectedIds: string[] }>(page, 'selectionchange');
      return events.at(-1)?.selectedIds.length ?? 0;
    })
    .toBe(1);
  await pointer.tap(300, 300);

  await expect.poll(async () => (await getEvents(page, 'union')).length).toBe(1);
  expect(await getEvents(page, 'unionfailed')).toHaveLength(0);
  expect(await featureCount(page)).toBe(1);
});
