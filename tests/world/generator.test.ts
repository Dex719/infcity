import { describe, expect, it } from 'vitest';
import { BLOCKS, CLOUD, GEN, LANDMARKS, TRAFFIC, WORLD } from '@/config';
import { Generator } from '@/world/Generator';
import { hash32 } from '@/world/Hash';
import { chebyshev } from '@/world/math';
import { NEIGHBOUR_OFFSETS, REGULAR_BLOCK_TYPES, type ChunkDescriptor } from '@/world/types';

/** Компактный отпечаток дескрипторов для снапшота (AC-1.1, AC-2.1). */
function digest(descriptors: readonly ChunkDescriptor[]): string {
  const json = JSON.stringify(descriptors);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = hash32(h, json.charCodeAt(i));
  }
  return `${String(descriptors.length)}:${h.toString(16)}`;
}

describe('Generator — детерминизм (FR-2, NFR-3)', () => {
  it('два экземпляра с одним seed дают идентичные дескрипторы', () => {
    const a = new Generator('astana');
    const b = new Generator('astana');
    expect(a.describeWindow(0, 0, 21)).toEqual(b.describeWindow(0, 0, 21));
    expect(a.describe(500, -321)).toEqual(b.describe(500, -321));
  });

  it('разные seed дают разные города', () => {
    const a = new Generator('astana');
    const b = new Generator('almaty');
    expect(digest(a.describeWindow(0, 0, 9))).not.toBe(digest(b.describeWindow(0, 0, 9)));
  });

  it('дамп окна 21×21 для seed «astana» зафиксирован снапшотом (AC-2.1)', () => {
    expect(digest(new Generator('astana').describeWindow(0, 0, 21))).toMatchSnapshot();
  });

  it('уход на 200 чанков и возврат дают тот же стартовый дамп (AC-1.1)', () => {
    const gen = new Generator('astana');
    const before = digest(gen.describeWindow(0, 0));
    for (let step = 1; step <= 200; step++) {
      gen.describeWindow(step, 0);
    }
    expect(digest(gen.describeWindow(0, 0))).toBe(before);
  });

  it('seed числом и строкой согласованы, отрицательные координаты допустимы', () => {
    const text = new Generator('astana');
    const numeric = new Generator(text.seed);
    expect(numeric.describe(-3, -4)).toEqual(text.describe(-3, -4));
    expect(text.describe(-3, -4).key).toBe('-3,-4');
  });
});

describe('Generator — кварталы и соседство (FR-3)', () => {
  const gen = new Generator('astana');
  const SIZE = 100;
  const area: ChunkDescriptor[] = [];
  for (let gy = 0; gy < SIZE; gy++) {
    for (let gx = 0; gx < SIZE; gx++) {
      area.push(gen.describe(gx + 1000, gy - 700));
    }
  }

  it('10 000 чанков: ни один регулярный квартал не совпадает с 8 соседями (AC-3.1)', () => {
    let violations = 0;
    for (const chunk of area) {
      if (chunk.block === 'landmark' || chunk.block === 'stadium' || chunk.block === 'river') {
        continue;
      }
      for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
        if (gen.describe(chunk.gx + dx, chunk.gy + dy).block === chunk.block) {
          violations++;
        }
      }
    }
    expect(violations).toBe(0);
  });

  it('каждый регулярный тип встречается с долей 4…20 % (разнообразие)', () => {
    const counts = new Map<string, number>();
    for (const chunk of area) {
      counts.set(chunk.block, (counts.get(chunk.block) ?? 0) + 1);
    }
    for (const type of REGULAR_BLOCK_TYPES) {
      const share = (counts.get(type) ?? 0) / area.length;
      expect(share, type).toBeGreaterThan(0.04);
      expect(share, type).toBeLessThan(0.2);
    }
  });

  it('стадион редкий (≤ 1/40) и никогда не ближе 5 чанков к другому стадиону', () => {
    const stadiums = area.filter((chunk) => chunk.block === 'stadium');
    expect(stadiums.length / area.length).toBeLessThanOrEqual(1 / 40);
    expect(stadiums.length).toBeGreaterThan(0);
    for (const a of stadiums) {
      for (const b of stadiums) {
        if (a !== b) {
          expect(chebyshev(a.gx, a.gy, b.gx, b.gy)).toBeGreaterThan(BLOCKS.STADIUM.RADIUS);
        }
      }
    }
  });

  it('поворот ∈ 0..3, у ландмарков всегда 0; вариант — 32-битное число', () => {
    for (const chunk of area) {
      expect([0, 1, 2, 3]).toContain(chunk.rotation);
      if (chunk.block === 'landmark') {
        expect(chunk.rotation).toBe(0);
      }
      expect(Number.isInteger(chunk.variant)).toBe(true);
    }
    const rotations = new Set(area.map((chunk) => chunk.rotation));
    expect(rotations.size).toBe(4);
  });

  it('стартовое окно 9×9 содержит ≥ 6 разных типов кварталов для 20 seed (AC-3.3)', () => {
    for (let i = 0; i < 20; i++) {
      const types = new Set(
        new Generator(`seed-${String(i)}`).describeWindow(0, 0).map((c) => c.block),
      );
      expect(types.size, `seed-${String(i)}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('классы чётности: 8-соседи никогда не совпадают по классу (D9)', () => {
    for (let gx = -3; gx <= 3; gx++) {
      for (let gy = -3; gy <= 3; gy++) {
        for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
          expect(Generator.parityClass(gx, gy)).not.toBe(Generator.parityClass(gx + dx, gy + dy));
        }
      }
    }
  });
});

describe('Generator — машины, облака, дороги, ЛРТ', () => {
  const gen = new Generator('traffic');
  const chunks: ChunkDescriptor[] = [];
  for (let gy = -50; gy < 50; gy++) {
    for (let gx = -50; gx < 50; gx++) {
      chunks.push(gen.describe(gx, gy));
    }
  }

  it('машины: доля полос с машиной ≈ P_CAR.desktop, модели в пуле, roll сохранён (FR-6.1)', () => {
    let lanes = 0;
    let cars = 0;
    for (const chunk of chunks) {
      lanes += TRAFFIC.LANES;
      cars += chunk.cars.length;
      for (const car of chunk.cars) {
        expect(car.model).toBeGreaterThanOrEqual(0);
        expect(car.model).toBeLessThan(TRAFFIC.MODEL_POOL);
        expect([1, -1]).toContain(car.dir);
        expect(car.roll).toBeLessThan(TRAFFIC.P_CAR.desktop);
        expect([0, 1, 2, 3]).toContain(car.lane);
      }
    }
    const share = cars / lanes;
    expect(share).toBeGreaterThan(TRAFFIC.P_CAR.desktop - 0.03);
    expect(share).toBeLessThan(TRAFFIC.P_CAR.desktop + 0.03);
    const mobile = chunks.flatMap((c) => c.cars).filter((car) => car.roll < TRAFFIC.P_CAR.mobile);
    expect(mobile.length / lanes).toBeLessThan(TRAFFIC.P_CAR.mobile + 0.03);
  });

  it('облака: доля ≈ P_CLOUD, координаты внутри чанка (FR-7.1)', () => {
    const clouds = chunks.filter((c) => c.cloud !== null);
    expect(clouds.length / chunks.length).toBeGreaterThan(0.26);
    expect(clouds.length / chunks.length).toBeLessThan(0.34);
    for (const chunk of clouds) {
      const cloud = chunk.cloud;
      if (cloud === null) {
        continue;
      }
      expect(Math.abs(cloud.x)).toBeLessThanOrEqual(WORLD.CHUNK_SIZE / 2);
      expect(Math.abs(cloud.z)).toBeLessThanOrEqual(WORLD.CHUNK_SIZE / 2);
      expect(cloud.speedMul).toBeGreaterThanOrEqual(1);
      expect(cloud.phase).toBeLessThan(1);
      expect(cloud.model).toBeGreaterThanOrEqual(0);
      expect(cloud.model).toBeLessThan(CLOUD.MODELS);
    }
    // Три силуэта облаков реально используются (AC-17.2).
    expect(new Set(clouds.map((c) => c.cloud?.model)).size).toBe(CLOUD.MODELS);
  });

  it('дороги и ЛРТ описаны в каждом чанке', () => {
    for (const chunk of chunks) {
      expect(['a', 'b']).toContain(chunk.roads.ns);
      expect(['plain', 'lights', 'plaza']).toContain(chunk.roads.corner);
      expect(chunk.lrt.station).toBe(chunk.lrt.corridor !== null && chunk.gx % 3 === 0);
    }
  });

  it('никогда не бросает и не использует fallback на 10 000 чанков (NFR-7)', () => {
    expect(chunks.some((c) => c.fallback === true)).toBe(false);
    expect(gen.errors).toBe(0);
  });
});

describe('Зелёный старт — сквер между Байтереком и Хан Шатыром (FR-20, AC-20.1)', () => {
  it('на 1 000 seed центр старта — парк, ландмарки на местах, соседи центра — не парки', () => {
    const { gx, gy } = LANDMARKS.START_PARK;
    for (let i = 0; i < 1000; i++) {
      const generator = new Generator(`green${String(i)}`);
      const center = generator.describe(gx, gy);
      expect(center.block).toBe('park');
      expect(center.landmark).toBeNull();
      for (const fixed of LANDMARKS.FIXED) {
        expect(generator.describe(fixed.gx, fixed.gy).landmark).toBe(fixed.id);
      }
      for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
        expect(generator.describe(gx + dx, gy + dy).block).not.toBe('park');
      }
    }
  });

  it('правило поменяло города — версия генератора 4 (ссылки с v=3 получат «Город обновился»)', () => {
    expect(GEN.VERSION).toBe(4);
  });
});
