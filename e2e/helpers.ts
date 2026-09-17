import { expect, type Page } from '@playwright/test';
import type { AppStats } from '@/app/App';

/** Параметры страницы по умолчанию: фиксированный seed и debug-API без оверлея. */
export const DEFAULT_PARAMS = 'seed=astana&debug=api';

/** `window.__app.stats()` внутри страницы. */
export function readStats(page: Page): Promise<AppStats> {
  return page.evaluate(() => {
    const api = window.__app;
    if (api === undefined) {
      throw new Error('window.__app is not installed');
    }
    return api.stats();
  });
}

/**
 * Открывает демо и ждёт старта: `window.__app` установлен, полоса загрузки скрыта,
 * стартовое окно собрано (`emptySlots === 0`).
 */
export async function gotoApp(page: Page, params: string = DEFAULT_PARAMS): Promise<void> {
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => window.__app !== undefined, undefined, { timeout: 30_000 });
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await readStats(page)).emptySlots, { timeout: 15_000 }).toBe(0);
}

/** Пауза цикла и детерминированный кадр: мобы пересозданы, заголовок убран. */
export async function freezeFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__app;
    if (api === undefined) {
      throw new Error('window.__app is not installed');
    }
    api.pause();
    api.resetMobs();
    document.getElementById('title')?.remove();
    api.step(0);
  });
}
