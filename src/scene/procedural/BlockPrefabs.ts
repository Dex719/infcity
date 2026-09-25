import type { Color } from 'three';
import { AO, CHUNK_LAYOUT, LANDMARKS, PAVING, RIVER } from '@/config';
import { buildLandmark } from '@/scene/landmarks';
import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { mulberry32 } from '@/world/Hash';
import type { ChunkDescriptor } from '@/world/types';
import { Buildings } from './Buildings';
import { GeometryBatch, Templates } from './GeometryBatch';
import { Props } from './Props';
import { type HiddenSides, hiddenSides } from './Visibility';

/** Прямоугольник на покрытии квартала: границы по X и по Z (локальные координаты). */
export interface GroundRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** Прямоугольник с центром `(x, z)` и размерами `w × d`, расширенный на `pad` с каждой стороны. */
export function groundRect(x: number, z: number, w: number, d: number, pad = 0): GroundRect {
  return { x0: x - w / 2 - pad, x1: x + w / 2 + pad, z0: z - d / 2 - pad, z1: z + d / 2 + pad };
}

/**
 * Отрезки шва мощения на линии (FR-19.7): промежуток `[−half, half]` минус проекции
 * прямоугольников `avoid`, которые линия пересекает. `alongX` — линия идёт вдоль X на
 * `z = at`; иначе — вдоль Z на `x = at`. Отрезки короче `PAVING.MIN_SEGMENT` отбрасываются.
 */
export function seamSegments(
  at: number,
  alongX: boolean,
  avoid: readonly GroundRect[],
  half: number,
): [number, number][] {
  let intervals: [number, number][] = [[-half, half]];
  for (const r of avoid) {
    const [c0, c1, s0, s1] = alongX ? [r.z0, r.z1, r.x0, r.x1] : [r.x0, r.x1, r.z0, r.z1];
    if (at <= c0 || at >= c1) {
      continue;
    }
    const next: [number, number][] = [];
    for (const [a, b] of intervals) {
      if (s1 <= a || s0 >= b) {
        next.push([a, b]);
        continue;
      }
      if (s0 > a) {
        next.push([a, s0]);
      }
      if (s1 < b) {
        next.push([s1, b]);
      }
    }
    intervals = next;
  }
  return intervals.filter(([a, b]) => b - a >= PAVING.MIN_SEGMENT);
}

/** Результат сборки квартала в его локальной системе (центр (0,0), ±25). */
export interface BlockGeometry {
  readonly opaque: GeometryBatch;
  readonly glass: GeometryBatch;
  /** Мелкие детали квартала: всё, что строит `Props`, и детали крыш; вливаются в статику чанка. */
  readonly detail: GeometryBatch;
}

const HALF = CHUNK_LAYOUT.BLOCK_SIZE / 2; // 25
const CURB_Y = 0.15;
const LAWN_Y = CURB_Y + 0.05;
/** Полуширина покрытия квартала (`lawn` 46 × 46): ореолы AO не выходят за него (FR-19.2). */
const GROUND_HALF = 23;

type Rng = () => number;

function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function int(rng: Rng, min: number, max: number): number {
  return Math.floor(between(rng, min, max + 1));
}

/**
 * Раскладки кварталов по типам (FR-3.4, design C7): детерминированные вариации из
 * `descriptor.variant`. Всё строится в локальной системе квартала; поворот и перенос
 * в чанк выполняет `PrefabBuilder`.
 */
export function buildBlock(descriptor: ChunkDescriptor, m: Materials): BlockGeometry {
  const opaque = new GeometryBatch();
  const glass = new GeometryBatch();
  // Мелочь квартала — отдельным батчем; `PrefabBuilder` вливает его в статику чанка (BUG-10).
  const detail = new GeometryBatch();
  const rng = mulberry32(descriptor.variant);
  const props = new Props(detail, m);
  // Квартал поворачивается в чанке на `rotation × 90°`, поэтому скрытые стороны — локальные (D13).
  const hidden = hiddenSides(descriptor.rotation);
  const buildings = new Buildings(opaque, glass, m, rng, hidden, detail);
  const ctx: Ctx = {
    b: opaque,
    props,
    buildings,
    m,
    rng,
    hidden,
    detail,
    variant: descriptor.variant,
  };

  switch (descriptor.block) {
    case 'residential-panel':
      residentialPanel(ctx);
      break;
    case 'residential-new':
      residentialNew(ctx);
      break;
    case 'business-glass':
      businessGlass(ctx);
      break;
    case 'commercial':
      commercial(ctx);
      break;
    case 'park':
      // Парк центра старта — бульвар Нуржол (FR-20.4, design D30); ось — по повороту квартала.
      if (descriptor.gx === LANDMARKS.START_PARK.gx && descriptor.gy === LANDMARKS.START_PARK.gy) {
        boulevard(ctx, descriptor.rotation % 2 === 0);
      } else {
        park(ctx);
      }
      break;
    case 'square':
      square(ctx);
      break;
    case 'campus':
      campus(ctx);
      break;
    case 'mall':
      mall(ctx);
      break;
    case 'market':
      market(ctx);
      break;
    case 'stadium':
      stadium(ctx);
      break;
    case 'river':
      river(ctx);
      break;
    case 'landmark':
      if (descriptor.landmark !== null) {
        buildLandmark(descriptor.landmark, { opaque, glass, props, m, rng, ao: buildings });
      }
      break;
  }
  // Ореолы AO вокруг корпусов — разом, когда известны все соседи (FR-19.2, design D15).
  buildings.flushHalos(LAWN_Y + AO.GROUND_LIFT, GROUND_HALF);
  return { opaque, glass, detail };
}

interface Ctx {
  readonly b: GeometryBatch;
  readonly props: Props;
  readonly buildings: Buildings;
  readonly m: Materials;
  readonly rng: Rng;
  /** Скрытые локальные стороны квартала (design D13): плоские накладки на них не строятся. */
  readonly hidden: HiddenSides;
  /** Батч мелких деталей квартала: в него пишет `props`, туда же — мелочь раскладок. */
  readonly detail: GeometryBatch;
  /** `descriptor.variant` (TSK-104, FR-18.5): источник вариативности без обращения к `rng`. */
  readonly variant: number;
}

function lawn(
  ctx: Ctx,
  x: number,
  z: number,
  w: number,
  d: number,
  color: PaletteKey = 'grass',
): void {
  ctx.b.plane(x, LAWN_Y, z, w, d, ctx.m.color(color));
  if (x === 0 && z === 0 && w === 2 * GROUND_HALF && d === 2 * GROUND_HALF) {
    // Полное покрытие квартала — под ним стоят корпуса, в его цвет красятся ореолы AO.
    ctx.buildings.groundKey = color;
  }
}

function scatterTrees(ctx: Ctx, count: number, avoid: (x: number, z: number) => boolean): void {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 8) {
    const x = between(ctx.rng, -HALF + 2, HALF - 2);
    const z = between(ctx.rng, -HALF + 2, HALF - 2);
    if (avoid(x, z)) {
      continue;
    }
    const scale = between(ctx.rng, 0.8, 1.3);
    const roll = ctx.rng();
    // Тот же бросок, что и раньше: хвойное / тополь / цветущее / лиственное (FR-17.1, FR-17.5).
    ctx.props.tree(x, z, scale, roll < 0.25 ? 1 : roll < 0.4 ? 2 : roll < 0.5 ? 3 : 0);
    placed++;
  }
}

function insideRect(
  x: number,
  z: number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  pad = 1.5,
): boolean {
  return Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad;
}

/**
 * Разметка мест на парковке (TSK-104, design «C7 (дополнение): улицы», FR-18.5, AC-18.5):
 * линии `box` 0.12 × 2.4 с шагом 2.6 вдоль края площадки, ряд идёт вдоль Z на фиксированном
 * `cross` (X); машины смотрят вдоль X (`rotationY = 0`). Линии — в батче деталей, на
 * уровне покрытия площадки + 0.02 (без z-fighting, `y` — уже с этим отступом).
 *
 * Машина ставится на каждое второе место, но не на крайней линии — иначе кузов (глубина
 * 1.7) вылезает за площадку. Индекс цвета — `descriptor.variant + i` (без `rng`, иначе
 * изменится раскладка города и упадут снапшоты, design «Контракт исполнителя»).
 */
function parkingMarkings(
  ctx: Ctx,
  cross: number,
  along: number,
  lineCount: number,
  y: number,
): void {
  const spacing = 2.6;
  const marking = ctx.m.color('marking');
  const start = along - ((lineCount - 1) * spacing) / 2;
  for (let i = 0; i < lineCount; i++) {
    const pos = start + i * spacing;
    ctx.detail.box(cross, y, pos, 2.4, 0.02, 0.12, marking);
    if (i > 0 && i < lineCount - 1 && i % 2 === 1) {
      // Машина стоит МЕЖДУ линиями, а не на линии: в первой версии кузов 3.6×1.7
      // центрировался на той же координате, что и разделитель (рецензия 2026-09-19).
      ctx.props.parkedCar(cross, pos + spacing / 2, 0, ctx.variant + i);
    }
  }
}

/**
 * Швы мощения (FR-19.7, AC-19.7, design «C7 (дополнение, итерация 5): мощение площадей»):
 * тонкие плоские полосы цвета `m.shade(ground, PAVING.SEAM_SHADE)` на линиях `lines` по обеим
 * осям, в батче деталей. Полоса разрезается вокруг `avoid`: здания вместе с ореолами AO
 * (светлый шов не должен перечёркивать тёмный ореол), парковки, фонтаны, газонные вставки.
 * Там, где швы пересекаются, лежат две одинаковые плоскости одного цвета — спорить по
 * глубине им не о чем. Без обращений к `rng` (FR-19.8).
 */
function pavingSeams(
  ctx: Ctx,
  ground: PaletteKey,
  lines: readonly number[],
  avoid: readonly GroundRect[],
): void {
  const color = ctx.m.shade(ground, PAVING.SEAM_SHADE);
  const y = LAWN_Y + PAVING.SEAM_LIFT;
  for (const at of lines) {
    for (const [a, b] of seamSegments(at, true, avoid, GROUND_HALF)) {
      ctx.detail.plane((a + b) / 2, y, at, b - a, PAVING.SEAM_W, color);
    }
    for (const [a, b] of seamSegments(at, false, avoid, GROUND_HALF)) {
      ctx.detail.plane(at, y, (a + b) / 2, PAVING.SEAM_W, b - a, color);
    }
  }
}

/** Линии швов с шагом `PAVING.STEP` внутри покрытия квартала: −20, −16, …, 20. */
const PAVING_LINES: readonly number[] = Array.from(
  { length: Math.floor((2 * (GROUND_HALF - 3)) / PAVING.STEP) + 1 },
  (_, i) => -(GROUND_HALF - 3) + i * PAVING.STEP,
);

function residentialPanel(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46);
  const walls: PaletteKey[] = ['panel-grey', 'brick', 'sand', 'stone-light'];
  const houses: { x: number; z: number; w: number; d: number }[] = [];
  const layout = ctx.rng() < 0.5 ? 0 : 1;
  if (layout === 0) {
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      houses.push({
        x: sx * 11.5,
        z: sz * 11,
        w: between(ctx.rng, 13, 16),
        d: between(ctx.rng, 8, 10),
      });
    }
  } else {
    houses.push({ x: 0, z: -13, w: 38, d: 9 });
    houses.push({ x: -12, z: 11, w: 15, d: 9 });
    houses.push({ x: 12, z: 11, w: 15, d: 9 });
  }
  for (const h of houses) {
    ctx.buildings.panelHouse(
      h,
      int(ctx.rng, 5, 9),
      walls[int(ctx.rng, 0, walls.length - 1)] ?? 'panel-grey',
    );
  }
  // Горка — к видимой стороне квартала (FR-19.29, design D33).
  ctx.props.playground(0, layout === 0 ? 0 : -1, visibleZ(ctx.hidden));
  scatterTrees(
    ctx,
    8,
    (x, z) =>
      houses.some((h) => insideRect(x, z, h.x, h.z, h.w, h.d)) || insideRect(x, z, 0, 0, 7, 7),
  );
  ctx.props.lamp(-20, -20);
  ctx.props.lamp(20, 20);
  ctx.props.bench(4, 5, 0);
  ctx.props.bench(-4, 5, 0);
  // Благоустройство (FR-17.5): кусты у подъездов, изгороди у площадки, столбики у въезда.
  for (const [x, z] of [
    [-9, -19],
    [9, -19],
    [-9, 19],
    [9, 19],
  ] as const) {
    ctx.props.bush(x, z, 1.1);
  }
  const yardZ = layout === 0 ? 0 : -1;
  ctx.props.hedge(-5.4, yardZ, 0.6, 6);
  ctx.props.hedge(5.4, yardZ, 0.6, 6);
  ctx.props.bollards(-3, 22.5, 3, 22.5, 4);
}

/**
 * Двор новостройки (FR-19.29, design D33): газон у юго-западного края, где двор был пустым
 * мощением, на нём детская площадка 7 × 7 и скамейка у её восточного края. Газон кончается
 * на x −11: третья башня (−1; 12) шириной до 14 начинается с −8, её ореол AO — с −10,5.
 */
export const NEW_BUILD_YARD = {
  lawn: { x0: -GROUND_HALF, x1: -11, z0: 3.5, z1: 19.5 },
  playground: { x: -17, z: 12 },
  bench: { x: -12.2, z: 12 },
} as const satisfies {
  lawn: GroundRect;
  playground: { x: number; z: number };
  bench: { x: number; z: number };
};

/** Видимая сторона квартала по локальной Z (design D13): туда разворачивают горку площадки. */
function visibleZ(hidden: HiddenSides): 1 | -1 {
  return hidden.z === 1 ? -1 : 1;
}

/** Отступ случайных деревьев от площадки двора: наибольший вынос кроны (1.3 × 1.9 × 1.3). */
const YARD_TREE_CLEARANCE = 3.3;

function residentialNew(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sidewalk');
  const accents: PaletteKey[] = ['glass-teal', 'flag-blue', 'accent-red', 'gold'];
  const towers = [
    { x: -12, z: -10, w: between(ctx.rng, 11, 13), d: between(ctx.rng, 11, 13) },
    { x: 11, z: -10, w: between(ctx.rng, 11, 13), d: between(ctx.rng, 11, 13) },
    { x: -1, z: 12, w: between(ctx.rng, 12, 14), d: between(ctx.rng, 10, 12) },
  ];
  for (const t of towers) {
    ctx.buildings.modernTower(
      t,
      int(ctx.rng, 7, 12),
      accents[int(ctx.rng, 0, accents.length - 1)] ?? 'glass-teal',
    );
  }
  // Газонная вставка выше покрытия двора (bugfix BUG-7: одна плоскость → z-fighting).
  ctx.b.plane(14, LAWN_Y + 0.06, 12, 14, 14, ctx.m.color('grass'));
  // Двор (FR-19.29, design D33): газон у юго-западного края, на нём детская площадка и скамейка.
  const yard = NEW_BUILD_YARD;
  const { lawn: yardLawn, playground } = yard;
  ctx.b.plane(
    (yardLawn.x0 + yardLawn.x1) / 2,
    LAWN_Y + 0.06,
    (yardLawn.z0 + yardLawn.z1) / 2,
    yardLawn.x1 - yardLawn.x0,
    yardLawn.z1 - yardLawn.z0,
    ctx.m.color('grass'),
  );
  ctx.props.playground(playground.x, playground.z, visibleZ(ctx.hidden));
  ctx.props.bench(yard.bench.x, yard.bench.z, Math.PI / 2);
  scatterTrees(
    ctx,
    7,
    (x, z) =>
      towers.some((t) => insideRect(x, z, t.x, t.z, t.w, t.d)) ||
      Math.hypot(x, z) < 3 ||
      Math.hypot(x + 20, z - 20) < 3 ||
      // Крона лиственного дерева выносится до 1.3 × 1.9 × масштаб (≤ 3.2) — мимо площадки.
      insideRect(x, z, playground.x, playground.z, 7, 7, YARD_TREE_CLEARANCE),
  );
  for (let i = 0; i < 4; i++) {
    ctx.props.parkedCar(-18 + i * 4.5, 22, 0, i);
  }
  ctx.props.lamp(0, 0);
  ctx.props.lamp(-20, 20);
  // Благоустройство (FR-17.5): изгороди вдоль газона, кусты, клумба.
  ctx.props.hedge(14, 4.6, 14, 0.6);
  ctx.props.hedge(6.6, 12, 0.6, 14);
  ctx.props.bush(20, 6, 1);
  ctx.props.bush(-20, -20, 1.1);
  ctx.props.bush(20, -20, 0.9);
  ctx.props.flowerBed(-20, 5, 1.5, 'gold');
}

/** Газонный остров площади: прямоугольник `x, z, w, d` и деревья `[x, z, масштаб]` на нём. */
export interface LawnIsland {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly trees: readonly (readonly [number, number, number])[];
}

/**
 * Газонные острова деловой площади (FR-19.25, design D27): восточный — между башнями, южный —
 * между скамейками и пристройкой, западный — между главной башней и краем плиты. Северная
 * вставка при повороте 0 закрыта главной башней, эти видны с камеры при любом повороте.
 */
export const BUSINESS_LAWNS: readonly LawnIsland[] = [
  {
    x: 14.5,
    z: -4,
    w: 12,
    d: 12,
    trees: [
      [12, -7, 1.1],
      [17, 0.5, 1],
    ],
  },
  { x: 0.5, z: 16, w: 7, d: 8, trees: [[0.5, 16, 1]] },
  { x: -20.25, z: -4, w: 5.5, d: 16, trees: [[-20, -8, 0.9]] },
];

/** Газонные острова с деревьями — на покрытии + 0.06, как вставки (BUG-7), без `rng`. */
function lawnIslands(ctx: Ctx, islands: readonly LawnIsland[]): void {
  for (const island of islands) {
    ctx.b.plane(island.x, LAWN_Y + 0.06, island.z, island.w, island.d, ctx.m.color('grass'));
    for (const [x, z, scale] of island.trees) {
      ctx.props.tree(x, z, scale, 0);
    }
  }
}

function businessGlass(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'stone-light');
  const tints: PaletteKey[] = ['glass-blue', 'glass-teal', 'glass-navy'];
  const main = { x: -5, z: -4, w: between(ctx.rng, 16, 19), d: between(ctx.rng, 16, 19) };
  ctx.buildings.glassTower(main, int(ctx.rng, 9, 12), tints[int(ctx.rng, 0, 2)] ?? 'glass-blue');
  const annex = { x: 13, z: 12, w: 12, d: 12 };
  ctx.buildings.glassTower(annex, int(ctx.rng, 4, 7), tints[int(ctx.rng, 0, 2)] ?? 'glass-teal');
  ctx.props.fountain(-13, 15, 3);
  ctx.props.lamp(-20, -20);
  ctx.props.lamp(20, -20);
  ctx.props.lamp(20, 20);
  ctx.props.bench(-6, 16, 0);
  ctx.props.bench(-6, 19, 0);
  scatterTrees(
    ctx,
    5,
    (x, z) =>
      insideRect(x, z, main.x, main.z, main.w, main.d, 3) ||
      insideRect(x, z, annex.x, annex.z, annex.w, annex.d, 3) ||
      // Площадка парковки ниже по функции: без этого исключения дерево вырастает прямо
      // посреди асфальта примерно в каждом третьем варианте (рецензия 2026-09-19).
      insideRect(x, z, 15, -17, 8, 8, 1.5),
  );
  // Благоустройство (FR-17.5): планеры у входа, ряд столбиков, кусты.
  ctx.props.flowerBed(-5, 9, 1.4, 'accent-red');
  ctx.props.flowerBed(-12, 9, 1.4, 'accent-red');
  ctx.props.bollards(-4, 22.5, 4, 22.5, 5);
  ctx.props.bush(20, 0, 1);
  ctx.props.bush(-20, 0, 1);
  // Велопарковка у входа (TSK-103, design «Мебель тротуара»): южнее главной башни
  // (край ≤ z 5.5), севернее клумбы (-5, 9, край 7.6) — запас ≥ 1.5 от обеих.
  ctx.props.bikeRack(-5, 7, 0);
  // Парковка (TSK-104, FR-18.5): у этого типа своей площадки раньше не было — добавляем
  // небольшое покрытие в юго-восточном углу (x ∈ [11, 19], z ∈ [-21, -13]), свободном от
  // башен (главная — x ≤ 4,5; пристройка — z ≥ 6) и уличной мебели, плюс разметку.
  ctx.b.plane(15, LAWN_Y + 0.03, -17, 8, 8, ctx.m.color('asphalt'));
  parkingMarkings(ctx, 15, -17, 4, LAWN_Y + 0.05);
  // Мощение и газон (FR-19.7): северная полоса z ∈ [−22, −17] свободна при любом варианте
  // (главная башня кончается на z ≥ −13.5, её ореол — на −16), парковка — с x ≥ 11.
  const insert = groundRect(-8, -19.5, 26, 5);
  ctx.b.plane(-8, LAWN_Y + 0.06, -19.5, 26, 5, ctx.m.color('grass'));
  for (const x of [-17, -8, 1]) {
    ctx.props.tree(x, -19.5, 1.1, 0);
  }
  // Газонные острова с деревьями (FR-19.25, design D27).
  lawnIslands(ctx, BUSINESS_LAWNS);
  pavingSeams(ctx, 'stone-light', PAVING_LINES, [
    groundRect(main.x, main.z, main.w, main.d, AO.GROUND_WIDTH),
    groundRect(annex.x, annex.z, annex.w, annex.d, AO.GROUND_WIDTH),
    groundRect(15, -17, 8, 8, 0.5),
    groundRect(-13, 15, 6, 6, 0.5),
    insert,
    ...BUSINESS_LAWNS.map((island) => groundRect(island.x, island.z, island.w, island.d, 0.5)),
  ]);
}

/**
 * Деревья коммерческого квартала `[x, z, масштаб]` и его изгородь (BUG-12): крона дерева
 * (с боковыми объёмами — до 1.3 радиуса от ствола) не должна накрывать изгородь. Раньше
 * дерево стояло на z −14 и его крона уходила в изгородь на z −12 — сверху читалось
 * «поваленным деревом». Экспортируются для регрессионного теста.
 */
export const COMMERCIAL_TREES: readonly (readonly [number, number, number])[] = [
  [16, -17, 1.1],
  [20, -8, 0.9],
];
export const COMMERCIAL_HEDGE = { x: 12, z: -12, w: 12, d: 0.8 } as const;

/** Задний торговый ряд коммерческого квартала: перед его фасадом стоит кафе-терраса. */
const COMMERCIAL_BACK_ROW = { x: -8, z: -12, w: 26, d: 11 } as const;

/** Столики кафе-террасы: смещения по x от центра заднего ряда (FR-19.18). */
export const CAFE_TABLES_X: readonly number[] = [-6, -2, 2, 6];

/**
 * Z кафе-террасы: на 2.5 от фасада заднего ряда, со стороны, куда он смотрит (FR-19.18).
 * Фасады рядов обращены к видимой стороне (`storefront`, D13): при видимой +Z фасад на −6.5
 * смотрит на парковку — терраса на z −4, между маркизами и столбиками; при видимой −Z фасад на
 * −17.5 смотрит на улицу — терраса на z −20. 2.5 = вынос маркизы 1.4 + радиус зонта 1 + зазор.
 * У переднего ряда при видимой −Z места нет: от его маркиз (до 8.2) до столбиков парковки
 * (6.6) всего 1.5.
 */
export function cafeTerraceZ(visibleZ: 1 | -1): number {
  return COMMERCIAL_BACK_ROW.z + visibleZ * (COMMERCIAL_BACK_ROW.d / 2 + 2.5);
}

/**
 * Кафе-терраса (FR-19.18, AC-19.19, design «Волна 6»): настил и четыре столика под зонтиками
 * перед фасадом заднего ряда, по его центру. Цвета зонтиков — по `variant`, без `rng`.
 */
function cafeTerrace(ctx: Ctx): void {
  const z = cafeTerraceZ(-ctx.hidden.z as 1 | -1);
  const cx = COMMERCIAL_BACK_ROW.x;
  ctx.b.plane(cx, LAWN_Y + 0.03, z, 16, 3, ctx.m.shade('sand', 0.8));
  const canopies: PaletteKey[] = ['accent-red', 'flag-blue', 'gold', 'glass-teal'];
  CAFE_TABLES_X.forEach((dx, i) => {
    ctx.props.cafeTable(
      cx + dx,
      z,
      canopies[(ctx.variant + i) % canopies.length] ?? 'accent-red',
      LAWN_Y + 0.03,
    );
  });
}

function commercial(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sidewalk');
  const walls: PaletteKey[] = ['sand', 'brick', 'stone-light', 'white'];
  const awnings: PaletteKey[] = ['accent-red', 'flag-blue', 'gold', 'glass-teal'];
  const front = { x: 0, z: 15, w: 42, d: 11 };
  ctx.buildings.shopRow(
    front,
    int(ctx.rng, 2, 3),
    walls[int(ctx.rng, 0, 3)] ?? 'sand',
    awnings[int(ctx.rng, 0, 3)] ?? 'accent-red',
  );
  const back = COMMERCIAL_BACK_ROW;
  ctx.buildings.shopRow(
    back,
    int(ctx.rng, 1, 2),
    walls[int(ctx.rng, 0, 3)] ?? 'brick',
    awnings[int(ctx.rng, 0, 3)] ?? 'flag-blue',
  );
  // Парковка между рядами.
  ctx.b.plane(4, LAWN_Y + 0.03, 2, 34, 8, ctx.m.color('asphalt'));
  for (let i = 0; i < 6; i++) {
    if (ctx.rng() < 0.7) {
      ctx.props.parkedCar(-10 + i * 5, 2, Math.PI / 2, i);
    }
  }
  ctx.props.lamp(-20, 3);
  ctx.props.lamp(20, 3);
  for (const [x, z, scale] of COMMERCIAL_TREES) {
    ctx.props.tree(x, z, scale);
  }
  // Доп. отмеченные места у правого края парковки (TSK-104, FR-18.5): площадка —
  // x ∈ [-13, 21], z ∈ [-2, 6]; ряд у x = 19 не задевает существующий ряд машин
  // (тот занимает x до ≈ 15,85).
  parkingMarkings(ctx, 19, 2, 4, LAWN_Y + 0.05);
  // Благоустройство (FR-17.5): ограждение парковки, изгородь, кусты.
  ctx.props.bollards(-12, -2.6, 20, -2.6, 4);
  ctx.props.bollards(-12, 6.6, 20, 6.6, 4);
  ctx.props.hedge(COMMERCIAL_HEDGE.x, COMMERCIAL_HEDGE.z, COMMERCIAL_HEDGE.w, COMMERCIAL_HEDGE.d);
  cafeTerrace(ctx);
  ctx.props.bush(-20, -20, 1);
  ctx.props.bush(20, -20, 1);
}

function park(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46);
  const path = ctx.m.color('sand');
  ctx.b.box(0, LAWN_Y + 0.02, 0, 46, 0.04, 2.4, path);
  ctx.b.box(0, LAWN_Y + 0.02, 0, 2.4, 0.04, 46, path);
  ctx.props.fountain(0, 0, 4.5);
  scatterTrees(ctx, 14, (x, z) => Math.abs(x) < 6 || Math.abs(z) < 6 || Math.hypot(x, z) < 8);
  ctx.props.bench(-9, 2.2, 0);
  ctx.props.bench(9, -2.2, 0);
  ctx.props.bench(2.2, 9, Math.PI / 2);
  ctx.props.bench(-2.2, -9, Math.PI / 2);
  ctx.props.lamp(-8, -8);
  ctx.props.lamp(8, 8);
  ctx.props.lamp(-8, 8);
  ctx.props.lamp(8, -8);
  // Благоустройство (FR-17.5): кусты вдоль аллей, клумбы, столбики у входов.
  for (const [x, z] of [
    [-14, 3.5],
    [14, -3.5],
    [3.5, 14],
    [-3.5, -14],
    [-14, -3.5],
  ] as const) {
    ctx.props.bush(x, z, 1.2);
  }
  ctx.props.flowerBed(10, 4.2, 1.5, 'accent-red');
  ctx.props.flowerBed(-10, -4.2, 1.5, 'gold');
  for (const s of [-1, 1]) {
    ctx.props.bollards(s * 22.5, -2.4, s * 22.5, 2.4, 2);
    ctx.props.bollards(-2.4, s * 22.5, 2.4, s * 22.5, 2);
  }
}

/**
 * Бульвар Нуржол (FR-20.4, AC-20.3, design D30). Оси: `along` — вдоль оси Байтерек ↔ Хан Шатыр
 * (мировая Z), `across` — поперёк. По оси — зелёная срединная полоса с фонтанами и водными
 * каналами, по бокам — мощёные дорожки, у центрального фонтана — круглая площадь.
 */
export const NURZHOL = {
  /** Полуширина зелёной срединной полосы с фонтанами и каналами. */
  MEDIAN_HALF: 2.5,
  /** Внешняя полуширина мощёных дорожек: дорожки — от `MEDIAN_HALF` до неё. */
  WALK_HALF: 5,
  /** Радиус мощёной площади вокруг центрального фонтана. */
  PLAZA_R: 5.5,
  /** Фонтаны на оси: `[along, радиус]`; центральный — на площади, боковые — на срединной полосе. */
  FOUNTAINS: [
    [0, 3.5],
    [-14, 2.2],
    [14, 2.2],
  ],
  /** Ширина водного канала между фонтанами. */
  CHANNEL_W: 1.2,
  /** Ряды деревьев: `across` ряда, `along` деревьев, масштаб; кроны нависают над дорожками. */
  TREE_ACROSS: 6.8,
  TREE_ALONG: [-19.5, -13, -6.5, 0, 6.5, 13, 19.5],
  TREE_SCALE: 1.1,
} as const;

/**
 * Бульвар Нуржол — парк центра старта между Байтереком и Хан Шатыром (FR-20.4, AC-20.3,
 * design D30). При чётном повороте квартала `along` — локальная Z, при нечётном — локальная X:
 * поворот `rotation × 90°` переводит её в мировую Z. Раскладка симметрична по `along` и без `rng`.
 */
function boulevard(ctx: Ctx, axisZ: boolean): void {
  lawn(ctx, 0, 0, 46, 46);
  const at = (along: number, across: number): [number, number] =>
    axisZ ? [across, along] : [along, across];
  const rect = (along: number, across: number, length: number, width: number): GroundRect => {
    const [x, z] = at(along, across);
    return axisZ ? groundRect(x, z, width, length) : groundRect(x, z, length, width);
  };
  const box = (
    along: number,
    across: number,
    y: number,
    length: number,
    height: number,
    width: number,
    color: Color,
  ): void => {
    const [x, z] = at(along, across);
    if (axisZ) {
      ctx.b.box(x, y, z, width, height, length, color);
    } else {
      ctx.b.box(x, y, z, length, height, width, color);
    }
  };
  const stone = ctx.m.color('stone-light');
  const white = ctx.m.color('white');
  const water = ctx.m.color('water');
  const { MEDIAN_HALF, WALK_HALF, PLAZA_R, CHANNEL_W } = NURZHOL;
  // Мощёные дорожки по обе стороны срединной полосы и круглая площадь в центре.
  const walkWidth = WALK_HALF - MEDIAN_HALF;
  const walkAcross = (WALK_HALF + MEDIAN_HALF) / 2;
  for (const s of [-1, 1]) {
    box(0, s * walkAcross, LAWN_Y + 0.02, 46, 0.04, walkWidth, stone);
  }
  const [cx, cz] = at(0, 0);
  ctx.b.place(Templates.cylinder16, cx, LAWN_Y + 0.03, cz, PLAZA_R, 0.02, PLAZA_R, stone);
  // Швы мощения — только на дорожках: обходят газоны, срединную полосу и площадь.
  const lawnWidth = 23 - WALK_HALF;
  const avoid: GroundRect[] = [
    rect(0, WALK_HALF + lawnWidth / 2, 46, lawnWidth),
    rect(0, -(WALK_HALF + lawnWidth / 2), 46, lawnWidth),
    rect(0, 0, 46, 2 * MEDIAN_HALF),
    rect(0, 0, 2 * PLAZA_R, 2 * PLAZA_R),
  ];
  pavingSeams(ctx, 'stone-light', PAVING_LINES, avoid);
  // Фонтаны на оси, между соседними — водные каналы с белыми бортиками («водно-зелёный»).
  for (const [along, radius] of NURZHOL.FOUNTAINS) {
    const [x, z] = at(along, 0);
    ctx.props.fountain(x, z, radius);
  }
  const [center, side] = [NURZHOL.FOUNTAINS[0], NURZHOL.FOUNTAINS[2]];
  const from = center[1];
  const to = side[0] - side[1];
  for (const s of [-1, 1]) {
    const mid = (s * (from + to)) / 2;
    box(mid, 0, LAWN_Y + 0.06, to - from, 0.04, CHANNEL_W, water);
    for (const edge of [-1, 1]) {
      box(mid, edge * (CHANNEL_W / 2 + 0.15), LAWN_Y + 0.1, to - from, 0.12, 0.3, white);
    }
  }
  // Ряды деревьев вдоль дорожек: кроны нависают над ними, как тенистая аллея, но не над
  // срединной полосой с фонтанами.
  for (const across of [-NURZHOL.TREE_ACROSS, NURZHOL.TREE_ACROSS]) {
    for (const along of NURZHOL.TREE_ALONG) {
      const [x, z] = at(along, across);
      ctx.props.tree(x, z, NURZHOL.TREE_SCALE, 0);
    }
  }
  // Скамейки у дорожек и фонари у площади — в просветах между деревьями, не под кронами.
  const benchRot = axisZ ? Math.PI / 2 : 0;
  for (const s of [-1, 1]) {
    for (const along of [-16.25, -9.75, 9.75, 16.25]) {
      const [x, z] = at(along, s * (WALK_HALF + 0.6));
      ctx.props.bench(x, z, benchRot);
    }
    for (const along of [-3.25, 3.25]) {
      const [x, z] = at(along, s * (WALK_HALF + 0.4));
      ctx.props.lamp(x, z);
    }
  }
  // Боковые газоны: клумбы и кусты по углам.
  const flowers: PaletteKey[] = ['accent-red', 'gold'];
  for (const s of [-1, 1]) {
    [-12, 12].forEach((along, i) => {
      const [x, z] = at(along, s * 15);
      ctx.props.flowerBed(x, z, 1.6, flowers[i] ?? 'gold');
    });
    for (const along of [-20, 20]) {
      const [x, z] = at(along, s * 20);
      ctx.props.bush(x, z, 1.1);
    }
  }
  // Столбики поперёк дорожек на концах бульвара.
  for (const along of [-22.5, 22.5]) {
    for (const s of [-1, 1]) {
      const [x1, z1] = at(along, s * (MEDIAN_HALF + 0.6));
      const [x2, z2] = at(along, s * (WALK_HALF - 0.6));
      ctx.props.bollards(x1, z1, x2, z2, 2);
    }
  }
}

function square(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'stone-light');
  const stripe = ctx.m.color('sand');
  for (let i = -20; i <= 20; i += 8) {
    ctx.b.box(i, LAWN_Y + 0.02, 0, 0.6, 0.04, 46, stripe);
    ctx.b.box(0, LAWN_Y + 0.02, i, 46, 0.04, 0.6, stripe);
  }
  ctx.props.monument(0, 0, int(ctx.rng, 8, 12));
  ctx.props.flagpole(-6, -6);
  ctx.props.flagpole(6, -6);
  for (const [x, z] of [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ] as const) {
    // Газонные вставки выше полос плит (bugfix BUG-2).
    ctx.b.plane(x, LAWN_Y + 0.06, z, 8, 8, ctx.m.color('grass'));
    ctx.props.tree(x, z, 1.2);
  }
  ctx.props.bench(-10, 8, 0);
  ctx.props.bench(10, 8, 0);
  ctx.props.lamp(-12, 0);
  ctx.props.lamp(12, 0);
  // Благоустройство (FR-17.5): клумбы вокруг памятника, столбики по краям площади.
  ctx.props.flowerBed(-6, 6, 1.4, 'accent-red');
  ctx.props.flowerBed(6, 6, 1.4, 'accent-red');
  ctx.props.flowerBed(0, 9, 1.4, 'gold');
  ctx.props.flowerBed(0, -10, 1.4, 'gold');
  ctx.props.bollards(-6, 22.5, 6, 22.5, 4);
  ctx.props.bollards(-6, -22.5, 6, -22.5, 4);
  // Мощение (FR-19.7): швы посередине между полосами плит (шаг полос 8) — клетка 4 × 4;
  // под памятником и газонными вставками углов швы не нужны.
  pavingSeams(
    ctx,
    'stone-light',
    [-16, -8, 0, 8, 16],
    [
      groundRect(0, 0, 5, 5, 0.5),
      ...[-18, 18].flatMap((x) => [-18, 18].map((z) => groundRect(x, z, 8, 8))),
    ],
  );
}

function campus(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46);
  const hall = { x: 0, z: -9, w: 36, d: 12 };
  ctx.buildings.campusHall(hall, int(ctx.rng, 3, 4));
  const wing = { x: -15, z: 10, w: 10, d: 14 };
  ctx.buildings.panelHouse(wing, 3, 'white');
  ctx.b.box(4, LAWN_Y + 0.02, 12, 24, 0.04, 2, ctx.m.color('sand'));
  ctx.b.box(4, LAWN_Y + 0.02, 4, 2, 0.04, 18, ctx.m.color('sand'));
  scatterTrees(
    ctx,
    6,
    (x, z) =>
      insideRect(x, z, hall.x, hall.z, hall.w, hall.d, 2.5) ||
      insideRect(x, z, wing.x, wing.z, wing.w, wing.d) ||
      Math.abs(z - 12) < 2 ||
      Math.abs(x - 4) < 2,
  );
  ctx.props.bench(8, 9, 0);
  ctx.props.bench(14, 15, Math.PI / 2);
  ctx.props.lamp(20, 20);
  // Благоустройство (FR-17.5): изгороди у фасада, клумбы, кусты.
  ctx.props.hedge(-9, -1.8, 16, 0.6);
  ctx.props.hedge(13, -1.8, 14, 0.6);
  ctx.props.flowerBed(8, 19, 1.4, 'accent-red');
  ctx.props.flowerBed(-4, 19, 1.4, 'gold');
  ctx.props.bush(21, -21, 1);
  ctx.props.bush(-21, -21, 1);
  ctx.props.bush(21, 6, 1.1);
  // Велопарковка у входа (TSK-103): в проёме между изгородями (x ∈ (-1, 6)), южнее
  // изгороди (z −1.8, край −1.5) и севернее дорожки (x ∈ [3, 5]) — запас ≥ 0.3.
  ctx.props.bikeRack(1.5, -0.8, 0);
}

/** Торговый центр (FR-15.1): корпус с вывеской и парковка перед входом. */
function mall(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sidewalk');
  // Фасад ТЦ и парковка — на видимой стороне квартала (BUG-13): раскладка зеркалится по z.
  // Прежде фасад был жёстко на локальной +Z, и при поворотах 2 и 3 камера видела глухую стену.
  const s = -ctx.hidden.z as 1 | -1;
  const accents: PaletteKey[] = ['gold', 'accent-red', 'flag-blue', 'glass-teal'];
  ctx.buildings.mall(
    { x: 0, z: -7 * s, w: 40, d: 24 },
    accents[int(ctx.rng, 0, accents.length - 1)] ?? 'gold',
  );
  ctx.b.plane(0, LAWN_Y + 0.03, 15 * s, 44, 12, ctx.m.color('asphalt'));
  for (let i = 0; i < 9; i++) {
    // Разделители мест — в батч деталей, как и вся остальная разметка парковок.
    ctx.detail.box(-18 + i * 4.5, LAWN_Y + 0.05, 15 * s, 0.15, 0.02, 9, ctx.m.color('marking'));
    if (i < 8 && ctx.rng() < 0.7) {
      // Зеркало по z меняет знак поворота вокруг Y.
      ctx.props.parkedCar(-15.75 + i * 4.5, 15 * s, (s * Math.PI) / 2, i);
    }
  }
  ctx.props.flagpole(-20, 2 * s, 9);
  ctx.props.lamp(20, 2 * s);
  ctx.props.lamp(-20, 22 * s);
  ctx.props.lamp(20, 22 * s);
  ctx.props.tree(-22, -20 * s, 1.0);
  ctx.props.tree(22, -20 * s, 1.0);
  // Доп. отмеченные места у правого края парковки (TSK-104, FR-18.5): площадка —
  // x ∈ [-22, 22], z ∈ [9, 21] (зеркально при s = −1); ряд у x = 20 не задевает существующие
  // делители (те доходят до x = 18).
  parkingMarkings(ctx, 20, 15 * s, 5, LAWN_Y + 0.05);
  // Благоустройство (FR-17.5): изгороди между корпусом и парковкой, клумбы у входа, столбики.
  ctx.props.hedge(-12.5, 7.6 * s, 13, 0.7);
  ctx.props.hedge(12.5, 7.6 * s, 13, 0.7);
  ctx.props.flowerBed(-4, 7.6 * s, 1.3, 'accent-red');
  ctx.props.flowerBed(4, 7.6 * s, 1.3, 'accent-red');
  ctx.props.bollards(-6, 22.5 * s, 6, 22.5 * s, 4);
  // Велопарковка у входа (TSK-103): между клумбами (края ±2.7), на одной линии с ними.
  ctx.props.bikeRack(0, 7.6 * s, 0);
}

/**
 * Газонные полосы по краям рынка (FR-19.26, design D28): восточная — под двумя прежними
 * деревьями, западная — под кустами; в `trees` — только новые деревья.
 */
export const MARKET_LAWNS: readonly LawnIsland[] = [
  { x: 18.5, z: -9, w: 8, d: 22, trees: [[19.5, -1, 0.9]] },
  { x: -20.5, z: 12.5, w: 5, d: 19, trees: [[-20.5, 12, 0.9]] },
];

function market(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sand');
  const hall = { x: -6, z: -10, w: 26, d: 16 };
  ctx.buildings.marketHall(hall);
  const roofs: PaletteKey[] = ['accent-red', 'flag-blue', 'gold', 'glass-teal', 'white'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const x = -13 + i * 8;
      const z = 6 + j * 6;
      ctx.buildings.stall(x, z, roofs[(i + j) % roofs.length] ?? 'accent-red');
    }
  }
  ctx.props.tree(18, -14, 1.1);
  ctx.props.tree(20, -6, 0.9);
  ctx.props.lamp(20, 20);
  ctx.props.lamp(-20, 20);
  // Благоустройство (FR-17.5): столбики между павильоном и рядами, кусты, клумба.
  ctx.props.bollards(-14, 1, 10, 1, 5);
  ctx.props.bush(-21, 8, 1);
  ctx.props.bush(-21, 16, 1.1);
  ctx.props.flowerBed(17, 5, 1.4, 'gold');
  lawnIslands(ctx, MARKET_LAWNS);
}

/** Внутренняя грань стенок набережной, |z| (стенка 0.8 с центром на 24.6). */
export const RIVER_WALL_INNER = 24.2;
/** Край настила набережной над водой, |z| (настил 3.2 с центром на −23.4). */
export const RIVER_DECK_EDGE = 21.8;

/**
 * Русло Есиль (FR-14): вода на всю ширину чанка (включая полосу моста N–S), набережная
 * с парапетом, фонарями и скамейками вдоль дороги E–W, берега-стенки, пара лодок.
 * Квартал не поворачивается; локальный (0,0) = чанк (5,5): вода x ∈ [−35, 25], z ∈ [−25, 25].
 */
function river(ctx: Ctx): void {
  const water = ctx.m.color('water');
  const concrete = ctx.m.color('concrete');
  const stone = ctx.m.color('stone-light');
  ctx.b.plane(-5, RIVER.WATER_Y, 0, 60, 50, water);
  // Берега: северная стенка под набережной и южная у следующего ряда. Стенки темнеют к урезу, а
  // на воде вдоль каждой — полоса AO в сторону русла (FR-19.24, design D26): вода лежит в русле.
  // Набережная — настил над водой от стенки до парапета (`RIVER_DECK_EDGE`), поэтому северная
  // полоса идёт от стенки под настилом и выходит за его край ещё на ширину ореола; южную первые
  // ≈ 1.7 от стенки закрывает сама стенка (квартал реки не поворачивается, камера — с юга).
  const aoY = RIVER.WATER_Y + AO.GROUND_LIFT;
  for (const side of [-1, 1] as const) {
    ctx.b.boxAo(
      -5,
      RIVER.WATER_Y / 2 - 0.1,
      side * (RIVER_WALL_INNER + 0.4),
      60,
      -RIVER.WATER_Y + 0.35,
      0.8,
      concrete,
    );
    const toWater = {
      px: 0,
      nx: 0,
      pz: side < 0 ? RIVER_WALL_INNER - RIVER_DECK_EDGE + AO.GROUND_WIDTH : 0,
      nz: side > 0 ? AO.GROUND_WIDTH : 0,
    };
    ctx.b.halo(-5, side * 24.6, 60, 0.8, aoY, toWater, water, AO.GROUND_MIN);
  }
  // Набережная: настил, парапет, фонари, скамейки.
  ctx.b.plane(-5, CURB_Y, -(RIVER_DECK_EDGE + 1.6), 60, 3.2, stone);
  ctx.b.box(-5, CURB_Y + 0.5, -21.9, 60, 1, 0.3, ctx.m.color('white'));
  // Фонари набережной ставит Roads (ряд у дороги); здесь — только скамейки у парапета.
  ctx.props.bench(-14, -23.2, 0);
  ctx.props.bench(6, -23.2, 0);
  ctx.props.bench(16, -23.2, 0);
  // Лодки на воде.
  for (const [x, z, rot] of [
    [8, 6, 0.4],
    [-10, 14, -0.9],
  ] as const) {
    ctx.b.box(x, RIVER.WATER_Y + 0.35, z, 4, 0.7, 1.6, ctx.m.color('white'), rot);
    ctx.b.box(x - 0.6, RIVER.WATER_Y + 1.1, z, 1.4, 0.8, 1.2, ctx.m.color('flag-blue'), rot);
  }
}

function stadium(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sidewalk');
  ctx.buildings.stadium(0, 0, 21, 16);
  for (let i = 0; i < 5; i++) {
    ctx.props.parkedCar(-16 + i * 7, 21, 0, i);
  }
  ctx.props.lamp(-22, -22);
  ctx.props.lamp(22, -22);
  // Отмеченные места у парковки (TSK-104, FR-18.5): правее существующего ряда машин
  // (тот занимает x до ≈ 13,8); своей площадки-покрытия у стадиона нет — линии лежат
  // прямо на уровне тротуара (`lawn`) + 0.02.
  parkingMarkings(ctx, 19, 21, 4, LAWN_Y + 0.02);
  // Благоустройство (FR-17.5): изгороди по бокам, столбики, флагштоки у входа.
  ctx.props.hedge(-23.5, 0, 0.7, 14);
  ctx.props.hedge(23.5, 0, 0.7, 14);
  ctx.props.bollards(-8, -19, 8, -19, 4);
  ctx.props.bollards(-8, 24, 8, 24, 4);
  ctx.props.flagpole(-16, -22, 8);
  ctx.props.flagpole(16, -22, 8);
}
