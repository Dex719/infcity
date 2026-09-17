import type { BufferGeometry } from 'three';
import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { GeometryBatch, Templates } from '@/scene/procedural/GeometryBatch';
import { CARRIAGE_LENGTH } from './Train';

/** Описание модели машины: длина и функция сборки в локальной системе (перед = +x). */
export interface VehicleModel {
  readonly name: string;
  readonly length: number;
  readonly build: (b: GeometryBatch, m: Materials) => void;
}

type Build = (b: GeometryBatch, m: Materials) => void;

function wheels(
  b: GeometryBatch,
  m: Materials,
  positions: readonly number[],
  width: number,
  r = 0.45,
): void {
  const dark = m.color('roof-dark');
  for (const x of positions) {
    b.placeRotated(Templates.cylinder8, x, r, width / 2, r, 0.35, r, Math.PI / 2, 0, 0, dark);
    b.placeRotated(Templates.cylinder8, x, r, -width / 2, r, 0.35, r, Math.PI / 2, 0, 0, dark);
  }
}

/** Легковая машина: корпус, кабина, стёкла, фары и габариты, колёса. */
function car(
  body: PaletteKey,
  roof: PaletteKey,
  cabinFrom: number,
  cabinTo: number,
  length: number,
  width = 1.8,
): Build {
  return (b, m) => {
    const w = width;
    b.box(0, 0.9, 0, length, 0.9, w, m.color(body));
    const cabinLen = cabinTo - cabinFrom;
    b.box((cabinFrom + cabinTo) / 2, 1.7, 0, cabinLen, 0.7, w - 0.3, m.color(roof));
    b.box((cabinFrom + cabinTo) / 2, 1.7, 0, cabinLen - 0.4, 0.5, w - 0.2, m.color('glass-navy'));
    b.box(length / 2 - 0.1, 0.95, 0.55, 0.15, 0.25, 0.3, m.color('white'));
    b.box(length / 2 - 0.1, 0.95, -0.55, 0.15, 0.25, 0.3, m.color('white'));
    b.box(-length / 2 + 0.05, 0.95, 0.55, 0.1, 0.25, 0.3, m.color('accent-red'));
    b.box(-length / 2 + 0.05, 0.95, -0.55, 0.1, 0.25, 0.3, m.color('accent-red'));
    wheels(b, m, [length / 2 - 1, -length / 2 + 1], w);
  };
}

/** Яндекс Go «Эконом/Комфорт» (FR-16.2): белая машина, жёлтая полоса на дверях, жёлтый знак на крыше. */
const yandexEconom: Build = (b, m) => {
  car('white', 'white', -1.2, 0.9, 4.4)(b, m);
  const yellow = m.color('yellow');
  b.box(-0.1, 0.72, 0.93, 2.8, 0.32, 0.06, yellow);
  b.box(-0.1, 0.72, -0.93, 2.8, 0.32, 0.06, yellow);
  b.box(-0.15, 2.2, 0, 0.8, 0.28, 0.46, yellow);
  b.box(-0.15, 2.2, 0, 0.82, 0.1, 0.48, m.color('black'));
};

/** Яндекс Go «Бизнес»: чёрный седан с хромированной полосой. */
const yandexBusiness: Build = (b, m) => {
  car('black', 'black', -1.4, 1.0, 4.9)(b, m);
  const steel = m.color('steel');
  b.box(0, 0.62, 0.93, 4.6, 0.08, 0.05, steel);
  b.box(0, 0.62, -0.93, 4.6, 0.08, 0.05, steel);
};

/** Яндекс Ultima «Premier»: длинный чёрный премиальный седан без брендинга. */
const yandexPremier: Build = (b, m) => {
  car('black', 'black', -1.7, 1.1, 5.4, 1.9)(b, m);
  const steel = m.color('steel');
  b.box(0, 0.62, 0.98, 5.1, 0.08, 0.05, steel);
  b.box(0, 0.62, -0.98, 5.1, 0.08, 0.05, steel);
  b.box(2.72, 0.75, 0, 0.06, 0.35, 1.2, steel);
};

/**
 * Городской автобус Астаны (FR-16.1, брендинг CTS 2024): светлый кузов, синяя полоса снизу,
 * зелёно-жёлтые ромбы, большие окна, табло маршрута.
 */
const busAstana: Build = (b, m) => {
  const w = 2.4;
  const len = 10;
  b.box(0, 1.6, 0, len, 2.4, w, m.color('white'));
  b.box(0, 0.75, 0, len + 0.02, 0.5, w + 0.04, m.color('flag-blue'));
  b.box(0, 2.15, 0, len - 0.6, 0.95, w + 0.05, m.color('glass-navy'));
  b.box(0, 2.9, 0, len - 0.4, 0.2, w - 0.2, m.color('stone-light'));
  b.box(len / 2, 1.5, 0, 0.1, 2.0, w - 0.4, m.color('glass-navy'));
  b.box(len / 2 - 0.15, 2.75, 0, 0.2, 0.35, 1.6, m.color('black'));
  const green = m.color('grass');
  const yellow = m.color('yellow');
  for (const side of [1, -1]) {
    const z = side * (w / 2 + 0.04);
    b.placeRotated(Templates.box, -3.6, 1.35, z, 0.45, 0.45, 0.06, 0, 0, Math.PI / 4, green);
    b.placeRotated(Templates.box, -2.9, 1.35, z, 0.45, 0.45, 0.06, 0, 0, Math.PI / 4, yellow);
    b.placeRotated(Templates.box, 2.9, 1.35, z, 0.45, 0.45, 0.06, 0, 0, Math.PI / 4, yellow);
    b.placeRotated(Templates.box, 3.6, 1.35, z, 0.45, 0.45, 0.06, 0, 0, Math.PI / 4, green);
  }
  wheels(b, m, [3.4, -3.4], w, 0.5);
};

/** Пул из 12 моделей (FR-6.6, FR-16): индекс = `CarSpawn.model`, порядок фиксирован (снапшоты). */
export const CAR_MODELS: readonly VehicleModel[] = [
  { name: 'sedan-red', length: 4.4, build: car('accent-red', 'accent-red', -1.2, 0.9, 4.4) },
  { name: 'hatchback-white', length: 3.8, build: car('white', 'white', -1.4, 0.6, 3.8) },
  { name: 'suv-grey', length: 4.8, build: car('steel', 'steel', -1.6, 1.0, 4.8) },
  { name: 'yandex-econom', length: 4.4, build: yandexEconom },
  { name: 'bus-astana', length: 10, build: busAstana },
  {
    name: 'truck',
    length: 8,
    build: (b, m) => {
      const w = 2.3;
      b.box(2.9, 1.6, 0, 2.2, 2.2, w, m.color('white'));
      b.box(3.3, 1.9, 0, 1.2, 0.8, w + 0.05, m.color('glass-navy'));
      b.box(-1.2, 1.9, 0, 5.6, 2.8, w, m.color('concrete'));
      b.box(0, 0.6, 0, 8, 0.4, w - 0.4, m.color('roof-dark'));
      wheels(b, m, [3, -0.5, -2.8], w, 0.5);
    },
  },
  {
    name: 'van',
    length: 5.2,
    build: (b, m) => {
      const w = 2;
      b.box(0, 1.4, 0, 5.2, 2.2, w, m.color('white'));
      b.box(1.9, 1.7, 0, 1.2, 0.8, w + 0.05, m.color('glass-navy'));
      b.box(0, 1.3, 0, 5.3, 0.3, w + 0.05, m.color('flag-blue'));
      wheels(b, m, [1.7, -1.7], w);
    },
  },
  {
    name: 'police',
    length: 4.6,
    build: (b, m) => {
      car('white', 'white', -1.3, 0.9, 4.6)(b, m);
      b.box(0, 0.95, 0, 4.7, 0.3, 1.85, m.color('glass-navy'));
      b.box(-0.2, 2.2, 0.25, 0.4, 0.25, 0.3, m.color('accent-red'));
      b.box(-0.2, 2.2, -0.25, 0.4, 0.25, 0.3, m.color('flag-blue'));
    },
  },
  { name: 'yandex-business', length: 4.9, build: yandexBusiness },
  { name: 'yandex-premier', length: 5.4, build: yandexPremier },
  { name: 'suv-white', length: 4.8, build: car('white', 'roof-dark', -1.6, 1.0, 4.8) },
  { name: 'sedan-blue', length: 4.5, build: car('glass-navy', 'glass-navy', -1.2, 0.9, 4.5) },
];

/** Вагон ЛРТ (перед = +x). */
export function buildCarriage(b: GeometryBatch, m: Materials): void {
  const w = 2.6;
  const h = 3;
  b.box(0, h / 2, 0, CARRIAGE_LENGTH, h, w, m.color('white'));
  b.box(0, h * 0.62, 0, CARRIAGE_LENGTH - 0.6, 1.1, w + 0.05, m.color('glass-navy'));
  b.box(0, h * 0.28, 0, CARRIAGE_LENGTH + 0.02, 0.5, w + 0.06, m.color('flag-blue'));
  b.box(0, h + 0.15, 0, CARRIAGE_LENGTH - 1, 0.3, w - 0.6, m.color('steel'));
  b.box(0, -0.3, 0, CARRIAGE_LENGTH - 1.5, 0.6, w - 0.8, m.color('roof-dark'));
}

type Blob = readonly [number, number, number, number];

/** Силуэты облаков (FR-17.2): верхние объёмы и плоская тёмная подложка снизу. */
const CLOUD_SHAPES: readonly { readonly top: readonly Blob[]; readonly base: readonly Blob[] }[] = [
  {
    // Кучевое.
    top: [
      [0, 0, 0, 5],
      [4.5, 0.6, 1, 3.8],
      [-4.2, 0.4, -0.5, 3.6],
      [1.5, 1.8, -2.5, 3],
      [-1.5, 1.4, 2.6, 2.8],
      [2.8, 2.6, 0.5, 2.2],
      [-2.6, 2.4, -1.4, 2],
      [6.8, -0.2, -1, 2.4],
    ],
    base: [
      [0, -0.6, 0, 4.6],
      [4.4, -0.6, 1, 3.2],
      [-4, -0.6, -0.5, 3],
      [1, -0.6, -2.6, 2.4],
    ],
  },
  {
    // Крупное кучевое.
    top: [
      [0, 0.4, 0, 6],
      [5.5, 0.6, 1.5, 4.2],
      [-5.2, 0.2, -1, 4],
      [2, 2.6, -3, 3.4],
      [-2, 2.2, 3, 3.2],
      [3.5, 3.8, 0.5, 2.6],
      [-3.2, 3.4, -1.5, 2.4],
      [8.8, -0.3, -0.5, 2.8],
      [-8.4, -0.4, 1, 2.6],
    ],
    base: [
      [0, -0.6, 0, 5.4],
      [5.4, -0.6, 1.4, 3.6],
      [-5.2, -0.6, -1, 3.4],
      [8.6, -0.6, -0.4, 2.2],
    ],
  },
  {
    // Вытянутое слоистое.
    top: [
      [0, 0, 0, 3.8],
      [5.5, 0.2, 0.6, 3.4],
      [-5.5, 0.1, -0.4, 3.4],
      [10.6, -0.3, 0.2, 2.8],
      [-10.6, -0.2, 0, 2.8],
      [2.5, 1.4, -1.2, 2.4],
      [-3, 1.3, 1, 2.2],
    ],
    base: [
      [0, -0.6, 0, 3.4],
      [6, -0.6, 0.5, 3],
      [-6, -0.6, -0.3, 3],
      [11, -0.6, 0, 2.2],
    ],
  },
];

/** Облако (FR-7, FR-17.2): скопление сплюснутых шаров с тёмной подложкой; три силуэта. */
export function buildCloud(b: GeometryBatch, m: Materials, variant: number): void {
  const shape = CLOUD_SHAPES[variant % CLOUD_SHAPES.length] ?? CLOUD_SHAPES[0];
  if (shape === undefined) {
    return;
  }
  const white = m.color('white');
  const mid = m.shade('white', 0.93);
  const shadow = m.shade('white', 0.82);
  shape.top.forEach(([x, y, z, r], i) => {
    b.place(
      i < 2 ? Templates.sphereLow : Templates.blob,
      x,
      y,
      z,
      r,
      r * 0.65,
      r,
      i >= 5 ? mid : white,
    );
  });
  for (const [x, y, z, r] of shape.base) {
    b.place(Templates.blobLow, x, y, z, r, r * 0.3, r, shadow);
  }
  // Клочки по краям силуэта (FR-17.6): у самых дальних верхних объёмов, чуть ниже.
  const edges = [...shape.top].sort((p, q) => Math.abs(q[0]) - Math.abs(p[0])).slice(0, 3);
  for (const [x, y, z, r] of edges) {
    const dir = Math.sign(x) || 1;
    b.place(
      Templates.blobLow,
      x + dir * r * 0.9,
      y - 0.3,
      z + 0.4,
      r * 0.5,
      r * 0.3,
      r * 0.5,
      white,
    );
  }
}

/** Собрать геометрию модели в отдельный `BufferGeometry` с вершинными цветами. */
export function geometryOf(
  build: (b: GeometryBatch, m: Materials) => void,
  m: Materials,
): BufferGeometry {
  const batch = new GeometryBatch();
  build(batch, m);
  return batch.build();
}
