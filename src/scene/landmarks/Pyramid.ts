import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/** Дворец мира и согласия (FR-4.6): четырёхгранная пирамида, стеклянная вершина, парадная лестница. */
export function buildPyramid(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const g = ctx.glass;
  const m = ctx.m;
  const h = LANDMARKS.HEIGHT.pyramid; // 30
  const half = 15;
  const base = half * Math.SQRT2; // радиус описанной окружности pyramid4
  const plinthH = 2;

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('grass'));
  b.box(0, plinthH / 2, 0, 36, plinthH, 36, m.color('stone-light'));
  b.place(Templates.pyramid4, 0, plinthH + h / 2, 0, base, h, base, m.color('sand'), Math.PI / 4);
  // Стеклянная верхняя треть чуть больше каменной, чтобы просвечивать поверх.
  const tipH = h / 3;
  const tipBase = (half / 3) * Math.SQRT2 * 1.06;
  g.place(
    Templates.pyramid4,
    0,
    plinthH + h - tipH / 2 + 0.05,
    0,
    tipBase,
    tipH * 1.06,
    tipBase,
    m.color('glass-blue'),
    Math.PI / 4,
  );
  // Рёбра пирамиды.
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    b.strut(sx * half, plinthH, sz * half, 0, plinthH + h, 0, 0.35, m.color('white'));
  }
  // Парадные лестницы с четырёх сторон и шпиль вершины (FR-15.3).
  for (let i = 0; i < 4; i++) {
    const d = 18 + i * 1.1;
    const y = 0.25 + i * 0.5;
    b.box(0, y, d, 14, 0.5, 1.2, m.color('white'));
    b.box(0, y, -d, 14, 0.5, 1.2, m.color('white'));
    b.box(d, y, 0, 1.2, 0.5, 14, m.color('white'));
    b.box(-d, y, 0, 1.2, 0.5, 14, m.color('white'));
  }
  b.strut(0, plinthH + h - 0.5, 0, 0, plinthH + h + 3, 0, 0.3, m.color('gold'));
  b.place(Templates.sphereLow, 0, plinthH + h + 3.2, 0, 0.5, 0.5, 0.5, m.color('gold'));
  b.box(0, LAWN_Y + 0.02, 22, 6, 0.04, 6, m.color('sand'));
  for (const [x, z] of [
    [-21, -21],
    [21, -21],
    [-21, 21],
    [21, 21],
  ] as const) {
    ctx.props.tree(x, z, 1.1, 1);
  }
  ctx.props.lamp(-19, 19, 4);
  ctx.props.lamp(19, 19, 4);

  // Детали итерации 3 (FR-17.3): стеклянные ромбы на гранях, изгороди, столбики, прожекторы.
  const slope = Math.atan(half / h); // наклон грани от вертикали
  const faces: readonly (readonly [number, number, number, number])[] = [
    // [nx, nz, rx, ry] — поворот тонкого бокса так, чтобы его нормаль совпала с нормалью грани
    [0, 1, -slope, 0],
    [0, -1, -(Math.PI - slope), 0],
    [1, 0, -Math.PI / 2, Math.PI / 2 - slope],
    [-1, 0, -Math.PI / 2, -(Math.PI / 2 - slope)],
  ];
  const t = 0.45;
  const radial = half * (1 - t) + 0.2;
  for (const [nx, nz, rx, ry] of faces) {
    for (const lateral of [-4.2, 0, 4.2]) {
      g.placeRotated(
        Templates.box,
        nx * radial + nz * lateral,
        plinthH + h * t,
        nz * radial + nx * lateral,
        2.6,
        2.6,
        0.25,
        rx,
        ry,
        Math.PI / 4,
        m.color('glass-blue'),
      );
    }
  }
  for (const s of [-1, 1]) {
    ctx.props.hedge(-12, s * 19, 8, 0.9);
    ctx.props.hedge(12, s * 19, 8, 0.9);
    ctx.props.hedge(s * 19, -12, 0.9, 8);
    ctx.props.hedge(s * 19, 12, 0.9, 8);
    ctx.props.bollards(-7, s * 23.2, 7, s * 23.2, 5);
    ctx.props.bollards(s * 23.2, -7, s * 23.2, 7, 5);
    ctx.props.spotlight(s * 23.5, -14, Math.atan2(-s * 23.5, 14));
    ctx.props.spotlight(s * 23.5, 14, Math.atan2(-s * 23.5, -14));
  }
}
