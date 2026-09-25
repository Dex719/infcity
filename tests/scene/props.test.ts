import type { BufferGeometry, Color } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { GeometryBatch, Templates } from '@/scene/procedural/GeometryBatch';
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

describe('Гранёный шар — панели с плоскими нормалями (FR-17.8, AC-17.8)', () => {
  it('icoFlat: ≥ 300 граней, нормали вершин каждой грани совпадают, два цвета попеременно', () => {
    const batch = new GeometryBatch();
    batch.placeFacets(
      Templates.icoFlat,
      0,
      0,
      0,
      7,
      7,
      7,
      materials.color('gold'),
      materials.shade('gold', 0.78),
    );
    expect(batch.parts).toBe(1);
    const geometry = batch.build();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const faces = position.count / 3;
    expect(faces).toBeGreaterThanOrEqual(300);
    for (let face = 0; face < faces; face++) {
      const i = face * 3;
      for (let v = 1; v < 3; v++) {
        expect(normal.getX(i + v)).toBeCloseTo(normal.getX(i), 5);
        expect(normal.getY(i + v)).toBeCloseTo(normal.getY(i), 5);
        expect(normal.getZ(i + v)).toBeCloseTo(normal.getZ(i), 5);
      }
    }
    expect(distinctColors(geometry)).toBe(2);
    // Соседние грани — разных цветов (индекс % 2).
    const color = geometry.getAttribute('color');
    expect(color.getX(0)).not.toBeCloseTo(color.getX(3), 5);
  });

  it('индексированный шаблон отвергается', () => {
    const batch = new GeometryBatch();
    expect(() =>
      batch.placeFacets(
        Templates.sphereLow,
        0,
        0,
        0,
        1,
        1,
        1,
        materials.color('gold'),
        materials.color('white'),
      ),
    ).toThrow();
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

// FR-19.29, AC-19.30, design D33: детская площадка двора — домик с крышей и горкой, качели,
// карусель на песке 7 × 7.
describe('Props.playground — детская площадка двора (FR-19.29, AC-19.30)', () => {
  it('песок 7 × 7, вся геометрия в пределах площадки и не выше 2,6; ≤ 350 вершин', () => {
    const { batch, geometry } = build((p) => p.playground(10, -4));
    expect(batch.vertices).toBeLessThanOrEqual(350);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    expect(box!.min.x).toBeGreaterThanOrEqual(10 - 3.5 - 1e-6);
    expect(box!.max.x).toBeLessThanOrEqual(10 + 3.5 + 1e-6);
    expect(box!.min.z).toBeGreaterThanOrEqual(-4 - 3.5 - 1e-6);
    expect(box!.max.z).toBeLessThanOrEqual(-4 + 3.5 + 1e-6);
    expect(box!.max.y).toBeLessThanOrEqual(2.6);
  });

  it('домик с крышей, горка до земли, качели (2 стойки, перекладина, 2 сиденья), карусель', () => {
    const boxes = vi.spyOn(GeometryBatch.prototype, 'box');
    const places = vi.spyOn(GeometryBatch.prototype, 'place');
    const rotated = vi.spyOn(GeometryBatch.prototype, 'placeRotated');
    const { geometry } = build((p) => p.playground(0, 0));
    const color = (key: Parameters<Materials['color']>[0]): Color => materials.color(key);
    // Песок, домик, крыша-пирамида, карусель — через `place`.
    const sand = places.mock.calls.filter(
      ([t, , , , w, , d, c]) =>
        t === Templates.planeXZ && w === 7 && d === 7 && c.equals(color('sand')),
    );
    expect(sand).toHaveLength(1);
    expect(
      places.mock.calls.some(
        ([t, , , , , , , c]) => t === Templates.pyramid4 && c.equals(color('accent-red')),
      ),
    ).toBe(true);
    expect(
      places.mock.calls.some(
        ([t, , , , , , , c]) => t === Templates.cylinder8 && c.equals(color('yellow')),
      ),
    ).toBe(true);
    // Горка — наклонная плита: верх у домика, низ у земли.
    expect(rotated.mock.calls).toHaveLength(1);
    const [, , sy, , , , length, angle] = rotated.mock.calls[0]!;
    expect(angle).toBeGreaterThan(0.2);
    expect(sy - (Math.sin(angle) * length) / 2).toBeLessThan(0.4);
    // Качели: стойки высотой 2, перекладина и 2 сиденья.
    const posts = boxes.mock.calls.filter(([, , , w, h]) => w === 0.12 && h === 2);
    const seats = boxes.mock.calls.filter(([, , , , , , c]) => c.equals(color('accent-red')));
    expect(posts).toHaveLength(2);
    expect(seats).toHaveLength(2);
    expect(boxes.mock.calls.some(([, y, , w]) => w > 2.5 && y > 2)).toBe(true);
    expect(distinctColors(geometry)).toBeGreaterThanOrEqual(6);
    vi.restoreAllMocks();
  });

  it('facing −1 — горка съезжает к −Z: площадка зеркальна по Z, пределы те же', () => {
    const rotated = vi.spyOn(GeometryBatch.prototype, 'placeRotated');
    const places = vi.spyOn(GeometryBatch.prototype, 'place');
    const { batch, geometry } = build((p) => p.playground(0, 0, -1));
    const house = places.mock.calls.find(([t]) => t === Templates.pyramid4);
    const [, , sy, sz, , , length, angle] = rotated.mock.calls[0]!;
    // Домик — на +Z, горка — между ним и −Z, её нижний конец — дальше от домика по −Z.
    expect(house?.[3]).toBeGreaterThan(0);
    expect(sz).toBeLessThan(house?.[3] ?? 0);
    expect(angle).toBeLessThan(-0.2);
    expect(sy - (Math.sin(-angle) * length) / 2).toBeLessThan(0.4);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(-3.5 - 1e-6);
    expect(geometry.boundingBox!.max.z).toBeLessThanOrEqual(3.5 + 1e-6);
    expect(batch.vertices).toBeLessThanOrEqual(350);
    vi.restoreAllMocks();
  });
});
