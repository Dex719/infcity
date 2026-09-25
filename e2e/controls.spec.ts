import { expect, test, type Page } from '@playwright/test';
import { CAMERA } from '@/config';
import { gotoApp } from './helpers';

/**
 * Высота камеры, когда анимация закончилась: доводим её временем приложения (`simulate`, кадры
 * по 1/60 с), а не настенными часами. Без видеокарты (раннер GitHub — 2,5 FPS) `dt` кадра
 * упирается в `WORLD.MAX_DT` 0,05 с, время приложения идёт в 8 раз медленнее настенного, и за
 * прежние 5 с опроса анимация не успевала (CI 2026-09-25: 60,9 вместо 60).
 */
async function settledHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__app;
    if (api === undefined) {
      throw new Error('window.__app is not installed');
    }
    api.simulate(3);
    return api.stats().cameraHeight;
  });
}

test.describe('Управление (FR-8)', () => {
  test('AC-8.1: точка под курсором после drag на 300 px остаётся в пределах 30 px', async ({
    page,
  }) => {
    await gotoApp(page);
    const start = { x: 500, y: 400 };
    const anchor = await page.evaluate(({ x, y }) => window.__app?.groundAt(x, y) ?? null, start);
    expect(anchor).not.toBeNull();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 300, start.y, { steps: 20 });
    // Пользователь останавливает руку перед отпусканием — инерции нет.
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const projected = await page.evaluate((point) => {
      const api = window.__app;
      if (api === undefined || point === null) {
        throw new Error('no api');
      }
      return api.project(point);
    }, anchor);
    const distance = Math.hypot(projected.x - (start.x + 300), projected.y - start.y);
    expect(distance).toBeLessThanOrEqual(30);
  });

  test('AC-8.2: 10 щелчков колеса упирают камеру в границы диапазона', async ({ page }) => {
    await gotoApp(page);
    await page.mouse.move(640, 360);
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100);
    }
    expect(await settledHeight(page)).toBeCloseTo(CAMERA.HEIGHT_MIN, 0);
    await page.mouse.wheel(0, -100);
    expect(await settledHeight(page)).toBeCloseTo(CAMERA.HEIGHT_MIN, 0);

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 100);
    }
    expect(await settledHeight(page)).toBeCloseTo(CAMERA.HEIGHT_MAX, 0);
    await page.mouse.wheel(0, 100);
    expect(await settledHeight(page)).toBeCloseTo(CAMERA.HEIGHT_MAX, 0);
  });

  test('AC-1.2: 60 с непрерывного панорамирования без пустых слотов', async ({ page }) => {
    test.setTimeout(300_000);
    await gotoApp(page);
    await page.evaluate(() => window.__app?.pause());
    await page.keyboard.down('ArrowRight');
    const samples: number[] = [];
    let moved = 0;
    // 60 с времени приложения: 120 отсчётов по полсекунды кадрами по 1/60 с. По настенным часам
    // без видеокарты панорама шла в 8 раз медленнее (см. settledHeight) и в CI 2026-09-25
    // сдвинулась ровно на 10 чанков при пороге «больше 10».
    for (let i = 0; i < 120; i++) {
      const stats = await page.evaluate(() => {
        const api = window.__app;
        if (api === undefined) {
          throw new Error('window.__app is not installed');
        }
        api.simulate(0.5, 1 / 60);
        return api.stats();
      });
      samples.push(stats.emptySlots);
      moved = Math.abs(stats.gridCoords.x) + Math.abs(stats.gridCoords.y);
    }
    await page.keyboard.up('ArrowRight');
    expect(Math.max(...samples)).toBe(0);
    expect(moved).toBeGreaterThan(10);
  });
});
