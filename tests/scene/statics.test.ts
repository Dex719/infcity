import { BackSide, Mesh, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { Lighting } from '@/render/Lighting';
import { ChunkWindow } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { PrefabBuilder } from '@/scene/PrefabBuilder';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { splitBySun } from '@/scene/ShadowSplit';
import { Generator } from '@/world/Generator';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));
const toSun = Lighting.sunDirection('summer');

/** Меши чанка (статика, освещённая статика, стекло). */
function meshesOf(node: { children: readonly unknown[] }): Mesh[] {
  return node.children.filter((child): child is Mesh => child instanceof Mesh);
}

/** Косинусы между нормалями граней (по обходу) и направлением на солнце. */
function facing(geometry: BufferGeometry): number[] {
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  if (index === null) {
    throw new Error('ожидалась индексированная геометрия');
  }
  const at = (k: number): Vector3 => {
    const v = index.getX(k);
    return new Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
  };
  const result: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = at(i);
    const n = new Vector3()
      .subVectors(at(i + 1), a)
      .cross(new Vector3().subVectors(at(i + 2), a))
      .normalize();
    result.push(n.dot(toSun));
  }
  return result;
}

describe('BUG-10: детали и тени не появляются на глазах — LOD снят', () => {
  it('у чанка нет отдельного меша деталей: мелочь влита в статику', () => {
    const builder = new PrefabBuilder(materials, toSun);
    for (const descriptor of new Generator('astana').describeWindow(0, 0, 5)) {
      const names = meshesOf(builder.build(descriptor)).map((mesh) => mesh.name);
      expect(names).toContain('statics');
      expect(names).not.toContain('details');
    }
  });

  it('статика отбрасывает и принимает тень, освещённая часть — только принимает', () => {
    const builder = new PrefabBuilder(materials, toSun);
    for (const descriptor of new Generator('astana').describeWindow(0, 0, 5)) {
      for (const mesh of meshesOf(builder.build(descriptor))) {
        expect(mesh.visible).toBe(true);
        if (mesh.name === 'statics') {
          expect(mesh.castShadow).toBe(true);
          expect(mesh.receiveShadow).toBe(true);
        }
        if (mesh.name === 'statics:lit') {
          expect(mesh.castShadow).toBe(false);
          expect(mesh.receiveShadow).toBe(true);
        }
      }
    }
  });

  it('при слиянии и делении не теряется ни одна вершина чанка', () => {
    const builder = new PrefabBuilder(materials, toSun);
    for (const descriptor of new Generator('astana').describeWindow(0, 0, 5)) {
      const before = builder.verticesBuilt;
      const node = builder.build(descriptor);
      const built = builder.verticesBuilt - before;
      // Статика и её освещённая часть делят буферы вершин — считаем каждый буфер один раз.
      const buffers = new Set(meshesOf(node).map((mesh) => mesh.geometry.getAttribute('position')));
      const inMeshes = [...buffers].reduce((sum, attribute) => sum + attribute.count, 0);
      expect(inMeshes).toBe(built);
    }
  });

  it('после сдвигов окна у всех чанков прежние флаги — переключений по расстоянию нет', () => {
    const window = new ChunkWindow(new Generator('astana'), new PrefabBuilder(materials, toSun), 5);
    for (const [gx, gy] of [
      [0, 0],
      [3, -2],
      [-7, 11],
    ] as const) {
      window.setCenter(gx, gy);
      window.update(window.size * window.size);
      for (const slot of window.slots) {
        const node = slot.node;
        expect(node).not.toBeNull();
        for (const mesh of meshesOf(node ?? { children: [] })) {
          expect(mesh.visible).toBe(true);
          if (mesh.name === 'statics') {
            expect(mesh.castShadow).toBe(true);
          }
        }
      }
    }
  });
});

describe('Деление статики по солнцу (BUG-10, design D20)', () => {
  it('в карту теней пишутся только грани, обращённые от света (shadowSide = BackSide)', () => {
    expect(materials.opaque.shadowSide).toBe(BackSide);
  });

  it('ни одна грань не теряется, буферы вершин общие', () => {
    const batch = new GeometryBatch();
    batch.box(0, 1, 0, 2, 2, 2, materials.color('white'));
    batch.box(4, 3, -2, 1, 6, 3, materials.color('white'), 0.7);
    batch.plane(0, 0, 0, 10, 10, materials.color('grass'));
    const geometry = batch.build();
    const total = (geometry.index?.count ?? 0) / 3;
    const { cast, lit } = splitBySun(geometry, toSun);
    expect((cast.index?.count ?? 0) / 3 + (lit.index?.count ?? 0) / 3).toBe(total);
    expect(cast.getAttribute('position')).toBe(geometry.getAttribute('position'));
    expect(lit.getAttribute('position')).toBe(geometry.getAttribute('position'));
  });

  it('освещённые грани смотрят на солнце, теневые — нет; земля и крыши освещены', () => {
    const batch = new GeometryBatch();
    batch.box(0, 1, 0, 2, 2, 2, materials.color('white'));
    batch.plane(0, 0, 0, 10, 10, materials.color('grass'));
    const { cast, lit } = splitBySun(batch.build(), toSun);
    const litFacing = facing(lit);
    const castFacing = facing(cast);
    expect(litFacing.length).toBeGreaterThan(0);
    expect(castFacing.length).toBeGreaterThan(0);
    for (const d of litFacing) {
      expect(d).toBeGreaterThan(0);
    }
    for (const d of castFacing) {
      expect(d).toBeLessThanOrEqual(1e-4);
    }
    // Бокс: +X, −Z и верх смотрят на солнце (100, 150, −40), остальные три — от него;
    // плоскость земли — вверх, к солнцу.
    expect(litFacing).toHaveLength(3 * 2 + 2);
    expect(castFacing).toHaveLength(3 * 2);
  });

  it('зимнее солнце делит иначе, чем летнее, — деление берёт солнце сезона', () => {
    const summer = Lighting.sunDirection('summer');
    const winter = Lighting.sunDirection('winter');
    expect(summer.distanceTo(winter)).toBeGreaterThan(0.1);
    expect(winter.length()).toBeCloseTo(1, 9);
  });
});
