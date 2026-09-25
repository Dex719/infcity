import { describe, expect, it } from 'vitest';
import { CROSSWALK, TRAFFIC } from '@/config';
import { Car } from '@/mobs/Car';
import {
  detects,
  STOP_LINE_TOLERANCE,
  STOP_MARGIN,
  stopMargin,
  type RadarCar,
} from '@/mobs/Traffic';

function radarCar(
  wx: number,
  wz: number,
  dirX: number,
  dirZ: number,
  local = { x: 0, z: 0 },
): RadarCar {
  return { wx, wz, dirX, dirZ, x: local.x, z: local.z, halfLength: 2, speed: 0, detected: null };
}

/** Локальная позиция внутри зоны перекрёстка (NW-угол чанка). */
const IN_ZONE = { x: -25, z: -25 };

describe('detects — радар (FR-6.2)', () => {
  it('видит машину прямо впереди в радиусе радара', () => {
    const self = radarCar(0, 0, 1, 0);
    expect(detects(self, radarCar(10, 0, 1, 0))).toBe(true);
    expect(detects(self, radarCar(TRAFFIC.RADAR_RADIUS + 5, 0, 1, 0))).toBe(false);
  });

  it('сектор: не видит сзади и слева (−z при движении +x), видит справа и впереди-справа', () => {
    const self = radarCar(0, 0, 1, 0);
    expect(detects(self, radarCar(-10, 0, 1, 0))).toBe(false);
    expect(detects(self, radarCar(0, -8, 1, 0))).toBe(false); // слева
    expect(detects(self, radarCar(0, 8, 0, -1, IN_ZONE))).toBe(true); // справа, едет к моей линии
    expect(detects(self, radarCar(8, 8, 0, -1, IN_ZONE))).toBe(true); // впереди-справа
    expect(detects(self, radarCar(8, -8, 0, 1, IN_ZONE))).toBe(false); // впереди-слева
  });

  it('поперечная машина вне зоны перекрёстка радару не цель — её ведёт стоп-линия (BUG-8)', () => {
    const self = radarCar(0, 0, 1, 0);
    // Впереди-справа, едет к моей линии, но стоит у своей стоп-линии вне зоны: не держит.
    expect(detects(self, radarCar(8, 8, 0, -1, { x: -22.5, z: -12 }))).toBe(false);
    // Та же машина внутри зоны — видна.
    expect(detects(self, radarCar(8, 8, 0, -1, IN_ZONE))).toBe(true);
    // Попутная вне зоны по-прежнему видна.
    expect(detects(self, radarCar(8, 0, 1, 0, { x: 5, z: 5 }))).toBe(true);
  });

  it('поперечная машина, уже проехавшая точку пересечения, не держит радар (AC-6.2)', () => {
    const self = radarCar(0, 0, 1, 0);
    // Справа, но удаляется от моей линии (+z): столкновение невозможно.
    expect(detects(self, radarCar(0, 8, 0, 1, IN_ZONE))).toBe(false);
    expect(detects(self, radarCar(6, 4, 0, 1, IN_ZONE))).toBe(false);
    // Та же точка, но едет к моей линии — видна.
    expect(detects(self, radarCar(6, 4, 0, -1, IN_ZONE))).toBe(true);
  });

  it('взаимная блокировка не считается: если он уже видит меня, я его не вижу', () => {
    const a = radarCar(0, 0, 1, 0);
    const b = radarCar(6, 6, 0, -1, IN_ZONE);
    expect(detects(a, b)).toBe(true);
    b.detected = a;
    expect(detects(a, b)).toBe(false);
  });

  it('на перекрёстке не уступает стоящим вне перекрёстка на пересекающем направлении', () => {
    const onCross = radarCar(0, 0, 1, 0, { x: -25, z: -25 });
    const waiting = radarCar(6, 6, 0, -1, { x: -22.5, z: -12 });
    expect(detects(onCross, waiting)).toBe(false);
    const alsoOnCross = radarCar(6, 6, 0, -1, { x: -22, z: -22 });
    expect(detects(onCross, alsoOnCross)).toBe(true);
  });
});

describe('Car.sense — торможение, разгон, anti-deadlock (AC-6.1, AC-6.2)', () => {
  it('задняя машина замедляется до скорости передней и не догоняет её', () => {
    const front = new Car(0, 0, { lane: 3, model: 0, dir: 1, roll: 0.2 }, 2.2);
    const back = new Car(0, 0, { lane: 3, model: 1, dir: 1, roll: 0.05 }, 2.2);
    front.speed = TRAFFIC.MAX_SPEED * 0.3;
    back.speed = TRAFFIC.MAX_SPEED;
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60 * 20; i++) {
      for (const car of [front, back]) {
        car.wx = car.worldX(0);
        car.wz = car.worldZ(0);
      }
      front.detected = null;
      front.speed = TRAFFIC.MAX_SPEED * 0.3;
      back.sense([front, back], 1 / 60);
      front.update(1 / 60);
      back.update(1 / 60);
      minGap = Math.min(minGap, front.x - back.x);
    }
    expect(minGap).toBeGreaterThan(front.halfLength + back.halfLength);
    expect(back.speed).toBeLessThan(TRAFFIC.MAX_SPEED * 0.6);
  });

  it('после 2 с полной остановки машина получает ползучую скорость', () => {
    const car = new Car(0, 0, { lane: 3, model: 0, dir: 1, roll: 0.05 }, 2.2);
    const blocker = new Car(0, 0, { lane: 3, model: 0, dir: 1, roll: 0.12 }, 2.2);
    blocker.speed = 0;
    car.speed = 0;
    for (let i = 0; i < 60 * 3; i++) {
      for (const c of [car, blocker]) {
        c.wx = c.worldX(0);
        c.wz = c.worldZ(0);
      }
      blocker.detected = null;
      car.sense([car, blocker], 1 / 60);
      // blocker стоит; car продвигается только ползком после таймаута
      car.update(1 / 60);
      blocker.x = car.x + 6; // держим препятствие впереди
    }
    expect(car.blockedSeconds).toBeGreaterThanOrEqual(TRAFFIC.DEADLOCK_TIMEOUT);
    expect(car.speed).toBeCloseTo(TRAFFIC.MAX_SPEED * TRAFFIC.DEADLOCK_MIN_SPEED_FACTOR, 5);
  });

  it('без препятствий разгоняется до максимума', () => {
    const car = new Car(0, 0, { lane: 0, model: 0, dir: 1, roll: 0.1 }, 2.2);
    car.speed = 0;
    for (let i = 0; i < 120; i++) {
      car.wx = car.worldX(0);
      car.wz = car.worldZ(0);
      car.sense([car], 1 / 60);
    }
    expect(car.speed).toBe(TRAFFIC.MAX_SPEED);
  });
});

// FR-19.27, AC-19.28, design D31: уступающая машина встаёт передом перед стоп-линией, а не
// на зебре; машина, уже проехавшая линию, как раньше встаёт у края зоны.
describe('Стоп-линия — где встаёт уступающая машина (FR-19.27, AC-19.28)', () => {
  /** Край стоп-линии со стороны подъезда — от края зоны. */
  const LINE_FAR = CROSSWALK.OFFSET + CROSSWALK.LENGTH + CROSSWALK.STOP_GAP + CROSSWALK.STOP_WIDTH;
  const HALF_LENGTH = 2.2;

  /** Машина на северной полосе E–W едет на запад к своей зоне (край на x = −20). */
  function approaching(x: number, speed: number): Car {
    const car = new Car(0, 0, { lane: 2, model: 0, dir: -1, roll: 0.1 }, HALF_LENGTH);
    car.x = x;
    car.speed = speed;
    return car;
  }

  /** Поперечная машина стоит в зоне у её южного края — слева от подъезжающей, радару не цель. */
  function blocker(): Car {
    const car = new Car(0, 0, { lane: 1, model: 0, dir: -1, roll: 0.1 }, HALF_LENGTH);
    car.z = -21;
    car.speed = 0;
    return car;
  }

  function drive(car: Car, other: Car, seconds: number): void {
    for (let i = 0; i < 60 * seconds; i++) {
      for (const c of [car, other]) {
        c.wx = c.worldX(0);
        c.wz = c.worldZ(0);
      }
      car.sense([car, other], 1 / 60);
      car.update(1 / 60);
    }
  }

  /** Расстояние от переда машины до края зоны. */
  const toZone = (car: Car): number => car.x - HALF_LENGTH - -20;

  it('запас торможения: до стоп-линии, пока машина её не проехала, иначе — край зоны', () => {
    expect(CROSSWALK.STOP_SETBACK).toBeGreaterThanOrEqual(LINE_FAR);
    expect(CROSSWALK.STOP_SETBACK - STOP_LINE_TOLERANCE).toBeGreaterThan(
      CROSSWALK.OFFSET + CROSSWALK.LENGTH,
    );
    expect(stopMargin(10)).toBe(CROSSWALK.STOP_SETBACK);
    expect(stopMargin(CROSSWALK.STOP_SETBACK - STOP_LINE_TOLERANCE + 0.01)).toBe(
      CROSSWALK.STOP_SETBACK,
    );
    expect(stopMargin(CROSSWALK.STOP_SETBACK - STOP_LINE_TOLERANCE - 0.01)).toBe(STOP_MARGIN);
  });

  it('с полной скорости встаёт передом перед стоп-линией, не на зебре', () => {
    const car = approaching(10, TRAFFIC.MAX_SPEED);
    drive(car, blocker(), 3);
    expect(car.speed).toBe(0);
    expect(toZone(car)).toBeGreaterThanOrEqual(LINE_FAR);
    expect(toZone(car)).toBeLessThanOrEqual(CROSSWALK.STOP_SETBACK + 0.05);
  });

  it('проехавшая стоп-линию встаёт у края зоны, не заезжая в неё', () => {
    const car = approaching(-20 + HALF_LENGTH + 2.5, 3);
    drive(car, blocker(), 3);
    expect(car.speed).toBe(0);
    expect(toZone(car)).toBeGreaterThan(0);
    expect(toZone(car)).toBeLessThanOrEqual(STOP_MARGIN + 0.05);
  });
});
