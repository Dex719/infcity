import { CHUNK_LAYOUT, TRAFFIC } from '@/config';
import { CAR_HALF_WIDTH } from './Collisions';
import { isOnIntersection } from './Lanes';

const RADAR_COS = Math.cos((TRAFFIC.RADAR_ROTATION_DEG * Math.PI) / 180);
const RADAR_SIN = Math.sin((TRAFFIC.RADAR_ROTATION_DEG * Math.PI) / 180);
const RADIUS_SQ = TRAFFIC.RADAR_RADIUS * TRAFFIC.RADAR_RADIUS;

/** Размер зоны перекрёстка (ширина дороги) и её локальные границы (NW-угол чанка). */
export const ZONE = CHUNK_LAYOUT.ROAD_WIDTH;
const ZONE_MIN = CHUNK_LAYOUT.ROAD_AXIS - ZONE / 2; // −30
const ZONE_MAX = CHUNK_LAYOUT.ROAD_AXIS + ZONE / 2; // −20
const HALF_CHUNK = 30;

/** С какого расстояния до стоп-линии машина начинает учитывать перекрёсток, юниты. */
export const INTERSECTION_LOOKAHEAD = 14;
/** Запас до стоп-линии, юниты. */
export const STOP_MARGIN = 0.6;
/** Минимальный зазор между bbox машин, юниты (AC-6.1). */
export const GAP_MARGIN = 0.35;
/** Длительность фазы приоритета одной оси на перекрёстке, секунды («светофор»). */
export const PHASE_SECONDS = 5;

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
  /** Текущая скорость, юн/с — для «заметённого» bbox при проверке зазора. */
  readonly speed: number;
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
  const otherOnIntersection = isOnIntersection(other.x, other.z);
  const sameDirection = self.dirX === other.dirX && self.dirZ === other.dirZ;
  const crossing = isCrossing(self, other);
  // Пересекающая машина вне зоны перекрёстка радару не цель: конфликт на перекрёстке
  // решают стоп-линия и фазы (`yieldDistance`), а радар держал бы машину у стоп-линии
  // из-за той, что сама стоит у своей стоп-линии и уступает ей — взаимное ожидание (BUG-8).
  if (!otherOnIntersection && (crossing || (selfOnIntersection && !sameDirection))) {
    return false;
  }
  if (crossing && hasPassedCrossing(self, other)) {
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

/** Запас за точкой пересечения, после которого поперечная машина больше не опасна, юниты. */
const PASSED_MARGIN = 0.5;

/**
 * Пересекающиеся траектории: `true`, если одна из машин уже проехала точку пересечения
 * своих полос — столкновение невозможно, тормозить ни к чему (уменьшает простои, AC-6.2).
 */
export function hasPassedCrossing(self: RadarCar, other: RadarCar): boolean {
  // Точка пересечения линий движения: по моей оси — координата другого, по его оси — моя.
  const cx = self.dirX !== 0 ? other.wx : self.wx;
  const cz = self.dirX !== 0 ? self.wz : other.wz;
  const otherAlong = (cx - other.wx) * other.dirX + (cz - other.wz) * other.dirZ;
  const selfAlong = (cx - self.wx) * self.dirX + (cz - self.wz) * self.dirZ;
  return (
    otherAlong < -(other.halfLength + PASSED_MARGIN) ||
    selfAlong < -(self.halfLength + PASSED_MARGIN)
  );
}

/** Ближайшая зона перекрёстка впереди по полосе: расстояние от переда до стоп-линии и её мировой прямоугольник. */
export interface ZoneAhead {
  /** Расстояние от переда машины до стоп-линии; ≤ 0 — машина уже в зоне или на линии. */
  readonly distance: number;
  /** Мировые координаты угла зоны (квадрат `ZONE × ZONE`). */
  readonly x0: number;
  readonly z0: number;
}

/**
 * Зона перекрёстка, к которой едет машина (FR-6.5): для +x/+z это зона следующего чанка
 * (вход на локальной координате +30), для −x/−z — зона своего чанка (вход на −20).
 */
export function zoneAhead(car: RadarCar): ZoneAhead {
  const originX = car.wx - car.x; // мировая координата локального нуля чанка
  const originZ = car.wz - car.z;
  const front = car.halfLength;
  if (car.dirX !== 0) {
    const forward = car.dirX > 0;
    const entry = forward ? HALF_CHUNK : ZONE_MAX;
    const distance = forward ? entry - (car.x + front) : car.x - front - entry;
    const x0 = originX + (forward ? HALF_CHUNK : ZONE_MIN);
    return { distance, x0, z0: originZ + ZONE_MIN };
  }
  const forward = car.dirZ > 0;
  const entry = forward ? HALF_CHUNK : ZONE_MAX;
  const distance = forward ? entry - (car.z + front) : car.z - front - entry;
  const z0 = originZ + (forward ? HALF_CHUNK : ZONE_MIN);
  return { distance, x0: originX + ZONE_MIN, z0 };
}

/** Пересекает ли bbox машины квадрат зоны (мировые координаты). */
export function boxInZone(car: RadarCar, zone: ZoneAhead): boolean {
  const ax = Math.abs(car.dirX);
  const az = Math.abs(car.dirZ);
  const ex = ax * car.halfLength + az * CAR_HALF_WIDTH;
  const ez = az * car.halfLength + ax * CAR_HALF_WIDTH;
  return (
    car.wx + ex > zone.x0 &&
    car.wx - ex < zone.x0 + ZONE &&
    car.wz + ez > zone.z0 &&
    car.wz - ez < zone.z0 + ZONE
  );
}

/** Едут ли машины по пересекающимся направлениям. */
export function isCrossing(a: RadarCar, b: RadarCar): boolean {
  return a.dirX * b.dirX + a.dirZ * b.dirZ === 0;
}

/** Находится ли `other` справа от `self` (правило правой руки). */
export function isRightOf(self: RadarCar, other: RadarCar): boolean {
  const dx = other.wx - self.wx;
  const dz = other.wz - self.wz;
  return self.dirX * dz - self.dirZ * dx > 0;
}

/**
 * «Светофор» перекрёстка: приоритетная ось меняется каждые `PHASE_SECONDS`, фаза сдвинута
 * детерминированно по координатам зоны, чтобы перекрёстки не переключались синхронно.
 */
export function greenAxisIsX(zone: ZoneAhead, time: number): boolean {
  const cell = Math.round((zone.x0 + zone.z0) / 60);
  const offset = (((cell % 3) + 3) % 3) * 2;
  return Math.floor((time + offset) / PHASE_SECONDS) % 2 === 0;
}

/**
 * Нужно ли `self` остановиться у стоп-линии перед зоной впереди (FR-6.5): зона занята
 * машиной пересекающего направления, либо у `self` не приоритетная фаза и к зоне подъезжает
 * пересекающая машина. Возвращает расстояние до стоп-линии или `null`.
 */
export function yieldDistance(
  self: RadarCar,
  others: readonly RadarCar[],
  time = 0,
): number | null {
  const zone = zoneAhead(self);
  if (zone.distance <= 0 || zone.distance > INTERSECTION_LOOKAHEAD) {
    return null;
  }
  for (const other of others) {
    if (other === self || !isCrossing(self, other)) {
      continue;
    }
    // Машина в зоне, уже проехавшая мою полосу и выезжающая, не мешает (меньше простоев).
    if (boxInZone(other, zone) && !hasPassedCrossing(self, other)) {
      return zone.distance;
    }
  }
  if (greenAxisIsX(zone, time) === (self.dirX !== 0)) {
    return null;
  }
  for (const other of others) {
    if (other === self || !isCrossing(self, other)) {
      continue;
    }
    const theirs = zoneAhead(other);
    if (
      theirs.distance > 0 &&
      theirs.distance <= INTERSECTION_LOOKAHEAD &&
      Math.abs(theirs.x0 - zone.x0) < 1e-6 &&
      Math.abs(theirs.z0 - zone.z0) < 1e-6
    ) {
      return zone.distance;
    }
  }
  return null;
}

/**
 * Свободное расстояние впереди по коридору движения до ближайшего чужого bbox
 * (с учётом его сдвига за кадр), минус запас: машина никогда не въезжает в чужой bbox (AC-6.1).
 */
export function freeDistanceAhead(self: RadarCar, others: readonly RadarCar[], dt: number): number {
  let free = Number.POSITIVE_INFINITY;
  for (const other of others) {
    if (other === self) {
      continue;
    }
    const dx = other.wx - self.wx;
    const dz = other.wz - self.wz;
    const along = dx * self.dirX + dz * self.dirZ;
    if (along <= 0) {
      continue;
    }
    const lateral = Math.abs(dx * self.dirZ - dz * self.dirX);
    const sweep = other.speed * dt;
    const parallel = !isCrossing(self, other);
    const otherLong = parallel ? other.halfLength + sweep : CAR_HALF_WIDTH;
    const otherLat = parallel ? CAR_HALF_WIDTH : other.halfLength + sweep;
    if (lateral >= CAR_HALF_WIDTH + otherLat) {
      continue;
    }
    free = Math.min(free, along - otherLong - self.halfLength - GAP_MARGIN);
  }
  return free;
}
