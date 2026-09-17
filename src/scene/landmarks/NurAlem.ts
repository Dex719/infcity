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
  for (let i = -20; i <= 20; i += 10) {
    b.box(i, LAWN_Y + 0.02, 0, 0.5, 0.04, 46, m.color('sand'));
  }
  b.box(0, podiumH / 2, 0, 26, podiumH, 26, m.color('white'));
  b.box(0, podiumH + 0.3, 0, 27, 0.6, 27, m.color('glass-teal'));
  b.place(Templates.sphere16, 0, centerY, 0, r - 0.6, r - 0.6, r - 0.6, m.color('glass-navy'));
  g.place(Templates.sphere16, 0, centerY, 0, r, r, r, m.color('glass-blue'));
  b.place(Templates.cylinder16, 0, centerY, 0, r + 0.7, 0.5, r + 0.7, m.color('white'));
  b.place(Templates.cylinder16, 0, centerY - 4, 0, r + 0.2, 0.35, r + 0.2, m.color('white'));
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
}
