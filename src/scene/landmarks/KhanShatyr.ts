import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;
const LEAN = 0.16; // наклон шатра, радианы (≈ 9°)

/**
 * Хан Шатыр (FR-4.5): наклонённый прозрачно-голубой шатёр на мачте с широким эллиптическим
 * основанием, внутренний корпус торгового центра, ванты от вершины к ободу, площадь с парковкой.
 */
export function buildKhanShatyr(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const g = ctx.glass;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['khan-shatyr']; // 42
  const rx = 20;
  const rz = 17;
  const tentH = total * 0.86;
  const white = m.color('white');

  // Площадь, парковка, зелень.
  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  b.plane(0, LAWN_Y + 0.02, 21, 40, 6, m.color('asphalt'));
  for (let i = 0; i < 7; i++) {
    if (ctx.rng() < 0.75) {
      ctx.props.parkedCar(-15 + i * 5, 21, Math.PI / 2, i);
    }
  }
  for (const [x, z] of [
    [-21, -21],
    [21, -21],
    [-21, 14],
    [21, 14],
  ] as const) {
    ctx.props.tree(x, z, 1.0);
    ctx.props.lamp(x + (x < 0 ? 2.5 : -2.5), z, 4);
  }

  // Основание-подиум (эллипс) и внутренний корпус, чтобы шатёр не выглядел пустым.
  b.place(Templates.cylinder16, 0, 0.6, 0, rx + 1.5, 1.2, rz + 1.5, white);
  b.place(Templates.cylinder16, 0, 1.2 + 4, 0, rx * 0.72, 8, rz * 0.72, m.color('sand'));
  b.place(Templates.cylinder16, 0, 9.5, 0, rx * 0.5, 3, rz * 0.5, m.color('sand'));

  // Шатёр: наклонённый конус в стекле, мачта-шпиль, ванты.
  const centerY = 1.2 + tentH / 2;
  g.placeRotated(
    Templates.cone24,
    0,
    centerY,
    0,
    rx,
    tentH,
    rz,
    0,
    0,
    -LEAN,
    m.color('glass-blue'),
  );
  const apexX = Math.sin(LEAN) * tentH * 0.5;
  const apexY = 1.2 + Math.cos(LEAN) * tentH;
  b.strut(-apexX * 0.6, 1.2, 0, apexX * 1.05, total + 0.5, 0, 0.9, m.color('steel'));
  b.place(Templates.sphereLow, apexX * 1.05, total + 0.6, 0, 0.9, 0.9, 0.9, m.color('gold'));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.strut(apexX, apexY, 0, Math.cos(a) * (rx + 0.6), 1.4, Math.sin(a) * (rz + 0.6), 0.16, white);
  }
  // Средний обод шатра и флагштоки (FR-15.3).
  b.place(
    Templates.cylinder16,
    apexX * 0.5,
    1.2 + tentH * 0.5,
    0,
    rx * 0.52,
    0.3,
    rz * 0.52,
    white,
  );
  ctx.props.flagpole(-8, 23.5, 8);
  ctx.props.flagpole(8, 23.5, 8);
  // Входной портал у южной стороны с аркой.
  b.box(0, 3, rz + 2.2, 10, 6, 2.4, white);
  g.box(0, 2.6, rz + 3.5, 8, 4.4, 0.2, m.color('glass-teal'));
  b.box(-6, 4, rz + 4.5, 1.2, 8, 1.2, white);
  b.box(6, 4, rz + 4.5, 1.2, 8, 1.2, white);
  b.box(0, 8.4, rz + 4.5, 13.4, 1, 1.4, m.color('gold'));

  // Детали итерации 3 (FR-17.3): лента остекления подиума, козырёк, изгороди с клумбами, корона мачты.
  g.place(
    Templates.cylinder16,
    0,
    5.4,
    0,
    rx * 0.72 + 0.15,
    2.2,
    rz * 0.72 + 0.15,
    m.color('glass-teal'),
  );
  ctx.props.canopy(0, 23.8, 8, 2.2, 3.4);
  ctx.props.hedge(-13, 17.6, 12, 0.8);
  ctx.props.hedge(13, 17.6, 12, 0.8);
  ctx.props.flowerBed(-23, 5, 1.4, 'gold');
  ctx.props.flowerBed(23, 5, 1.4, 'gold');
  ctx.props.flowerBed(-23, -5, 1.4, 'accent-red');
  ctx.props.flowerBed(23, -5, 1.4, 'accent-red');
  b.place(Templates.cylinder16, apexX * 1.05, total - 1.4, 0, 1.6, 0.3, 1.6, m.color('gold'));
  b.place(Templates.cylinder16, apexX * 1.05, total - 3.2, 0, 1.2, 0.25, 1.2, m.color('gold'));
  // Волна 2 (FR-17.7): вывеска портала, изгороди вокруг подиума, фонари парковки.
  for (let i = 0; i < 4; i++) {
    b.box(-4.5 + i * 3, 9.6, rz + 4.5, 2.2, 1.2, 0.5, m.color('gold'));
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    ctx.props.hedge(Math.cos(a) * (rx + 1.8), Math.sin(a) * (rz + 1.8), 5, 0.7, -a);
  }
  ctx.props.lamp(-22, 24, 4);
  ctx.props.lamp(22, 24, 4);
}
