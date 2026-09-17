import { LANDMARKS } from '@/config';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;
const FLOOR = 2.7;

/**
 * Штаб-квартира КазМунайГаз (FR-15.2): два симметричных крыла и высокая арка-«ворота»
 * между ними, сквозь которую видна площадь.
 */
export function buildKazMunayGas(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT.kazmunaygas; // 34
  const stone = m.color('stone-light');
  const wingH = total - 4;
  const wingW = 13;
  const wingD = 26;

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('sand'));
  b.plane(0, LAWN_Y + 0.02, 0, 40, 40, stone);
  for (const side of [-1, 1]) {
    const x = side * 12;
    b.box(x, wingH / 2, -2, wingW, wingH, wingD, stone);
    const floors = Math.floor(wingH / FLOOR);
    for (let i = 0; i < floors; i++) {
      const y = i * FLOOR + FLOOR * 0.55;
      ctx.glass.box(
        x,
        y,
        -2 + wingD / 2 + 0.06,
        wingW * 0.7,
        FLOOR * 0.45,
        0.12,
        m.color('glass-navy'),
      );
      ctx.glass.box(
        x,
        y,
        -2 - wingD / 2 - 0.06,
        wingW * 0.7,
        FLOOR * 0.45,
        0.12,
        m.color('glass-navy'),
      );
      ctx.glass.box(
        x + side * (wingW / 2 + 0.06),
        y,
        -2,
        0.12,
        FLOOR * 0.45,
        wingD * 0.7,
        m.color('glass-navy'),
      );
    }
    b.box(x, wingH + 0.3, -2, wingW + 0.4, 0.6, wingD + 0.4, m.color('white'));
  }
  // Арка: перемычка и золотые пояса.
  b.box(0, wingH - 3.5, -2, 12, 7, wingD * 0.8, stone);
  b.box(0, wingH + 0.3, -2, 12.4, 0.6, wingD * 0.8 + 0.4, m.color('white'));
  b.box(0, wingH - 7.2, -2, 12.2, 0.5, wingD * 0.8 + 0.2, m.color('gold'));
  ctx.glass.box(0, wingH - 3.5, -2 + (wingD * 0.8) / 2 + 0.06, 9, 5, 0.12, m.color('glass-teal'));
  // Площадь под аркой: флаги и фонтан.
  ctx.props.flagpole(-4, 16, 9);
  ctx.props.flagpole(4, 16, 9);
  ctx.props.fountain(0, 20, 2.4);
  ctx.props.lamp(-20, 20, 4);
  ctx.props.lamp(20, 20, 4);
  ctx.props.tree(-20, -20, 0.9, 1);
  ctx.props.tree(20, -20, 0.9, 1);

  // Детали итерации 3 (FR-17.3): пилястры крыльев, золотой карниз арки, козырёк входа,
  // планеры с клумбами и изгороди.
  const white = m.color('white');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      b.box(side * 18.65, wingH / 2, -13 + i * 4.3, 0.4, wingH, 0.7, white);
    }
    for (let i = 0; i < 4; i++) {
      b.box(side * (6.5 + i * 3.6), wingH / 2, 11.1, 0.7, wingH, 0.4, white);
    }
    ctx.props.hedge(side * 21.5, -2, 0.9, 20);
    ctx.props.flowerBed(side * 9, 20, 1.5, 'gold');
  }
  b.box(0, wingH + 0.9, -2, 12.6, 0.5, wingD * 0.8 + 0.6, m.color('gold'));
  ctx.props.canopy(0, 13.5, 8, 2.6, 4);
  // Волна 2 (FR-17.7): флаги у арки, фонари, изгороди под аркой, столбики.
  for (const x of [-10, 10, -16, 16]) {
    ctx.props.flagpole(x, 15.5, 8);
  }
  for (const [x, z] of [
    [-8, 23],
    [8, 23],
    [-22, 12],
    [22, 12],
  ] as const) {
    ctx.props.lamp(x, z, 3.5);
  }
  ctx.props.hedge(-4.5, -2, 0.7, 14);
  ctx.props.hedge(4.5, -2, 0.7, 14);
  ctx.props.bollards(-5, 10, 5, 10, 4);
  ctx.props.bollards(-5, -14.5, 5, -14.5, 4);
}
