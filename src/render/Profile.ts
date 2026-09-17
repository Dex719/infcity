import { RENDER, TRAFFIC } from '@/config';
import type { Quality } from '@/api/Seed';

/** Профиль качества: всё, что зависит от устройства (NFR-1, design → Performance). */
export interface Profile {
  readonly quality: Quality;
  readonly mobile: boolean;
  readonly maxDpr: number;
  readonly shadowResolution: number;
  readonly shadows: boolean;
  /** Порог `roll` машины: спавним только `roll < carProbability` (FR-6.1). */
  readonly carProbability: number;
}

/** Грубая эвристика мобильного устройства: touch + узкий экран или mobile UA. */
export function isMobileDevice(nav: Navigator = navigator, win: Window = window): boolean {
  const touch = nav.maxTouchPoints > 0;
  const narrow = Math.min(win.innerWidth, win.innerHeight) < 700;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  return ua || (touch && narrow);
}

/** Профиль по имени качества. */
export function profileFor(quality: Quality, mobile: boolean): Profile {
  switch (quality) {
    case 'high':
      return {
        quality,
        mobile,
        maxDpr: RENDER.MAX_DPR.desktop,
        shadowResolution: RENDER.SHADOW_RES.desktop,
        shadows: true,
        carProbability: TRAFFIC.P_CAR.desktop,
      };
    case 'medium':
      return {
        quality,
        mobile,
        maxDpr: RENDER.MAX_DPR.mobile,
        shadowResolution: RENDER.SHADOW_RES.mobile,
        shadows: true,
        carProbability: TRAFFIC.P_CAR.mobile,
      };
    case 'low':
      return {
        quality,
        mobile,
        maxDpr: 1,
        shadowResolution: RENDER.SHADOW_RES.mobile,
        shadows: false,
        carProbability: TRAFFIC.P_CAR.mobile,
      };
  }
}

/** Профиль по умолчанию: desktop → high, mobile → medium; `?quality=` переопределяет. */
export function detectProfile(forced: Quality | null, mobile: boolean = isMobileDevice()): Profile {
  return profileFor(forced ?? (mobile ? 'medium' : 'high'), mobile);
}
