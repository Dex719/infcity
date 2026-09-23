import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { buildBlock, COMMERCIAL_HEDGE, COMMERCIAL_TREES } from '@/scene/procedural/BlockPrefabs';
import { Buildings, type Footprint } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
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
