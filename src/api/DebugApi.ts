import type { App, AppStats } from '@/app/App';
import type { ChunkDescriptor } from '@/world/types';

/** `window.__app` в debug-режиме (design → API Design, FR-12.3). */
export interface DebugApi {
  readonly seed: string;
  readonly gridCoords: { x: number; y: number };
  describe(gx: number, gy: number): ChunkDescriptor;
  dumpWindow(): ChunkDescriptor[];
  stats(): AppStats;
  pan(dxPx: number, dyPx: number): void;
  step(dt: number): void;
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
    step: (dt) => app.step(dt),
    pause: () => app.pause(),
    resume: () => app.resume(),
  };
  target.__app = api;
  return api;
}
