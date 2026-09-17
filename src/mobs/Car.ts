import { TRAFFIC } from '@/config';
import type { CarSpawn } from '@/world/types';
import { LANES, laneDirection, laneStart } from './Lanes';
import { MobileObject } from './MobileObject';
import { detects, type RadarCar } from './Traffic';

/**
 * Машина (FR-6, design C10): едет по полосе прямо, радаром ищет впереди-справа других,
 * плавно тормозит и разгоняется; после 2 с полной остановки получает «ползучую» скорость
 * против взаимных блокировок.
 */
export class Car extends MobileObject implements RadarCar {
  readonly model: number;
  readonly halfLength: number;
  detected: RadarCar | null = null;
  wx = 0;
  wz = 0;

  private minSpeed = 0;
  private stuckFor = 0;

  constructor(gx: number, gy: number, spawn: CarSpawn, halfLength: number) {
    const lane = LANES[spawn.lane] ?? LANES[0];
    if (lane === undefined) {
      throw new Error('lane table is empty');
    }
    const t = spawn.roll / TRAFFIC.P_CAR.desktop;
    const start = laneStart(lane, t);
    super(gx, gy, start.x, 0, start.z);
    const dir = laneDirection(lane);
    this.dirX = dir.x;
    this.dirZ = dir.z;
    this.model = spawn.model;
    this.halfLength = halfLength;
    this.speed = TRAFFIC.MAX_SPEED;
    this.faceDirection();
  }

  /** Радар по соседям: `neighbours` — машины своего и соседних чанков в общих мировых координатах. */
  sense(neighbours: readonly Car[], dt: number): void {
    this.detected = null;
    for (const other of neighbours) {
      if (detects(this, other)) {
        this.detected = other;
        break;
      }
    }
    const accel = TRAFFIC.ACCELERATION * dt;
    if (this.detected === null) {
      this.speed = Math.min(TRAFFIC.MAX_SPEED, this.speed + accel);
      if (this.stuckFor > 0 || this.minSpeed > 0) {
        this.stuckFor = 0;
        this.minSpeed = 0;
      }
      return;
    }
    this.speed = Math.max(this.minSpeed, this.speed - accel);
    if (this.speed <= this.minSpeed + 1e-6) {
      this.stuckFor += dt;
      if (this.stuckFor >= TRAFFIC.DEADLOCK_TIMEOUT && this.minSpeed === 0) {
        this.minSpeed = TRAFFIC.MAX_SPEED * TRAFFIC.DEADLOCK_MIN_SPEED_FACTOR;
      }
    }
  }

  update(dt: number): void {
    this.advance(this.speed * dt);
  }

  /** Сколько секунд машина стоит (для проверок AC-6.2). */
  get stuckSeconds(): number {
    return this.stuckFor;
  }
}
