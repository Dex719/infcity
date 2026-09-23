import { describe, expect, it } from 'vitest';
import { LANDMARK_IDS, type LandmarkId } from '@/config';
import { buildLandmark } from '@/scene/landmarks';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { buildBlock } from '@/scene/procedural/BlockPrefabs';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Props } from '@/scene/procedural/Props';
import { Generator } from '@/world/Generator';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

/** Вершины (opaque + glass) каждого ландмарка в итерации 2 — измерено 2026-09-18 до детализации. */
const ITERATION_2_LANDMARK_VERTICES: Readonly<Record<LandmarkId, number>> = {
  baiterek: 5365,
  'khan-shatyr': 3227,
  'nur-alem': 3962,
  pyramid: 1126,
  'ak-orda': 4022,
  'abu-dhabi-plaza': 2020,
  'astana-opera': 3085,
  'hazret-sultan': 3081,
  'mega-silk-way': 2656,
  'northern-lights': 3756,
  'transport-tower': 2036,
  kazmunaygas: 3422,
};

/**
 * Максимум вершин квартала каждого регулярного типа в окне 21×21 seed `astana` — замер
 * 2026-09-19 сразу после отсечения скрытых сторон (FR-18.1). Заменяет проверку роста
 * относительно итерации 2 (AC-17.7): та фиксировала появление благоустройства и выполнена,
 * но с отсечением невидимых оконных полос абсолютные числа стали меньше. Теперь таблица —
 * нижняя граница: детали итерации 4 только добавляются, падение ниже неё означает, что
 * благоустройство или окна потеряны.
 */
const AFTER_CULLING_BLOCK_MAX: Readonly<Record<string, number>> = {
  'business-glass': 2875,
  campus: 3046,
  commercial: 2362,
  mall: 2808,
  market: 2018,
  park: 3690,
  'residential-new': 4516,
  'residential-panel': 4852,
  river: 320,
  square: 2959,
  stadium: 2668,
};

/** Абсолютный потолок вершин ландмарка (FR-17.4). */
const LANDMARK_CAP = 9_000;
/** Абсолютный потолок вершин регулярного квартала (FR-17.4, уточнение волны 2). */
const BLOCK_CAP = 7_000;
/** Допуск вниз от таблицы после отсечения: детали итерации 4 только добавляются (FR-18.6). */
const BLOCK_FLOOR_RATIO = 0.98;
/** Минимальный рост ландмарка после двух волн детализации (AC-17.3). */
const LANDMARK_GROWTH_FLOOR = 1.35;

function landmarkVertices(id: LandmarkId): number {
  const opaque = new GeometryBatch();
  const glass = new GeometryBatch();
  buildLandmark(id, {
    opaque,
    glass,
    props: new Props(opaque, materials),
    m: materials,
    rng: mulberry32(7),
  });
  return opaque.vertices + glass.vertices;
}

describe('Ландмарки — детализация в бюджете (FR-17.3, FR-17.4, AC-17.3)', () => {
  for (const id of LANDMARK_IDS) {
    it(`${id}: вершин ≥ ×${String(LANDMARK_GROWTH_FLOOR)} итерации 2 и ≤ ${String(LANDMARK_CAP)}`, () => {
      const vertices = landmarkVertices(id);
      expect(vertices).toBeGreaterThanOrEqual(
        Math.floor(ITERATION_2_LANDMARK_VERTICES[id] * LANDMARK_GROWTH_FLOOR),
      );
      expect(vertices).toBeLessThanOrEqual(LANDMARK_CAP);
    });
  }

  it('сборка ландмарка детерминирована (одинаковый rng — одинаковые вершины)', () => {
    expect(landmarkVertices('baiterek')).toBe(landmarkVertices('baiterek'));
  });
});

describe('Кварталы — детали в бюджете (FR-17.4, FR-18.1, AC-18.4)', () => {
  it(`каждый регулярный тип не теряет геометрию и не превышает ${String(BLOCK_CAP)} вершин`, () => {
    const maxByType = new Map<string, number>();
    for (const descriptor of new Generator('astana').describeWindow(0, 0, 21)) {
      if (descriptor.landmark !== null) {
        continue;
      }
      const geometry = buildBlock(descriptor, materials);
      // Считаем все три батча: слой деталей (D14) влияет на то, что рисуется, а не на то,
      // сколько геометрии собрано — потолок 7 000 остаётся потолком всего квартала.
      const vertices =
        geometry.opaque.vertices + geometry.glass.vertices + geometry.detail.vertices;
      maxByType.set(descriptor.block, Math.max(maxByType.get(descriptor.block) ?? 0, vertices));
    }
    const violations: string[] = [];
    for (const [type, max] of maxByType) {
      const base = AFTER_CULLING_BLOCK_MAX[type];
      if (base === undefined) {
        violations.push(`${type}: нет базового значения после отсечения`);
      } else if (max > BLOCK_CAP) {
        violations.push(`${type}: ${String(max)} > ${String(BLOCK_CAP)}`);
      } else if (max < base * BLOCK_FLOOR_RATIO) {
        violations.push(`${type}: ${String(max)} < ${String(base)} × ${String(BLOCK_FLOOR_RATIO)}`);
      }
    }
    expect(violations).toEqual([]);
    expect(maxByType.size).toBeGreaterThanOrEqual(10);
  });

  it(`потолок ${String(BLOCK_CAP)} вершин держится и на других сидах`, () => {
    // Одного сида мало: замер по восьми сидам после детализации фасадов нашёл два квартала
    // `residential-panel` выше потолка (7 065 у `expo` и 7 031 у `saryarka`) — на `astana`
    // таких раскладок не встретилось. Эти два окна закреплены как регрессионные.
    const worstCases: readonly (readonly [string, number, number])[] = [
      ['expo', 40, -40],
      ['saryarka', -90, 70],
      ['nomad', 10, -1],
    ];
    const violations: string[] = [];
    for (const [seed, gx, gy] of worstCases) {
      for (const descriptor of new Generator(seed).describeWindow(gx, gy, 21)) {
        if (descriptor.landmark !== null) {
          continue;
        }
        const geometry = buildBlock(descriptor, materials);
        const vertices =
          geometry.opaque.vertices + geometry.glass.vertices + geometry.detail.vertices;
        if (vertices > BLOCK_CAP) {
          violations.push(`${seed} ${descriptor.key} ${descriptor.block}: ${String(vertices)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
