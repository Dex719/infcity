import { expect, test } from '@playwright/test';
import { CAMERA } from '@/config';
import { gotoApp, readStats } from './helpers';

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
    await expect
      .poll(async () => (await readStats(page)).cameraHeight, { timeout: 5_000 })
      .toBeCloseTo(CAMERA.HEIGHT_MIN, 0);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(400);
    expect((await readStats(page)).cameraHeight).toBeCloseTo(CAMERA.HEIGHT_MIN, 0);

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 100);
    }
    await expect
      .poll(async () => (await readStats(page)).cameraHeight, { timeout: 5_000 })
      .toBeCloseTo(CAMERA.HEIGHT_MAX, 0);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(400);
    expect((await readStats(page)).cameraHeight).toBeCloseTo(CAMERA.HEIGHT_MAX, 0);
  });

  test('AC-1.2: 60 с непрерывного панорамирования без пустых слотов', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoApp(page);
    const samples: number[] = [];
    await page.keyboard.down('ArrowRight');
    const until = Date.now() + 60_000;
    let moved = 0;
    while (Date.now() < until) {
      await page.waitForTimeout(250);
      const stats = await readStats(page);
      samples.push(stats.emptySlots);
      moved = Math.abs(stats.gridCoords.x) + Math.abs(stats.gridCoords.y);
    }
    await page.keyboard.up('ArrowRight');
    expect(samples.length).toBeGreaterThan(100);
    expect(Math.max(...samples)).toBe(0);
    expect(moved).toBeGreaterThan(10);
  });
});
