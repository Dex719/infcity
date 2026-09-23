import { type BufferGeometry, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AO, ROOF } from '@/config';
import { Materials } from '@/scene/Materials';
import { parsePalette, type PaletteKey } from '@/scene/palette';
import { AWNING_TILT, Buildings, FLOOR, type Footprint } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { CHUNK_HIDDEN, hiddenSides, type HiddenSides } from '@/scene/procedural/Visibility';
import { mulberry32 } from '@/world/Hash';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

/**
 * Доступ к приватным `plinth`/`cornice`/`balconies` для точечной проверки геометрии
 * (design «C7: фасады»).
 */
interface FacadeInternals {
  plinth: (f: Footprint) => void;
  cornice: (f: Footprint, top: number) => void;
  balconies: (f: Footprint, floors: number, color: PaletteKey) => void;
  entrance: (f: Footprint, side?: 'x' | 'z') => void;
  storefront: (f: Footprint) => void;
}

function freshBuildings(hidden: HiddenSides = CHUNK_HIDDEN): {
  buildings: Buildings;
  opaque: GeometryBatch;
  glass: GeometryBatch;
  detail: GeometryBatch;
} {
  const opaque = new GeometryBatch();
  const glass = new GeometryBatch();
  const detail = new GeometryBatch();
  const buildings = new Buildings(opaque, glass, materials, mulberry32(1), hidden, detail);
  return { buildings, opaque, glass, detail };
}

/** Вершины цвета `key` из построенной геометрии батча (как в tests/scene/hidden.test.ts). */
function verticesOfColor(batch: GeometryBatch, key: PaletteKey): Vector3[] {
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

/**
 * Вершины оттенка `key` с запечённым AO (FR-19.1): цвет вершины — цвет палитры, умноженный на
 * один множитель из `[AO.WALL_MIN, 1]` по всем трём каналам.
 */
function verticesOfHue(batch: GeometryBatch, key: PaletteKey): Vector3[] {
  const geometry = batch.build();
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const wanted = materials.color(key);
  const found: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    const k = color.getY(i) / wanted.g;
    if (
      k >= AO.WALL_MIN - 1e-6 &&
      k <= 1 + 1e-6 &&
      Math.abs(color.getX(i) - wanted.r * k) < 1e-4 &&
      Math.abs(color.getZ(i) - wanted.b * k) < 1e-4
    ) {
      found.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }
  }
  return found;
}

describe('plinth/cornice — примитивы (FR-18.6, design «C7: фасады»)', () => {
  const f: Footprint = { x: 5, z: -3, w: 16, d: 12 };
  const top = 24.3;

  it('plinth: один бокс (w+0.3)×0.6×(d+0.3) цвета concrete у земли, с AO контакта (FR-19.1)', () => {
    const { buildings, opaque } = freshBuildings();
    const internals = buildings as unknown as FacadeInternals;
    internals.plinth(f);
    expect(opaque.parts).toBe(1);
    expect(opaque.vertices).toBe(24);
    const vertices = verticesOfHue(opaque, 'concrete');
    expect(vertices.length).toBe(24);
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    const zs = vertices.map((v) => v.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(f.w + 0.3, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.6, 5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(f.d + 0.3, 5);
    // Стоит у земли: нижняя грань на y = 0.
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
  });

  it('cornice: один бокс (w+0.5)×0.25×(d+0.5) цвета white чуть ниже top', () => {
    const { buildings, opaque } = freshBuildings();
    const internals = buildings as unknown as FacadeInternals;
    internals.cornice(f, top);
    expect(opaque.parts).toBe(1);
    expect(opaque.vertices).toBe(24);
    const vertices = verticesOfColor(opaque, 'white');
    expect(vertices.length).toBe(24);
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    const zs = vertices.map((v) => v.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(f.w + 0.5, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.25, 5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(f.d + 0.5, 5);
    // Не выступает выше top — карниз лежит целиком под кровлей.
    expect(Math.max(...ys)).toBeLessThanOrEqual(top);
  });
});

/** Отключает `plinth`/`cornice` на конкретном экземпляре — для замера прироста от них. */
function withoutFacadeDetails(buildings: Buildings): void {
  const internals = buildings as unknown as FacadeInternals;
  internals.plinth = (): void => {};
  internals.cornice = (): void => {};
}

interface FacadeCase {
  readonly name: string;
  readonly build: (b: Buildings) => void;
}

const CASES: FacadeCase[] = [
  {
    name: 'panelHouse',
    build: (b) => {
      b.panelHouse({ x: 0, z: 0, w: 16, d: 12 }, 9);
    },
  },
  {
    name: 'modernTower',
    build: (b) => {
      b.modernTower({ x: 0, z: 0, w: 12, d: 12 }, 10);
    },
  },
  {
    name: 'shopRow',
    build: (b) => {
      b.shopRow({ x: 0, z: 0, w: 20, d: 10 }, 2, 'sand', 'accent-red');
    },
  },
  {
    name: 'campusHall',
    build: (b) => {
      b.campusHall({ x: 0, z: 0, w: 36, d: 12 }, 3);
    },
  },
  {
    name: 'mall',
    build: (b) => {
      b.mall({ x: 0, z: 0, w: 40, d: 24 }, 'gold');
    },
  },
];

describe('Цоколь и карниз во всех пяти типах домов (TSK-105, FR-18.6)', () => {
  for (const { name, build } of CASES) {
    it(`${name}: прирост батча +2 частей и ровно 48 вершин (цоколь + карниз)`, () => {
      const full = freshBuildings();
      build(full.buildings);

      const without = freshBuildings();
      withoutFacadeDetails(without.buildings);
      build(without.buildings);

      const partsDelta = full.opaque.parts - without.opaque.parts;
      const verticesDelta = full.opaque.vertices - without.opaque.vertices;

      expect(partsDelta).toBe(2);
      expect(verticesDelta).toBe(48);
      expect(verticesDelta).toBeLessThanOrEqual(48);
    });
  }
});

/** Отключает `balconies` на конкретном экземпляре — для замера прироста от неё отдельно. */
function withoutBalconies(buildings: Buildings): void {
  const internals = buildings as unknown as FacadeInternals;
  internals.balconies = (): void => {};
}

describe('Балконы (TSK-106, FR-18.6, AC-18.6)', () => {
  it('panelHouse на 9 этажей: ≥ 4 балкона в слое деталей, не больше 8 балконов и 384 вершин', () => {
    const f: Footprint = { x: 0, z: 0, w: 16, d: 12 };

    const full = freshBuildings();
    full.buildings.panelHouse(f, 9);

    const without = freshBuildings();
    withoutBalconies(without.buildings);
    without.buildings.panelHouse(f, 9);

    // Каждый балкон — 2 бокса (плита + ограждение) = 48 вершин; сверяем только слой деталей
    // (D14), в основной батч балконы не попадают.
    const partsDelta = full.detail.parts - without.detail.parts;
    const verticesDelta = full.detail.vertices - without.detail.vertices;
    const balconyCount = partsDelta / 2;

    expect(without.opaque.vertices).toBe(full.opaque.vertices);
    expect(balconyCount).toBeGreaterThanOrEqual(4);
    expect(balconyCount).toBeLessThanOrEqual(8);
    expect(verticesDelta).toBe(balconyCount * 48);
    expect(verticesDelta).toBeLessThanOrEqual(384);
  });

  it('modernTower: балконы тоже строятся, в пределах бюджета 8 балконов / 384 вершины', () => {
    const f: Footprint = { x: 0, z: 0, w: 14, d: 14 };

    const full = freshBuildings();
    full.buildings.modernTower(f, 12);

    const without = freshBuildings();
    withoutBalconies(without.buildings);
    without.buildings.modernTower(f, 12);

    const partsDelta = full.detail.parts - without.detail.parts;
    const verticesDelta = full.detail.vertices - without.detail.vertices;
    const balconyCount = partsDelta / 2;

    expect(balconyCount).toBeGreaterThanOrEqual(4);
    expect(balconyCount).toBeLessThanOrEqual(8);
    expect(verticesDelta).toBeLessThanOrEqual(384);
  });

  it('балконы стоят только на видимой стороне: сторона по Z переворачивается вместе с hidden.z', () => {
    const f: Footprint = { x: 2, z: -4, w: 16, d: 12 };
    const floors = 9;

    function balconyZSigns(hidden: HiddenSides): number[] {
      const { buildings, detail } = freshBuildings(hidden);
      const internals = buildings as unknown as FacadeInternals;
      internals.balconies(f, floors, 'accent-red');
      const geometry = detail.build();
      const position = geometry.getAttribute('position');
      const signs = new Set<number>();
      for (let i = 0; i < position.count; i++) {
        signs.add(Math.sign(position.getZ(i) - f.z));
      }
      return [...signs];
    }

    // hidden.z = -1 → скрыта сторона −Z, видимая +Z: все балконы на +Z.
    const whenHiddenNegZ = balconyZSigns({ x: -1, z: -1 });
    expect(whenHiddenNegZ.length).toBeGreaterThan(0);
    expect(whenHiddenNegZ.every((sign) => sign > 0)).toBe(true);

    // hidden.z = 1 → скрыта сторона +Z, видимая −Z: все балконы переезжают на −Z.
    const whenHiddenPosZ = balconyZSigns({ x: -1, z: 1 });
    expect(whenHiddenPosZ.length).toBeGreaterThan(0);
    expect(whenHiddenPosZ.every((sign) => sign < 0)).toBe(true);
  });
});

/** Отключает `entrance` на конкретном экземпляре — для замера прироста от неё отдельно. */
function withoutEntrance(buildings: Buildings): void {
  const internals = buildings as unknown as FacadeInternals;
  internals.entrance = (): void => {};
}

describe('Входная группа (TSK-107, FR-18.6, AC-18.6)', () => {
  const f: Footprint = { x: 0, z: 0, w: 16, d: 12 };

  it('panelHouse: крыльцо и 2 ступени в основном батче, козырёк и 2 стойки в слое деталей, ≤ 168 вершин', () => {
    const full = freshBuildings();
    full.buildings.panelHouse(f, 9);

    const without = freshBuildings();
    withoutEntrance(without.buildings);
    without.buildings.panelHouse(f, 9);

    // Крыльцо + 2 ступени — крупные объёмы, основной батч (design D14).
    const opaquePartsDelta = full.opaque.parts - without.opaque.parts;
    const opaqueVerticesDelta = full.opaque.vertices - without.opaque.vertices;
    expect(opaquePartsDelta).toBe(3);
    expect(opaqueVerticesDelta).toBe(72);

    // Козырёк + 2 стойки — мелочь, слой деталей (design D14).
    const detailPartsDelta = full.detail.parts - without.detail.parts;
    const detailVerticesDelta = full.detail.vertices - without.detail.vertices;
    expect(detailPartsDelta).toBe(3);
    expect(detailVerticesDelta).toBe(72);

    const totalVertices = opaqueVerticesDelta + detailVerticesDelta;
    expect(totalVertices).toBeLessThanOrEqual(168);
  });

  it('campusHall: тоже получает вход (крыльцо в основном батче, козырёк в слое деталей)', () => {
    const hallF: Footprint = { x: 0, z: 0, w: 36, d: 12 };

    const full = freshBuildings();
    full.buildings.campusHall(hallF, 3);

    const without = freshBuildings();
    withoutEntrance(without.buildings);
    without.buildings.campusHall(hallF, 3);

    expect(full.opaque.vertices - without.opaque.vertices).toBe(72);
    expect(full.detail.vertices - without.detail.vertices).toBe(72);
  });

  it('содержит крыльцо (concrete, основной батч) и ровно 2 ступени (concrete, основной батч)', () => {
    const { buildings, opaque } = freshBuildings();
    const internals = buildings as unknown as FacadeInternals;
    internals.entrance(f, 'z');

    // Крыльцо (1 бокс) + 2 ступени (2 бокса) — 3 части по 24 вершины, все concrete.
    expect(opaque.parts).toBe(3);
    const concreteVertices = verticesOfColor(opaque, 'concrete');
    expect(concreteVertices.length).toBe(72);
  });

  it('содержит козырёк (white, 1 бокс) на 2 стойках (steel, 2 бокса) в слое деталей', () => {
    const { buildings, detail } = freshBuildings();
    const internals = buildings as unknown as FacadeInternals;
    internals.entrance(f, 'z');

    const geometry = detail.build();
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const countColor = (key: PaletteKey): number => {
      const wanted = materials.color(key);
      let count = 0;
      for (let i = 0; i < position.count; i++) {
        if (
          Math.abs(color.getX(i) - wanted.r) < 1e-4 &&
          Math.abs(color.getY(i) - wanted.g) < 1e-4 &&
          Math.abs(color.getZ(i) - wanted.b) < 1e-4
        ) {
          count++;
        }
      }
      return count;
    };

    expect(countColor('white')).toBe(24); // козырёк — 1 бокс
    expect(countColor('steel')).toBe(48); // 2 стойки — по 24 вершины
  });

  it('вход стоит на видимой стороне при любом hidden (крыльцо, ступени и козырёк вместе)', () => {
    function entranceOutSigns(hidden: HiddenSides): number[] {
      const { buildings, opaque, detail } = freshBuildings(hidden);
      const internals = buildings as unknown as FacadeInternals;
      internals.entrance(f, 'z');
      const signs = new Set<number>();
      for (const batch of [opaque, detail]) {
        const geometry = batch.build();
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          signs.add(Math.sign(position.getZ(i) - f.z));
        }
      }
      return [...signs];
    }

    // hidden.z = -1 → скрыта сторона −Z, видимая +Z: весь вход на +Z.
    const whenHiddenNegZ = entranceOutSigns({ x: -1, z: -1 });
    expect(whenHiddenNegZ.length).toBeGreaterThan(0);
    expect(whenHiddenNegZ.every((sign) => sign > 0)).toBe(true);

    // hidden.z = 1 → скрыта сторона +Z, видимая −Z: весь вход переезжает на −Z.
    const whenHiddenPosZ = entranceOutSigns({ x: -1, z: 1 });
    expect(whenHiddenPosZ.length).toBeGreaterThan(0);
    expect(whenHiddenPosZ.every((sign) => sign < 0)).toBe(true);
  });
});

describe('Витрина торгового ряда (TSK-108, FR-18.6, AC-18.6)', () => {
  const f: Footprint = { x: 0, z: 0, w: 20, d: 10 };

  it('shopRow: непустой батч стекла и вывеска (белая накладка в слое деталей)', () => {
    const { buildings, glass, detail } = freshBuildings();
    buildings.shopRow(f, 2, 'sand', 'accent-red');

    expect(glass.isEmpty).toBe(false);
    const glassVertices = verticesOfColor(glass, 'window');
    expect(glassVertices.length).toBeGreaterThan(0);

    // Вывеска над витриной (storefront) — белый бокс с цветной накладкой, слой деталей.
    const signVertices = verticesOfColor(detail, 'white');
    expect(signVertices.length).toBeGreaterThan(0);
  });

  it('storefront: витрина (24) + 3 стойки (72) + вывеска (24) + накладка (24) = 144 вершины', () => {
    const { buildings, glass, detail } = freshBuildings();
    const internals = buildings as unknown as FacadeInternals;
    internals.storefront(f);

    expect(glass.vertices).toBe(24);
    expect(detail.parts).toBe(5); // 3 стойки + вывеска + накладка
    expect(detail.vertices).toBe(120);
    expect(glass.vertices + detail.vertices).toBeLessThanOrEqual(144);
    expect(glass.vertices + detail.vertices).toBe(144);
  });

  it('витрина строится на видимой стороне при обоих значениях hidden.z, а не жёстко на +Z', () => {
    function glassZSigns(hidden: HiddenSides): number[] {
      const { buildings, glass } = freshBuildings(hidden);
      const internals = buildings as unknown as FacadeInternals;
      internals.storefront(f);
      const geometry = glass.build();
      const position = geometry.getAttribute('position');
      const signs = new Set<number>();
      for (let i = 0; i < position.count; i++) {
        signs.add(Math.sign(position.getZ(i) - f.z));
      }
      return [...signs];
    }

    // hidden.z = -1 → скрыта сторона −Z, видимая +Z: витрина на +Z.
    const whenHiddenNegZ = glassZSigns({ x: -1, z: -1 });
    expect(whenHiddenNegZ.length).toBeGreaterThan(0);
    expect(whenHiddenNegZ.every((sign) => sign > 0)).toBe(true);

    // hidden.z = 1 → скрыта сторона +Z, видимая −Z: витрина переезжает на −Z.
    const whenHiddenPosZ = glassZSigns({ x: -1, z: 1 });
    expect(whenHiddenPosZ.length).toBeGreaterThan(0);
    expect(whenHiddenPosZ.every((sign) => sign < 0)).toBe(true);
  });
});

describe('Окна отдельными проёмами (FR-19.6, AC-19.6)', () => {
  const house: Footprint = { x: 0, z: 0, w: 16, d: 10 };
  const FLOORS = 9;

  /** Центры проёмов цвета `key`: вершины группируются по четвёркам (шаблон `planeXY`). */
  function windowCenters(batch: GeometryBatch, key: PaletteKey): Vector3[] {
    const vertices = verticesOfColor(batch, key);
    const centers: Vector3[] = [];
    for (let i = 0; i + 3 < vertices.length; i += 4) {
      const c = new Vector3();
      for (let j = 0; j < 4; j++) {
        c.add(vertices[i + j] ?? new Vector3());
      }
      centers.push(c.divideScalar(4));
    }
    return centers;
  }

  it('панельный дом 16 × 10, 9 этажей: ≥ 4 проёма на этаж на длинной видимой стороне', () => {
    const { buildings, opaque } = freshBuildings();
    buildings.panelHouse(house, FLOORS, 'sand');
    const centers = windowCenters(opaque, 'window');
    // Видимые стороны при CHUNK_HIDDEN (−X, −Z скрыты): +Z (длинная, 16) и +X (короткая, 10).
    const longSide = centers.filter((c) => c.z > house.d / 2);
    const shortSide = centers.filter((c) => c.x > house.w / 2);
    expect(longSide.length + shortSide.length).toBe(centers.length);
    expect(longSide.length / FLOORS).toBeGreaterThanOrEqual(4);
    expect(shortSide.length).toBeGreaterThan(0);
    // Ни одного проёма на скрытых сторонах.
    expect(centers.some((c) => c.z < -house.d / 2 || c.x < -house.w / 2)).toBe(false);
  });

  it('проёмы дешевле ленты итерации 4 по треугольникам и не выходят за углы', () => {
    const { buildings, opaque } = freshBuildings();
    buildings.panelHouse(house, FLOORS, 'sand');
    const windows = verticesOfColor(opaque, 'window');
    const windowTriangles = (windows.length / 4) * 2;
    const bandTriangles = 2 * FLOORS * 12;
    expect(windowTriangles).toBeLessThanOrEqual(bandTriangles);
    for (const v of windows) {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(house.w / 2 + 0.05);
      expect(Math.abs(v.z)).toBeLessThanOrEqual(house.d / 2 + 0.05);
    }
  });

  it('новостройка: за вертикальной полосой лоджий боковой стороны проёмов нет', () => {
    const { buildings, opaque } = freshBuildings();
    const tower: Footprint = { x: 0, z: 0, w: 14, d: 14 };
    buildings.modernTower(tower, 10, 'glass-teal');
    const side = windowCenters(opaque, 'window').filter((c) => c.x > tower.w / 2);
    expect(side.length).toBeGreaterThan(0);
    for (const c of side) {
      expect(Math.abs(c.z)).toBeGreaterThanOrEqual(tower.d * 0.175);
    }
  });
});

describe('Крыши: тёмная кровля и цветной парапет (FR-19.5, AC-19.5)', () => {
  type Build = (b: Buildings) => void;
  // [тип, сборка, высота плиты крыши (верх), цвет парапета, число стенок]
  const cases: readonly (readonly [string, Build, number, PaletteKey, number])[] = [
    [
      'panelHouse',
      (b) => b.panelHouse({ x: 0, z: 0, w: 16, d: 10 }, 9, 'sand'),
      9 * FLOOR + 0.4,
      'roof-red',
      4,
    ],
    [
      'modernTower',
      (b) => b.modernTower({ x: 0, z: 0, w: 14, d: 14 }, 10, 'gold'),
      10 * FLOOR + 0.4,
      'gold',
      4,
    ],
    [
      'glassTower',
      (b) => b.glassTower({ x: 0, z: 0, w: 16, d: 16 }, 10, 'glass-blue'),
      10 * FLOOR + 0.6,
      'white',
      4,
    ],
    [
      'shopRow',
      (b) => b.shopRow({ x: 0, z: 0, w: 20, d: 10 }, 2, 'brick', 'glass-teal'),
      2 * FLOOR + 0.3,
      'glass-teal',
      4,
    ],
    [
      'campusHall',
      (b) => b.campusHall({ x: 0, z: 0, w: 36, d: 12 }, 3),
      3 * FLOOR + 0.4,
      'glass-teal',
      4,
    ],
    ['mall', (b) => b.mall({ x: 0, z: 0, w: 40, d: 24 }, 'gold'), 12.5, 'white', 3],
  ];

  for (const [name, build, top, rim, walls] of cases) {
    it(`${name}: ${String(walls)} стенки парапета цвета ${rim}, кровля roof`, () => {
      const { buildings, opaque } = freshBuildings();
      build(buildings);
      const rimVertices = verticesOfHue(opaque, rim).filter(
        (v) => Math.abs(v.y - top) < 1e-4 || Math.abs(v.y - (top + ROOF.PARAPET_HEIGHT)) < 1e-4,
      );
      expect(rimVertices).toHaveLength(walls * 24);
      const { opaque: again } = (() => {
        const fresh = freshBuildings();
        build(fresh.buildings);
        return fresh;
      })();
      const roofTop = verticesOfColor(again, 'roof').filter((v) => Math.abs(v.y - top) < 1e-4);
      expect(roofTop.length).toBeGreaterThanOrEqual(4);
      expect(materials.color(rim).equals(materials.color('roof'))).toBe(false);
    });
  }

  it('панельный дом: цвет парапета выбирается по цвету стен без rng', () => {
    const rims = (['panel-grey', 'brick', 'sand', 'stone-light'] as const).map((wall) => {
      const { buildings, opaque } = freshBuildings();
      buildings.panelHouse({ x: 0, z: 0, w: 16, d: 10 }, 5, wall);
      const top = 5 * FLOOR + 0.4 + ROOF.PARAPET_HEIGHT;
      const geometry = opaque.build();
      const position = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getY(i) - top) < 1e-4) {
          return `${color.getX(i).toFixed(3)},${color.getY(i).toFixed(3)},${color.getZ(i).toFixed(3)}`;
        }
      }
      return '';
    });
    expect(rims.every((r) => r !== '')).toBe(true);
    expect(new Set(rims).size).toBe(4);
  });
});

describe('BUG-11: свод крытого рынка лежит, а не стоит башней', () => {
  it('красный свод не выше корпуса + 3 и не длиннее павильона', () => {
    const { buildings, opaque } = freshBuildings();
    const hall: Footprint = { x: 0, z: 0, w: 26, d: 16 };
    buildings.marketHall(hall);
    const vault = verticesOfColor(opaque, 'roof-red');
    expect(vault.length).toBeGreaterThan(0);
    const ys = vault.map((v) => v.y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(5 + 3 + 1e-5);
    expect(Math.max(...ys)).toBeGreaterThan(5 + 2.5);
    for (const v of vault) {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(hall.w / 2 + 1e-5);
      expect(Math.abs(v.z)).toBeLessThanOrEqual(hall.d / 2 + 1e-5);
    }
  });
});

describe('Стеклянные башни — навесная стена (FR-19.15, AC-19.16)', () => {
  const tower: Footprint = { x: 0, z: 0, w: 16, d: 16 };
  const FLOORS = 10;
  const H = FLOORS * FLOOR;

  it('≥ 4 вертикальных импоста во всю высоту на каждой видимой стороне, на скрытых — ни одного', () => {
    const { buildings, opaque } = freshBuildings();
    buildings.glassTower(tower, FLOORS, 'glass-blue');
    // Импост — стальной бокс от земли до верха: его нижние вершины — единственные стальные
    // на высоте 0 (пояса начинаются с первого этажа, антенна — над крышей).
    const steel = verticesOfColor(opaque, 'steel');
    const bottoms = steel.filter((v) => Math.abs(v.y) < 1e-4);
    const tops = steel.filter((v) => Math.abs(v.y - H) < 1e-4);
    expect(bottoms.length % 12).toBe(0);
    const count = bottoms.length / 12;
    expect(tops.length).toBeGreaterThanOrEqual(bottoms.length);
    expect(count).toBe(12);
    // При CHUNK_HIDDEN видимы +X и +Z. Внешняя грань импоста — на 0.1 от фасада: у каждого
    // импоста там ровно 6 нижних вершин, а угловые импосты другой стороны туда не достают.
    const onZ = bottoms.filter((v) => v.z >= tower.d / 2 + 0.099).length / 6;
    const onX = bottoms.filter((v) => v.x >= tower.w / 2 + 0.099).length / 6;
    expect(onZ).toBeGreaterThanOrEqual(4);
    expect(onX).toBeGreaterThanOrEqual(4);
    expect(onZ + onX).toBe(count);
    // На скрытых сторонах импостов нет: дальше угловых импостов видимых сторон ничего.
    expect(bottoms.some((v) => v.x < -tower.w / 2 - 0.09 || v.z < -tower.d / 2 - 0.09)).toBe(false);
  });
});

describe('Полосатые наклонные маркизы (FR-19.17, AC-19.18)', () => {
  const f: Footprint = { x: 0, z: 0, w: 26, d: 11 };
  const count = Math.floor(f.w / 4);
  const step = f.w / count;
  const tilt = { sin: Math.sin(AWNING_TILT), cos: Math.cos(AWNING_TILT) };

  interface Vertex {
    p: Vector3;
    n: Vector3;
  }

  /** Вершины цвета `key` из готовой геометрии (батч после `build()` пуст, поэтому один раз). */
  function ofColor(geometry: BufferGeometry, key: PaletteKey): Vertex[] {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const color = geometry.getAttribute('color');
    const wanted = materials.color(key);
    const found: Vertex[] = [];
    for (let i = 0; i < position.count; i++) {
      if (
        Math.abs(color.getX(i) - wanted.r) < 1e-4 &&
        Math.abs(color.getY(i) - wanted.g) < 1e-4 &&
        Math.abs(color.getZ(i) - wanted.b) < 1e-4
      ) {
        found.push({
          p: new Vector3(position.getX(i), position.getY(i), position.getZ(i)),
          n: new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)),
        });
      }
    }
    return found;
  }

  /** Номер маркизы по x вершины. */
  function slot(v: Vertex): number {
    return Math.floor((v.p.x - (f.x - f.w / 2)) / step);
  }

  it.each<[string, HiddenSides]>([
    ['видимая +Z', CHUNK_HIDDEN],
    ['видимая −Z', { x: 1, z: 1 }],
  ])(
    '%s: у каждой маркизы ≥ 2 белые полосы поверх, внешний край ниже, всё на видимой стороне',
    (_, hidden) => {
      const visibleZ = -hidden.z;
      const wallZ = f.z + (visibleZ * f.d) / 2;
      const { buildings, opaque } = freshBuildings(hidden);
      buildings.shopRow(f, 1, 'sand', 'accent-red');
      const geometry = opaque.build();
      // Верхняя грань наклонена наружу: нормаль (0, cos, ±sin) в сторону фасада.
      const facingUpOut = (v: Vertex): boolean =>
        Math.abs(v.n.y - tilt.cos) < 1e-3 && Math.abs(v.n.z * visibleZ - tilt.sin) < 1e-3;
      const tops = ofColor(geometry, 'accent-red').filter(facingUpOut);
      const stripes = ofColor(geometry, 'white').filter(facingUpOut);
      expect(tops).toHaveLength(count * 4);

      for (let i = 0; i < count; i++) {
        const top = tops.filter((v) => slot(v) === i);
        const own = stripes.filter((v) => slot(v) === i);
        expect(top).toHaveLength(4);
        // ≥ 2 полосы по 4 вершины — и все лежат над верхней гранью своей маркизы, не в ней.
        expect(own.length).toBeGreaterThanOrEqual(8);
        const anchor = top[0];
        expect(anchor).toBeDefined();
        if (anchor === undefined) {
          return;
        }
        for (const v of own) {
          const lift = v.p.clone().sub(anchor.p).dot(anchor.n);
          expect(lift).toBeGreaterThan(0.001);
          expect(lift).toBeLessThan(0.05);
        }
        // Внешний край (дальше от стены) ниже внутреннего.
        const out = (v: Vertex): number => (v.p.z - wallZ) * visibleZ;
        const near = top.filter((v) => out(v) < 0.7);
        const far = top.filter((v) => out(v) > 0.7);
        expect(near).toHaveLength(2);
        expect(far).toHaveLength(2);
        expect(Math.max(...far.map((v) => v.p.y))).toBeLessThan(
          Math.min(...near.map((v) => v.p.y)) - 0.3,
        );
      }

      // Все грани маркиз и полосы — снаружи видимой стены.
      for (const v of [...ofColor(geometry, 'accent-red'), ...stripes]) {
        if (Math.abs(v.n.z) > 0.1 && Math.abs(v.n.z) < 0.99) {
          expect((v.p.z - f.z) * visibleZ).toBeGreaterThan(f.d / 2);
        }
      }
    },
  );
});

describe('Кровля ТЦ: кондиционеры и фонари (FR-19.21, AC-19.22)', () => {
  const f: Footprint = { x: 0, z: -7, w: 40, d: 24 };
  const top = 12.5;

  /** Вершины цвета `key` из готовой геометрии. */
  function ofColor(geometry: BufferGeometry, key: PaletteKey, factor = 1): Vector3[] {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const wanted = materials.color(key).clone().multiplyScalar(factor);
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

  /** Объекты как группы вершин: соседние ближе `gap` по XZ — один объект (углы пирамиды — 2.55 от вершины). */
  function clusters(vertices: Vector3[], gap = 3): Vector3[][] {
    const groups: Vector3[][] = [];
    for (const v of vertices) {
      const near = groups.filter((g) => g.some((u) => Math.hypot(u.x - v.x, u.z - v.z) < gap));
      const merged = near.flat();
      merged.push(v);
      for (const g of near) {
        groups.splice(groups.indexOf(g), 1);
      }
      groups.push(merged);
    }
    return groups;
  }

  /** Центр габарита группы: у шаблонов с дублями вершин на шве среднее смещено к шву. */
  function center(group: Vector3[]): Vector3 {
    const xs = group.map((v) => v.x);
    const zs = group.map((v) => v.z);
    return new Vector3(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      0,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
  }

  it.each<[string, HiddenSides]>([
    ['видимая +Z', CHUNK_HIDDEN],
    ['видимая −Z', { x: 1, z: 1 }],
  ])(
    '%s: ≥ 8 вентиляторов и ≥ 3 фонаря внутри кровли, мимо полосы случайных деталей, с ореолами',
    (_, hidden) => {
      const s = -hidden.z;
      const { buildings, detail } = freshBuildings(hidden);
      buildings.mall(f, 'gold');
      const geometry = detail.build();
      const fans = clusters(ofColor(geometry, 'black'));
      const lights = clusters(ofColor(geometry, 'glass-blue'));
      expect(fans.length).toBeGreaterThanOrEqual(8);
      expect(lights.length).toBeGreaterThanOrEqual(3);
      // Ось вглубь кровли от фасада: полоса случайных деталей — v ∈ [−9.9, −6.1] с их размером.
      const v = (p: Vector3): number => (f.z - p.z) * s;
      for (const p of [...fans.flat(), ...lights.flat()]) {
        expect(p.y).toBeGreaterThan(top);
        expect(Math.abs(p.x - f.x)).toBeLessThan(f.w / 2 - 1);
        expect(Math.abs(p.z - f.z)).toBeLessThan(f.d / 2 - 1);
        expect(v(p)).toBeGreaterThan(-6.1);
      }
      // Ореол у каждой установки: внутренние углы кольца — цвет кровли × GROUND_MIN на кровле.
      const inner = ofColor(geometry, 'roof', AO.GROUND_MIN).filter(
        (p) => Math.abs(p.y - (top + AO.GROUND_LIFT)) < 1e-4,
      );
      for (const group of [...fans, ...lights]) {
        const c = center(group);
        const corners = inner.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < 3);
        expect(corners.length).toBeGreaterThanOrEqual(4);
      }
    },
  );

  it('случайные детали — в полосе у фасада; mall() тратит rng ровно как один roofDetails', () => {
    for (const hidden of [CHUNK_HIDDEN, { x: 1, z: 1 } as HiddenSides]) {
      const s = -hidden.z;
      const spy = vi.spyOn(Buildings.prototype, 'roofDetails');
      const a = mulberry32(42);
      new Buildings(new GeometryBatch(), new GeometryBatch(), materials, a, hidden).mall(f, 'gold');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toEqual({ x: f.x, z: f.z + s * 8, w: 41, d: 7 });
      spy.mockRestore();
      const b = mulberry32(42);
      new Buildings(new GeometryBatch(), new GeometryBatch(), materials, b, hidden).roofDetails(
        f,
        top,
      );
      expect(a()).toBe(b());
    }
  });
});

describe('Кондиционеры на кровлях торговых рядов и учебного корпуса (FR-19.22, AC-19.23)', () => {
  /** Вентиляторы — единственные вершины цвета `black` в слое деталей этих зданий. */
  function fans(detail: GeometryBatch): Vector3[] {
    const geometry = detail.build();
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const black = materials.color('black');
    const roof = materials.color('roof').clone().multiplyScalar(AO.GROUND_MIN);
    const groups: Vector3[][] = [];
    const inner: Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3(position.getX(i), position.getY(i), position.getZ(i));
      const is = (c: { r: number; g: number; b: number }): boolean =>
        Math.abs(color.getX(i) - c.r) < 1e-4 &&
        Math.abs(color.getY(i) - c.g) < 1e-4 &&
        Math.abs(color.getZ(i) - c.b) < 1e-4;
      if (is(black)) {
        const group = groups.find((g) => g.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.5));
        if (group === undefined) {
          groups.push([p]);
        } else {
          group.push(p);
        }
      } else if (is(roof)) {
        inner.push(p);
      }
    }
    // Центр вентилятора — центр габарита его вершин (дубли на шве смещают среднее).
    const centers = groups.map((g) => {
      const xs = g.map((q) => q.x);
      const zs = g.map((q) => q.z);
      return new Vector3(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        g[0]?.y ?? 0,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      );
    });
    // У каждого вентилятора — 4 внутренних угла ореола кровли (корпус 3 × 1.6…2: углы в 1.8).
    for (const c of centers) {
      expect(inner.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < 2.2).length).toBe(4);
    }
    return centers;
  }

  it.each<[string, HiddenSides]>([
    ['видимая +Z', CHUNK_HIDDEN],
    ['видимая −Z', { x: 1, z: 1 }],
  ])(
    '%s: торговый ряд — ⌊(L − 8) / 8⌋ + 1 установок за вывеской, мимо полосы деталей',
    (_, hidden) => {
      const s = -hidden.z;
      for (const f of [
        { x: -8, z: -12, w: 26, d: 11 },
        { x: 0, z: 15, w: 42, d: 11 },
      ]) {
        const { buildings, detail } = freshBuildings(hidden);
        buildings.shopRow(f, 2, 'sand', 'accent-red');
        const found = fans(detail);
        expect(found).toHaveLength(Math.floor((f.w - 8) / 8) + 1);
        for (const p of found) {
          const v = (f.z - p.z) * s;
          // За вывеской (v = −4.9) и за полосой случайных деталей (до v = 0.4), внутри кровли.
          expect(v).toBeGreaterThan(1.2);
          expect(v).toBeLessThan(f.d / 2 - 1);
          expect(Math.abs(p.x - f.x)).toBeLessThan(f.w / 2 - 1);
        }
      }
    },
  );

  it('торговый ряд: случайные детали — в полосе, rng тратится ровно как один roofDetails', () => {
    const f: Footprint = { x: 0, z: 15, w: 42, d: 11 };
    for (const hidden of [CHUNK_HIDDEN, { x: 1, z: 1 } as HiddenSides]) {
      const s = -hidden.z;
      const spy = vi.spyOn(Buildings.prototype, 'roofDetails');
      const a = mulberry32(7);
      new Buildings(new GeometryBatch(), new GeometryBatch(), materials, a, hidden).shopRow(
        f,
        2,
        'sand',
        'accent-red',
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toEqual({ x: f.x, z: f.z + s * 1.5, w: f.w - 1, d: 7 });
      spy.mockRestore();
      const b = mulberry32(7);
      new Buildings(new GeometryBatch(), new GeometryBatch(), materials, b, hidden).roofDetails(
        f,
        2 * FLOOR + 0.3,
      );
      expect(a()).toBe(b());
    }
  });

  it.each<[string, HiddenSides]>([
    ['видимая +Z', CHUNK_HIDDEN],
    ['видимая −Z', { x: 1, z: 1 }],
  ])('%s: учебный корпус — 4 установки по бокам купола, у задней кромки', (_, hidden) => {
    const s = -hidden.z;
    const f: Footprint = { x: 0, z: -9, w: 36, d: 12 };
    const { buildings, detail } = freshBuildings(hidden);
    buildings.campusHall(f, 3);
    const found = fans(detail);
    expect(found).toHaveLength(4);
    for (const p of found) {
      expect(Math.abs(p.x - f.x)).toBeGreaterThanOrEqual(6.5);
      expect(Math.abs(p.x - f.x)).toBeLessThan(f.w / 2 - 1);
      expect((f.z - p.z) * s).toBeGreaterThan(0);
    }
  });
});

describe('Пояса-плиты новостроек (FR-19.23, AC-19.24)', () => {
  const f: Footprint = { x: 0, z: 0, w: 12, d: 12 };
  const FLOORS = 10;

  interface Aabb {
    min: Vector3;
    max: Vector3;
  }

  /** Вершины цвета `key` в полосе высот уровня `i · FLOOR ± band` (i = 1…FLOORS − 1), по порядку. */
  function atLevels(geometry: BufferGeometry, key: PaletteKey, band: number): Vector3[] {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const wanted = materials.color(key);
    const found: Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const level = Math.round(y / FLOOR);
      if (
        level >= 1 &&
        level < FLOORS &&
        Math.abs(y - level * FLOOR) <= band + 1e-4 &&
        Math.abs(color.getX(i) - wanted.r) < 1e-4 &&
        Math.abs(color.getY(i) - wanted.g) < 1e-4 &&
        Math.abs(color.getZ(i) - wanted.b) < 1e-4
      ) {
        found.push(new Vector3(position.getX(i), y, position.getZ(i)));
      }
    }
    return found;
  }

  /** Бокс — 24 вершины подряд: габариты по группам. */
  function boxes(vertices: Vector3[]): Aabb[] {
    const out: Aabb[] = [];
    for (let k = 0; k + 24 <= vertices.length; k += 24) {
      const part = vertices.slice(k, k + 24);
      out.push({
        min: new Vector3(
          Math.min(...part.map((v) => v.x)),
          Math.min(...part.map((v) => v.y)),
          Math.min(...part.map((v) => v.z)),
        ),
        max: new Vector3(
          Math.max(...part.map((v) => v.x)),
          Math.max(...part.map((v) => v.y)),
          Math.max(...part.map((v) => v.z)),
        ),
      });
    }
    return out;
  }

  function overlapVolume(a: Aabb, b: Aabb): number {
    const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
    const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
  }

  it.each([0, 1, 2, 3] as const)(
    'поворот %i: 18 плит только на видимых сторонах, без пересечений, ниже балконных плит',
    (rotation) => {
      const hidden = hiddenSides(rotation);
      const xSign = -hidden.x;
      const zSign = -hidden.z;
      const { buildings, opaque, detail } = freshBuildings(hidden);
      buildings.modernTower(f, FLOORS, 'glass-teal');
      const slabVertices = atLevels(opaque.build(), 'white', 0.1);
      const slabs = boxes(slabVertices);
      expect(slabVertices).toHaveLength(slabs.length * 24);
      expect(slabs).toHaveLength(2 * (FLOORS - 1));
      // Каждая вершина — снаружи корпуса на видимой стороне.
      for (const v of slabVertices) {
        const outX = (v.x - f.x) * xSign >= f.w / 2 - 1e-4;
        const outZ = (v.z - f.z) * zSign >= f.d / 2 - 1e-4;
        expect(outX || outZ).toBe(true);
      }
      for (let a = 0; a < slabs.length; a++) {
        for (let b = a + 1; b < slabs.length; b++) {
          const sa = slabs[a];
          const sb = slabs[b];
          if (sa !== undefined && sb !== undefined) {
            expect(overlapVolume(sa, sb)).toBeLessThan(1e-9);
          }
        }
      }
      // Балконные плиты (concrete, слой деталей) выше пояса своего уровня на ≥ 0.01.
      const plates = boxes(atLevels(detail.build(), 'concrete', 0.2));
      expect(plates.length).toBeGreaterThan(0);
      for (const plate of plates) {
        const level = Math.round(plate.min.y / FLOOR);
        const slabTop = Math.max(
          ...slabs.filter((s) => Math.round(s.min.y / FLOOR) === level).map((s) => s.max.y),
        );
        expect(plate.max.y - slabTop).toBeGreaterThanOrEqual(0.01);
      }
    },
  );
});
