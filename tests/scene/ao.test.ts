import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AO } from '@/config';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { Buildings } from '@/scene/procedural/Buildings';
import { GeometryBatch, wallAo } from '@/scene/procedural/GeometryBatch';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));
const EPS = 1e-6;

interface Vertex {
  readonly p: Vector3;
  readonly n: Vector3;
  readonly c: Color;
}

function verticesOf(batch: GeometryBatch): { vertices: Vertex[]; indices: number[] } {
  const geometry = batch.build();
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const col = geometry.getAttribute('color');
  const vertices: Vertex[] = [];
  for (let i = 0; i < pos.count; i++) {
    vertices.push({
      p: new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
      n: new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)),
      c: new Color(col.getX(i), col.getY(i), col.getZ(i)),
    });
  }
  const index = geometry.index;
  const indices = index === null ? [] : Array.from(index.array);
  return { vertices, indices };
}

/** Множитель цвета вершины относительно исходного (по зелёному каналу — он у цвета ненулевой). */
function factor(v: Vertex, color: Color): number {
  return v.c.g / color.g;
}

describe('GeometryBatch.boxAo (FR-19.1, AC-19.1, design D15)', () => {
  const color = new Color(0.6, 0.5, 0.4);

  it('wallAo: WALL_MIN у основания, 1 на WALL_HEIGHT и выше', () => {
    expect(wallAo(0)).toBeCloseTo(AO.WALL_MIN, 9);
    expect(wallAo(AO.WALL_HEIGHT)).toBeCloseTo(1, 9);
    expect(wallAo(AO.WALL_HEIGHT * 10)).toBeCloseTo(1, 9);
    expect(wallAo(-1)).toBeCloseTo(AO.WALL_MIN, 9);
    expect(wallAo(AO.WALL_HEIGHT / 2)).toBeCloseTo((AO.WALL_MIN + 1) / 2, 9);
  });

  it('высокий бокс: 32 вершины и 20 треугольников, три пояса на боковых гранях', () => {
    const b = new GeometryBatch();
    b.boxAo(0, 15, 0, 10, 30, 8, color);
    expect(b.vertices).toBe(32);
    const { vertices, indices } = verticesOf(b);
    expect(indices.length / 3).toBe(20);
    const sideHeights = new Set(
      vertices.filter((v) => Math.abs(v.n.y) < EPS).map((v) => v.p.y.toFixed(6)),
    );
    expect([...sideHeights].sort()).toEqual(['0.000000', '3.000000', '30.000000'].sort());
  });

  it('боковые грани: WALL_MIN у основания, 1 от WALL_HEIGHT; верх без затемнения', () => {
    const b = new GeometryBatch();
    b.boxAo(0, 15, 0, 10, 30, 8, color);
    const { vertices } = verticesOf(b);
    for (const v of vertices) {
      const f = factor(v, color);
      if (v.n.y > 0.5) {
        expect(f).toBeCloseTo(1, 6);
      } else if (Math.abs(v.n.y) < EPS) {
        expect(f).toBeCloseTo(wallAo(v.p.y), 6);
        if (v.p.y < EPS) {
          expect(f).toBeCloseTo(AO.WALL_MIN, 6);
        }
        if (v.p.y >= AO.WALL_HEIGHT - EPS) {
          expect(f).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it('низкий бокс (h ≤ WALL_HEIGHT): как обычный — 24 вершины и 12 треугольников', () => {
    const b = new GeometryBatch();
    b.boxAo(0, 0.3, 0, 4, 0.6, 3, color);
    expect(b.vertices).toBe(24);
    const { vertices, indices } = verticesOf(b);
    expect(indices.length / 3).toBe(12);
    const topOfSides = vertices.filter((v) => Math.abs(v.n.y) < EPS && v.p.y > 0.3);
    expect(topOfSides).toHaveLength(8);
    for (const v of topOfSides) {
      expect(factor(v, color)).toBeCloseTo(wallAo(0.6), 6);
    }
  });

  it('бокс замкнут, все грани смотрят наружу, габарит совпадает с обычным box', () => {
    const b = new GeometryBatch();
    b.boxAo(2, 10, -3, 6, 20, 4, color, 0.7);
    const { vertices, indices } = verticesOf(b);
    const reference = new GeometryBatch();
    reference.box(2, 10, -3, 6, 20, 4, color, 0.7);
    const ref = verticesOf(reference).vertices;
    const bounds = (list: Vertex[]): { min: Vector3; max: Vector3 } => {
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const v of list) {
        min.min(v.p);
        max.max(v.p);
      }
      return { min, max };
    };
    const a = bounds(vertices);
    const r = bounds(ref);
    expect(a.min.distanceTo(r.min)).toBeLessThan(1e-5);
    expect(a.max.distanceTo(r.max)).toBeLessThan(1e-5);
    // Обход каждого треугольника совпадает с нормалью его вершин (CCW снаружи).
    const e1 = new Vector3();
    const e2 = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      const va = vertices[indices[i] ?? 0];
      const vb = vertices[indices[i + 1] ?? 0];
      const vc = vertices[indices[i + 2] ?? 0];
      if (va === undefined || vb === undefined || vc === undefined) {
        throw new Error('индекс вне массива вершин');
      }
      e1.subVectors(vb.p, va.p);
      e2.subVectors(vc.p, va.p);
      n.crossVectors(e1, e2).normalize();
      expect(n.dot(va.n)).toBeGreaterThan(0.99);
    }
    // Замкнутость: у каждой из 6 сторон есть грань (нормали ±X', ±Y, ±Z' после поворота).
    const directions = new Set(
      vertices.map((v) => `${v.n.x.toFixed(3)},${v.n.y.toFixed(3)},${v.n.z.toFixed(3)}`),
    );
    expect(directions.size).toBe(6);
  });
});

describe('Buildings: AO контакта у корпусов (FR-19.1)', () => {
  it('панельный дом темнеет к земле: у основания стены — WALL_MIN, выше — без затемнения', () => {
    const opaque = new GeometryBatch();
    const buildings = new Buildings(
      opaque,
      new GeometryBatch(),
      materials,
      mulberry32(1),
      undefined,
      new GeometryBatch(),
    );
    buildings.panelHouse({ x: 0, z: 0, w: 16, d: 10 }, 9, 'brick');
    const brick = materials.color('brick');
    const { vertices } = verticesOf(opaque);
    const walls = vertices.filter(
      (v) =>
        Math.abs(v.n.y) < EPS &&
        Math.abs(v.c.r / brick.r - v.c.g / brick.g) < 1e-4 &&
        Math.abs(v.c.g / brick.g - v.c.b / brick.b) < 1e-4,
    );
    const atGround = walls.filter((v) => v.p.y < EPS);
    const high = walls.filter((v) => v.p.y > AO.WALL_HEIGHT + EPS);
    expect(atGround.length).toBeGreaterThanOrEqual(8);
    expect(high.length).toBeGreaterThanOrEqual(8);
    for (const v of atGround) {
      expect(factor(v, brick)).toBeCloseTo(AO.WALL_MIN, 5);
    }
    for (const v of high) {
      expect(factor(v, brick)).toBeCloseTo(1, 5);
    }
  });
});
