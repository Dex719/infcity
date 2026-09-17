import { expect, test } from '@playwright/test';
import { freezeFrame, gotoApp, readStats } from './helpers';

test.describe('WebGPU за флагом (design D6, TSK-073)', () => {
  test('?gpu=1: WebGPU или откат на WebGL; стартовый кадр совпадает с эталоном (≤ 2 %)', async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await gotoApp(page, 'seed=astana&debug=api&gpu=1');
    const stats = await readStats(page);
    expect(['webgl', 'webgpu']).toContain(stats.backend);
    expect(stats.emptySlots).toBe(0);
    console.log(`gpu backend: ${stats.backend}; warnings: ${String(warnings.length)}`);
    await freezeFrame(page);
    await expect(page).toHaveScreenshot('astana-start.png', { maxDiffPixelRatio: 0.02 });
  });
});
