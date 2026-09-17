import { LANDMARKS, LANDMARK_IDS, WORLD, type LandmarkId } from '@/config';
import { chebyshev } from './math';
import { isRareWinner, rareRoll, type RareRule } from './Rare';
import { isRiverRow } from './RiverPlanner';
import { NEIGHBOUR_OFFSETS, Salt } from './types';

/**
 * Ландмарки: фиксированные у старта и редкие случайные (FR-4, design C4).
 *
 * Правило редкости применяется отдельно к каждому типу (дистанция ≥ 6 между
 * одинаковыми), в одной клетке побеждает тип с меньшим броском, соседние клетки
 * разных типов подавляются по меньшему броску. Соль каждого типа берётся из его
 * индекса в глобальном `LANDMARK_IDS`, поэтому включение новых типов не сдвигает
 * уже существующие ландмарки.
 */
export class LandmarkPlanner {
  private readonly rules: ReadonlyMap<LandmarkId, RareRule>;

  constructor(
    private readonly seed: number,
    private readonly enabled: readonly LandmarkId[] = LANDMARKS.ENABLED,
  ) {
    const rules = new Map<LandmarkId, RareRule>();
    for (const id of enabled) {
      rules.set(id, {
        salt: Salt.LANDMARK_BASE + LANDMARK_IDS.indexOf(id),
        probability: LANDMARKS.PROBABILITY,
        radius: LANDMARKS.RADIUS,
      });
    }
    this.rules = rules;
  }

  /** Фиксированный ландмарк стартовой зоны (FR-4.1) или `null`. */
  static fixed(gx: number, gy: number): LandmarkId | null {
    for (const fixed of LANDMARKS.FIXED) {
      if (fixed.gx === gx && fixed.gy === gy) {
        return fixed.id;
      }
    }
    return null;
  }

  /** Стартовая зона: случайные ландмарки запрещены, там стоят фиксированные. */
  static inStartZone(gx: number, gy: number): boolean {
    return Math.max(Math.abs(gx), Math.abs(gy)) <= WORLD.START_ZONE_RADIUS;
  }

  /**
   * Фиксированные ландмарки не участвуют в хеш-поле, поэтому дистанции до них
   * проверяются явно: одинаковый тип — не ближе `RADIUS + 1`, любой — не сосед.
   */
  static conflictsWithFixed(gx: number, gy: number, id: LandmarkId): boolean {
    for (const fixed of LANDMARKS.FIXED) {
      const distance = chebyshev(gx, gy, fixed.gx, fixed.gy);
      if (distance <= LANDMARKS.ADJACENCY_RADIUS) {
        return true;
      }
      if (fixed.id === id && distance <= LANDMARKS.RADIUS) {
        return true;
      }
    }
    return false;
  }

  /** Ландмарк клетки или `null`. */
  pick(gx: number, gy: number): LandmarkId | null {
    const fixed = LandmarkPlanner.fixed(gx, gy);
    if (fixed !== null) {
      return fixed;
    }
    if (LandmarkPlanner.inStartZone(gx, gy) || isRiverRow(gy)) {
      return null;
    }
    const best = this.winnerAt(gx, gy);
    if (best === null || LandmarkPlanner.conflictsWithFixed(gx, gy, best.id)) {
      return null;
    }
    const r = LANDMARKS.ADJACENCY_RADIUS;
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      for (let step = 1; step <= r; step++) {
        const other = this.winnerAt(gx + dx * step, gy + dy * step, best.id);
        if (other !== null && other.u < best.u) {
          return null;
        }
      }
    }
    return best.id;
  }

  /** Победивший тип в клетке (с минимальным броском), исключая `skip`. */
  private winnerAt(
    gx: number,
    gy: number,
    skip: LandmarkId | null = null,
  ): { id: LandmarkId; u: number } | null {
    let best: { id: LandmarkId; u: number } | null = null;
    for (const [id, rule] of this.rules) {
      if (id === skip) {
        continue;
      }
      const u = rareRoll(this.seed, gx, gy, rule);
      if (u >= rule.probability || (best !== null && u >= best.u)) {
        continue;
      }
      if (isRareWinner(this.seed, gx, gy, rule)) {
        best = { id, u };
      }
    }
    return best;
  }

  /** Включённые типы (для отладки и тестов). */
  get enabledIds(): readonly LandmarkId[] {
    return this.enabled;
  }
}
