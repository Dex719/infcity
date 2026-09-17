import { RENDER, TRAFFIC } from '@/config';
import type { Profile } from './Profile';

/** Шаги автопонижения в порядке применения (design → Error Handling: «Низкий FPS»). */
export type DowngradeStep = 'shadows' | 'dpr' | 'traffic';
export const DOWNGRADE_STEPS: readonly DowngradeStep[] = ['shadows', 'dpr', 'traffic'];

/** Что контроллер умеет менять на лету. */
export interface QualityTarget {
  setShadowResolution(size: number): void;
  setPixelRatio(maxRatio: number): void;
  setCarProbability(probability: number): void;
}

export interface QualityOptions {
  /** `false`, если профиль задан явно (`?quality=`) — тогда автопонижения нет. */
  readonly enabled: boolean;
  readonly thresholdFps?: number;
  readonly windowSeconds?: number;
}

/** Снимок состояния для debug/e2e. */
export interface QualityInfo {
  readonly enabled: boolean;
  readonly level: number;
  readonly steps: readonly DowngradeStep[];
  readonly shadowResolution: number;
  readonly maxDpr: number;
  readonly carProbability: number;
}

/** Медиана; для пустого массива — 0. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return sorted.length % 2 === 0 ? (lo + hi) / 2 : hi;
}

/**
 * Автопонижение качества (NFR-1, TSK-060): раз в секунду получает FPS; когда за окно
 * `windowSeconds` медиана ниже порога, применяет следующий шаг: тени 1024 → DPR 1 →
 * меньше машин. Шаги, которые ничего не меняют для текущего профиля, пропускаются.
 */
export class QualityController {
  private readonly samples: number[] = [];
  private readonly applied: DowngradeStep[] = [];
  private shadowResolution: number;
  private maxDpr: number;
  private carProbability: number;
  private readonly thresholdFps: number;
  private readonly windowSeconds: number;

  constructor(
    private readonly target: QualityTarget,
    profile: Profile,
    private readonly options: QualityOptions,
  ) {
    this.shadowResolution = profile.shadows ? profile.shadowResolution : 0;
    this.maxDpr = profile.maxDpr;
    this.carProbability = profile.carProbability;
    this.thresholdFps = options.thresholdFps ?? RENDER.AUTO_DOWNGRADE.fps;
    this.windowSeconds = options.windowSeconds ?? RENDER.AUTO_DOWNGRADE.windowSeconds;
  }

  /** Один замер FPS в секунду; `0` (скрытая вкладка) игнорируется. Возвращает применённый шаг. */
  observe(fps: number): DowngradeStep | null {
    if (!this.options.enabled || fps <= 0) {
      return null;
    }
    this.samples.push(fps);
    if (this.samples.length < this.windowSeconds) {
      return null;
    }
    const value = median(this.samples);
    this.samples.length = 0;
    if (value >= this.thresholdFps) {
      return null;
    }
    return this.downgrade();
  }

  /** Применить следующий значимый шаг; `null`, если понижать больше нечего. */
  downgrade(): DowngradeStep | null {
    for (let i = this.applied.length; i < DOWNGRADE_STEPS.length; i++) {
      const step = DOWNGRADE_STEPS[i];
      if (step === undefined) {
        break;
      }
      this.applied.push(step);
      if (this.apply(step)) {
        console.info(`quality: downgrade step "${step}" applied`);
        return step;
      }
    }
    return null;
  }

  get info(): QualityInfo {
    return {
      enabled: this.options.enabled,
      level: this.applied.length,
      steps: [...this.applied],
      shadowResolution: this.shadowResolution,
      maxDpr: this.maxDpr,
      carProbability: this.carProbability,
    };
  }

  /** `true`, если шаг реально что-то изменил. */
  private apply(step: DowngradeStep): boolean {
    switch (step) {
      case 'shadows': {
        const size = RENDER.SHADOW_RES.mobile;
        if (this.shadowResolution === 0 || this.shadowResolution <= size) {
          return false;
        }
        this.shadowResolution = size;
        this.target.setShadowResolution(size);
        return true;
      }
      case 'dpr': {
        if (this.maxDpr <= 1) {
          return false;
        }
        this.maxDpr = 1;
        this.target.setPixelRatio(1);
        return true;
      }
      case 'traffic': {
        const probability = TRAFFIC.P_CAR.mobile;
        if (this.carProbability <= probability) {
          return false;
        }
        this.carProbability = probability;
        this.target.setCarProbability(probability);
        return true;
      }
    }
  }
}
