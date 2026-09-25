import { TRAFFIC } from '@/config';
import type { CarSpawn } from '@/world/types';
import { LANES, laneDirection, laneStart } from './Lanes';
import { MobileObject } from './MobileObject';
import {
  detects,
  freeDistanceAhead,
  GAP_MARGIN,
  INTERSECTION_LOOKAHEAD,
  PHASE_SECONDS,
  stopMargin,
  yieldDistance,
  ZONE,
  zoneAhead,
  type RadarCar,
} from './Traffic';

/**
 * Машина (FR-6, design C10): едет по полосе прямо, радаром ищет впереди-справа других,
 * плавно тормозит и разгоняется; после 2 с полной остановки получает «ползучую» скорость
 * против взаимных блокировок. Перед перекрёстком уступает машинам в зоне и справа
 * (стоп-линия), а зазор до чужого bbox не может стать меньше `GAP_MARGIN` (AC-6.1).
 */
export class Car extends MobileObject implements RadarCar {
  readonly model: number;
  readonly halfLength: number;
  /** Бросок спавна — для отсечения при снижении P_CAR (TSK-060). */
  readonly roll: number;
  detected: RadarCar | null = null;
  wx = 0;
  wz = 0;

  private minSpeed = 0;
  /** Сколько секунд радар держит машину (для ползучего хода против взаимных блокировок). */
  private blockedFor = 0;
  /** Сколько секунд машина стоит (скорость ≈ 0) — метрика AC-6.2. */
  private stuckFor = 0;
  /** Сколько секунд стоим у стоп-линии; после таймаута въезд разрешается (анти-дедлок). */
  private waitingFor = 0;
  private forceEntry = false;

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
    this.roll = spawn.roll;
    this.speed = TRAFFIC.MAX_SPEED;
    this.faceDirection();
  }

  /** Радар по соседям: `neighbours` — машины своего и соседних чанков в общих мировых координатах; `time` — для фаз перекрёстков. */
  sense(neighbours: readonly Car[], dt: number, time = 0): void {
    this.detected = null;
    for (const other of neighbours) {
      if (detects(this, other)) {
        this.detected = other;
        break;
      }
    }
    const accel = TRAFFIC.ACCELERATION * dt;
    let target: number;
    if (this.detected === null) {
      target = Math.min(TRAFFIC.MAX_SPEED, this.speed + accel);
      if (this.blockedFor > 0 || this.minSpeed > 0) {
        this.blockedFor = 0;
        this.minSpeed = 0;
      }
    } else {
      target = Math.max(this.minSpeed, this.speed - accel);
      if (target <= this.minSpeed + 1e-6) {
        this.blockedFor += dt;
        if (this.blockedFor >= TRAFFIC.DEADLOCK_TIMEOUT && this.minSpeed === 0) {
          this.minSpeed = TRAFFIC.MAX_SPEED * TRAFFIC.DEADLOCK_MIN_SPEED_FACTOR;
        }
      }
    }

    // Зазор: никогда не въезжаем в чужой bbox.
    const free = freeDistanceAhead(this, neighbours, dt);

    // Перекрёсток: стоп-линия, пока зона занята или справа подъезжает машина.
    const zone = zoneAhead(this);
    if (this.forceEntry && zone.distance <= 0) {
      this.forceEntry = false;
    }
    let stop = this.forceEntry ? null : yieldDistance(this, neighbours, time);
    // «Не занимай перекрёсток»: въезжаем, только если за зоной есть место для всей машины —
    // иначе хвост очереди встаёт внутри зоны и по кругу квартала возникает gridlock (AC-6.2).
    if (
      stop === null &&
      zone.distance > 0 &&
      zone.distance <= INTERSECTION_LOOKAHEAD &&
      free < zone.distance + ZONE + 2 * this.halfLength + GAP_MARGIN
    ) {
      stop = zone.distance;
    }
    if (stop !== null) {
      // Встаём перед стоп-линией, а проехавшая её машина — у края зоны (FR-19.27, D31).
      const allowed = Math.sqrt(2 * TRAFFIC.ACCELERATION * Math.max(0, stop - stopMargin(stop)));
      target = Math.min(target, allowed);
      if (allowed < 0.05) {
        this.waitingFor += dt;
        if (this.waitingFor >= PHASE_SECONDS + TRAFFIC.DEADLOCK_TIMEOUT) {
          this.forceEntry = true;
          this.waitingFor = 0;
        }
      }
    } else {
      this.waitingFor = 0;
    }

    if (free < Number.POSITIVE_INFINITY) {
      target = Math.min(target, Math.max(0, free) / Math.max(dt, 1e-6));
    }
    this.speed = target;
    if (target < 0.05) {
      this.stuckFor += dt;
    } else if (target > 0.5) {
      this.stuckFor = 0;
    }
  }

  update(dt: number): void {
    this.advance(this.speed * dt);
  }

  /** Сколько секунд машина стоит на месте (AC-6.2). */
  get stuckSeconds(): number {
    return this.stuckFor;
  }

  /** Сколько секунд радар держит машину (анти-дедлок, FR-6.5). */
  get blockedSeconds(): number {
    return this.blockedFor;
  }
}
