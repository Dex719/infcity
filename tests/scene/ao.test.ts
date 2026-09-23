import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AO, LANDMARK_IDS, LRT, type LandmarkId } from '@/config';
import { buildLandmark } from '@/scene/landmarks';
import { Materials } from '@/scene/Materials';
import { parsePalette, type PaletteKey } from '@/scene/palette';
import { buildBlock } from '@/scene/procedural/BlockPrefabs';
import { Buildings } from '@/scene/procedural/Buildings';
import { buildLrt } from '@/scene/procedural/Lrt';
import { Props } from '@/scene/procedural/Props';
import { GeometryBatch, wallAo } from '@/scene/procedural/GeometryBatch';
import { Generator } from '@/world/Generator';
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

describe('GeometryBatch.halo (FR-19.2, design D15)', () => {
  const ground = new Color(0.3, 0.6, 0.2);

  it('кольцо: 8 вершин и 8 треугольников, внутренний край × GROUND_MIN, внешний — цвет земли', () => {
    const b = new GeometryBatch();
    b.halo(0, 0, 10, 6, 0.21, { px: 2.5, nx: 2.5, pz: 1, nz: 0 }, ground, AO.GROUND_MIN);
    expect(b.vertices).toBe(8);
    const { vertices, indices } = verticesOf(b);
    expect(indices.length / 3).toBe(8);
    for (const v of vertices) {
      expect(v.p.y).toBeCloseTo(0.21, 6);
      expect(v.n.y).toBeCloseTo(1, 6);
      const inner = Math.abs(v.p.x) <= 5 + EPS && Math.abs(v.p.z) <= 3 + EPS;
      const onInnerCorner =
        Math.abs(Math.abs(v.p.x) - 5) < EPS && Math.abs(Math.abs(v.p.z) - 3) < EPS;
      if (inner && onInnerCorner && v.c.g < ground.g - EPS) {
        expect(factor(v, ground)).toBeCloseTo(AO.GROUND_MIN, 6);
      } else {
        expect(factor(v, ground)).toBeCloseTo(1, 6);
      }
    }
    const dark = vertices.filter((v) => factor(v, ground) < 1 - EPS);
    expect(dark).toHaveLength(4);
    // Внешний контур: +X на 2.5, −X на 2.5, +Z на 1, −Z без выступа.
    const xs = vertices.map((v) => v.p.x);
    const zs = vertices.map((v) => v.p.z);
    expect(Math.max(...xs)).toBeCloseTo(7.5, 6);
    expect(Math.min(...xs)).toBeCloseTo(-7.5, 6);
    expect(Math.max(...zs)).toBeCloseTo(4, 6);
    expect(Math.min(...zs)).toBeCloseTo(-3, 6);
  });

  it('все треугольники смотрят вверх (CCW при взгляде сверху)', () => {
    const b = new GeometryBatch();
    b.halo(3, -2, 8, 5, 0.21, { px: 2, nx: 1, pz: 2.5, nz: 0.5 }, ground, AO.GROUND_MIN);
    const { vertices, indices } = verticesOf(b);
    const e1 = new Vector3();
    const e2 = new Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      const va = vertices[indices[i] ?? 0];
      const vb = vertices[indices[i + 1] ?? 0];
      const vc = vertices[indices[i + 2] ?? 0];
      if (va === undefined || vb === undefined || vc === undefined) {
        throw new Error('индекс вне массива вершин');
      }
      e1.subVectors(vb.p, va.p);
      e2.subVectors(vc.p, va.p);
      expect(e1.cross(e2).y).toBeGreaterThan(0);
    }
  });
});

describe('Buildings.flushHalos (FR-19.2, AC-19.2)', () => {
  function fresh(): { buildings: Buildings; opaque: GeometryBatch } {
    const opaque = new GeometryBatch();
    const buildings = new Buildings(
      opaque,
      new GeometryBatch(),
      materials,
      mulberry32(1),
      undefined,
      new GeometryBatch(),
    );
    buildings.groundKey = 'grass';
    return { buildings, opaque };
  }

  type Rect = { x0: number; x1: number; z0: number; z1: number };
  function outer(h: {
    footprint: { x: number; z: number; w: number; d: number };
    widths: { px: number; nx: number; pz: number; nz: number };
  }): Rect {
    const f = h.footprint;
    return {
      x0: f.x - f.w / 2 - h.widths.nx,
      x1: f.x + f.w / 2 + h.widths.px,
      z0: f.z - f.d / 2 - h.widths.nz,
      z1: f.z + f.d / 2 + h.widths.pz,
    };
  }
  function overlap(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
  }

  it('соседи в 4 юнитах по X: обращённые стороны урезаны до 2, дальние — полная ширина', () => {
    const { buildings } = fresh();
    buildings.marketHall({ x: -7, z: 0, w: 10, d: 8 });
    buildings.marketHall({ x: 7, z: 0, w: 10, d: 8 });
    const halos = buildings.flushHalos(0.21, 23);
    expect(halos).toHaveLength(2);
    const [left, right] = halos;
    expect(left?.widths.px).toBeCloseTo(2, 9);
    expect(left?.widths.nx).toBeCloseTo(AO.GROUND_WIDTH, 9);
    expect(right?.widths.nx).toBeCloseTo(2, 9);
    expect(right?.widths.px).toBeCloseTo(AO.GROUND_WIDTH, 9);
    expect(overlap(outer(left!), outer(right!))).toBe(false);
  });

  it('у края покрытия кольцо не выходит за ±limit', () => {
    const { buildings } = fresh();
    buildings.marketHall({ x: 17, z: -18, w: 10, d: 8 });
    const [halo] = buildings.flushHalos(0.21, 23);
    expect(halo?.widths.px).toBeCloseTo(1, 9);
    expect(halo?.widths.nz).toBeCloseTo(1, 9);
    const r = outer(halo!);
    expect(r.x1).toBeLessThanOrEqual(23 + EPS);
    expect(r.z0).toBeGreaterThanOrEqual(-23 - EPS);
  });

  it('соседи по диагонали: кольца касаются, но не перекрываются', () => {
    const { buildings } = fresh();
    buildings.marketHall({ x: -6, z: -6, w: 8, d: 8 });
    buildings.marketHall({ x: 3, z: 5, w: 8, d: 8 });
    const [a, b] = buildings.flushHalos(0.21, 23);
    expect(overlap(outer(a!), outer(b!))).toBe(false);
  });

  it('без цвета покрытия ореолов нет, реестр очищается', () => {
    const { buildings, opaque } = fresh();
    buildings.groundKey = null;
    buildings.marketHall({ x: 0, z: 0, w: 10, d: 8 });
    const before = opaque.vertices;
    expect(buildings.flushHalos(0.21, 23)).toHaveLength(0);
    expect(opaque.vertices).toBe(before);
  });

  it('жилой квартал: ореолы у домов цвета газона, в пределах покрытия (перебор сидов)', () => {
    for (const seed of ['astana', 'expo', 'saryarka']) {
      for (const descriptor of new Generator(seed).describeWindow(0, 0, 9)) {
        if (descriptor.block !== 'residential-panel') {
          continue;
        }
        const block = buildBlock(descriptor, materials);
        const { vertices } = verticesOf(block.opaque);
        const grass = materials.color('grass');
        const ring = vertices.filter(
          (v) => Math.abs(v.p.y - (0.2 + AO.GROUND_LIFT)) < 1e-5 && v.n.y > 0.99,
        );
        expect(ring.length % 8).toBe(0);
        expect(ring.length).toBeGreaterThanOrEqual(24);
        for (const v of ring) {
          const f = factor(v, grass);
          expect(Math.abs(f - 1) < 1e-5 || Math.abs(f - AO.GROUND_MIN) < 1e-5).toBe(true);
          expect(Math.abs(v.p.x)).toBeLessThanOrEqual(23 + 1e-5);
          expect(Math.abs(v.p.z)).toBeLessThanOrEqual(23 + 1e-5);
        }
      }
    }
  });
});

describe('AO малых форм (FR-19.12, AC-19.13)', () => {
  const ground = materials.color('sidewalk');

  it('haloEllipse: 16 сегментов — 32 вершины и 32 треугольника, все грани смотрят вверх', () => {
    const b = new GeometryBatch();
    b.haloEllipse(0, 0, 10, 6, 2.5, 1.5, 0.21, ground, AO.GROUND_MIN);
    expect(b.vertices).toBe(32);
    const { vertices, indices } = verticesOf(b);
    expect(indices.length / 3).toBe(32);
    const e1 = new Vector3();
    const e2 = new Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      const va = vertices[indices[i] ?? 0];
      const vb = vertices[indices[i + 1] ?? 0];
      const vc = vertices[indices[i + 2] ?? 0];
      if (va === undefined || vb === undefined || vc === undefined) {
        throw new Error('индекс вне массива вершин');
      }
      e1.subVectors(vb.p, va.p);
      e2.subVectors(vc.p, va.p);
      expect(e1.cross(e2).y).toBeGreaterThan(0);
    }
    const dark = vertices.filter((v) => factor(v, ground) < 1 - EPS);
    expect(dark).toHaveLength(16);
    for (const v of dark) {
      expect(factor(v, ground)).toBeCloseTo(AO.GROUND_MIN, 6);
      expect((v.p.x / 10) ** 2 + (v.p.z / 6) ** 2).toBeCloseTo(1, 5);
    }
  });

  function fresh(groundKey: 'sidewalk' | 'sand'): { buildings: Buildings; opaque: GeometryBatch } {
    const opaque = new GeometryBatch();
    const buildings = new Buildings(
      opaque,
      new GeometryBatch(),
      materials,
      mulberry32(1),
      undefined,
      new GeometryBatch(),
    );
    buildings.groundKey = groundKey;
    return { buildings, opaque };
  }

  it('стадион: эллиптический ореол цвета покрытия, не выходит за ±23', () => {
    const { buildings, opaque } = fresh('sidewalk');
    buildings.stadium(0, 0, 21, 16);
    buildings.flushHalos(0.21, 23);
    const { vertices } = verticesOf(opaque);
    const ring = vertices.filter((v) => Math.abs(v.p.y - 0.21) < 1e-5 && v.n.y > 0.99);
    expect(ring).toHaveLength(32);
    for (const v of ring) {
      const f = factor(v, ground);
      expect(Math.abs(f - 1) < 1e-5 || Math.abs(f - AO.GROUND_MIN) < 1e-5).toBe(true);
      expect(Math.abs(v.p.x)).toBeLessThanOrEqual(23 + 1e-5);
      expect(Math.abs(v.p.z)).toBeLessThanOrEqual(23 + 1e-5);
    }
  });

  it('рынок: ореол у павильона и у каждого из 12 лотков, стены лотков темнеют к земле', () => {
    const { buildings, opaque } = fresh('sand');
    buildings.marketHall({ x: -6, z: -10, w: 26, d: 16 });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        buildings.stall(-13 + i * 8, 6 + j * 6, 'accent-red');
      }
    }
    const halos = buildings.flushHalos(0.21, 23);
    expect(halos).toHaveLength(13);
    const brick = materials.color('brick');
    const { vertices } = verticesOf(opaque);
    const stallBase = vertices.filter(
      (v) =>
        Math.abs(v.n.y) < EPS &&
        v.p.y < EPS &&
        Math.abs(v.c.r / brick.r - v.c.g / brick.g) < 1e-4 &&
        Math.abs(v.c.g / brick.g - v.c.b / brick.b) < 1e-4,
    );
    expect(stallBase.length).toBeGreaterThanOrEqual(12 * 8);
    for (const v of stallBase) {
      expect(factor(v, brick)).toBeCloseTo(AO.WALL_MIN, 5);
    }
  });

  it('эстакада ЛРТ: ореол цвета асфальта под каждой опорой, ниже разметки', () => {
    const b = new GeometryBatch();
    buildLrt(b, materials, { corridor: 'EW', station: false, ns: false, nsStation: false });
    const asphalt = materials.color('asphalt');
    const { vertices } = verticesOf(b);
    const ring = vertices.filter(
      (v) =>
        Math.abs(v.p.y - 0.01) < 1e-5 &&
        v.n.y > 0.99 &&
        Math.abs(v.c.r / asphalt.r - v.c.g / asphalt.g) < 1e-4,
    );
    const pillars = Math.round(60 / LRT.PILLAR_SPACING);
    expect(ring).toHaveLength(pillars * 8);
    expect(ring.filter((v) => factor(v, asphalt) < 1 - EPS)).toHaveLength(pillars * 4);
  });
});

describe('AO контакта у ландмарков (FR-19.14, AC-19.15)', () => {
  // [плита, верх плиты, полуширина плиты]
  const plates: Readonly<Partial<Record<LandmarkId, readonly [PaletteKey, number, number]>>> = {
    'abu-dhabi-plaza': ['stone-light', 0.2, 23],
    'ak-orda': ['stone-light', 0.2, 23],
    'astana-opera': ['stone-light', 0.2, 23],
    'hazret-sultan': ['stone-light', 0.22, 20],
    kazmunaygas: ['stone-light', 0.22, 20],
    'khan-shatyr': ['stone-light', 0.2, 23],
    'mega-silk-way': ['sidewalk', 0.2, 23],
    'northern-lights': ['stone-light', 0.2, 23],
    'nur-alem': ['stone-light', 0.2, 23],
    pyramid: ['grass', 0.2, 23],
    'transport-tower': ['stone-light', 0.2, 23],
  };

  function landmarkOpaque(id: LandmarkId): GeometryBatch {
    const opaque = new GeometryBatch();
    const glass = new GeometryBatch();
    const ao = new Buildings(opaque, glass, materials, mulberry32(7));
    buildLandmark(id, {
      opaque,
      glass,
      props: new Props(opaque, materials),
      m: materials,
      rng: mulberry32(7),
      ao,
    });
    ao.flushHalos(0.2 + AO.GROUND_LIFT, 23);
    return opaque;
  }

  for (const id of LANDMARK_IDS) {
    const plate = plates[id];
    if (plate === undefined) {
      it(`${id}: на плитке ореола нет — AO лежит на разноцветных кольцах (FR-19.16)`, () => {
        const ground = materials.color('stone-light');
        const { vertices } = verticesOf(landmarkOpaque(id));
        const dark = vertices.filter(
          (v) =>
            Math.abs(v.p.y - (0.2 + AO.GROUND_LIFT)) < 1e-5 &&
            Math.abs(factor(v, ground) - AO.GROUND_MIN) < 1e-5,
        );
        expect(dark).toHaveLength(0);
      });
      continue;
    }
    const [key, top, half] = plate;
    it(`${id}: ореол цвета плиты ${key} на её высоте и в её границах`, () => {
      const ground = materials.color(key);
      const { vertices } = verticesOf(landmarkOpaque(id));
      const ring = vertices.filter(
        (v) =>
          Math.abs(v.p.y - (top + AO.GROUND_LIFT)) < 1e-5 &&
          v.n.y > 0.99 &&
          Math.abs(v.c.r / ground.r - v.c.g / ground.g) < 1e-4,
      );
      const dark = ring.filter((v) => Math.abs(factor(v, ground) - AO.GROUND_MIN) < 1e-5);
      const edge = ring.filter((v) => Math.abs(factor(v, ground) - 1) < 1e-5);
      expect(dark.length).toBeGreaterThanOrEqual(4);
      expect(edge.length).toBeGreaterThanOrEqual(4);
      for (const v of ring) {
        expect(Math.abs(v.p.x)).toBeLessThanOrEqual(half + 1e-5);
        expect(Math.abs(v.p.z)).toBeLessThanOrEqual(half + 1e-5);
      }
    });
  }
});

describe('AO Байтерека по кольцам (FR-19.16, AC-19.17)', () => {
  // [r0, r1, высота полосы, цвет] — как в `Baiterek.ts`.
  const rings: readonly (readonly [number, number, number, PaletteKey])[] = [
    [9, 9.6, 0.3, 'gold'],
    [9.6, 10.5, 0.28, 'sand'],
    [10.5, 11.5, 0.26, 'white'],
  ];
  const aoAt = (r: number): number =>
    AO.GROUND_MIN + (1 - AO.GROUND_MIN) * Math.min(1, (r - 9) / AO.GROUND_WIDTH);

  function baiterek(): Vertex[] {
    const opaque = new GeometryBatch();
    const glass = new GeometryBatch();
    const ao = new Buildings(opaque, glass, materials, mulberry32(7));
    buildLandmark('baiterek', {
      opaque,
      glass,
      props: new Props(opaque, materials),
      m: materials,
      rng: mulberry32(7),
      ao,
    });
    ao.flushHalos(0.2 + AO.GROUND_LIFT, 23);
    return verticesOf(opaque).vertices;
  }

  it('каждое кольцо затемнено своим цветом: у внутреннего края f(r0), у внешнего f(r1)', () => {
    const vertices = baiterek();
    for (const [r0, r1, y, key] of rings) {
      const color = materials.color(key);
      // На той же высоте лежат и другие плоские вещи площади — берём только оттенок кольца.
      const band = vertices.filter(
        (v) =>
          Math.abs(v.p.y - y) < 1e-5 &&
          v.n.y > 0.99 &&
          Math.abs(v.c.r / color.r - v.c.g / color.g) < 1e-4 &&
          Math.abs(v.c.g / color.g - v.c.b / color.b) < 1e-4,
      );
      expect(band).toHaveLength(32);
      for (const v of band) {
        const r = Math.hypot(v.p.x, v.p.z);
        const expected = Math.abs(r - r0) < 1e-3 ? aoAt(r0) : aoAt(r1);
        expect(Math.abs(r - r0) < 1e-3 || Math.abs(r - r1) < 1e-3).toBe(true);
        expect(factor(v, color)).toBeCloseTo(expected, 6);
      }
    }
  });

  it('градиент непрерывен на границах колец и сходит на нет к внешнему краю белого', () => {
    expect(aoAt(9)).toBeCloseTo(AO.GROUND_MIN, 9);
    for (let i = 0; i + 1 < rings.length; i++) {
      const outer = rings[i];
      const inner = rings[i + 1];
      if (outer === undefined || inner === undefined) {
        throw new Error('нет кольца');
      }
      expect(outer[1]).toBe(inner[0]);
    }
    expect(aoAt(11.5)).toBeCloseTo(1, 9);
  });
});
