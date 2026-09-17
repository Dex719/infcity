import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/**
 * Мечеть Хазрет Султан (FR-15.2): белый корпус, большой бирюзовый купол на барабане,
 * малые купола, четыре минарета с балконами, портал входа.
 */
export function buildHazretSultan(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['hazret-sultan']; // 40
  const white = m.color('white');
  const teal = m.color('glass-teal');
  const gold = m.color('gold');
  const bodyH = 13;

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('sand'));
  b.plane(0, LAWN_Y + 0.02, 0, 40, 40, m.color('stone-light'));
  b.box(0, bodyH / 2, 0, 32, bodyH, 32, white);
  b.box(0, bodyH + 0.3, 0, 33, 0.6, 33, m.color('sand'));
  // Главный купол.
  b.place(Templates.cylinder16, 0, bodyH + 2, 0, 9, 4, 9, white);
  b.place(Templates.sphere16, 0, bodyH + 4 + 2.5, 0, 9.5, 8.5, 9.5, teal);
  b.box(0, bodyH + 14.5, 0, 0.3, 3, 0.3, gold);
  // Малые купола по углам корпуса.
  for (const [x, z] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ] as const) {
    b.place(Templates.cylinder16, x, bodyH + 1, z, 3.2, 2, 3.2, white);
    b.place(Templates.sphereLow, x, bodyH + 2.6, z, 3.4, 3, 3.4, teal);
  }
  // Портал входа с аркой.
  b.box(0, 8, 17.5, 12, 16, 3, white);
  b.box(0, 3.2, 19.1, 5, 6.4, 0.3, m.color('glass-navy'));
  b.box(0, 16.6, 17.5, 13, 1.2, 3.6, gold);
  // Минареты.
  for (const [x, z] of [
    [-19, -19],
    [19, -19],
    [-19, 19],
    [19, 19],
  ] as const) {
    const minaretH = total - 4;
    b.place(Templates.cylinder8, x, minaretH / 2, z, 1.3, minaretH, 1.3, white);
    b.place(Templates.cylinder16, x, minaretH * 0.55, z, 2, 0.5, 2, gold);
    b.place(Templates.cylinder16, x, minaretH * 0.8, z, 1.9, 0.5, 1.9, gold);
    b.place(Templates.sphereLow, x, minaretH + 1, z, 1.5, 1.8, 1.5, teal);
    b.box(x, total - 0.5, z, 0.2, 3, 0.2, gold);
  }
  ctx.props.fountain(0, 22.5, 2);
  ctx.props.lamp(-14, 22, 4);
  ctx.props.lamp(14, 22, 4);

  // Детали итерации 3 (FR-17.3): арочные окна корпуса, эмблемы куполов, сад с изгородями
  // и клумбами, столбики у портала.
  const g = ctx.glass;
  const navy = m.color('glass-navy');
  for (let i = 0; i < 5; i++) {
    const p = -10 + i * 5;
    g.box(p, 6, -16.06, 2, 4.5, 0.12, navy);
    g.box(-16.06, 6, p, 0.12, 4.5, 2, navy);
    g.box(16.06, 6, p, 0.12, 4.5, 2, navy);
    if (p !== 0) {
      g.box(p, 6, 16.06, 2, 4.5, 0.12, navy);
    }
    b.box(p, 8.6, -16.1, 2.4, 0.5, 0.2, gold);
    b.box(-16.1, 8.6, p, 0.2, 0.5, 2.4, gold);
    b.box(16.1, 8.6, p, 0.2, 0.5, 2.4, gold);
  }
  b.placeRotated(Templates.cylinder16, 0, bodyH + 16.7, 0, 0.8, 0.12, 0.8, Math.PI / 2, 0, 0, gold);
  for (const [x, z] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ] as const) {
    b.box(x, bodyH + 6.2, z, 0.15, 1.2, 0.15, gold);
    b.placeRotated(Templates.cylinder16, x, bodyH + 7, z, 0.4, 0.1, 0.4, Math.PI / 2, 0, 0, gold);
  }
  ctx.props.hedge(-22.5, 0, 0.9, 24);
  ctx.props.hedge(22.5, 0, 0.9, 24);
  ctx.props.flowerBed(-8, 22.5, 1.5, 'accent-red');
  ctx.props.flowerBed(8, 22.5, 1.5, 'accent-red');
  ctx.props.bollards(-9, 20.2, -3, 20.2, 3);
  ctx.props.bollards(3, 20.2, 9, 20.2, 3);
}
