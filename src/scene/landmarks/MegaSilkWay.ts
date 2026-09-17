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
  b.box(body.x, h / 2, body.z, body.w, h, body.d, m.color('stone-light'));
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
}
