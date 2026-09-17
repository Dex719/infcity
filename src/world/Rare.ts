import { hashUnit } from './Hash';

/**
 * Редкие объекты без хранения состояния (design C4): клетка — кандидат, если её
 * бросок `u < probability`; кандидат побеждает, если его `u` минимален среди
 * кандидатов в квадрате Чебышёва радиуса `radius`. Гарантия: два победителя
 * одного правила никогда не ближе `radius + 1`.
 */
export interface RareRule {
  readonly salt: number;
  readonly probability: number;
  readonly radius: number;
}

/** Бросок клетки для правила, [0, 1). */
export function rareRoll(seed: number, gx: number, gy: number, rule: RareRule): number {
  return hashUnit(seed, gx, gy, rule.salt);
}

/** Детерминированный порядок клеток для разрешения (практически невозможных) ничьих. */
function lexLess(ax: number, ay: number, bx: number, by: number): boolean {
  return ay < by || (ay === by && ax < bx);
}

/** Является ли клетка победителем правила. */
export function isRareWinner(seed: number, gx: number, gy: number, rule: RareRule): boolean {
  const u = rareRoll(seed, gx, gy, rule);
  if (u >= rule.probability) {
    return false;
  }
  const r = rule.radius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = gx + dx;
      const ny = gy + dy;
      const v = rareRoll(seed, nx, ny, rule);
      if (v < rule.probability && (v < u || (v === u && lexLess(nx, ny, gx, gy)))) {
        return false;
      }
    }
  }
  return true;
}
