import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { RENDER } from '@/config';
import { gotoApp, readStats } from './helpers';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

test.describe('Бюджеты кадра (NFR-1)', () => {
  test('draw calls ≤ 300, треугольники ≤ 400 k; медианный FPS записывается в отчёт', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await gotoApp(page);
    // Прогрев и панорамирование: окно обновляется, тени и мобы активны.
    await page.keyboard.down('ArrowDown');
    const fps: number[] = [];
    const draws: number[] = [];
    const tris: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stats = await readStats(page);
      if (stats.fps > 0) {
        fps.push(stats.fps);
      }
      draws.push(stats.drawCalls);
      tris.push(stats.triangles);
    }
    await page.keyboard.up('ArrowDown');

    const report = {
      browser: browserName,
      medianFps: median(fps),
      minFps: Math.min(...fps),
      maxDrawCalls: Math.max(...draws),
      maxTriangles: Math.max(...tris),
      samples: fps.length,
      date: new Date().toISOString(),
    };
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/perf.json', JSON.stringify(report, null, 2));
    console.log(`perf: ${JSON.stringify(report)}`);

    expect(report.maxDrawCalls).toBeLessThanOrEqual(RENDER.BUDGET.drawCalls);
    expect(report.maxTriangles).toBeLessThanOrEqual(RENDER.BUDGET.triangles);
    expect(report.samples).toBeGreaterThan(5);
  });
});
