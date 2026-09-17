import { TRAFFIC } from '@/config';
import { isOnIntersection } from './Lanes';

const RADAR_COS = Math.cos((TRAFFIC.RADAR_ROTATION_DEG * Math.PI) / 180);
const RADAR_SIN = Math.sin((TRAFFIC.RADAR_ROTATION_DEG * Math.PI) / 180);
const RADIUS_SQ = TRAFFIC.RADAR_RADIUS * TRAFFIC.RADAR_RADIUS;

/** Минимум состояния машины, нужный радару (чистая логика для тестов). */
export interface RadarCar {
  /** Мировые координаты центра (в одной системе для всех участников). */
  readonly wx: number;
  readonly wz: number;
  readonly dirX: number;
  readonly dirZ: number;
  /** Локальные координаты в чанке — для правила перекрёстка. */
  readonly x: number;
  readonly z: number;
  /** Половина длины корпуса: коллизионные точки — перед и зад (AC-6.1). */
  readonly halfLength: number;
  /** Кого эта машина уже «видит» (взаимная блокировка не считается). */
  detected: RadarCar | null;
}

/**
 * Радар (FR-6.2, FR-6.5, design C10): цель видна, если одна из её коллизионных точек
 * попадает в круг радиуса `RADAR_RADIUS` и в сектор впереди-справа (направление, повёрнутое
 * на −45°, `dot > RADAR_DOT`). На перекрёстке машина не уступает стоящим вне перекрёстка
 * на пересекающем направлении.
 */
export function detects(self: RadarCar, other: RadarCar): boolean {
  if (other === self || other.detected === self) {
    return false;
  }
  const selfOnIntersection = isOnIntersection(self.x, self.z);
  const sameDirection = self.dirX === other.dirX && self.dirZ === other.dirZ;
  if (selfOnIntersection && !isOnIntersection(other.x, other.z) && !sameDirection) {
    return false;
  }
  // Ось радара: направление, повёрнутое на RADAR_ROTATION_DEG вокруг Y.
  const axisX = self.dirX * RADAR_COS + self.dirZ * RADAR_SIN;
  const axisZ = -self.dirX * RADAR_SIN + self.dirZ * RADAR_COS;
  for (const sign of [1, -1]) {
    const px = other.wx + other.dirX * other.halfLength * sign;
    const pz = other.wz + other.dirZ * other.halfLength * sign;
    const dx = px - self.wx;
    const dz = pz - self.wz;
    const distSq = dx * dx + dz * dz;
    if (distSq > RADIUS_SQ || distSq === 0) {
      continue;
    }
    const inv = 1 / Math.sqrt(distSq);
    if ((axisX * dx + axisZ * dz) * inv > TRAFFIC.RADAR_DOT) {
      return true;
    }
  }
  return false;
}
