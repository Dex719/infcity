import type { App, AppStats, CityPoint } from '@/app/App';
import type { CarSnapshot } from '@/mobs/MobSystem';
import type { DowngradeStep } from '@/render/Quality';
import type { ChunkDescriptor } from '@/world/types';

/** `window.__app` в debug-режиме (design → API Design, FR-12.3). */
export interface DebugApi {
  readonly seed: string;
  readonly gridCoords: { x: number; y: number };
  describe(gx: number, gy: number): ChunkDescriptor;
  dumpWindow(): ChunkDescriptor[];
  stats(): AppStats;
  pan(dxPx: number, dyPx: number): void;
  centerOn(gx: number, gy: number): void;
  step(dt: number): void;
  /** Ускоренное время без рендера (TSK-062). */
  simulate(seconds: number, dt?: number): void;
  /** Пересекающиеся пары машин в окне (AC-6.1). */
  overlaps(): number;
  /** Пересоздать мобов из дескрипторов — детерминированный кадр (AC-9.1). */
  resetMobs(): void;
  /** Снимки машин: позиция, скорость, радар, время простоя (AC-6.2). */
  cars(): CarSnapshot[];
  /** Поезда в окне: чанк, локальная позиция, направление, состояние (AC-5.4). */
  trains(): {
    gx: number;
    gy: number;
    x: number;
    z: number;
    dirX: number;
    dirZ: number;
    axis: 'x' | 'z';
    state: string;
  }[];
  /** Точка города под пикселем и обратная проекция (AC-8.1). */
  groundAt(px: number, py: number): CityPoint | null;
  project(point: CityPoint): { x: number; y: number };
  /** Ручной шаг автопонижения (TSK-060). */
  downgrade(): DowngradeStep | null;
  /** Камера: колесо (deltaY в px) и мгновенная установка высоты (e2e, скриншоты). */
  zoom(deltaY: number): void;
  setHeight(height: number): void;
  pause(): void;
  resume(): void;
}

declare global {
  interface Window {
    __app?: DebugApi;
  }
}

/** Создаёт debug-API и вешает его на `window`. */
export function installDebugApi(app: App, target: Window = window): DebugApi {
  const api: DebugApi = {
    seed: app.flags.seed,
    get gridCoords(): { x: number; y: number } {
      return { ...app.chunkWindow.gridCoords };
    },
    describe: (gx, gy) => app.generator.describe(gx, gy),
    dumpWindow: () => app.chunkWindow.dump(),
    stats: () => app.stats(),
    pan: (dx, dy) => app.pan.panByPixels(dx, dy),
    centerOn: (gx, gy) => app.centerOn(gx, gy),
    step: (dt) => app.step(dt),
    simulate: (seconds, dt) => app.simulate(seconds, dt),
    overlaps: () => app.mobs.overlaps(),
    resetMobs: () => app.mobs.reset(),
    cars: () => app.mobs.carSnapshots(),
    trains: () =>
      app.mobs.allTrains.map((t) => ({
        gx: t.gx,
        gy: t.gy,
        x: t.x,
        z: t.z,
        dirX: t.dirX,
        dirZ: t.dirZ,
        axis: t.axis,
        state: t.state,
      })),
    groundAt: (px, py) => app.cityPointAt(px, py),
    project: (point) => app.screenPointOf(point),
    downgrade: () => app.quality.downgrade(),
    zoom: (deltaY) => app.rig.wheel(deltaY),
    setHeight: (height) => app.rig.snapHeight(height),
    pause: () => app.pause(),
    resume: () => app.resume(),
  };
  target.__app = api;
  return api;
}
