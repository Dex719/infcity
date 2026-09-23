import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import {
  buildBlock,
  CAFE_TABLES_X,
  COMMERCIAL_HEDGE,
  COMMERCIAL_TREES,
} from '@/scene/procedural/BlockPrefabs';
import { AWNING_DEPTH, Buildings, type Footprint } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Props } from '@/scene/procedural/Props';
import { CHUNK_HIDDEN, hiddenSides, type HiddenSides } from '@/scene/procedural/Visibility';
import { Generator } from '@/world/Generator';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

/** Горизонтальный вынос кроны лиственного дерева от ствола: боковые объёмы — до 1.3 радиуса. */
function crownReach(scale: number): number {
  return 1.3 * 1.9 * scale;
}

function crownHitsHedge(x: number, z: number, scale: number): boolean {
  const e = crownReach(scale);
  const h = COMMERCIAL_HEDGE;
  return (
    x - e < h.x + h.w / 2 && x + e > h.x - h.w / 2 && z - e < h.z + h.d / 2 && z + e > h.z - h.d / 2
  );
}

describe('BUG-12: дерево коммерческого квартала не растёт сквозь изгородь', () => {
  it('ни одна крона не накрывает изгородь', () => {
    for (const [x, z, scale] of COMMERCIAL_TREES) {
      expect(crownHitsHedge(x, z, scale)).toBe(false);
    }
  });

  it('прежняя позиция дерева (16, −14) проверкой ловится', () => {
    expect(crownHitsHedge(16, -14, 1.1)).toBe(true);
  });
});

/** Вершины цвета `key` (точное совпадение) из батча. */
function verticesOfColor(batch: GeometryBatch, key: 'glass-blue' | 'asphalt'): Vector3[] {
  const geometry = batch.build();
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const wanted = materials.color(key);
  const found: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    if (
      Math.abs(color.getX(i) - wanted.r) < 1e-4 &&
      Math.abs(color.getY(i) - wanted.g) < 1e-4 &&
      Math.abs(color.getZ(i) - wanted.b) < 1e-4
    ) {
      found.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }
  }
  return found;
}

describe('BUG-13: торговый центр стоит к камере фасадом', () => {
  const f: Footprint = { x: 0, z: -7, w: 40, d: 24 };

  function portal(hidden: HiddenSides): Vector3[] {
    const opaque = new GeometryBatch();
    const glass = new GeometryBatch();
    new Buildings(opaque, glass, materials, mulberry32(1), hidden).mall(f, 'gold');
    return verticesOfColor(glass, 'glass-blue');
  }

  it('портал входа — на видимой стороне при любом hidden.z', () => {
    const visiblePlus = portal(CHUNK_HIDDEN);
    expect(visiblePlus.length).toBeGreaterThan(0);
    expect(visiblePlus.every((v) => v.z > f.z + f.d / 2)).toBe(true);
    const visibleMinus = portal({ x: 1, z: 1 });
    expect(visibleMinus.length).toBeGreaterThan(0);
    expect(visibleMinus.every((v) => v.z < f.z - f.d / 2)).toBe(true);
  });

  it('парковка квартала — на видимой стороне при каждом повороте', () => {
    const mall = new Generator('astana').describeWindow(0, 0, 21).find((d) => d.block === 'mall');
    expect(mall).toBeDefined();
    if (mall === undefined) {
      return;
    }
    for (const rotation of [0, 1, 2, 3] as const) {
      const visibleZ = -hiddenSides(rotation).z;
      const block = buildBlock({ ...mall, rotation }, materials);
      const parking = verticesOfColor(block.opaque, 'asphalt').filter(
        (v) => Math.abs(v.y - 0.23) < 1e-4,
      );
      expect(parking.length).toBeGreaterThan(0);
      for (const v of parking) {
        expect(v.z * visibleZ).toBeGreaterThan(0);
      }
    }
  });
});

describe('Кафе-терраса коммерческого квартала (FR-19.18, AC-19.19)', () => {
  /** Радиус купола зонта; стулья (до 0.95 от стойки) — под ним. */
  const CANOPY = 1;
  const commercial = new Generator('astana')
    .describeWindow(0, 0, 21)
    .find((d) => d.block === 'commercial' && d.landmark === null);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface Rect {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
  }

  function rectOf(x: number, z: number, w: number, d: number): Rect {
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  }

  function overlaps(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  }

  it('квартал есть в окне 21×21 seed astana', () => {
    expect(commercial).toBeDefined();
  });

  it.each([0, 1, 2, 3] as const)(
    'поворот %i: ≥ 3 зонтика перед фасадом заднего ряда — мимо корпусов, маркиз и парковки',
    (rotation) => {
      if (commercial === undefined) {
        return;
      }
      const tables = vi.spyOn(Props.prototype, 'cafeTable');
      const rows = vi.spyOn(Buildings.prototype, 'shopRow');
      const planes = vi.spyOn(GeometryBatch.prototype, 'plane');
      const block = buildBlock({ ...commercial, rotation }, materials);
      const visibleZ = -hiddenSides(rotation).z;

      const footprints = rows.mock.calls.map(([f]) => f);
      expect(footprints).toHaveLength(2);
      const back = footprints.reduce((a, b) => (b.z < a.z ? b : a));
      const facade = back.z + (visibleZ * back.d) / 2;
      const asphalt = materials.color('asphalt');
      const parking = planes.mock.calls
        .filter(([, , , , , color]) => color.equals(asphalt))
        .map(([x, , z, w, d]) => rectOf(x, z, w, d));
      expect(parking).toHaveLength(1);

      expect(tables.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(tables.mock.calls).toHaveLength(CAFE_TABLES_X.length);
      for (const [x, z] of tables.mock.calls) {
        const canopy = rectOf(x, z, 2 * CANOPY, 2 * CANOPY);
        // Перед фасадом заднего ряда, в его ширину.
        expect(x).toBeGreaterThan(back.x - back.w / 2);
        expect(x).toBeLessThan(back.x + back.w / 2);
        // Дальше вылета маркиз: купол не заходит под них.
        expect((z - facade) * visibleZ - CANOPY).toBeGreaterThanOrEqual(AWNING_DEPTH);
        // Не в корпусе ни одного ряда и не на асфальте парковки, в пределах плиты квартала.
        for (const f of footprints) {
          expect(overlaps(canopy, rectOf(f.x, f.z, f.w, f.d))).toBe(false);
        }
        for (const p of parking) {
          expect(overlaps(canopy, p)).toBe(false);
        }
        expect(Math.abs(z) + CANOPY).toBeLessThanOrEqual(23);
      }

      const vertices = block.opaque.vertices + block.glass.vertices + block.detail.vertices;
      expect(vertices).toBeLessThanOrEqual(7000);
    },
  );
});
