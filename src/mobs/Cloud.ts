import { CLOUD } from '@/config';
import type { CloudSpawn } from '@/world/types';
import { MobileObject } from './MobileObject';

const DIR_LEN = Math.hypot(CLOUD.DIRECTION.x, CLOUD.DIRECTION.z);
const PULSE_PERIOD = 6;

/**
 * Видимость облаков при высоте камеры `h` (FR-19.10, AC-19.11, design D18): 0 не выше
 * `CLOUD.FADE.HIDE`, 1 не ниже `CLOUD.FADE.SHOW`, между — плавно (smoothstep).
 */
export function cloudVisibility(h: number): number {
  const span = CLOUD.FADE.SHOW - CLOUD.FADE.HIDE;
  const t = Math.min(Math.max((h - CLOUD.FADE.HIDE) / span, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Облако (FR-7): дрейф по ветру над городом и «дыхание» масштаба ±5 %. */
export class Cloud extends MobileObject {
  readonly model: number;
  private readonly baseScale: number;
  private readonly phase: number;

  constructor(gx: number, gy: number, spawn: CloudSpawn) {
    super(gx, gy, spawn.x, CLOUD.ALTITUDE, spawn.z);
    this.model = spawn.model;
    this.dirX = CLOUD.DIRECTION.x / DIR_LEN;
    this.dirZ = CLOUD.DIRECTION.z / DIR_LEN;
    this.speed = CLOUD.SPEED * spawn.speedMul;
    this.phase = spawn.phase;
    this.baseScale = 1 + (spawn.speedMul - 1) * 2; // чуть крупнее быстрые
    this.yaw = 0.25;
  }

  update(dt: number, t: number): void {
    const pulse = Math.sin(((t / PULSE_PERIOD) * 2 + this.phase * 2) * Math.PI);
    this.scale = this.baseScale * (1 + CLOUD.SCALE_AMPLITUDE * pulse);
    this.advance(this.speed * dt);
  }
}
