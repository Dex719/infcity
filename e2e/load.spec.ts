import { expect, test } from '@playwright/test';
import { gotoApp, DEFAULT_PARAMS } from './helpers';

declare global {
  interface Window {
    __progress?: number[];
  }
}

test.describe('Загрузка и ошибки (FR-11)', () => {
  test('AC-11.1: прогресс монотонно растёт и заканчивается на 100 %', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const bar = document.getElementById('loading');
        if (bar === null) {
          return;
        }
        const values: number[] = [Number(bar.getAttribute('aria-valuenow') ?? '0')];
        window.__progress = values;
        new MutationObserver(() => {
          values.push(Number(bar.getAttribute('aria-valuenow') ?? '0'));
        }).observe(bar, { attributes: true, attributeFilter: ['aria-valuenow'] });
      });
    });
    await gotoApp(page);
    const values = await page.evaluate(() => window.__progress ?? []);
    expect(values.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] ?? 0);
    }
    expect(values[values.length - 1]).toBe(100);
  });

  test('AC-11.2: палитра отвечает 500 → 3 попытки, оверлей «Повторить», повтор запускает демо', async ({
    page,
  }) => {
    let requests = 0;
    let failing = true;
    await page.route('**/assets/palette.json', async (route) => {
      requests++;
      if (failing) {
        await route.fulfill({ status: 500, body: 'boom' });
        return;
      }
      await route.continue();
    });
    await page.goto(`/?${DEFAULT_PARAMS}`);
    const error = page.locator('#error');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText('Не удалось загрузить');
    expect(requests).toBe(3);
    await expect(page.locator('#loading')).toBeHidden();

    failing = false;
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(error).toBeHidden();
    await page.waitForFunction(() => window.__app !== undefined, undefined, { timeout: 30_000 });
    expect(requests).toBe(4);
  });

  test('AC-11.3: без WebGL 2 показана заставка, ошибок в консоли нет', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'getContext');
      const original = descriptor?.value as (
        this: HTMLCanvasElement,
        ...args: unknown[]
      ) => unknown;
      Object.defineProperty(proto, 'getContext', {
        configurable: true,
        writable: true,
        value: function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === 'webgl2') {
            return null;
          }
          return original.call(this, type, ...rest);
        },
      });
    });
    await page.goto(`/?${DEFAULT_PARAMS}`);
    const error = page.locator('#error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Нужен WebGL 2');
    await expect(error.locator('a')).toHaveAttribute('href', /webgl/);
    await expect(page.locator('#loading')).toBeHidden();
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
