import type { Color } from 'three';
import { CHUNK_LAYOUT, WORLD } from '@/config';
import type { Materials } from '@/scene/Materials';
import type { RoadsInfo } from '@/world/types';
import type { GeometryBatch } from './GeometryBatch';
import type { Props } from './Props';

const HALF = WORLD.CHUNK_SIZE / 2;
const AXIS = CHUNK_LAYOUT.ROAD_AXIS; // −25
const ROAD_W = CHUNK_LAYOUT.ROAD_WIDTH; // 10
const CURB_Y = 0.15;
const MARK_Y = 0.03;
const DASH_LEN = 3;
const DASH_GAP = 3;

/**
 * Дороги чанка (FR-3.1, FR-3.5, design C7): полотно N–S вдоль западной кромки
 * `x ∈ [−30, −20]`, полотно E–W вдоль северной `z ∈ [−30, −20]`, перекрёсток в NW-углу,
 * тротуары-бордюры вокруг квартала, разметка, зебры, фонари и остановки.
 * Стыковка: полотна упираются в границы чанка ровно на ±30, осевые линии на −25.
 */
export function buildRoads(
  batch: GeometryBatch,
  props: Props,
  m: Materials,
  roads: RoadsInfo,
  hasLrt: boolean,
): void {
  const asphalt = m.color('asphalt');
  const marking = m.color('marking');
  const sidewalk = m.color('sidewalk');

  // Полотно: вся площадь чанка — асфальт (перекрывается тротуаром квартала).
  batch.plane(0, 0, 0, WORLD.CHUNK_SIZE, WORLD.CHUNK_SIZE, asphalt);

  // Тротуар-бордюр квартала: x, z ∈ [−20, 30], приподнят.
  const blockMin = AXIS + ROAD_W / 2; // −20
  const blockCenter = (blockMin + HALF) / 2; // 5
  const blockSize = HALF - blockMin; // 50
  batch.box(blockCenter, CURB_Y / 2, blockCenter, blockSize, CURB_Y, blockSize, sidewalk);

  // Тротуары на внешней стороне дорог (у соседних чанков) — узкие полоски у кромки.
  const sw = CHUNK_LAYOUT.SIDEWALK_WIDTH;
  batch.box(-HALF + sw / 2, CURB_Y / 2, blockCenter, sw, CURB_Y, blockSize, sidewalk);
  batch.box(blockCenter, CURB_Y / 2, -HALF + sw / 2, blockSize, CURB_Y, sw, sidewalk);
  batch.box(-HALF + sw / 2, CURB_Y / 2, -HALF + sw / 2, sw, CURB_Y, sw, sidewalk);

  // Осевые прерывистые линии (не в зоне перекрёстка).
  const from = blockMin + 2;
  for (let t = from; t < HALF - DASH_LEN; t += DASH_LEN + DASH_GAP) {
    const c = t + DASH_LEN / 2;
    if (!hasLrt) {
      batch.box(c, MARK_Y, AXIS, DASH_LEN, 0.02, 0.25, marking); // вдоль E–W
    }
    batch.box(AXIS, MARK_Y, c, 0.25, 0.02, DASH_LEN, marking); // вдоль N–S
  }
  // Сплошные краевые линии.
  batch.box(blockCenter, MARK_Y, AXIS - ROAD_W / 2 + 0.3, blockSize, 0.02, 0.15, marking);
  batch.box(blockCenter, MARK_Y, AXIS + ROAD_W / 2 - 0.3, blockSize, 0.02, 0.15, marking);
  batch.box(AXIS - ROAD_W / 2 + 0.3, MARK_Y, blockCenter, 0.15, 0.02, blockSize, marking);
  batch.box(AXIS + ROAD_W / 2 - 0.3, MARK_Y, blockCenter, 0.15, 0.02, blockSize, marking);

  // Зебры на въездах в перекрёсток (со стороны квартала и со стороны соседей).
  zebra(batch, marking, blockMin + 1.2, AXIS, true);
  zebra(batch, marking, AXIS, blockMin + 1.2, false);
  zebra(batch, marking, -HALF + 1.2, AXIS, true);
  zebra(batch, marking, AXIS, -HALF + 1.2, false);

  // Фонари вдоль квартала (сторона −z и сторона −x квартала).
  for (let t = blockMin + 6; t < HALF - 3; t += 12) {
    props.lamp(t, blockMin + 0.6);
    props.lamp(blockMin + 0.6, t);
  }

  // Вариант 'b': остановка и деревья вдоль тротуара; 'a' — только деревья реже.
  if (roads.ew === 'b') {
    props.busStop(blockMin + 14, blockMin + 1.3, 0);
  }
  if (roads.ns === 'b') {
    props.busStop(blockMin + 1.3, blockMin + 34, Math.PI / 2);
  }
  const treeStep = roads.ew === 'b' ? 9 : 14;
  for (let t = blockMin + 3; t < HALF - 2; t += treeStep) {
    props.tree(t, blockMin + 1.1, 0.6, 1);
  }
  const treeStepNs = roads.ns === 'b' ? 9 : 14;
  for (let t = blockMin + 7; t < HALF - 2; t += treeStepNs) {
    props.tree(blockMin + 1.1, t, 0.6, 1);
  }

  // Перекрёсток: светофоры для варианта 'lights', клумба для 'plaza'.
  if (roads.corner === 'lights') {
    trafficLight(batch, m, blockMin + 0.7, blockMin + 0.7);
    trafficLight(batch, m, -HALF + 0.7, blockMin + 0.7);
    trafficLight(batch, m, blockMin + 0.7, -HALF + 0.7);
  } else if (roads.corner === 'plaza') {
    batch.box(AXIS, MARK_Y, AXIS, 3, 0.05, 3, m.color('sand'));
    batch.box(AXIS, 0.35, AXIS, 2.2, 0.6, 2.2, m.color('grass'));
  }
}

/** Пешеходная зебра поперёк дороги: `alongX` — полосы тянутся вдоль X (true) или Z. */
function zebra(batch: GeometryBatch, color: Color, cx: number, cz: number, alongX: boolean): void {
  for (let i = -2; i <= 2; i++) {
    const offset = i * 1.6;
    if (alongX) {
      batch.box(cx, MARK_Y, cz + offset, 1.6, 0.02, 0.8, color);
    } else {
      batch.box(cx + offset, MARK_Y, cz, 0.8, 0.02, 1.6, color);
    }
  }
}

function trafficLight(batch: GeometryBatch, m: Materials, x: number, z: number): void {
  batch.box(x, 2.2, z, 0.2, 4.4, 0.2, m.color('steel'));
  batch.box(x, 4.6, z, 0.5, 1.2, 0.4, m.color('roof-dark'));
  batch.box(x, 4.95, z + 0.21, 0.25, 0.25, 0.02, m.color('accent-red'));
  batch.box(x, 4.6, z + 0.21, 0.25, 0.25, 0.02, m.color('gold'));
  batch.box(x, 4.25, z + 0.21, 0.25, 0.25, 0.02, m.color('grass'));
}
