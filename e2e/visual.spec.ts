import { expect, test, type Page } from '@playwright/test';
import { CAMERA, LANDMARK_IDS, RIVER } from '@/config';
import { freezeFrame, gotoApp } from './helpers';

/** Телепорт к чанку, высота камеры, детерминированные мобы, один кадр. */
async function frameAt(page: Page, gx: number, gy: number, height: number): Promise<void> {
  await page.evaluate(
    ({ gx: x, gy: y, height: h }) => {
      const api = window.__app;
      if (api === undefined) {
        throw new Error('no api');
      }
      api.pause();
      api.centerOn(x, y);
      api.setHeight(h);
      api.resetMobs();
      document.getElementById('title')?.remove();
      api.step(0);
    },
    { gx, gy, height },
  );
}

/** Первая клетка с ландмарком `id` в квадрате ±45 вокруг старта (детерминировано для seed). */
function findLandmark(page: Page, id: string): Promise<[number, number] | null> {
  return page.evaluate((wanted) => {
    const api = window.__app;
    if (api === undefined) {
      throw new Error('no api');
    }
    for (let r = 0; r <= 45; r++) {
      for (let gy = -r; gy <= r; gy++) {
        for (let gx = -r; gx <= r; gx++) {
          if (Math.max(Math.abs(gx), Math.abs(gy)) !== r) {
            continue;
          }
          if (api.describe(gx, gy).landmark === wanted) {
            return [gx, gy] as [number, number];
          }
        }
      }
    }
    return null;
  }, id);
}

test.describe('Visual regression (FR-9, FR-15)', () => {
  test('AC-9.1: стартовый кадр seed=astana совпадает с эталоном (≤ 1 % пикселей)', async ({
    page,
  }) => {
    await gotoApp(page);
    await freezeFrame(page);
    await expect(page).toHaveScreenshot('astana-start.png');
  });

  test('AC-13.1: зимний режим — снег, серо-голубое небо, та же раскладка', async ({ page }) => {
    await gotoApp(page, 'seed=astana&debug=api&season=winter');
    await freezeFrame(page);
    await expect(page).toHaveScreenshot('astana-winter.png');
  });

  test('BUG-1: минимальная высота камеры — здания не режутся near-плоскостью', async ({ page }) => {
    await gotoApp(page);
    await frameAt(page, 0, 0, CAMERA.HEIGHT_MIN);
    await expect(page).toHaveScreenshot('astana-low.png');
  });

  test('AC-14.1: русло Есиль с мостами и набережной', async ({ page }) => {
    await gotoApp(page);
    await frameAt(page, 0, RIVER.OFFSET, 80);
    await expect(page).toHaveScreenshot('astana-river.png');
  });

  test('BUG-2: площадь без полос сквозь газоны', async ({ page }) => {
    await gotoApp(page);
    const square = await page.evaluate(() => {
      const api = window.__app;
      if (api === undefined) {
        throw new Error('no api');
      }
      for (let gy = -6; gy <= 6; gy++) {
        for (let gx = -6; gx <= 6; gx++) {
          if (api.describe(gx, gy).block === 'square') {
            return [gx, gy] as [number, number];
          }
        }
      }
      return null;
    });
    expect(square).not.toBeNull();
    if (square !== null) {
      await frameAt(page, square[0], square[1], CAMERA.HEIGHT_MIN);
      await expect(page).toHaveScreenshot('astana-square.png');
    }
  });

  for (const id of LANDMARK_IDS) {
    test(`AC-15.2: ландмарк ${id} крупным планом`, async ({ page }) => {
      await gotoApp(page);
      const at = await findLandmark(page, id);
      expect(at, `ландмарк ${id} не найден в ±45 чанках`).not.toBeNull();
      if (at !== null) {
        await frameAt(page, at[0], at[1], 90);
        await expect(page).toHaveScreenshot(`landmark-${id}.png`);
      }
    });
  }
});
