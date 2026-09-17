import { describe, expect, it } from 'vitest';
import { LRT, RIVER, WORLD } from '@/config';
import { Generator } from '@/world/Generator';
import { isCorridorRow } from '@/world/LrtPlanner';
import { bankOf, isRiverRow, nearestRiverRow } from '@/world/RiverPlanner';

describe('RiverPlanner — русло Есиль (FR-14, FR-15.6)', () => {
  it('русло каждые PERIOD рядов со смещением OFFSET; период ≥ 12', () => {
    expect(RIVER.PERIOD).toBeGreaterThanOrEqual(12);
    expect(isRiverRow(RIVER.OFFSET)).toBe(true);
    expect(isRiverRow(RIVER.OFFSET + RIVER.PERIOD)).toBe(true);
    expect(isRiverRow(RIVER.OFFSET - RIVER.PERIOD)).toBe(true);
    expect(isRiverRow(RIVER.OFFSET + 1)).toBe(false);
    expect(nearestRiverRow(RIVER.OFFSET + 3)).toBe(RIVER.OFFSET);
  });

  it('русло никогда не совпадает с коридором ЛРТ (ряды 0 mod 8)', () => {
    for (let gy = -400; gy <= 400; gy++) {
      expect(isRiverRow(gy) && isCorridorRow(gy), `gy=${String(gy)}`).toBe(false);
    }
    expect(LRT.PERIOD).toBe(8);
  });

  it('стартовая зона целиком на левом берегу, за руслом — правый', () => {
    for (let gy = -WORLD.START_ZONE_RADIUS; gy <= WORLD.START_ZONE_RADIUS; gy++) {
      expect(bankOf(gy)).toBe('left');
    }
    expect(bankOf(RIVER.OFFSET)).toBe('river');
    expect(bankOf(RIVER.OFFSET + 1)).toBe('right');
    expect(bankOf(RIVER.OFFSET + RIVER.PERIOD + 1)).toBe('left');
  });
});

describe('Generator — река и берега', () => {
  const generator = new Generator('astana');

  it('чанки русла: block=river, без ландмарка и поворота, дороги и ЛРТ на месте (AC-14.1)', () => {
    for (let gx = -10; gx <= 10; gx++) {
      const d = generator.describe(gx, RIVER.OFFSET);
      expect(d.block).toBe('river');
      expect(d.landmark).toBeNull();
      expect(d.rotation).toBe(0);
      expect(d.roads.ns).toMatch(/[ab]/);
      expect(d.lrt.corridor).toBeNull();
    }
  });

  it('AC-15.1: завода нет; ТЦ встречается не реже 1 на 40 чанков (окно 21×21)', () => {
    const dump = generator.describeWindow(0, 0, 21);
    const blocks = dump.map((d) => d.block);
    expect(blocks).not.toContain('industrial');
    const malls = blocks.filter((b) => b === 'mall').length;
    expect(malls).toBeGreaterThanOrEqual(Math.floor(dump.length / 40));
  });

  it('AC-15.5: левый берег — стекло/ТЦ/новостройки ≥ 50 %, правый — панельки/новостройки ≥ 33 %', () => {
    const count = (rows: number[], types: readonly string[]): number => {
      let total = 0;
      let hit = 0;
      for (const gy of rows) {
        for (let gx = -30; gx <= 30; gx++) {
          const d = generator.describe(gx, gy);
          if (d.block === 'landmark' || d.block === 'stadium' || d.block === 'river') {
            continue;
          }
          total++;
          if (types.includes(d.block)) {
            hit++;
          }
        }
      }
      return hit / total;
    };
    const left = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const right = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    expect(left.every((gy) => bankOf(gy) === 'left')).toBe(true);
    expect(right.every((gy) => bankOf(gy) === 'right')).toBe(true);
    expect(count(left, ['business-glass', 'mall', 'residential-new'])).toBeGreaterThanOrEqual(0.5);
    expect(count(right, ['residential-panel', 'residential-new'])).toBeGreaterThanOrEqual(0.33);
    expect(count(right, ['business-glass'])).toBeLessThan(0.1);
  });
});
