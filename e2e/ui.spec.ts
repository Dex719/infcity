import { expect, test } from '@playwright/test';
import { GEN } from '@/config';
import { gotoApp, readStats } from './helpers';

test.describe('UI-оболочка (FR-2, FR-10)', () => {
  test('AC-10.1: заголовок появляется после старта и исчезает через несколько секунд', async ({
    page,
  }) => {
    await gotoApp(page);
    const title = page.locator('#title');
    await expect(title).toBeVisible({ timeout: 2_000 });
    await expect(title).toHaveCount(0, { timeout: 12_000 });
  });

  test('AC-10.2: About ставит паузу и размывает канвас; закрытие возвращает всё', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.keyboard.press('Shift+?');
    await expect(page.locator('#about')).toBeVisible();
    expect((await readStats(page)).paused).toBe(true);
    const gridBefore = (await readStats(page)).gridCoords;
    const carsBefore = await page.evaluate(() => window.__app?.trains() ?? []);
    await page.waitForTimeout(700);
    const carsAfter = await page.evaluate(() => window.__app?.trains() ?? []);
    expect(carsAfter).toEqual(carsBefore);
    expect((await readStats(page)).gridCoords).toEqual(gridBefore);
    await expect(page.locator('#app')).toHaveCSS('filter', /blur/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#about')).toBeHidden();
    expect((await readStats(page)).paused).toBe(false);
    await expect(page.locator('#app')).toHaveCSS('filter', 'none');
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 3840, height: 2160 },
  ]) {
    test(`AC-10.3: About умещается в ${String(viewport.width)}×${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoApp(page);
      await page.keyboard.press('Shift+?');
      const dialog = page.locator('#about');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      if (box !== null) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
      }
      const close = dialog.getByRole('button', { name: 'Закрыть' });
      await expect(close).toBeInViewport();
      const share = page.locator('#share');
      await share.scrollIntoViewIfNeeded();
      await expect(share).toBeInViewport();
      await close.click();
      await expect(dialog).toBeHidden();
    });
  }

  test('AC-2.3: «Поделиться» копирует ссылку с seed и показывает тост', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'права на буфер обмена выдаются только в Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gotoApp(page);
    await page.keyboard.press('Shift+?');
    await page.locator('#share').click();
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Ссылка скопирована');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`http://localhost:4173/?seed=astana&v=${String(GEN.VERSION)}`);
    await expect(toast).toBeHidden({ timeout: 4_000 });
  });

  test('AC-2.2: без seed адрес получает 8-символьный seed через replaceState', async ({ page }) => {
    await gotoApp(page, 'debug=api');
    const search = await page.evaluate(() => window.location.search);
    expect(search).toMatch(/[?&]seed=[a-z0-9]{8}(&|$)/);
    const historyLength = await page.evaluate(() => window.history.length);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  });

  test('NFR-6: About открывается и закрывается с клавиатуры', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Shift+?');
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#about button[aria-label="Закрыть"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#about')).toBeHidden();
  });
});
