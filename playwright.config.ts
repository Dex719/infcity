import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/** Порт `vite preview`, на котором e2e поднимает продакшен-сборку. */
const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

/**
 * Локально Chromium-проект едет на системном Chrome (`channel: 'chrome'`), чтобы не
 * скачивать браузеры Playwright; в CI и при `PW_CHANNEL=chromium` — на браузере Playwright.
 */
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? 'chromium' : 'chrome');
const chromiumUse =
  channel === 'chromium'
    ? { ...devices['Desktop Chrome'] }
    : { ...devices['Desktop Chrome'], channel };

const projects: NonNullable<PlaywrightTestConfig['projects']> = [
  { name: 'chromium', use: chromiumUse },
];
// WebKit — по флагу: `PW_WEBKIT=1 npx playwright test` (нужен `npx playwright install webkit`).
if (process.env.PW_WEBKIT === '1') {
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } });
}

/**
 * E2E и visual regression (design → Testing Strategy, TSK-061/062) на статической сборке.
 * Эталоны скриншотов — `e2e/__screenshots__/<name>.png` (один файл на кадр, без суффиксов
 * платформы: сравнение выполняется локально, в CI — `--ignore-snapshots`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    bypassCSP: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  projects,
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
