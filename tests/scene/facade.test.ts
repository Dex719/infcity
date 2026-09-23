import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AO } from '@/config';
import { Materials } from '@/scene/Materials';
import { parsePalette, type PaletteKey } from '@/scene/palette';
import { Buildings, type Footprint } from '@/scene/procedural/Buildings';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { CHUNK_HIDDEN, type HiddenSides } from '@/scene/procedural/Visibility';
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
    const glassVertices = verticesOfColor(glass, 'glass-blue');
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
    const centers = windowCenters(opaque, 'glass-navy');
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
    const windows = verticesOfColor(opaque, 'glass-navy');
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
    const side = windowCenters(opaque, 'glass-blue').filter((c) => c.x > tower.w / 2);
    expect(side.length).toBeGreaterThan(0);
    for (const c of side) {
      expect(Math.abs(c.z)).toBeGreaterThanOrEqual(tower.d * 0.175);
    }
  });
});
