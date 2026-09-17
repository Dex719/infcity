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

/** Максимум вершин квартала каждого регулярного типа в окне 21×21 seed `astana`, итерация 2. */
const ITERATION_2_BLOCK_MAX: Readonly<Record<string, number>> = {
  market: 1656,
  'residential-panel': 5802,
  'residential-new': 5485,
  campus: 2779,
  park: 2647,
  square: 2215,
  commercial: 2128,
  mall: 2340,
  'business-glass': 2267,
  river: 320,
  stadium: 1316,
};

/** Абсолютный потолок вершин ландмарка (FR-17.4). */
const LANDMARK_CAP = 9_000;
/** Рост регулярного квартала относительно итерации 2 (FR-17.4). */
const BLOCK_GROWTH_CAP = 1.6;
/** Минимальный рост ландмарка после детализации (AC-17.3). */
const LANDMARK_GROWTH_FLOOR = 1.15;

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

describe('Кварталы — рост вершин после детализации деревьев (FR-17.4)', () => {
  it(`ни один регулярный тип не вырос больше чем в ${String(BLOCK_GROWTH_CAP)} раза`, () => {
    const maxByType = new Map<string, number>();
    for (const descriptor of new Generator('astana').describeWindow(0, 0, 21)) {
      if (descriptor.landmark !== null) {
        continue;
      }
      const geometry = buildBlock(descriptor, materials);
      const vertices = geometry.opaque.vertices + geometry.glass.vertices;
      maxByType.set(descriptor.block, Math.max(maxByType.get(descriptor.block) ?? 0, vertices));
    }
    const violations: string[] = [];
    for (const [type, max] of maxByType) {
      const base = ITERATION_2_BLOCK_MAX[type];
      if (base === undefined) {
        violations.push(`${type}: нет базового значения итерации 2`);
      } else if (max > base * BLOCK_GROWTH_CAP) {
        violations.push(`${type}: ${String(max)} > ${String(base)} × ${String(BLOCK_GROWTH_CAP)}`);
      }
    }
    expect(violations).toEqual([]);
    expect(maxByType.size).toBeGreaterThanOrEqual(10);
  });
});
