// Картинка карточки ссылки и PNG-значки (FR-19.28, design D32).
// Запуск после сборки: npm run build && node tools/share-assets.js
// Поднимает `vite preview` над dist/, снимает стартовый кадр 1200 × 630 в public/og.jpg и
// рендерит public/favicon.svg в public/favicon-32.png и public/apple-touch-icon.png.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const publicDir = new URL('../public/', import.meta.url);
const out = (name) => fileURLToPath(new URL(name, publicDir));

// Как в playwright.config.ts: локально системный Chrome, `PW_CHANNEL=chromium` — браузер Playwright.
const channel = process.env.PW_CHANNEL ?? 'chrome';
const server = await preview({ preview: { port: 4179 }, logLevel: 'warn' });
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
try {
  const context = await browser.newContext({ bypassCSP: true, deviceScaleFactor: 1 });

  // Карточка: стартовый вид seed `astana`, сдвинутый на 290 px вниз, чтобы Байтерек вошёл в
  // кадр вместе с шаром, а под ним — бульвар Нуржол; пауза, мобы пересозданы, без заголовка.
  const page = await context.newPage();
  await page.setViewportSize({ width: 1200, height: 630 });
  const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4179/';
  await page.goto(`${base}?seed=astana&debug=api`);
  await page.waitForFunction(() => window.__app !== undefined, undefined, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.waitForFunction(() => window.__app.stats().emptySlots === 0, undefined, {
    timeout: 15_000,
  });
  await page.evaluate((CARD_SHIFT) => {
    const api = window.__app;
    api.pause();
    api.pan(0, CARD_SHIFT);
    api.step(2); // панорама доезжает до цели; мобов пересоздаём после
    api.resetMobs();
    document.getElementById('title')?.remove();
    api.step(0);
  }, 290);
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('og.jpg'), type: 'jpeg', quality: 85 });

  // Значки: SVG в Chromium на прозрачном фоне. Для домашнего экрана iOS — без скругления:
  // углы iOS скругляет сама, а прозрачные углы она заливает чёрным.
  const svg = readFileSync(new URL('favicon.svg', publicDir), 'utf8');
  const icon = async (markup, size, name) => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width: size, height: size });
    const src = `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;
    await tab.setContent(
      `<style>html,body{margin:0;background:transparent}</style>` +
        `<img src="${src}" width="${String(size)}" height="${String(size)}">`,
    );
    await tab.locator('img').evaluate((img) => img.decode());
    await tab.screenshot({ path: out(name), omitBackground: true });
    await tab.close();
  };
  await icon(svg, 32, 'favicon-32.png');
  await icon(svg.replace('rx="14"', 'rx="0"'), 180, 'apple-touch-icon.png');
  console.log('public/og.jpg, public/favicon-32.png, public/apple-touch-icon.png');
} finally {
  await browser.close();
  await server.close();
}
