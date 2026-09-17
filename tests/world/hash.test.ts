import { describe, expect, it } from 'vitest';
import { hash32, hashUnit, mulberry32, rng, seedToInt } from '@/world/Hash';

describe('hash32', () => {
  it('детерминирован и зависит от каждого аргумента', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(1, 2)).not.toBe(hash32(1, 2, 0));
  });

  it('возвращает беззнаковое 32-битное целое, отрицательные координаты допустимы', () => {
    for (const value of [hash32(0), hash32(-1, -1, 7), hash32(2 ** 31, -(2 ** 31))]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
    expect(hash32(-1, 5)).not.toBe(hash32(1, 5));
  });

  it('значения зафиксированы: одинаковы в Node и браузере (NFR-3)', () => {
    expect([
      hash32(0, 0, 0, 1),
      hash32(42, -7, 13, 3),
      hash32(seedToInt('astana'), 1, -1, 100),
    ]).toMatchSnapshot();
  });

  it('распределение по 16 корзинам близко к равномерному (χ², df=15)', () => {
    const buckets = new Array<number>(16).fill(0);
    const n = 100_000;
    for (let gx = 0; gx < 250; gx++) {
      for (let gy = 0; gy < 400; gy++) {
        const bucket = hash32(7, gx, gy, 1) >>> 28;
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }
    }
    const expected = n / 16;
    const chi2 = buckets.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(37.7); // p = 0.999
  });

  it('соседние клетки не коррелируют по младшим битам', () => {
    let same = 0;
    for (let gx = 0; gx < 1000; gx++) {
      if ((hash32(1, gx, 0, 1) & 7) === (hash32(1, gx + 1, 0, 1) & 7)) {
        same++;
      }
    }
    expect(same).toBeGreaterThan(60);
    expect(same).toBeLessThan(190); // ожидание 125
  });
});

describe('hashUnit / seedToInt / PRNG', () => {
  it('hashUnit в [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const u = hashUnit(3, i, -i, 9);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('seedToInt: FNV-1a, разные строки → разные значения, юникод допустим', () => {
    expect(seedToInt('astana')).toBe(seedToInt('astana'));
    expect(seedToInt('astana')).not.toBe(seedToInt('Astana'));
    expect(seedToInt('астана')).not.toBe(seedToInt('astana'));
    expect(seedToInt('')).toBe(0x811c9dc5);
  });

  it('mulberry32 воспроизводим и равномерен', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    let sum = 0;
    const c = rng(1, 2, 3, 4);
    for (let i = 0; i < 10_000; i++) {
      sum += c();
    }
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });
});
