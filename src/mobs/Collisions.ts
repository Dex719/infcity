/** Половина ширины самой широкой модели (автобус 2.4) с запасом, юниты. */
export const CAR_HALF_WIDTH = 1.25;

/** Осевой bbox машины: центр, направление (по осям x/z) и полудлина/полуширина. */
export interface CarBox {
  readonly x: number;
  readonly z: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

/** Полуразмеры bbox в мировых осях: машины едут строго вдоль x или z. */
function extents(box: CarBox): { ex: number; ez: number } {
  const ax = Math.abs(box.dirX);
  const az = Math.abs(box.dirZ);
  return {
    ex: ax * box.halfLength + az * box.halfWidth,
    ez: az * box.halfLength + ax * box.halfWidth,
  };
}

/** Пересекаются ли bbox двух машин (строго, касание не считается). */
export function overlaps(a: CarBox, b: CarBox): boolean {
  const ea = extents(a);
  const eb = extents(b);
  return Math.abs(a.x - b.x) < ea.ex + eb.ex && Math.abs(a.z - b.z) < ea.ez + eb.ez;
}

/**
 * Число пересекающихся пар (AC-6.1): сортировка по x и ранний выход, чтобы 250 машин
 * проверялись за ~10 k сравнений, а не за 31 k.
 */
export function countOverlaps(boxes: readonly CarBox[]): number {
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  const maxExtent = Math.max(0, ...sorted.map((box) => Math.max(box.halfLength, box.halfWidth)));
  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b === undefined) {
        continue;
      }
      if (b.x - a.x > 2 * maxExtent) {
        break;
      }
      if (overlaps(a, b)) {
        count++;
      }
    }
  }
  return count;
}
