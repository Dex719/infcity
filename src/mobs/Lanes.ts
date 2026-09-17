import { CHUNK_LAYOUT, WORLD } from '@/config';
import type { LaneIndex } from '@/world/types';

/** Полоса: ось движения, смещение поперёк и направление правостороннего движения (FR-6.1). */
export interface Lane {
  readonly index: LaneIndex;
  /** Вдоль какой оси едет машина. */
  readonly axis: 'x' | 'z';
  /** Координата полосы по перпендикулярной оси (локально в чанке). */
  readonly offset: number;
  /** Направление вдоль оси: +1 или −1. */
  readonly dir: 1 | -1;
}

const [WEST_LANE, EAST_LANE] = CHUNK_LAYOUT.LANE_OFFSETS; // −27.5, −22.5

/**
 * Правостороннее движение: на дороге N–S восточная полоса (x = −22.5) едет на север (−z),
 * западная — на юг (+z); на дороге E–W южная полоса (z = −22.5) едет на восток (+x),
 * северная — на запад (−x).
 */
export const LANES: readonly Lane[] = [
  { index: 0, axis: 'z', offset: WEST_LANE, dir: 1 },
  { index: 1, axis: 'z', offset: EAST_LANE, dir: -1 },
  { index: 2, axis: 'x', offset: WEST_LANE, dir: -1 },
  { index: 3, axis: 'x', offset: EAST_LANE, dir: 1 },
];

export const HALF_CHUNK = WORLD.CHUNK_SIZE / 2;

/** Диапазон стартовых позиций вдоль полосы (вне перекрёстка), юниты. */
export const SPAWN_FROM = -14;
export const SPAWN_TO = 24;

/** Локальная стартовая позиция машины на полосе: `t ∈ [0,1)` — доля диапазона спавна. */
export function laneStart(lane: Lane, t: number): { x: number; z: number } {
  // Зона перекрёстка [-30, -20] и запас под самую длинную модель: машины не спавнятся
  // друг в друге на пересечении полос (AC-6.1), а соседние чанки дают зазор ≥ 20 юнитов.
  const along = SPAWN_FROM + t * (SPAWN_TO - SPAWN_FROM);
  return lane.axis === 'x' ? { x: along, z: lane.offset } : { x: lane.offset, z: along };
}

/** Единичный вектор направления полосы. */
export function laneDirection(lane: Lane): { x: number; z: number } {
  return lane.axis === 'x' ? { x: lane.dir, z: 0 } : { x: 0, z: lane.dir };
}

/** Находится ли локальная точка в зоне перекрёстка (NW-угол чанка). */
export function isOnIntersection(x: number, z: number): boolean {
  const min = CHUNK_LAYOUT.ROAD_AXIS - CHUNK_LAYOUT.ROAD_WIDTH / 2;
  const max = CHUNK_LAYOUT.ROAD_AXIS + CHUNK_LAYOUT.ROAD_WIDTH / 2;
  return x >= min && x <= max && z >= min && z <= max;
}
