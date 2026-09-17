import { LANDMARKS } from '@/config';
import { Templates } from '@/scene/procedural/GeometryBatch';
import type { LandmarkContext } from './index';

const LAWN_Y = 0.2;

/**
 * Транспортная башня («Зажигалка», FR-15.2): высокий узкий корпус в синем стекле
 * со скошенной золотой вершиной и низким подиумом.
 */
export function buildTransportTower(ctx: LandmarkContext): void {
  const b = ctx.opaque;
  const m = ctx.m;
  const total = LANDMARKS.HEIGHT['transport-tower']; // 42
  const w = 12;
  const bodyH = total - 5;

  b.plane(0, LAWN_Y, 0, 46, 46, m.color('stone-light'));
  b.box(0, 2, 0, 30, 4, 24, m.color('white'));
  ctx.glass.box(0, 1.9, 0, 30.4, 3, 24.4, m.color('glass-blue'));
  b.box(0, bodyH / 2, -2, w - 1, bodyH, w - 1, m.shade('glass-navy', 0.6));
  ctx.glass.box(0, bodyH / 2, -2, w, bodyH, w, m.color('glass-navy'));
  for (let y = 5.4; y < bodyH; y += 5.4) {
    b.box(0, y, -2, w + 0.2, 0.16, w + 0.2, m.color('steel'));
  }
  // Скошенная золотая «крышка».
  b.placeRotated(
    Templates.box,
    0,
    bodyH + 2,
    -2,
    w + 0.6,
    4.5,
    w + 0.6,
    0.32,
    0,
    0,
    m.color('gold'),
  );
  b.box(0, total + 1, -2, 0.4, 3, 0.4, m.color('steel'));
  ctx.props.flagpole(-12, 14, 8);
  ctx.props.flagpole(12, 14, 8);
  ctx.props.lamp(-20, 20, 4);
  ctx.props.lamp(20, 20, 4);
  ctx.props.tree(-20, -18, 1.0);
  ctx.props.tree(20, -18, 1.0);
  ctx.props.fountain(0, 18, 2.4);
}
