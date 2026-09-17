import { LANDMARKS } from '@/config';
import type { PaletteKey } from '@/scene/palette';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;
const FLOOR = 2.7;

/** Волнистая башня: этажи сдвинуты по синусоиде — силуэт «северного сияния». */
function waveTower(
  ctx: LandmarkContext,
  x: number,
  z: number,
  w: number,
  h: number,
  tint: PaletteKey,
  phase: number,
): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const floors = Math.round(h / FLOOR);
  for (let i = 0; i < floors; i++) {
    const shift = Math.sin(i * 0.45 + phase) * 1.3;
    const y = i * FLOOR + FLOOR / 2;
    b.box(x + shift, y, z, w - 0.8, FLOOR, w - 0.8, m.shade(tint, 0.6));
    ctx.glass.box(x + shift, y, z, w, FLOOR - 0.05, w, m.color(tint));
    b.box(x + shift, y + FLOOR / 2, z, w + 0.2, 0.14, w + 0.2, m.color('white'));
  }
  const top = floors * FLOOR;
  const shift = Math.sin(floors * 0.45 + phase) * 1.3;
  b.box(x + shift, top + 0.4, z, w * 0.7, 0.8, w * 0.7, m.color('white'));
}

/** ЖК «Северное сияние» (FR-15.2): три волнистые стеклянные башни разной высоты на подиуме. */
export function buildNorthernLights(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['northern-lights']; // 40

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  b.box(0, 1.5, 0, 42, 3, 30, m.color('white'));
  ctx.glass.box(0, 1.4, 0, 42.4, 2.2, 30.4, m.color('glass-teal'));
  waveTower(ctx, -14, 0, 10, total, 'glass-blue', 0);
  waveTower(ctx, 0, 0, 10, total * 0.85, 'glass-teal', 1.1);
  waveTower(ctx, 14, 0, 10, total * 0.7, 'glass-blue', 2.2);
  b.plane(0, LAWN_Y + 0.06, 20, 40, 8, m.color('grass'));
  for (let i = 0; i < 5; i++) {
    ctx.props.tree(-16 + i * 8, 20, 0.9);
  }
  ctx.props.lamp(-21, 21, 4);
  ctx.props.lamp(21, 21, 4);
  ctx.props.bench(-4, 17, 0);
  ctx.props.bench(4, 17, 0);
}
