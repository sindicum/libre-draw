import type { Page } from '@playwright/test';
import type { LibreDraw, LibreDrawEventMap, ModeName } from '../../src';

type Point = [number, number];

/** Event names the flows observe; typed so a typo fails at compile time. */
export type E2EEventName = keyof LibreDrawEventMap;

/** What `examples/basic/main.ts` exposes on `window`, plus the event log the tests attach. */
interface E2EWindow {
  draw: LibreDraw;
  map: { loaded(): boolean; unproject(p: Point): { lng: number; lat: number } };
  __e2e: Record<string, unknown[]>;
}

/** Open the example in `?e2e` mode and wait until the map and LibreDraw are ready. */
export async function openMap(page: Page): Promise<void> {
  await page.goto('/?e2e');
  await page.waitForFunction(
    () => {
      const w = window as unknown as Partial<E2EWindow>;
      return Boolean(w.draw) && w.map?.loaded() === true;
    },
    undefined,
    { timeout: 15_000 }
  );
  await page.evaluate(() => {
    (window as unknown as E2EWindow).__e2e = {};
  });
}

/** Start recording the given LibreDraw events into `window.__e2e[type]`. */
export async function recordEvents(page: Page, types: E2EEventName[]): Promise<void> {
  await page.evaluate((types) => {
    const w = window as unknown as E2EWindow;
    for (const type of types) {
      w.__e2e[type] = [];
      w.draw.on(type as 'create', (e: unknown) => {
        // JSON round-trip keeps the payload readable from the test side.
        w.__e2e[type].push(JSON.parse(JSON.stringify(e)));
      });
    }
  }, types);
}

export async function getEvents<T = Record<string, unknown>>(
  page: Page,
  type: E2EEventName
): Promise<T[]> {
  return page.evaluate(
    (type) => (window as unknown as E2EWindow).__e2e[type] ?? [],
    type
  ) as Promise<T[]>;
}

export async function featureCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as E2EWindow).draw.getFeatures().length);
}

export async function setMode(page: Page, mode: ModeName): Promise<void> {
  await page.evaluate((mode) => (window as unknown as E2EWindow).draw.setMode(mode), mode);
}

/** `vertexCount` of the most recent `draftchange` event, or -1 if none was recorded. */
export async function lastDraftVertexCount(page: Page): Promise<number> {
  const events = await getEvents<{ vertexCount: number }>(page, 'draftchange');
  return events.length === 0 ? -1 : events[events.length - 1].vertexCount;
}

/**
 * Add a polygon whose ring is given in screen pixels. Coordinates are
 * unprojected in the page so the test does not depend on center / zoom.
 */
export async function addPolygonFromScreen(page: Page, points: Point[]): Promise<void> {
  await page.evaluate((points) => {
    const w = window as unknown as E2EWindow;
    const ring = points.map((p) => {
      const ll = w.map.unproject(p);
      return [ll.lng, ll.lat];
    });
    ring.push(ring[0]);
    w.draw.addFeatures([
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
    ]);
  }, points);
}

/** Longer than `LONG_PRESS_MS` (500) in `src/input/gestures.ts`, with slack for CI. */
const LONG_PRESS_HOLD_MS = 700;
/**
 * `TouchInput` reports two taps within `DOUBLE_TAP_MS` (300) as a double tap
 * regardless of where they land, so a second touch tap must not follow the
 * first too quickly. Only the remainder of this window is waited, and only
 * on the touch project; mouse clicks far apart never form a dblclick.
 */
const TOUCH_TAP_MIN_INTERVAL_MS = 350;

/**
 * Pointer abstraction over the two projects: real touch input through CDP
 * on the mobile project (so Chromium synthesises the compatibility mouse
 * events a tap produces), plain mouse input on desktop.
 */
export class Pointer {
  private lastTouchTapAt = 0;

  constructor(
    private readonly page: Page,
    private readonly touch: boolean
  ) {}

  get isTouch(): boolean {
    return this.touch;
  }

  async tap(x: number, y: number): Promise<void> {
    if (this.touch) {
      const sinceLast = Date.now() - this.lastTouchTapAt;
      if (sinceLast < TOUCH_TAP_MIN_INTERVAL_MS) {
        await this.page.waitForTimeout(TOUCH_TAP_MIN_INTERVAL_MS - sinceLast);
      }
      await this.page.touchscreen.tap(x, y);
      this.lastTouchTapAt = Date.now();
    } else {
      await this.page.mouse.click(x, y);
    }
  }

  /** Touch only: hold a finger still long enough for the long-press gesture. */
  async longPress(x: number, y: number, holdMs = LONG_PRESS_HOLD_MS): Promise<void> {
    if (!this.touch) throw new Error('longPress is a touch gesture');
    const cdp = await this.page.context().newCDPSession(this.page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await this.page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  }

  async drag(from: Point, to: Point, steps = 10): Promise<void> {
    if (this.touch) {
      const cdp = await this.page.context().newCDPSession(this.page);
      try {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: from[0], y: from[1] }],
        });
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t },
            ],
          });
          await this.page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await cdp.detach();
      }
    } else {
      await this.page.mouse.move(from[0], from[1]);
      await this.page.mouse.down();
      await this.page.mouse.move(to[0], to[1], { steps });
      await this.page.mouse.up();
    }
  }
}
