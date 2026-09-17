import { RIVER } from '@/config';
import { mod } from './math';

/** Берег относительно ближайшего русла: правый — панельная застройка, левый — стекло и ТЦ. */
export type Bank = 'right' | 'left' | 'river';

/**
 * Река Есиль (FR-14, FR-15.6, design D10): русло — ряды `gy ≡ OFFSET (mod PERIOD)`;
 * ряды ЛРТ `0 (mod 8)` с ними никогда не совпадают (6 + 12k нечётно ≠ 8m).
 * Полосы между руслами чередуются: «левый берег» (современный) и «правый» (старый город);
 * стартовая зона (|gy| ≤ 5) лежит целиком на левом берегу, как Байтерек и Хан Шатыр.
 */
export function isRiverRow(gy: number): boolean {
  return mod(gy - RIVER.OFFSET, RIVER.PERIOD) === 0;
}

/** Индекс полосы между руслами: полоса k занимает ряды `(OFFSET + k·PERIOD, OFFSET + (k+1)·PERIOD)`. */
export function bandIndex(gy: number): number {
  return Math.floor((gy - RIVER.OFFSET) / RIVER.PERIOD);
}

export function bankOf(gy: number): Bank {
  if (isRiverRow(gy)) {
    return 'river';
  }
  return mod(bandIndex(gy), 2) === 1 ? 'left' : 'right';
}

/** Ближайший ряд русла к `gy`. */
export function nearestRiverRow(gy: number): number {
  return Math.round((gy - RIVER.OFFSET) / RIVER.PERIOD) * RIVER.PERIOD + RIVER.OFFSET;
}
