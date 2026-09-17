import { LANDMARKS } from '@/config';
import type { PaletteKey } from '@/scene/palette';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/** Стеклянная башня комплекса: ядро, оболочка, стальные пояса, «корона». */
function tower(
  ctx: LandmarkContext,
  x: number,
  z: number,
  w: number,
  h: number,
  tint: PaletteKey,
): void {
  const b = ctx.opaque;
  const m = ctx.m;
  b.box(x, h / 2, z, w - 1, h, w - 1, m.shade(tint, 0.55));
  ctx.glass.box(x, h / 2, z, w, h, w, m.color(tint));
  for (let y = 5.4; y < h; y += 5.4) {
    b.box(x, y, z, w + 0.2, 0.18, w + 0.2, m.color('steel'));
  }
  b.box(x, h + 0.3, z, w + 0.4, 0.6, w + 0.4, m.color('white'));
  b.box(x, h + 1.8, z, w * 0.6, 2.4, w * 0.6, m.shade(tint, 0.7));
}

/**
 * Абу-Даби Плаза (FR-15.2): самая высокая башня комплекса, две башни пониже
 * и стеклянный подиум-ТЦ с площадью.
 */
export function buildAbuDhabiPlaza(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['abu-dhabi-plaza']; // 50

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  // Подиум с торговой галереей.
  b.box(0, 3, 0, 40, 6, 40, m.color('white'));
  ctx.glass.box(0, 2.4, 0, 40.6, 4.2, 40.6, m.color('glass-teal'));
  b.box(0, 6.3, 0, 41, 0.6, 41, m.color('steel'));

  tower(ctx, -6, -6, 14, total, 'glass-blue');
  tower(ctx, 10, 8, 11, 36, 'glass-navy');
  tower(ctx, -11, 13, 9, 28, 'glass-teal');
  // Шпиль главной башни.
  b.box(-6, total + 3 + 2.5, -6, 0.5, 5, 0.5, m.color('steel'));

  for (const [x, z] of [
    [-22, -22],
    [22, -22],
    [-22, 22],
    [22, 22],
  ] as const) {
    ctx.props.tree(x, z, 1.0);
    ctx.props.lamp(x + (x < 0 ? 2.2 : -2.2), z, 4);
  }
  ctx.props.fountain(0, 21.5, 2.2);
  ctx.props.bench(-6, 22.5, 0);
  ctx.props.bench(6, 22.5, 0);
}
