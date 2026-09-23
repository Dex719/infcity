import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FACADE } from '@/config';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { Buildings } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { CHUNK_HIDDEN, hiddenSides, isVisibleSide } from '@/scene/procedural/Visibility';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

/** Мировое направление локальной оси после поворота квартала на `rotation × 90°`. */
function toWorld(rotation: number, local: Vector3): Vector3 {
  const matrix = new Matrix4().makeRotationY((rotation * Math.PI) / 2);
  return local.clone().applyMatrix4(matrix);
}

describe('Скрытые стороны квартала (FR-18.1, AC-18.2, design D13)', () => {
  for (const rotation of [0, 1, 2, 3]) {
    it(`rotation ${String(rotation)}: скрытые локальные стороны смотрят в мировые −X или −Z`, () => {
      const hidden = hiddenSides(rotation);
      // Поворот переставляет оси: локальная сторона X может смотреть в мировой −Z и наоборот,
      // поэтому проверяем попадание в полупространство {−X, −Z}, а не совпадение осей.
      for (const local of [new Vector3(hidden.x, 0, 0), new Vector3(0, 0, hidden.z)]) {
        const world = toWorld(rotation, local);
        expect(Math.min(world.x, world.z)).toBeCloseTo(-1, 6);
      }
      // Две скрытые стороны смотрят в разные мировые оси — одна в −X, другая в −Z.
      const worldX = toWorld(rotation, new Vector3(hidden.x, 0, 0));
      const worldZ = toWorld(rotation, new Vector3(0, 0, hidden.z));
      expect(Math.abs(worldX.x - worldZ.x)).toBeCloseTo(1, 6);
    });

    it(`rotation ${String(rotation)}: противоположные стороны видимы`, () => {
      const hidden = hiddenSides(rotation);
      for (const local of [new Vector3(-hidden.x, 0, 0), new Vector3(0, 0, -hidden.z)]) {
        const world = toWorld(rotation, local);
        expect(Math.max(world.x, world.z)).toBeCloseTo(1, 6);
      }
      expect(isVisibleSide(hidden, 'x', -hidden.x as 1 | -1)).toBe(true);
      expect(isVisibleSide(hidden, 'x', hidden.x)).toBe(false);
      expect(isVisibleSide(hidden, 'z', hidden.z)).toBe(false);
    });
  }

  it('поворот нормализуется (отрицательные и большие значения)', () => {
    expect(hiddenSides(4)).toEqual(hiddenSides(0));
    expect(hiddenSides(-1)).toEqual(hiddenSides(3));
    expect(hiddenSides(0)).toEqual(CHUNK_HIDDEN);
  });
});

/** Вершины цвета `key`, добытые из построенной геометрии батча. */
function verticesOfColor(batch: GeometryBatch, key: 'window'): Vector3[] {
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

const FOOTPRINT = { x: 0, z: 0, w: 16, d: 12 };
const FLOORS = 9;

function panelHouse(rotation: number): GeometryBatch {
  const opaque = new GeometryBatch();
  const glass = new GeometryBatch();
  const buildings = new Buildings(opaque, glass, materials, mulberry32(1), hiddenSides(rotation));
  buildings.panelHouse(FOOTPRINT, FLOORS);
  return opaque;
}

describe('Окна строятся только на видимых фасадах (FR-18.1, FR-19.6)', () => {
  for (const rotation of [0, 1, 2, 3]) {
    it(`rotation ${String(rotation)}: все окна на видимых сторонах`, () => {
      const hidden = hiddenSides(rotation);
      const windows = verticesOfColor(panelHouse(rotation), 'window');
      expect(windows.length).toBeGreaterThan(0);
      const visibleX = -hidden.x * (FOOTPRINT.w / 2);
      const visibleZ = -hidden.z * (FOOTPRINT.d / 2);
      for (const v of windows) {
        const onVisibleX = hidden.x === -1 ? v.x >= visibleX - 0.01 : v.x <= visibleX + 0.01;
        const onVisibleZ = hidden.z === -1 ? v.z >= visibleZ - 0.01 : v.z <= visibleZ + 0.01;
        expect(onVisibleX || onVisibleZ).toBe(true);
      }
    });
  }

  it('число вершин не зависит от поворота; окна только на двух фасадах', () => {
    const counts = [0, 1, 2, 3].map((r) => panelHouse(r).vertices);
    expect(new Set(counts).size).toBe(1);
    // Итерация 4: лента-бокс на двух видимых фасадах — 2 × 9 этажей × 24 = 432 вершины.
    // Итерация 5 (FR-19.6): отдельные проёмы по 4 вершины, число — по шагу FACADE.
    const perSide = (length: number): number =>
      Math.max(1, Math.floor((length - 2 * FACADE.WINDOW_MARGIN) / FACADE.WINDOW_STEP));
    const windows = verticesOfColor(panelHouse(0), 'window');
    expect(windows.length).toBe(FLOORS * (perSide(FOOTPRINT.w) + perSide(FOOTPRINT.d)) * 4);
    expect(windows.length).toBeLessThan(2 * FLOORS * 24);
  });
});
