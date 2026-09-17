import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/**
 * Астана Опера (FR-15.2): классический театр — корпус, портик на восьми колоннах,
 * фронтон, парадная лестница, фонтаны по сторонам.
 */
export function buildAstanaOpera(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const h = LANDMARKS.HEIGHT['astana-opera']; // 20
  const white = m.color('white');
  const stone = m.color('stone-light');

  b.plane(0, LAWN_Y, 0, 46, 46, stone);
  b.plane(-19, LAWN_Y + 0.06, -4, 7, 30, m.color('grass'));
  b.plane(19, LAWN_Y + 0.06, -4, 7, 30, m.color('grass'));

  // Корпус и сценическая коробка.
  const bodyH = h * 0.7;
  b.box(0, bodyH / 2, -4, 30, bodyH, 24, white);
  b.box(0, h / 2, -10, 20, h, 10, white);
  b.box(0, bodyH + 0.3, -4, 31, 0.6, 25, m.color('sand'));
  b.box(0, h + 0.3, -10, 21, 0.6, 11, m.color('sand'));
  // Окна-арки по бокам.
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const z = -13 + i * 4.5;
      ctx.glass.box(side * 15.06, bodyH * 0.55, z, 0.12, bodyH * 0.5, 2.2, m.color('glass-navy'));
    }
  }
  // Портик: колонны, антаблемент, фронтон.
  const front = 8;
  for (let i = 0; i < 8; i++) {
    const x = -12.25 + i * 3.5;
    b.place(Templates.cylinder8, x, bodyH / 2, front + 3, 0.6, bodyH, 0.6, white);
    b.box(x, bodyH - 0.4, front + 3, 1.4, 0.8, 1.4, stone);
  }
  b.box(0, bodyH + 0.5, front + 3, 30, 1, 5, white);
  b.place(Templates.pyramid4, 0, bodyH + 2.4, front + 3, 21.2, 2.6, 4.2, stone, Math.PI / 4);
  b.box(0, bodyH + 3.9, front + 3, 3, 1.2, 1.5, m.color('gold'));
  // Парадная лестница.
  for (let i = 0; i < 5; i++) {
    b.box(0, 0.25 + i * 0.5, front + 6.6 + i * 1.1, 24 - i * 2, 0.5, 1.2, white);
  }
  ctx.props.fountain(-16, 19, 2.6);
  ctx.props.fountain(16, 19, 2.6);
  ctx.props.lamp(-8, 22, 4);
  ctx.props.lamp(8, 22, 4);
  ctx.props.flagpole(-21, 20, 9);
  ctx.props.flagpole(21, 20, 9);
  ctx.props.tree(-19, -18, 1.0, 1);
  ctx.props.tree(19, -18, 1.0, 1);

  // Детали итерации 3 (FR-17.3): скульптуры на фронтоне, окна сценической коробки,
  // фонари вдоль лестницы, изгороди газонов.
  const g = ctx.glass;
  const gold = m.color('gold');
  for (const [x, y] of [
    [-13, bodyH + 2.1],
    [13, bodyH + 2.1],
    [0, bodyH + 5.5],
  ] as const) {
    b.box(x, y, front + 3, 0.8, 2, 0.8, gold);
    b.place(Templates.sphereLow, x, y + 1.35, front + 3, 0.42, 0.42, 0.42, gold);
  }
  for (let i = 0; i < 3; i++) {
    g.box(-10.06, 12, -13 + i * 3, 0.12, 3, 1.6, m.color('glass-navy'));
    g.box(10.06, 12, -13 + i * 3, 0.12, 3, 1.6, m.color('glass-navy'));
  }
  for (let i = 0; i < 4; i++) {
    g.box(-6 + i * 4, 12, -15.06, 1.8, 3, 0.12, m.color('glass-navy'));
  }
  ctx.props.lamp(-14, 15.5, 3);
  ctx.props.lamp(14, 15.5, 3);
  ctx.props.lamp(-10.5, 19.5, 3);
  ctx.props.lamp(10.5, 19.5, 3);
  for (const s of [-1, 1]) {
    ctx.props.hedge(s * 16.2, -4, 0.8, 26);
    ctx.props.hedge(s * 22.6, -4, 0.8, 26);
  }
}
