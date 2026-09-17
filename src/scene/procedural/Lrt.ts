import { CHUNK_LAYOUT, LRT, WORLD } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { LrtInfo } from '@/world/types';
import { type GeometryBatch, Templates } from './GeometryBatch';

const HALF = WORLD.CHUNK_SIZE / 2;
const BEAM_W = 3.6;
const BEAM_H = 1.2;

/**
 * Эстакада ЛРТ (FR-5.1, FR-5.2, design C7): балка по оси северной дороги на высоте
 * `BEAM_HEIGHT`, опоры на разделительной полосе каждые `PILLAR_SPACING`, две нитки рельсов;
 * на станционных чанках — платформа с навесом и лестница на тротуар квартала.
 * Балка тянется ровно от −30 до +30 по x → стык с соседями без зазора (AC-5.2).
 */
export function buildLrt(batch: GeometryBatch, m: Materials, lrt: LrtInfo): void {
  if (lrt.corridor === null) {
    return;
  }
  const z = LRT.AXIS_Z;
  const top = LRT.BEAM_HEIGHT;
  const concrete = m.color('concrete');
  const steel = m.color('steel');
  const white = m.color('white');

  batch.box(0, top - BEAM_H / 2, z, WORLD.CHUNK_SIZE, BEAM_H, BEAM_W, concrete);
  batch.box(0, top + 0.08, z - (BEAM_W / 2 - 0.25), WORLD.CHUNK_SIZE, 0.16, 0.3, white);
  batch.box(0, top + 0.08, z + (BEAM_W / 2 - 0.25), WORLD.CHUNK_SIZE, 0.16, 0.3, white);
  for (const trackZ of [LRT.TRACK_Z.east, LRT.TRACK_Z.west]) {
    batch.box(0, top + 0.06, trackZ - 0.55, WORLD.CHUNK_SIZE, 0.12, 0.12, steel);
    batch.box(0, top + 0.06, trackZ + 0.55, WORLD.CHUNK_SIZE, 0.12, 0.12, steel);
  }

  for (let x = -HALF + LRT.PILLAR_SPACING / 2; x < HALF; x += LRT.PILLAR_SPACING) {
    batch.place(Templates.cylinder8, x, (top - BEAM_H) / 2, z, 0.8, top - BEAM_H, 0.8, concrete);
    batch.box(x, top - BEAM_H - 0.4, z, 2.4, 0.8, BEAM_W + 0.6, concrete);
    batch.box(x, 0.2, z, 2.2, 0.4, 2.2, concrete);
  }

  if (!lrt.station) {
    return;
  }
  const len = LRT.PLATFORM.length;
  const pw = LRT.PLATFORM.width;
  const platformY = top + 0.9;
  // Платформы по обе стороны от путей.
  batch.box(0, platformY - 0.4, z - (BEAM_W / 2 + pw / 2), len, 0.8, pw, white);
  batch.box(0, platformY - 0.4, z + (BEAM_W / 2 + pw / 2), len, 0.8, pw, white);
  batch.box(0, platformY - 0.1, z - (BEAM_W / 2 + 0.3), len, 0.15, 0.4, m.color('gold'));
  batch.box(0, platformY - 0.1, z + (BEAM_W / 2 + 0.3), len, 0.15, 0.4, m.color('gold'));
  // Навес на стойках.
  const roofY = platformY + 4.2;
  batch.box(0, roofY, z, len + 2, 0.35, BEAM_W + pw * 2 + 2, m.color('glass-teal'));
  for (const sx of [-len / 2 + 1, 0, len / 2 - 1]) {
    for (const sz of [z - (BEAM_W / 2 + pw - 0.5), z + (BEAM_W / 2 + pw - 0.5)]) {
      batch.box(sx, platformY + 2.1, sz, 0.3, 4.2, 0.3, steel);
    }
  }
  // Лестница с южной платформы на тротуар квартала (z = −20).
  const blockEdge = CHUNK_LAYOUT.ROAD_AXIS + CHUNK_LAYOUT.ROAD_WIDTH / 2; // −20
  const stairX = len / 2 + 2.5;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const y = platformY - 0.6 - t * (platformY - 1);
    batch.box(stairX, y, blockEdge + 1.5 + t * 1.2, 3, 0.5, 1.6, concrete);
  }
  batch.box(stairX, platformY / 2, z + (BEAM_W / 2 + pw / 2), 3, platformY - 0.8, pw, concrete);
  batch.box(stairX, 1.2, blockEdge + 0.4, 0.4, 2.4, 0.4, steel);
  batch.box(stairX, 2.8, blockEdge + 1.1, 2.4, 0.9, 0.2, m.color('flag-blue'));
}
