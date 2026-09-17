/**
 * Детерминированные целочисленные хеши и PRNG (NFR-3, design C2).
 *
 * Всё считается в 32-битной целочисленной арифметике (`Math.imul`, сдвиги),
 * поэтому результат одинаков в любом JS-движке. Float появляется только на выходе
 * (`/ 2^32`) — это точное деление степени двойки, тоже воспроизводимое.
 */

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const SEED_BASE = 0x9e3779b9;
const TWO_POW_32 = 4294967296;

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * MurmurHash3-подобное смешивание последовательности 32-битных целых.
 * Отрицательные целые допустимы (два-дополнение через `| 0`).
 * @returns беззнаковое 32-битное число
 */
export function hash32(...ints: readonly number[]): number {
  let h = SEED_BASE;
  for (const value of ints) {
    let k = Math.imul(value | 0, C1);
    k = rotl(k, 15);
    k = Math.imul(k, C2);
    h ^= k;
    h = rotl(h, 13);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  return fmix(h ^ (ints.length << 2));
}

/** `hash32` в [0, 1). */
export function hashUnit(...ints: readonly number[]): number {
  return hash32(...ints) / TWO_POW_32;
}

/** FNV-1a по кодовым точкам строки → беззнаковое 32-битное число (FR-2.1). */
export function seedToInt(seed: string): number {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: быстрый PRNG с 32-битным состоянием, значения в [0, 1). */
export function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  };
}

/** PRNG, привязанный к клетке и назначению: `rng(seed, gx, gy, salt)()`. */
export function rng(seed: number, gx: number, gy: number, salt: number): () => number {
  return mulberry32(hash32(seed, gx, gy, salt));
}
