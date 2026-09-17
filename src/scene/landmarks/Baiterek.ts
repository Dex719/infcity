import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/**
 * Байтерек (FR-4.4): белый ствол, расширяющаяся кверху решётчатая «крона» из распорок,
 * золотой шар на вершине, круглая площадь с фонтанами и аллеей. Высота — `LANDMARKS.HEIGHT.baiterek`.
 */
export function buildBaiterek(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const g = ctx.glass;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT.baiterek; // 50
  const sphereR = total * 0.14; // 7
  const sphereY = total - sphereR; // 43
  const crownTop = sphereY - sphereR * 0.35; // ≈ 40.5
  const crownBottom = total * 0.56; // 28
  const white = m.color('white');
  const gold = m.color('gold');

  // Площадь: светлый камень, кольцевая аллея, газоны по углам.
  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  for (const [x, z] of [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ] as const) {
    b.plane(x, LAWN_Y + 0.02, z, 9, 9, m.color('grass'));
    ctx.props.tree(x, z, 1.1);
    ctx.props.tree(x + 3, z - 3, 0.8);
  }
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.01, 0, 15, 0.04, 15, m.color('sand'));
  // Орнамент площади: кольца и лучи (FR-15.3).
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.03, 0, 11.5, 0.04, 11.5, white);
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.05, 0, 10.5, 0.04, 10.5, m.color('sand'));
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.07, 0, 9.6, 0.04, 9.6, gold);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(Math.cos(a) * 12.5, LAWN_Y + 0.03, Math.sin(a) * 12.5, 4.5, 0.04, 0.4, white, -a);
  }
  ctx.props.fountain(0, -19, 3);
  ctx.props.fountain(0, 19, 3);
  ctx.props.fountain(-19, 0, 3);
  ctx.props.fountain(19, 0, 3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.props.lamp(Math.cos(a) * 13, Math.sin(a) * 13, 4);
  }
  ctx.props.bench(8, 9, Math.PI / 4);
  ctx.props.bench(-8, 9, -Math.PI / 4);

  // Постамент, вход и ствол с золотыми поясами.
  b.place(Templates.cylinder16, 0, 0.8, 0, 9, 1.6, 9, white);
  b.box(0, 2.9, 7.2, 5, 2.6, 3, white);
  g.box(0, 2.8, 8.75, 4, 2.2, 0.15, m.color('glass-blue'));
  for (const y of [8, 15, 22]) {
    b.place(
      Templates.cylinder16,
      0,
      y,
      0,
      2.9 - (y / crownBottom) * 0.9,
      0.5,
      2.9 - (y / crownBottom) * 0.9,
      gold,
    );
  }
  b.place(Templates.cylinder16, 0, 2.1, 0, 6.5, 1, 6.5, white);
  b.place(Templates.taper, 0, 2.6 + (crownBottom - 2.6) / 2, 0, 2.6, crownBottom - 2.6, 2.6, white);

  // Крона: чаша + 16 наклонных рёбер от ствола к ободу.
  const crownH = crownTop - crownBottom;
  b.place(
    Templates.flare,
    0,
    crownBottom + crownH / 2,
    0,
    sphereR * 1.25,
    crownH,
    sphereR * 1.25,
    white,
  );
  const rimR = sphereR * 1.3;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    b.strut(x * 1.4, crownBottom - 6, z * 1.4, x * rimR, crownTop + 1.5, z * rimR, 0.35, white);
    b.strut(x * rimR, crownTop + 1.5, z * rimR, x * 1.2, crownTop - 2, z * 1.2, 0.22, white);
  }
  b.place(Templates.cylinder16, 0, crownTop + 1.5, 0, rimR + 0.3, 0.5, rimR + 0.3, white);
  b.place(Templates.cylinder16, 0, crownTop + 0.6, 0, rimR * 0.9, 0.35, rimR * 0.9, white);

  // Золотой шар (FR-17.8): гранёный — 320 треугольных панелей двух оттенков золота,
  // металлические обода по экватору и меридиану, как у настоящей панельной конструкции.
  b.placeFacets(
    Templates.icoFlat,
    0,
    sphereY,
    0,
    sphereR,
    sphereR,
    sphereR,
    gold,
    m.shade('gold', 0.78),
    0.3,
  );
  const rim = m.shade('gold', 0.6);
  b.place(Templates.cylinder16, 0, sphereY, 0, sphereR + 0.12, 0.28, sphereR + 0.12, rim);
  b.placeRotated(
    Templates.cylinder16,
    0,
    sphereY,
    0,
    sphereR + 0.12,
    0.28,
    sphereR + 0.12,
    Math.PI / 2,
    0,
    0,
    rim,
  );

  // Детали итерации 3 (FR-17.3): стеклянная шахта лифта, клумбы-«лепестки», прожекторы, изгороди.
  const shaftH = crownBottom - 2.6;
  g.box(0, 2.6 + shaftH / 2, 3.1, 1.4, shaftH, 0.5, m.color('glass-blue'));
  b.box(-0.8, 2.6 + shaftH / 2, 3.1, 0.2, shaftH, 0.6, m.color('steel'));
  b.box(0.8, 2.6 + shaftH / 2, 3.1, 0.2, shaftH, 0.6, m.color('steel'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.props.flowerBed(
      Math.cos(a) * 16.5,
      Math.sin(a) * 16.5,
      1.6,
      i % 2 === 0 ? 'accent-red' : 'gold',
    );
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 10.5;
    const z = Math.sin(a) * 10.5;
    ctx.props.spotlight(x, z, Math.atan2(-x, -z));
  }
  for (const [x, z] of [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ] as const) {
    ctx.props.hedge(x, z - Math.sign(z) * 4.8, 9, 0.8);
    ctx.props.hedge(x - Math.sign(x) * 4.8, z, 0.8, 9);
  }
  // Волна 2 (FR-17.7): мачты освещения, кольцо скамеек, кольца мощения.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 21.5;
    const z = Math.sin(a) * 21.5;
    b.box(x, 7, z, 0.35, 14, 0.35, m.color('steel'));
    b.box(x, 14.2, z, 1.6, 0.5, 1.6, white);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    ctx.props.bench(Math.cos(a) * 14.6, Math.sin(a) * 14.6, -a + Math.PI / 2);
  }
  b.place(Templates.cylinder16, 0, LAWN_Y + 0.03, 0, 18.5, 0.03, 18.5, white);
}
