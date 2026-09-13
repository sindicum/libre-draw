import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Real-browser E2E for the input layer (touch, long press, drag), which
 * happy-dom cannot reproduce. Runs `examples/basic` in `?e2e` mode (no
 * tiles) on desktop Chromium and a touch-emulated Pixel.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // One Vite dev server is shared; the flows are short, so a single worker
  // keeps the run deterministic without costing much time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite examples/basic --port ${PORT} --strictPort`,
    url: `${BASE_URL}/?e2e`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      // Pixel 7: hasTouch + isMobile, so Chromium synthesises the
      // compatibility mouse events that follow a real tap.
      use: { ...devices['Pixel 7'] },
    },
  ],
});
