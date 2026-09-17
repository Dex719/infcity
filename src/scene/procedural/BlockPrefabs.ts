import { CHUNK_LAYOUT } from '@/config';
import { buildLandmark } from '@/scene/landmarks';
import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { mulberry32 } from '@/world/Hash';
import type { ChunkDescriptor } from '@/world/types';
import { Buildings } from './Buildings';
import { GeometryBatch } from './GeometryBatch';
import { Props } from './Props';

/** Результат сборки квартала в его локальной системе (центр (0,0), ±25). */
export interface BlockGeometry {
  readonly opaque: GeometryBatch;
  readonly glass: GeometryBatch;
}

const HALF = CHUNK_LAYOUT.BLOCK_SIZE / 2; // 25
const CURB_Y = 0.15;
const LAWN_Y = CURB_Y + 0.05;

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
  const props = new Props(opaque, m);
  const buildings = new Buildings(opaque, glass, m);
  const rng = mulberry32(descriptor.variant);
  const ctx: Ctx = { b: opaque, props, buildings, m, rng };

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
      park(ctx);
      break;
    case 'square':
      square(ctx);
      break;
    case 'campus':
      campus(ctx);
      break;
    case 'industrial':
      industrial(ctx);
      break;
    case 'market':
      market(ctx);
      break;
    case 'stadium':
      stadium(ctx);
      break;
    case 'landmark':
      if (descriptor.landmark !== null) {
        buildLandmark(descriptor.landmark, { opaque, glass, props, m, rng });
      }
      break;
  }
  return { opaque, glass };
}

interface Ctx {
  readonly b: GeometryBatch;
  readonly props: Props;
  readonly buildings: Buildings;
  readonly m: Materials;
  readonly rng: Rng;
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
    ctx.props.tree(x, z, between(ctx.rng, 0.8, 1.3), ctx.rng() < 0.3 ? 1 : 0);
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
  ctx.props.playground(0, layout === 0 ? 0 : -1);
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
}

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
      int(ctx.rng, 8, 13),
      accents[int(ctx.rng, 0, accents.length - 1)] ?? 'glass-teal',
    );
  }
  lawn(ctx, 14, 12, 14, 14);
  scatterTrees(ctx, 7, (x, z) => towers.some((t) => insideRect(x, z, t.x, t.z, t.w, t.d)));
  for (let i = 0; i < 4; i++) {
    ctx.props.parkedCar(-18 + i * 4.5, 22, 0, i);
  }
  ctx.props.lamp(0, 0);
  ctx.props.lamp(-20, 20);
}

function businessGlass(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'stone-light');
  const tints: PaletteKey[] = ['glass-blue', 'glass-teal', 'glass-navy'];
  const main = { x: -5, z: -4, w: between(ctx.rng, 16, 19), d: between(ctx.rng, 16, 19) };
  ctx.buildings.glassTower(main, int(ctx.rng, 11, 16), tints[int(ctx.rng, 0, 2)] ?? 'glass-blue');
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
      insideRect(x, z, annex.x, annex.z, annex.w, annex.d, 3),
  );
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
  const back = { x: -8, z: -12, w: 26, d: 11 };
  ctx.buildings.shopRow(
    back,
    int(ctx.rng, 1, 2),
    walls[int(ctx.rng, 0, 3)] ?? 'brick',
    awnings[int(ctx.rng, 0, 3)] ?? 'flag-blue',
  );
  // Парковка между рядами.
  ctx.b.plane(4, CURB_Y + 0.04, 2, 34, 8, ctx.m.color('asphalt'));
  for (let i = 0; i < 6; i++) {
    if (ctx.rng() < 0.7) {
      ctx.props.parkedCar(-10 + i * 5, 2, Math.PI / 2, i);
    }
  }
  ctx.props.lamp(-20, 3);
  ctx.props.lamp(20, 3);
  ctx.props.tree(16, -14, 1.1);
  ctx.props.tree(20, -8, 0.9);
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
    lawn(ctx, x, z, 8, 8);
    ctx.props.tree(x, z, 1.2);
  }
  ctx.props.bench(-10, 8, 0);
  ctx.props.bench(10, 8, 0);
  ctx.props.lamp(-12, 0);
  ctx.props.lamp(12, 0);
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
}

function industrial(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'concrete');
  const a = { x: -8, z: -8, w: 24, d: 18 };
  const b = { x: 12, z: 12, w: 16, d: 14 };
  ctx.buildings.shed(a, int(ctx.rng, 6, 8));
  ctx.buildings.shed(b, int(ctx.rng, 5, 6));
  ctx.props.fence(0, 0, 47, 47);
  for (let i = 0; i < 3; i++) {
    ctx.b.box(-16 + i * 7, 1.6, 15, 5, 3.2, 2.4, ctx.m.color(i === 1 ? 'accent-red' : 'white'));
  }
  ctx.b.box(16, 2, -12, 6, 4, 6, ctx.m.color('steel'));
  ctx.props.lamp(-20, 20);
}

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
}

function stadium(ctx: Ctx): void {
  lawn(ctx, 0, 0, 46, 46, 'sidewalk');
  ctx.buildings.stadium(0, 0, 21, 16);
  for (let i = 0; i < 5; i++) {
    ctx.props.parkedCar(-16 + i * 7, 21, 0, i);
  }
  ctx.props.lamp(-22, -22);
  ctx.props.lamp(22, -22);
}
