import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/**
 * ТЦ Mega Silk Way (FR-15.1, FR-15.2): длинный корпус с волнистой крышей из «труб»,
 * стеклянный фасад, вывеска, большая парковка.
 */
export function buildMegaSilkWay(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const g = ctx.glass;
  const m = ctx.m;
  const h = LANDMARKS.HEIGHT['mega-silk-way'] - 4; // 10: корпус, +4 — волны крыши
  const white = m.color('white');
  const gold = m.color('gold');
  const body = { x: 0, z: -8, w: 44, d: 26 };

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('sidewalk'));
  ctx.ao.ground('sidewalk');
  b.boxAo(body.x, h / 2, body.z, body.w, h, body.d, m.color('stone-light'));
  ctx.ao.footprint(body.x, body.z, body.w, body.d);
  // Ленточное остекление и стеклянный фасад со стороны входа.
  g.box(
    body.x,
    h * 0.55,
    body.z + body.d / 2 + 0.06,
    body.w - 6,
    h * 0.6,
    0.12,
    m.color('glass-teal'),
  );
  g.box(
    body.x - body.w / 2 - 0.06,
    h * 0.55,
    body.z,
    0.12,
    h * 0.4,
    body.d - 4,
    m.color('glass-blue'),
  );
  g.box(
    body.x + body.w / 2 + 0.06,
    h * 0.55,
    body.z,
    0.12,
    h * 0.4,
    body.d - 4,
    m.color('glass-blue'),
  );
  // Волнистая крыша: полузаглублённые трубы вдоль z.
  for (let i = 0; i < 6; i++) {
    const x = body.x - body.w / 2 + 3.7 + i * 7.3;
    b.placeRotated(
      Templates.cylinder16,
      x,
      h + 0.4,
      body.z,
      3.6,
      body.d - 1,
      2.6,
      Math.PI / 2,
      0,
      0,
      white,
    );
  }
  // Входной портал и вывеска.
  const front = body.z + body.d / 2;
  b.box(0, 4, front + 1.5, 14, 8, 3, white);
  g.box(0, 3, front + 3.05, 11, 5.6, 0.15, m.color('glass-blue'));
  b.box(0, h + 3, front - 1, 16, 2.6, 0.5, white);
  for (let i = 0; i < 4; i++) {
    b.box(-5.4 + i * 3.6, h + 3, front - 0.7, 2.6, 1.6, 0.25, gold);
  }
  // Парковка с разметкой.
  b.plane(0, LAWN_Y + 0.04, 15, 44, 14, m.color('asphalt'));
  for (let i = 0; i < 10; i++) {
    b.box(-20.25 + i * 4.5, LAWN_Y + 0.07, 15, 0.15, 0.02, 10, m.color('marking'));
    if (i < 9 && ctx.rng() < 0.75) {
      ctx.props.parkedCar(-18 + i * 4.5, 15, Math.PI / 2, i);
    }
  }
  ctx.props.flagpole(-21, 5, 9);
  ctx.props.flagpole(21, 5, 9);
  ctx.props.lamp(-22, 22, 5);
  ctx.props.lamp(22, 22, 5);

  // Детали итерации 3 (FR-17.3): световые фонари на волнах крыши, вывеска MEGA на крыше,
  // остановка у парковки, изгороди.
  for (let i = 0; i < 6; i++) {
    const x = body.x - body.w / 2 + 3.7 + i * 7.3;
    g.box(x, h + 3.05, body.z, 1.6, 0.16, body.d - 6, m.color('glass-teal'));
  }
  b.box(-11.2, h + 4.6, body.z - 6.3, 14, 2.6, 0.2, white);
  for (let i = 0; i < 4; i++) {
    b.box(-16 + i * 3.2, h + 4.6, body.z - 6, 2.4, 2.2, 0.4, m.color('accent-red'));
  }
  b.box(-16.6, h + 3.8, body.z - 6, 0.3, 1.6, 0.3, m.color('steel'));
  b.box(-5.8, h + 3.8, body.z - 6, 0.3, 1.6, 0.3, m.color('steel'));
  ctx.props.busStop(-23.5, -16, Math.PI / 2);
  ctx.props.hedge(-14, 7.6, 14, 0.8);
  ctx.props.hedge(14, 7.6, 14, 0.8);
  // Волна 2 (FR-17.7): мачты освещения парковки, ограждения тележек, вентиляция на крыше.
  for (const x of [-11.25, 2.25, 15.75]) {
    b.box(x, 4.5, 15, 0.3, 9, 0.3, m.color('steel'));
    b.box(x, 9.1, 15, 2.6, 0.3, 0.6, white);
  }
  ctx.props.bollards(-21, 9.5, -17, 9.5, 3);
  ctx.props.bollards(17, 9.5, 21, 9.5, 3);
  for (let i = 0; i < 6; i++) {
    const x = body.x - body.w / 2 + 3.7 + i * 7.3;
    b.box(x, h + 3.4, -19.5, 1.6, 0.8, 1.6, m.color('steel'));
  }
}
