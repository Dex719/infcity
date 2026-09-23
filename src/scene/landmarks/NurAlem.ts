import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/** Нур Алем (FR-4.6): стеклянная сфера на подиуме, экваториальная галерея, площадь EXPO. */
export function buildNurAlem(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const g = ctx.glass;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['nur-alem']; // 34
  const podiumH = 6;
  const r = (total - podiumH) / 2; // 14
  const centerY = podiumH + r;

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  ctx.ao.ground('stone-light');
  for (let i = -20; i <= 20; i += 10) {
    b.box(i, LAWN_Y + 0.02, 0, 0.5, 0.04, 46, m.color('sand'));
  }
  b.boxAo(0, podiumH / 2, 0, 26, podiumH, 26, m.color('white'));
  ctx.ao.footprint(0, 0, 26, 26);
  b.box(0, podiumH + 0.3, 0, 27, 0.6, 27, m.color('glass-teal'));
  b.place(Templates.sphere16, 0, centerY, 0, r - 0.6, r - 0.6, r - 0.6, m.color('glass-navy'));
  g.place(Templates.sphere16, 0, centerY, 0, r, r, r, m.color('glass-blue'));
  b.place(Templates.cylinder16, 0, centerY, 0, r + 0.7, 0.5, r + 0.7, m.color('white'));
  b.place(Templates.cylinder16, 0, centerY - 4, 0, r + 0.2, 0.35, r + 0.2, m.color('white'));
  // Панели сферы: кольца широт (FR-15.3).
  for (const dy of [-8, 5, 9]) {
    const rr = Math.sqrt(r * r - dy * dy) + 0.25;
    b.place(Templates.cylinder16, 0, centerY + dy, 0, rr, 0.25, rr, m.color('white'));
  }
  // Павильоны Expo по бокам подиума.
  for (const side of [-1, 1]) {
    b.box(side * 19, 2.5, 2, 8, 5, 12, m.color('white'));
    g.box(side * 14.95, 2.2, 2, 0.12, 3.6, 10, m.color('glass-teal'));
    b.box(side * 19, 5.3, 2, 8.6, 0.5, 12.6, m.color('flag-blue'));
  }
  // Роботы-гиды у лестницы.
  ctx.props.robot(-7, 22, 0.5);
  ctx.props.robot(0, 23.2, 0);
  ctx.props.robot(7, 22, -0.5);
  // Лестница-пандус к подиуму и флагштоки.
  for (let i = 0; i < 5; i++) {
    b.box(0, 0.5 + i * 1.1, 16 + i * 1.2, 12, 1.1, 1.4, m.color('white'));
  }
  ctx.props.flagpole(-16, -18, 10);
  ctx.props.flagpole(16, -18, 10);
  for (const [x, z] of [
    [-20, 20],
    [20, 20],
    [-20, -20],
    [20, -20],
  ] as const) {
    ctx.props.tree(x, z, 1.0);
  }
  ctx.props.lamp(-14, 20, 4);
  ctx.props.lamp(14, 20, 4);

  // Детали итерации 3 (FR-17.3): меридианы сферы, ряд флагов Expo, окна павильонов,
  // вывеска EXPO на подиуме, клумбы у лестницы.
  const white = m.color('white');
  const levels = [-8, -3, 3, 9];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    for (let k = 0; k < levels.length - 1; k++) {
      const y0 = levels[k] ?? 0;
      const y1 = levels[k + 1] ?? 0;
      const r0 = Math.sqrt(r * r - y0 * y0) + 0.3;
      const r1 = Math.sqrt(r * r - y1 * y1) + 0.3;
      b.strut(
        Math.cos(a) * r0,
        centerY + y0,
        Math.sin(a) * r0,
        Math.cos(a) * r1,
        centerY + y1,
        Math.sin(a) * r1,
        0.28,
        white,
      );
    }
  }
  for (let i = 0; i < 6; i++) {
    ctx.props.flagpole(-12.5 + i * 5, -23, 7);
  }
  for (const side of [-1, 1]) {
    g.box(side * 23.06, 2.6, 2, 0.12, 2.2, 10, m.color('glass-navy'));
    g.box(side * 19, 2.6, 8.06, 6, 2.2, 0.12, m.color('glass-navy'));
  }
  for (let i = 0; i < 4; i++) {
    b.box(-4.5 + i * 3, 4.2, 13.2, 2.2, 1.6, 0.3, m.color('gold'));
  }
  ctx.props.flowerBed(-10, 18, 1.5, 'accent-red');
  ctx.props.flowerBed(10, 18, 1.5, 'accent-red');
  // Волна 2 (FR-17.7): кольца мощения площади, фонари вокруг подиума, киоски.
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.03, 0, 19.5, 0.03, 19.5, white);
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.05, 0, 18.6, 0.03, 18.6, m.color('sand'));
  for (const [x, z] of [
    [-10, 15],
    [10, 15],
    [-16, 9],
    [16, 9],
    [-16, -9],
    [16, -9],
  ] as const) {
    ctx.props.lamp(x, z, 3.5);
  }
  for (const x of [-22, 22]) {
    b.box(x, 1.3, 12, 2.4, 2.6, 2.4, white);
    b.box(x, 2.8, 12, 3, 0.3, 3, m.color('flag-blue'));
    g.box(x, 1.4, 13.26, 1.8, 1.2, 0.1, m.color('glass-teal'));
  }
}
