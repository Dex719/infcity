import { LRT } from '@/config';
import { mod } from './math';
import type { LrtInfo } from './types';

/**
 * Коридоры и станции ЛРТ (FR-5.1, FR-5.2, design C5): коридор E–W идёт по рядам
 * `gy ≡ 0 (mod PERIOD)`, станция — в чанках `gx ≡ 0 (mod STATION_PERIOD)`.
 */
export function isCorridorRow(gy: number): boolean {
  return mod(gy, LRT.PERIOD) === 0;
}

/** Есть ли станция в чанке коридора с координатой `gx`. */
export function isStationColumn(gx: number): boolean {
  return mod(gx, LRT.STATION_PERIOD) === 0;
}

/** Коридор N–S: столбцы `gx ≡ NS_OFFSET (mod NS_PERIOD)` (TSK-072). */
export function isNsCorridorColumn(gx: number): boolean {
  return mod(gx - LRT.NS_OFFSET, LRT.NS_PERIOD) === 0;
}

/** Станция N–S в рядах `gy ≡ 0 (mod STATION_PERIOD)`. */
export function isStationRow(gy: number): boolean {
  return mod(gy, LRT.STATION_PERIOD) === 0;
}

/** ЛРТ-информация чанка. */
export function describeLrt(gx: number, gy: number): LrtInfo {
  const corridor = isCorridorRow(gy) ? 'EW' : null;
  const ns = isNsCorridorColumn(gx);
  return {
    corridor,
    station: corridor !== null && isStationColumn(gx),
    ns,
    nsStation: ns && isStationRow(gy),
  };
}

/** Ближайший ряд коридора к `gy` (для спавна поездов и отладки). */
export function nearestCorridorRow(gy: number): number {
  return Math.round(gy / LRT.PERIOD) * LRT.PERIOD;
}
