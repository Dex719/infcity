import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Props } from '@/scene/procedural/Props';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

function build(fn: (props: Props) => void): {
  batch: GeometryBatch;
  parts: number;
  geometry: BufferGeometry;
} {
  const batch = new GeometryBatch();
  fn(new Props(batch, materials));
  const parts = batch.parts;
  return { batch, parts, geometry: batch.build() };
}

/** Число различных цветов вершин (округление до 3 знаков). */
function distinctColors(geometry: BufferGeometry): number {
  const color = geometry.getAttribute('color');
  const seen = new Set<string>();
  for (let i = 0; i < color.count; i++) {
    seen.add([color.getX(i), color.getY(i), color.getZ(i)].map((v) => v.toFixed(3)).join(','));
  }
  return seen.size;
}

function extent(geometry: BufferGeometry): { width: number; height: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    throw new Error('no bounding box');
  }
  return {
    width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z),
    height: box.max.y - box.min.y,
  };
}

describe('Props.tree — объёмные кроны (FR-17.1, AC-17.1)', () => {
  it('лиственное: приствольный круг, ствол и ≥ 3 объёма кроны двух оттенков', () => {
    const { parts, geometry } = build((p) => p.tree(3, -4, 1, 0));
    expect(parts).toBeGreaterThanOrEqual(5);
    // Круг, ствол, основной зелёный и два оттенка — не менее 4 цветов.
    expect(distinctColors(geometry)).toBeGreaterThanOrEqual(4);
  });

  it('хвойное: три яруса', () => {
    const { parts, geometry } = build((p) => p.tree(0, 0, 1, 1));
    expect(parts).toBeGreaterThanOrEqual(5);
    expect(distinctColors(geometry)).toBeGreaterThanOrEqual(3);
  });

  it('цветущее: розовая крона и белые цветы поверх зелени (FR-17.5, AC-17.5)', () => {
    const { parts, geometry } = build((p) => p.tree(2, 2, 1, 3));
    expect(parts).toBeGreaterThanOrEqual(5);
    // Круг, ствол, розовый, белый, зелёный — не менее 5 цветов.
    expect(distinctColors(geometry)).toBeGreaterThanOrEqual(5);
  });

  it('куст — один объём на уровне газона (AC-17.5)', () => {
    const { parts, geometry } = build((p) => p.bush(0, 0, 1));
    expect(parts).toBe(1);
    expect(extent(geometry).height).toBeLessThan(2);
  });

  it('тополь: крона выше 2,5 своей ширины', () => {
    const { geometry } = build((p) => p.tree(0, 0, 1, 2));
    const { width, height } = extent(geometry);
    expect(height / width).toBeGreaterThanOrEqual(2.5);
  });

  it('раскладка кроны детерминирована позицией: одинаковые позиции — одинаковая геометрия', () => {
    const a = build((p) => p.tree(5, 7, 1.1, 0)).geometry.getAttribute('position');
    const b = build((p) => p.tree(5, 7, 1.1, 0)).geometry.getAttribute('position');
    const c = build((p) => p.tree(6, 7, 1.1, 0)).geometry.getAttribute('position');
    expect(Array.from(a.array)).toEqual(Array.from(b.array));
    // Другая позиция: сдвиг не сводится к параллельному переносу основного объёма (угол отличается).
    const shifted = Array.from(c.array).map((v, i) => (i % 3 === 0 ? v - 1 : v));
    expect(shifted).not.toEqual(Array.from(a.array));
  });

  it('масштаб растит дерево пропорционально', () => {
    const small = extent(build((p) => p.tree(0, 0, 0.8, 0)).geometry);
    const big = extent(build((p) => p.tree(0, 0, 1.3, 0)).geometry);
    expect(big.height).toBeGreaterThan(small.height * 1.4);
  });
});

describe('Props — помощники деталей ландмарков (FR-17.3)', () => {
  it('изгородь, клумба, козырёк, столбики и прожектор собираются в батч', () => {
    const { parts } = build((p) => {
      p.hedge(0, 0, 6, 1.2);
      p.flowerBed(4, 4, 2, 'gold');
      p.canopy(0, 8, 6, 3, 3.5);
      p.bollards(-5, 10, 5, 10, 6);
      p.spotlight(6, 6, Math.PI / 4);
    });
    // 2 + 2 + 5 + 6 + 4
    expect(parts).toBe(19);
  });
});
