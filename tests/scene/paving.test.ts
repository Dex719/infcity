import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PAVING } from '@/config';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import {
  buildBlock,
  groundRect,
  seamSegments,
  type GroundRect,
} from '@/scene/procedural/BlockPrefabs';
import type { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Generator } from '@/world/Generator';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));
const HALF = 23;
const LINES = Array.from({ length: 11 }, (_, i) => -20 + i * PAVING.STEP);
const SEAM_Y = 0.2 + PAVING.SEAM_LIFT;

function inside(r: GroundRect, x: number, z: number): boolean {
  return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
}

describe('seamSegments (FR-19.7)', () => {
  it('линия без препятствий — один отрезок во всю ширину покрытия', () => {
    expect(seamSegments(4, true, [], HALF)).toEqual([[-HALF, HALF]]);
  });

  it('линия, пересекающая прямоугольник, разрезается на его проекции', () => {
    const avoid = [groundRect(0, 0, 10, 6)];
    expect(seamSegments(2, true, avoid, HALF)).toEqual([
      [-HALF, -5],
      [5, HALF],
    ]);
    // Линия вдоль Z на x = 2 режется по z-проекции.
    expect(seamSegments(2, false, avoid, HALF)).toEqual([
      [-HALF, -3],
      [3, HALF],
    ]);
  });

  it('линия мимо прямоугольника и по его границе не режется', () => {
    const avoid = [groundRect(0, 0, 10, 6)];
    expect(seamSegments(3, true, avoid, HALF)).toEqual([[-HALF, HALF]]);
    expect(seamSegments(10, true, avoid, HALF)).toEqual([[-HALF, HALF]]);
  });

  it('обрезки короче PAVING.MIN_SEGMENT отбрасываются, перекрытия складываются', () => {
    const avoid = [groundRect(-10, 0, 4, 4), groundRect(-7.2, 0, 1, 4), groundRect(10, 0, 30, 4)];
    const segments = seamSegments(0, true, avoid, HALF);
    for (const [a, b] of segments) {
      expect(b - a).toBeGreaterThanOrEqual(PAVING.MIN_SEGMENT);
      for (const r of avoid) {
        expect(b <= r.x0 || a >= r.x1).toBe(true);
      }
    }
    // Между −8 и −7.7 остаётся 0.3 — такой обрезок не строится.
    expect(segments.some(([a]) => a > -8.1 && a < -7.6)).toBe(false);
  });

  it(`AC-19.7: любой свободный квадрат ${String(PAVING.MAX_EMPTY)}×${String(PAVING.MAX_EMPTY)} пересекает шов`, () => {
    const avoid = [
      groundRect(-5, -4, 18, 18, 2.5),
      groundRect(13, 12, 12, 12, 2.5),
      groundRect(15, -17, 8, 8, 0.5),
    ];
    const size = PAVING.MAX_EMPTY;
    for (let x0 = -HALF; x0 + size <= HALF; x0 += 1) {
      for (let z0 = -HALF; z0 + size <= HALF; z0 += 1) {
        const square = { x0, x1: x0 + size, z0, z1: z0 + size };
        const blocked = avoid.some(
          (r) => r.x0 < square.x1 && square.x0 < r.x1 && r.z0 < square.z1 && square.z0 < r.z1,
        );
        if (blocked) {
          continue;
        }
        const crossed = LINES.some(
          (at) =>
            (at > z0 &&
              at < z0 + size &&
              seamSegments(at, true, avoid, HALF).some(([a, b]) => a < x0 + size && b > x0)) ||
            (at > x0 &&
              at < x0 + size &&
              seamSegments(at, false, avoid, HALF).some(([a, b]) => a < z0 + size && b > z0)),
        );
        expect(crossed).toBe(true);
      }
    }
  });
});

/** Вершины шва: цвет — покрытие `stone-light` × `SEAM_SHADE`, высота — покрытие + подъём. */
function seamVertices(batch: GeometryBatch): Vector3[] {
  const geometry = batch.build();
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const wanted = materials.shade('stone-light', PAVING.SEAM_SHADE);
  const found: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    if (
      Math.abs(position.getY(i) - SEAM_Y) < 1e-4 &&
      Math.abs(color.getX(i) - wanted.r) < 1e-4 &&
      Math.abs(color.getY(i) - wanted.g) < 1e-4 &&
      Math.abs(color.getZ(i) - wanted.b) < 1e-4
    ) {
      found.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }
  }
  return found;
}

describe('Мощение кварталов (FR-19.7, AC-19.7)', () => {
  const blocks = [...new Generator('astana').describeWindow(0, 0, 21)];

  it('business-glass: ≥ 15 отрезков шва, ни одного на парковке и в газонной вставке', () => {
    const glass = blocks.filter((d) => d.block === 'business-glass');
    expect(glass.length).toBeGreaterThan(0);
    const parking = groundRect(15, -17, 8, 8);
    const insert = groundRect(-8, -19.5, 26, 5);
    for (const descriptor of glass) {
      const seams = seamVertices(buildBlock(descriptor, materials).detail);
      expect(seams.length / 4).toBeGreaterThanOrEqual(15);
      for (const v of seams) {
        expect(inside(parking, v.x, v.z)).toBe(false);
        expect(inside(insert, v.x, v.z)).toBe(false);
        expect(Math.abs(v.x)).toBeLessThanOrEqual(HALF + 1e-4);
        expect(Math.abs(v.z)).toBeLessThanOrEqual(HALF + 1e-4);
      }
    }
  });

  it('square: швы между полосами плит, под памятником шва нет', () => {
    const squares = blocks.filter((d) => d.block === 'square');
    expect(squares.length).toBeGreaterThan(0);
    const monument = groundRect(0, 0, 5, 5);
    for (const descriptor of squares) {
      const seams = seamVertices(buildBlock(descriptor, materials).detail);
      expect(seams.length / 4).toBeGreaterThanOrEqual(8);
      for (const v of seams) {
        expect(inside(monument, v.x, v.z)).toBe(false);
      }
    }
  });
});
