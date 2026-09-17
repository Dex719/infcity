import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/** Ак Орда (FR-4.6): белый дворец с колоннадой, синим куполом и золотым шпилем, парадная площадь. */
export function buildAkOrda(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['ak-orda']; // 30
  const bodyH = 16;
  const white = m.color('white');
  const blue = m.color('flag-blue');
  const gold = m.color('gold');

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  b.plane(0, LAWN_Y + 0.02, 17, 40, 10, m.color('grass'));
  // Корпус, крылья, карниз.
  b.box(0, bodyH / 2, -4, 30, bodyH, 18, white);
  b.box(-19, 5, -4, 8, 10, 16, white);
  b.box(19, 5, -4, 8, 10, 16, white);
  b.box(0, bodyH + 0.3, -4, 31, 0.6, 19, m.color('sand'));
  // Колоннада по южному фасаду.
  for (let i = 0; i < 9; i++) {
    const x = -12 + i * 3;
    b.place(Templates.cylinder8, x, bodyH / 2, 5.6, 0.55, bodyH, 0.55, white);
  }
  b.box(0, bodyH + 0.2, 5.6, 30, 0.6, 3, white);
  b.place(Templates.pyramid4, 0, bodyH + 1.6, 5.6, 8, 2.4, 3, m.color('sand'), Math.PI / 4);
  // Купол на барабане и шпиль.
  const drumH = 3;
  b.place(Templates.cylinder16, 0, bodyH + drumH / 2, -4, 7.5, drumH, 7.5, white);
  b.place(Templates.sphere16, 0, bodyH + drumH + 1, -4, 7, 6, 7, blue);
  const spireBase = bodyH + drumH + 6.5;
  b.strut(0, spireBase, -4, 0, total, -4, 0.5, gold);
  b.place(Templates.sphereLow, 0, total, -4, 0.7, 0.7, 0.7, gold);
  // Малые купола на крыльях.
  b.place(Templates.sphereLow, -19, 11.5, -4, 2.8, 2.2, 2.8, blue);
  b.place(Templates.sphereLow, 19, 11.5, -4, 2.8, 2.2, 2.8, blue);
  // Площадь: фонтан, флагштоки, фонари.
  ctx.props.fountain(0, 15, 3.5);
  ctx.props.flagpole(-9, 20, 10);
  ctx.props.flagpole(9, 20, 10);
  ctx.props.flagpole(-17, 20, 8);
  ctx.props.flagpole(17, 20, 8);
  // Парадные ворота с золотым фризом (FR-15.3).
  b.box(-6, 3, 22.5, 1.6, 6, 1.6, white);
  b.box(6, 3, 22.5, 1.6, 6, 1.6, white);
  b.box(0, 6.4, 22.5, 14, 0.8, 1.8, white);
  b.box(0, 7.1, 22.5, 14.4, 0.5, 2, gold);
  ctx.props.lamp(-20, 20, 4);
  ctx.props.lamp(20, 20, 4);
  ctx.props.tree(-21, 12, 0.9, 1);
  ctx.props.tree(21, 12, 0.9, 1);

  // Детали итерации 3 (FR-17.3): ряды окон, золотое кольцо купола, балюстрада крыши, клумбы.
  const g = ctx.glass;
  const navy = m.color('glass-navy');
  for (const y of [5, 11]) {
    for (let i = 0; i < 6; i++) {
      g.box(-10 + i * 4, y, -13.06, 2.2, 3, 0.12, navy);
    }
    for (let i = 0; i < 4; i++) {
      g.box(-15.06, y, -10 + i * 3.5, 0.12, 3, 2, navy);
      g.box(15.06, y, -10 + i * 3.5, 0.12, 3, 2, navy);
    }
  }
  for (let i = 0; i < 3; i++) {
    g.box(-23.06, 5, -10 + i * 4.5, 0.12, 2.6, 2, navy);
    g.box(23.06, 5, -10 + i * 4.5, 0.12, 2.6, 2, navy);
  }
  b.place(Templates.cylinder16, 0, bodyH + drumH + 0.2, -4, 7.4, 0.4, 7.4, gold);
  b.box(0, bodyH + 1, -13.2, 31, 0.6, 0.4, white);
  b.box(-15.3, bodyH + 1, -4, 0.4, 0.6, 18, white);
  b.box(15.3, bodyH + 1, -4, 0.4, 0.6, 18, white);
  for (let i = 0; i < 12; i++) {
    b.box(-13.75 + i * 2.5, bodyH + 0.6, -13.2, 0.3, 0.6, 0.3, white);
  }
  ctx.props.flowerBed(-7, 15, 1.6, 'accent-red');
  ctx.props.flowerBed(7, 15, 1.6, 'accent-red');
}
