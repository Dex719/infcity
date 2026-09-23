import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { Buildings, FIELD_TOP } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

interface Triangle {
  readonly center: Vector3;
  readonly normal: Vector3;
}

/** Треугольники батча: центр и нормаль по обходу вершин. */
function triangles(batch: GeometryBatch): Triangle[] {
  const geometry = batch.build();
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  if (index === null) {
    throw new Error('ожидалась индексированная геометрия');
  }
  const result: Triangle[] = [];
  const at = (k: number): Vector3 => {
    const v = index.getX(k);
    return new Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const center = new Vector3().add(a).add(b).add(c).divideScalar(3);
    result.push({ center, normal });
  }
  return result;
}

/** Горизонтальная составляющая «от центра наружу» в точке. */
function radial(point: Vector3): Vector3 {
  return new Vector3(point.x, 0, point.z).normalize();
}

describe('GeometryBatch.ellipseBand (FR-19.13, design «Волна 3»)', () => {
  const color = new Color(0.5, 0.5, 0.5);

  it('32 вершины и 32 треугольника на 16 сегментов', () => {
    const b = new GeometryBatch();
    b.ellipseBand(0, 0, { rx: 10, rz: 6, y: 1 }, { rx: 12, rz: 8, y: 3 }, color, color);
    expect(b.vertices).toBe(32);
    expect(triangles(b)).toHaveLength(32);
  });

  it('ярус (b шире и выше a) смотрит вверх и к центру', () => {
    const b = new GeometryBatch();
    b.ellipseBand(0, 0, { rx: 10, rz: 6, y: 1 }, { rx: 12, rz: 8, y: 3 }, color, color);
    for (const t of triangles(b)) {
      expect(t.normal.y).toBeGreaterThan(0.2);
      expect(t.normal.dot(radial(t.center))).toBeLessThan(0);
    }
  });

  it('стена, заданная сверху вниз, смотрит наружу', () => {
    const b = new GeometryBatch();
    b.ellipseBand(0, 0, { rx: 10, rz: 6, y: 5 }, { rx: 10, rz: 6, y: 1 }, color, color);
    for (const t of triangles(b)) {
      expect(Math.abs(t.normal.y)).toBeLessThan(1e-6);
      expect(t.normal.dot(radial(t.center))).toBeGreaterThan(0);
    }
  });

  it('плоское кольцо наружу смотрит вверх', () => {
    const b = new GeometryBatch();
    b.ellipseBand(0, 0, { rx: 10, rz: 6, y: 2 }, { rx: 11, rz: 7, y: 2 }, color, color);
    for (const t of triangles(b)) {
      expect(t.normal.y).toBeGreaterThan(0.999);
    }
  });
});

describe('Стадион — открытая чаша (FR-19.13, AC-19.14)', () => {
  const RX = 21;
  const RZ = 16;

  function build(): { opaque: GeometryBatch; detail: GeometryBatch } {
    const opaque = new GeometryBatch();
    const detail = new GeometryBatch();
    const buildings = new Buildings(
      opaque,
      new GeometryBatch(),
      materials,
      mulberry32(1),
      undefined,
      detail,
    );
    buildings.stadium(0, 0, RX, RZ);
    return { opaque, detail };
  }

  /** Точка внутри центральной части поля (60 % полуосей). */
  function overField(p: Vector3): boolean {
    return (p.x / (RX * 0.6)) ** 2 + (p.z / (RZ * 0.6)) ** 2 < 1;
  }

  it('над центральной частью поля нет геометрии выше газона и разметки', () => {
    const { opaque, detail } = build();
    for (const batch of [opaque, detail]) {
      const geometry = batch.build();
      const pos = geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (overField(p)) {
          expect(p.y).toBeLessThanOrEqual(FIELD_TOP + 0.1);
        }
      }
    }
  });

  it('ярусы трибун обращены к полю: нормали вверх и внутрь', () => {
    const { opaque } = build();
    const tiers = triangles(opaque).filter(
      (t) =>
        t.center.y > FIELD_TOP + 0.2 && t.center.y < 10.3 && t.normal.y > 0.2 && t.normal.y < 0.99,
    );
    expect(tiers.length).toBeGreaterThanOrEqual(64);
    for (const t of tiers) {
      expect(t.normal.dot(radial(t.center))).toBeLessThan(0);
    }
  });

  it('разметка и полосы газона: ≥ 10 элементов в слое деталей', () => {
    const { detail } = build();
    expect(detail.parts).toBeGreaterThanOrEqual(10);
  });
});
