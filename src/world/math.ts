/** Евклидов модуль: результат всегда в [0, n) даже для отрицательных `a`. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Расстояние Чебышёва между клетками сетки. */
export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Элемент массива по индексу с проверкой (для `noUncheckedIndexedAccess`). */
export function pick<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new RangeError(`index ${String(index)} out of range 0..${String(list.length - 1)}`);
  }
  return value;
}
