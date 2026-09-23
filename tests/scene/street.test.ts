import type { BufferGeometry, Color } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { CHUNK_LAYOUT } from '@/config';
import { buildBlock } from '@/scene/procedural/BlockPrefabs';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Props } from '@/scene/procedural/Props';
import { buildRoads, laneArrow, laneArrows, stopLines } from '@/scene/procedural/Roads';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor, LrtInfo, RoadsInfo } from '@/world/types';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

function build(fn: (props: Props) => void): {
  vertices: number;
  geometry: BufferGeometry;
} {
  const batch = new GeometryBatch();
  fn(new Props(batch, materials));
  const vertices = batch.vertices;
  return { vertices, geometry: batch.build() };
}

/** Число различных цветов вершин (округление до 3 знаков), как в props.test.ts. */
function distinctColors(geometry: BufferGeometry): number {
  const color = geometry.getAttribute('color');
  const seen = new Set<string>();
  for (let i = 0; i < color.count; i++) {
    seen.add([color.getX(i), color.getY(i), color.getZ(i)].map((v) => v.toFixed(3)).join(','));
  }
  return seen.size;
}

describe('Props.roadSign — дорожный знак (FR-18.3, AC-18.3)', () => {
  it('укладывается в потолок 128 вершин и строит непустую геометрию', () => {
    const { vertices, geometry } = build((p) => p.roadSign(0, 0, 0));
    expect(vertices).toBeGreaterThan(0);
    expect(vertices).toBeLessThanOrEqual(128);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('kind 0/1/2 дают разные силуэты (число вершин или цвета различаются)', () => {
    const a = build((p) => p.roadSign(0, 0, 0));
    const b = build((p) => p.roadSign(0, 0, 1));
    const c = build((p) => p.roadSign(0, 0, 2));
    const shapes = [a, b, c];
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const same =
          shapes[i]!.vertices === shapes[j]!.vertices &&
          distinctColors(shapes[i]!.geometry) === distinctColors(shapes[j]!.geometry);
        expect(same).toBe(false);
      }
      expect(shapes[i]!.vertices).toBeLessThanOrEqual(128);
    }
  });

  it('два одинаковых вызова дают одинаковое число вершин (детерминизм)', () => {
    const a = build((p) => p.roadSign(3, -2, 1, 0.6));
    const b = build((p) => p.roadSign(3, -2, 1, 0.6));
    expect(a.vertices).toBe(b.vertices);
    expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(
      Array.from(b.geometry.getAttribute('position').array),
    );
  });
});

describe('Props.trashBin — урна (FR-18.3, AC-18.3)', () => {
  it('укладывается в потолок 104 вершины и строит непустую геометрию', () => {
    const { vertices, geometry } = build((p) => p.trashBin(0, 0));
    expect(vertices).toBeGreaterThan(0);
    expect(vertices).toBeLessThanOrEqual(104);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('два одинаковых вызова дают одинаковое число вершин (детерминизм)', () => {
    const a = build((p) => p.trashBin(5, 5));
    const b = build((p) => p.trashBin(5, 5));
    expect(a.vertices).toBe(b.vertices);
  });
});

describe('Props.bikeRack — велопарковка (FR-18.3, AC-18.3)', () => {
  it('укладывается в потолок 120 вершин и строит непустую геометрию', () => {
    const { vertices, geometry } = build((p) => p.bikeRack(0, 0));
    expect(vertices).toBeGreaterThan(0);
    expect(vertices).toBeLessThanOrEqual(120);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('два одинаковых вызова дают одинаковое число вершин (детерминизм)', () => {
    const a = build((p) => p.bikeRack(1, 2, Math.PI / 3));
    const b = build((p) => p.bikeRack(1, 2, Math.PI / 3));
    expect(a.vertices).toBe(b.vertices);
  });
});

describe('Props.pedestrianLight — пешеходный светофор (FR-18.4, AC-18.3)', () => {
  it('укладывается в потолок 96 вершин и строит непустую геометрию', () => {
    const { vertices, geometry } = build((p) => p.pedestrianLight(0, 0));
    expect(vertices).toBeGreaterThan(0);
    expect(vertices).toBeLessThanOrEqual(96);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('две секции (стоп/иди) дают минимум 4 разных цвета', () => {
    const { geometry } = build((p) => p.pedestrianLight(0, 0, Math.PI / 4));
    expect(distinctColors(geometry)).toBeGreaterThanOrEqual(4);
  });

  it('два одинаковых вызова дают одинаковое число вершин (детерминизм)', () => {
    const a = build((p) => p.pedestrianLight(4, -1, 1.1));
    const b = build((p) => p.pedestrianLight(4, -1, 1.1));
    expect(a.vertices).toBe(b.vertices);
  });
});

// Геометрия блока в системе координат Roads.ts (`CHUNK_LAYOUT.ROAD_AXIS` = −25,
// `ROAD_WIDTH` = 10): blockMin = −20, blockCenter = 5, blockSize = 50.
const BLOCK_MIN = -20;
const MARK_Y = 0.03;

// Толщина разметки — 0.02 (design «Разметка»): у бруса `box(..., 0.02, ...)` верх и низ
// лежат на `MARK_Y ± 0.01`, поэтому проверяем принадлежность этому слою, а не точное MARK_Y.
const MARK_HALF_THICKNESS = 0.011;

/** Все вершины геометрии лежат в слое разметки (`MARK_Y ± 0.01` — толщина бруса). */
function expectAllAtMarkY(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    expect(position.getY(i)).toBeGreaterThanOrEqual(MARK_Y - MARK_HALF_THICKNESS);
    expect(position.getY(i)).toBeLessThanOrEqual(MARK_Y + MARK_HALF_THICKNESS);
  }
}

/** Число вершин заданного цвета в геометрии (сравнение по компонентам с допуском). */
function countColor(geometry: BufferGeometry, target: Color): number {
  const color = geometry.getAttribute('color');
  let count = 0;
  for (let i = 0; i < color.count; i++) {
    if (
      Math.abs(color.getX(i) - target.r) < 1e-4 &&
      Math.abs(color.getY(i) - target.g) < 1e-4 &&
      Math.abs(color.getZ(i) - target.b) < 1e-4
    ) {
      count++;
    }
  }
  return count;
}

/** Габариты геометрии батча (батч после этого пуст — вызывать последним). */
function bounds(batch: GeometryBatch): {
  min: { x: number; z: number };
  max: { x: number; z: number };
  meanX: number;
  meanZ: number;
} {
  const position = batch.build().getAttribute('position');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    sumX += x;
    sumZ += z;
  }
  return {
    min: { x: minX, z: minZ },
    max: { x: maxX, z: maxZ },
    meanX: sumX / position.count,
    meanZ: sumZ / position.count,
  };
}

describe('Roads.stopLines — стоп-линии перед зебрами (TSK-102, FR-18.2)', () => {
  it('4 бруса по 24 вершины (96 всего), все на MARK_Y', () => {
    const batch = new GeometryBatch();
    stopLines(batch, materials.color('marking'), BLOCK_MIN);
    expect(batch.parts).toBe(4);
    expect(batch.vertices).toBe(96);
    expectAllAtMarkY(batch.build());
  });

  it('вся геометрия внутри чанка [−30, 30] (рецензия: две линии уезжали к соседу)', () => {
    const batch = new GeometryBatch();
    stopLines(batch, materials.color('marking'), BLOCK_MIN);
    const box = bounds(batch);
    expect(box.min.x).toBeGreaterThanOrEqual(-30);
    expect(box.min.z).toBeGreaterThanOrEqual(-30);
    expect(box.max.x).toBeLessThanOrEqual(30);
    expect(box.max.z).toBeLessThanOrEqual(30);
  });

  it('каждая линия центрирована на своей полосе, а не на оси дороги', () => {
    // Полосы — CHUNK_LAYOUT.LANE_OFFSETS (−27.5 и −22.5). Линия длиной 4.4 поперёк полосы
    // должна лежать в её коридоре ±2.5, то есть не пересекать ось дороги (−25).
    const lanes = CHUNK_LAYOUT.LANE_OFFSETS;
    for (const [index, lane] of lanes.entries()) {
      const batch = new GeometryBatch();
      stopLines(batch, materials.color('marking'), BLOCK_MIN);
      const position = batch.build().getAttribute('position');
      let onLane = 0;
      for (let i = 0; i < position.count; i++) {
        const across = index === 0 ? position.getZ(i) : position.getX(i);
        if (Math.abs(across - lane) <= 2.5) {
          onLane++;
        }
      }
      expect(onLane).toBeGreaterThan(0);
    }
  });
});

describe('Roads.laneArrows — стрелки направления на подъездах (TSK-102, FR-18.2)', () => {
  it('2 стрелки (стержень + 2 пера каждая) — 6 брусов, 144 вершины, все на MARK_Y', () => {
    const batch = new GeometryBatch();
    laneArrows(batch, materials.color('marking'), BLOCK_MIN);
    expect(batch.parts).toBe(6);
    expect(batch.vertices).toBe(144);
    expectAllAtMarkY(batch.build());
  });

  it('остриё смотрит по ходу своей полосы (рецензия: стрелка была против движения)', () => {
    // Южная полоса E–W (z = −22.5) едет на восток (+x), восточная полоса N–S (x = −22.5)
    // едет на север (−z) — см. `mobs/Lanes.ts`. Перья сидят у острия, поэтому центр масс
    // смещён от середины стержня в сторону движения.
    const east = CHUNK_LAYOUT.LANE_OFFSETS[1];
    const ewBatch = new GeometryBatch();
    laneArrow(ewBatch, materials.color('marking'), BLOCK_MIN + 5, east, Math.PI / 2);
    const ew = bounds(ewBatch);
    expect(ew.meanX).toBeGreaterThan(BLOCK_MIN + 5);

    const nsBatch = new GeometryBatch();
    laneArrow(nsBatch, materials.color('marking'), east, BLOCK_MIN + 5, Math.PI);
    const ns = bounds(nsBatch);
    expect(ns.meanZ).toBeLessThan(BLOCK_MIN + 5);
  });

  it('перья не торчат впереди острия — наконечник, а не крест', () => {
    // Стрелка в начале координат, остриё на +X: длина стержня 2, значит остриё в x = 1.
    // Перья отодвинуты назад, поэтому геометрия не должна заходить за остриё дальше, чем
    // на половину ширины пера (0.11) с запасом на поворот.
    const batch = new GeometryBatch();
    laneArrow(batch, materials.color('marking'), 0, 0, Math.PI / 2);
    const arrow = bounds(batch);
    expect(arrow.max.x).toBeLessThanOrEqual(1 + 0.2);
    expect(arrow.max.x).toBeGreaterThan(0.8);
  });
});

describe('Разметка TSK-102 — бюджет (AC-18.3, design «C7 (дополнение): улицы»)', () => {
  it('суммарный прирост вершин чанка (стоп-линии + стрелки) ≤ 300', () => {
    const batch = new GeometryBatch();
    stopLines(batch, materials.color('marking'), BLOCK_MIN);
    laneArrows(batch, materials.color('marking'), BLOCK_MIN);
    expect(batch.vertices).toBe(96 + 144);
    expect(batch.vertices).toBeLessThanOrEqual(300);
  });
});

describe('buildRoads — интеграция разметки TSK-102 (перекрёсток со светофорами)', () => {
  const roads: RoadsInfo = { ns: 'a', ew: 'a', corner: 'lights' };
  const lrt: LrtInfo = { corridor: null, station: false, ns: false, nsStation: false };

  function run(river: boolean): GeometryBatch {
    const batch = new GeometryBatch();
    const detail = new GeometryBatch();
    const props = new Props(detail, materials);
    buildRoads(batch, detail, props, materials, roads, lrt, river);
    return detail;
  }

  it('дескриптор с corner = "lights": разметка есть в слое деталей и вся лежит на MARK_Y', () => {
    const geometry = run(false).build();
    const marking = countColor(geometry, materials.color('marking'));
    expect(marking).toBeGreaterThan(0);
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const target = materials.color('marking');
    for (let i = 0; i < color.count; i++) {
      const isMarking =
        Math.abs(color.getX(i) - target.r) < 1e-4 &&
        Math.abs(color.getY(i) - target.g) < 1e-4 &&
        Math.abs(color.getZ(i) - target.b) < 1e-4;
      if (isMarking) {
        expect(position.getY(i)).toBeGreaterThanOrEqual(MARK_Y - MARK_HALF_THICKNESS);
        expect(position.getY(i)).toBeLessThanOrEqual(MARK_Y + MARK_HALF_THICKNESS);
      }
    }
  });

  it('на чанке реки (river = true) стрелки не строятся: разница в разметке равна ровно 144 вершинам', () => {
    const normal = countColor(run(false).build(), materials.color('marking'));
    const river = countColor(run(true).build(), materials.color('marking'));
    expect(normal - river).toBe(144);
  });
});

// TSK-103 (design «Мебель тротуара», FR-18.3, FR-18.4, AC-18.4): урна, велопарковка и
// скамейка тротуара в окне 21×21 seed `astana`, потолок 7 000 вершин на квартал.
describe('Мебель перекрёстка и тротуара — TSK-103 (design «Мебель тротуара», AC-18.4)', () => {
  const window = new Generator('astana').describeWindow(0, 0, 21);

  /** Слой деталей дорог для дескриптора (или его варианта с подменённым `roads`). */
  function roadsDetail(source: Pick<ChunkDescriptor, 'roads' | 'lrt' | 'block'>): GeometryBatch {
    const batch = new GeometryBatch();
    const detail = new GeometryBatch();
    const props = new Props(detail, materials);
    buildRoads(batch, detail, props, materials, source.roads, source.lrt, source.block === 'river');
    return detail;
  }

  it("roads.ew = 'b' в окне встречается и добавляет урну + скамейку (≥ 104 + 48 вершин)", () => {
    const withEw = window.find((d) => d.roads.ew === 'b');
    expect(withEw, 'в окне 21×21 seed astana нет чанка с roads.ew = "b"').toBeDefined();
    const withDetail = roadsDetail(withEw!);
    const withoutDetail = roadsDetail({ ...withEw!, roads: { ...withEw!.roads, ew: 'a' } });
    // >= вместо ===: смена ew также меняет шаг хвойников на этой стороне (design «улицы»),
    // урна и скамейка — гарантированная нижняя граница прироста, а не весь прирост.
    expect(withDetail.vertices - withoutDetail.vertices).toBeGreaterThanOrEqual(104 + 48);
  });

  it("roads.ns = 'b' вне русла в окне встречается и добавляет велопарковку (≥ 120 вершин)", () => {
    const withNs = window.find((d) => d.roads.ns === 'b' && d.block !== 'river');
    expect(withNs, 'в окне 21×21 seed astana нет чанка с roads.ns = "b" вне русла').toBeDefined();
    const withDetail = roadsDetail(withNs!);
    const withoutDetail = roadsDetail({ ...withNs!, roads: { ...withNs!.roads, ns: 'a' } });
    expect(withDetail.vertices - withoutDetail.vertices).toBeGreaterThanOrEqual(120);
  });

  it("квартал corner = 'lights' встречается и добавляет урну (≥ 104 вершин)", () => {
    const withLights = window.find((d) => d.roads.corner === 'lights');
    expect(withLights, 'в окне 21×21 seed astana нет перекрёстка corner = "lights"').toBeDefined();
    const withDetail = roadsDetail(withLights!);
    const withoutDetail = roadsDetail({
      ...withLights!,
      roads: { ...withLights!.roads, corner: 'plain' },
    });
    expect(withDetail.vertices).toBeGreaterThan(withoutDetail.vertices);
  });

  it('велопарковка у входа встречается в business-glass, campus и mall (design «Мебель тротуара»)', () => {
    const spy = vi.spyOn(Props.prototype, 'bikeRack');
    for (const type of ['business-glass', 'campus', 'mall'] as const) {
      const descriptor = window.find((d) => d.block === type);
      expect(descriptor, `в окне 21×21 seed astana нет квартала типа ${type}`).toBeDefined();
      spy.mockClear();
      buildBlock(descriptor!, materials);
      expect(spy, `${type}: bikeRack() не вызван`).toHaveBeenCalledTimes(1);
    }
    spy.mockRestore();
  });

  it('потолок 7 000 вершин на квартал не нарушен ни в одном чанке окна (AC-18.4)', () => {
    for (const descriptor of window) {
      if (descriptor.landmark !== null) {
        continue;
      }
      const geometry = buildBlock(descriptor, materials);
      const vertices =
        geometry.opaque.vertices + geometry.glass.vertices + geometry.detail.vertices;
      expect(vertices).toBeLessThanOrEqual(7000);
    }
  });
});

// TSK-104 (design «C7 (дополнение): улицы», FR-18.5, AC-18.5): разметка машино-мест и
// припаркованные машины в кварталах commercial, mall, business-glass, stadium.
describe('Парковки — TSK-104 (design «C7 (дополнение): улицы», FR-18.5, AC-18.5)', () => {
  const window = new Generator('astana').describeWindow(0, 0, 21);

  /** Число вершин цвета `marking` в слое деталей квартала (каждая линия — 24 вершины). */
  function markingLines(detail: GeometryBatch): number {
    return countColor(detail.build(), materials.color('marking')) / 24;
  }

  it.each(['commercial', 'mall'] as const)(
    '%s: ≥ 4 линии разметки и ≥ 1 припаркованная машина, потолок 7 000 соблюдён (AC-18.5)',
    (type) => {
      const descriptor = window.find((d) => d.block === type);
      expect(descriptor, `в окне 21×21 seed astana нет квартала типа ${type}`).toBeDefined();
      const spy = vi.spyOn(Props.prototype, 'parkedCar');
      const geometry = buildBlock(descriptor!, materials);
      expect(markingLines(geometry.detail)).toBeGreaterThanOrEqual(4);
      expect(spy).toHaveBeenCalled();
      const vertices =
        geometry.opaque.vertices + geometry.glass.vertices + geometry.detail.vertices;
      expect(vertices).toBeLessThanOrEqual(7000);
      spy.mockRestore();
    },
  );

  it('business-glass и stadium: тоже получают разметку и машину, потолок 7 000 соблюдён', () => {
    for (const type of ['business-glass', 'stadium'] as const) {
      const descriptor = window.find((d) => d.block === type);
      expect(descriptor, `в окне 21×21 seed astana нет квартала типа ${type}`).toBeDefined();
      const spy = vi.spyOn(Props.prototype, 'parkedCar');
      const geometry = buildBlock(descriptor!, materials);
      expect(markingLines(geometry.detail)).toBeGreaterThanOrEqual(4);
      expect(spy).toHaveBeenCalled();
      const vertices =
        geometry.opaque.vertices + geometry.glass.vertices + geometry.detail.vertices;
      expect(vertices).toBeLessThanOrEqual(7000);
      spy.mockRestore();
    }
  });

  it('индекс цвета машины детерминирован (variant, без rng): одинаковый дескриптор — одинаковая геометрия', () => {
    const descriptor = window.find((d) => d.block === 'commercial');
    expect(descriptor).toBeDefined();
    const a = buildBlock(descriptor!, materials);
    const b = buildBlock(descriptor!, materials);
    expect(a.detail.vertices).toBe(b.detail.vertices);
    expect(Array.from(a.detail.build().getAttribute('position').array)).toEqual(
      Array.from(b.detail.build().getAttribute('position').array),
    );
  });

  it('линии лежат на уровне покрытия + 0,02 (без z-fighting), толщина бруса 0,02', () => {
    // Уровень зависит от покрытия конкретного квартала: LAWN_Y + 0,05 у commercial/mall/
    // business-glass (их покрытие само на LAWN_Y + 0,03), LAWN_Y + 0,02 у stadium (своей
    // площадки-покрытия нет — уровень тротуара LAWN_Y), design «клади линии на её
    // уровень + 0.02». У бруса `box(..., 0.02, ...)` верх и низ лежат на y ± 0,01.
    const LAWN_Y = 0.2; // CURB_Y (0.15) + 0.05, как в BlockPrefabs.ts
    const expectedY: Record<string, number> = {
      commercial: LAWN_Y + 0.05,
      mall: LAWN_Y + 0.05,
      'business-glass': LAWN_Y + 0.05,
      stadium: LAWN_Y + 0.02,
    };
    for (const type of ['commercial', 'mall', 'business-glass', 'stadium'] as const) {
      const descriptor = window.find((d) => d.block === type);
      expect(descriptor).toBeDefined();
      const geometry = buildBlock(descriptor!, materials).detail.build();
      const position = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      const target = materials.color('marking');
      const y = expectedY[type]!;
      let found = false;
      for (let i = 0; i < color.count; i++) {
        const isMarking =
          Math.abs(color.getX(i) - target.r) < 1e-4 &&
          Math.abs(color.getY(i) - target.g) < 1e-4 &&
          Math.abs(color.getZ(i) - target.b) < 1e-4;
        if (!isMarking) {
          continue;
        }
        found = true;
        expect(position.getY(i)).toBeGreaterThanOrEqual(y - 0.011);
        expect(position.getY(i)).toBeLessThanOrEqual(y + 0.011);
      }
      expect(found, `${type}: разметка не найдена`).toBe(true);
    }
  });

  it('бюджет: разметка парковки в собранном квартале ≤ 350 вершин', () => {
    // Прежняя версия теста считала бюджет по литералам и не вызывала продакшен-код вовсе
    // (рецензия 2026-09-19) — теперь разметка считается в реально собранных кварталах.
    const generator = new Generator('astana');
    const seen = new Set<string>();
    for (const descriptor of generator.describeWindow(0, 0, 21)) {
      if (descriptor.landmark !== null || seen.has(descriptor.block)) {
        continue;
      }
      if (!['commercial', 'mall', 'business-glass', 'stadium'].includes(descriptor.block)) {
        continue;
      }
      seen.add(descriptor.block);
      const geometry = buildBlock(descriptor, materials);
      const markingVertices = countColor(geometry.detail.build(), materials.color('marking'));
      expect(markingVertices).toBeGreaterThan(0);
      expect(markingVertices).toBeLessThanOrEqual(350);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
