import { expect, test } from '@playwright/test';
import { freezeFrame, gotoApp } from './helpers';

test.describe('Visual regression (FR-9)', () => {
  test('AC-9.1: стартовый кадр seed=astana совпадает с эталоном (≤ 1 % пикселей)', async ({
    page,
  }) => {
    await gotoApp(page);
    await freezeFrame(page);
    await expect(page).toHaveScreenshot('astana-start.png');
  });

  test('ландмарки: Байтерек и Хан Шатыр крупным планом', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      const api = window.__app;
      if (api === undefined) {
        throw new Error('no api');
      }
      api.pause();
      api.centerOn(0, -1);
      api.resetMobs();
      document.getElementById('title')?.remove();
      api.step(0);
    });
    await expect(page).toHaveScreenshot('astana-baiterek.png');
    await page.evaluate(() => {
      const api = window.__app;
      if (api === undefined) {
        throw new Error('no api');
      }
      api.centerOn(0, 1);
      api.resetMobs();
      api.step(0);
    });
    await expect(page).toHaveScreenshot('astana-khan-shatyr.png');
  });
});
