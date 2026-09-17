import { LRT, TRAIN, WORLD } from '@/config';
import { hashUnit } from '@/world/Hash';
import { isStationColumn, isStationRow } from '@/world/LrtPlanner';
import { MobileObject } from './MobileObject';

/** Состояния поезда (FR-5.4). */
export type TrainState = 'moving' | 'braking' | 'dwell' | 'accelerating';

const TRAIN_SALT = 700;
const DWELL_SALT = 701;

/** Длина вагона и зазор между вагонами, юниты. */
export const CARRIAGE_LENGTH = 9;
export const CARRIAGE_GAP = 0.6;
export const CARRIAGES = 3;

/**
 * Поезд ЛРТ (FR-5.3–5.6, design C10): едет по своей нитке эстакады, у станции тормозит,
 * стоит 3–5 с и разгоняется; ближе `TRAIN_SEPARATION` до поезда впереди — останавливается.
 */
export class Train extends MobileObject {
  /** Ось коридора: E–W (`x`) или N–S (`z`, TSK-072). */
  readonly axis: 'x' | 'z';
  state: TrainState = 'moving';
  /** Секунд стоянки осталось. */
  dwellLeft = 0;
  /** Станция, у которой уже остановились (чтобы не тормозить повторно). */
  private servedStationKey: string | null = null;
  private readonly seed: number;

  constructor(
    seed: number,
    gx: number,
    gy: number,
    along: number,
    direction: 1 | -1,
    axis: 'x' | 'z' = 'x',
  ) {
    if (axis === 'x') {
      super(
        gx,
        gy,
        along,
        LRT.BEAM_HEIGHT + 0.7,
        direction === 1 ? LRT.TRACK_Z.east : LRT.TRACK_Z.west,
      );
      this.dirX = direction;
      this.dirZ = 0;
    } else {
      super(
        gx,
        gy,
        direction === 1 ? LRT.TRACK_X.south : LRT.TRACK_X.north,
        LRT.NS_BEAM_HEIGHT + 0.7,
        along,
      );
      this.dirX = 0;
      this.dirZ = direction;
    }
    this.axis = axis;
    this.seed = seed;
    this.speed = TRAIN.MAX_SPEED;
    this.faceDirection();
  }

  /** Координата вдоль коридора (локальная) и направление по нему. */
  get along(): number {
    return this.axis === 'x' ? this.x : this.z;
  }

  get direction(): 1 | -1 {
    return (this.axis === 'x' ? this.dirX : this.dirZ) === 1 ? 1 : -1;
  }

  /** Координата чанка вдоль коридора. */
  get lineCoord(): number {
    return this.axis === 'x' ? this.gx : this.gy;
  }

  /** Координата чанка поперёк коридора (номер линии). */
  get lineIndex(): number {
    return this.axis === 'x' ? this.gy : this.gx;
  }

  /** Детерминированный спавн: поезда `+` в чанках `c ≡ 0 (mod 5)` вдоль коридора, `−` — `c ≡ 2 (mod 5)`. */
  static spawnsAt(coord: number, direction: 1 | -1): boolean {
    const period = TRAIN_SPAWN_PERIOD;
    const phase = direction === 1 ? 0 : Math.floor(period / 2);
    return ((coord % period) + period) % period === phase;
  }

  /** Расстояние (со знаком по направлению) до центра станции текущего чанка или `null`. */
  private stationAhead(): number | null {
    const hasStation = this.axis === 'x' ? isStationColumn(this.gx) : isStationRow(this.gy);
    if (!hasStation || this.servedStationKey === this.key) {
      return null;
    }
    const distance = (0 - this.along) * this.direction;
    return distance >= -1 ? distance : null;
  }

  /** `leader` — расстояние до поезда впереди на той же нитке (юниты) или `Infinity`. */
  step(dt: number, leaderDistance: number): void {
    const accel = TRAIN.MAX_SPEED * dt; // разгон/торможение за ~1 с
    const separation = TRAIN_SEPARATION;
    switch (this.state) {
      case 'moving': {
        const ahead = this.stationAhead();
        if (ahead !== null && ahead <= TRAIN.BRAKE_DISTANCE) {
          this.state = 'braking';
        } else if (leaderDistance < separation) {
          // Интервал ≥ 4 чанков (AC-5.4): у границы — остановка, а не ползучий ход.
          this.speed = Math.max(0, this.speed - accel);
        } else {
          this.speed = Math.min(TRAIN.MAX_SPEED, this.speed + accel);
        }
        break;
      }
      case 'braking': {
        const ahead = this.stationAhead() ?? 0;
        // Скорость по тормозному пути: v = vmax·sqrt(d / D), минимум для доезда.
        const target = TRAIN.MAX_SPEED * Math.sqrt(Math.max(ahead, 0) / TRAIN.BRAKE_DISTANCE);
        this.speed = Math.max(Math.min(this.speed, Math.max(target, 1.5)), 0);
        if (ahead <= 0.4) {
          this.speed = 0;
          if (this.axis === 'x') {
            this.x = 0;
          } else {
            this.z = 0;
          }
          this.state = 'dwell';
          this.servedStationKey = this.key;
          const u = hashUnit(
            this.seed,
            this.gx,
            this.gy,
            DWELL_SALT + (this.direction === 1 ? 0 : 1),
          );
          this.dwellLeft = TRAIN.DWELL.min + u * (TRAIN.DWELL.max - TRAIN.DWELL.min);
        }
        break;
      }
      case 'dwell':
        this.dwellLeft -= dt;
        if (this.dwellLeft <= 0) {
          this.state = 'accelerating';
        }
        break;
      case 'accelerating':
        this.speed = Math.min(TRAIN.MAX_SPEED, this.speed + accel);
        if (this.speed >= TRAIN.MAX_SPEED) {
          this.state = 'moving';
        }
        break;
    }
    this.advance(this.speed * dt);
  }

  update(dt: number): void {
    this.step(dt, Number.POSITIVE_INFINITY);
  }

  /** Сброс «обслуженной» станции при переходе в другой чанк. */
  override moveTo(transfer: { gx: number; gy: number; key: string }): void {
    super.moveTo(transfer);
    if (this.servedStationKey !== this.key) {
      this.servedStationKey = null;
    }
  }

  /** Хеш для детерминированных параметров поезда. */
  static roll(seed: number, gx: number, gy: number): number {
    return hashUnit(seed, gx, gy, TRAIN_SALT);
  }
}

/** Период спавна поездов по gx (чанков); в окне 9 — 1…2 поезда на нитку (AC-5.4). */
export const TRAIN_SPAWN_PERIOD = 5;

/** Минимальный интервал до поезда впереди на той же нитке, юниты (4,5 чанка, AC-5.4). */
export const TRAIN_SEPARATION = WORLD.CHUNK_SIZE * 4.5;
