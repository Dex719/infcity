import { expect, test } from '@playwright/test';
import { TRAIN, WORLD } from '@/config';
import { gotoApp, readStats } from './helpers';

interface Sample {
  readonly second: number;
  readonly overlaps: number;
  readonly stuck: number;
  readonly trains: number;
  readonly cars: number;
  readonly minTrainGap: number;
  readonly emptySlots: number;
}

/** Минимальный интервал между поездами одной нитки в окне, юниты. */
function minTrainGap(
  trains: readonly { gx: number; gy: number; x: number; dirX: number }[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const a of trains) {
    for (const b of trains) {
      if (a === b || a.dirX !== b.dirX || a.gy !== b.gy) {
        continue;
      }
      const gap = Math.abs(a.gx * WORLD.CHUNK_SIZE + a.x - (b.gx * WORLD.CHUNK_SIZE + b.x));
      best = Math.min(best, gap);
    }
  }
  return best;
}

test.describe('Симуляция в ускоренном времени (TSK-062)', () => {
  test('AC-6.1, AC-6.2, AC-5.4: 5 минут при seed=astana без пересечений и заторов', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await gotoApp(page);
    await page.evaluate(() => window.__app?.pause());

    const samples: Sample[] = [];
    for (let second = 1; second <= 300; second++) {
      // Каждые 45 с — сдвиг окна на чанк: переносы, деспавн и спавн мобов.
      if (second % 45 === 0) {
        await page.evaluate(() => window.__app?.pan(300, 0));
      }
      const sample = await page.evaluate((s) => {
        const api = window.__app;
        if (api === undefined) {
          throw new Error('no api');
        }
        api.simulate(1, 1 / 60);
        const stats = api.stats();
        return {
          second: s,
          overlaps: api.overlaps(),
          stuck: stats.mobs.stuckCars,
          trains: stats.mobs.trains,
          cars: stats.mobs.cars,
          emptySlots: stats.emptySlots,
          trainList: api.trains(),
        };
      }, second);
      samples.push({ ...sample, minTrainGap: minTrainGap(sample.trainList) });
    }

    const overlapping = samples.filter((s) => s.overlaps > 0);
    const stuck = samples.filter((s) => s.stuck > 0);
    const trainRange = samples.filter(
      (s) => s.trains < TRAIN.IN_WINDOW.min || s.trains > TRAIN.IN_WINDOW.max,
    );
    const closeTrains = samples.filter((s) => s.minTrainGap < 4 * WORLD.CHUNK_SIZE);
    expect(overlapping, `пересечения: ${JSON.stringify(overlapping.slice(0, 5))}`).toEqual([]);
    expect(stuck, `заторы: ${JSON.stringify(stuck.slice(0, 5))}`).toEqual([]);
    expect(trainRange, `поезда вне 1…4: ${JSON.stringify(trainRange.slice(0, 5))}`).toEqual([]);
    expect(closeTrains, `интервал < 4 чанков: ${JSON.stringify(closeTrains.slice(0, 5))}`).toEqual(
      [],
    );
    expect(Math.min(...samples.map((s) => s.cars))).toBeGreaterThan(50);
    expect((await readStats(page)).emptySlots).toBe(0);
  });
});
