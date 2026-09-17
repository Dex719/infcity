import { Scene, Vector3 } from 'three';
import { CLOUD, WORLD } from '@/config';
import type { AppFlags } from '@/api/Seed';
import { CameraRig } from '@/controls/CameraRig';
import { InputManager } from '@/controls/InputManager';
import { PanControls } from '@/controls/PanControls';
import { MobSystem, type MobStats } from '@/mobs/MobSystem';
import { Lighting } from '@/render/Lighting';
import { Vignette } from '@/render/Post';
import type { Profile } from '@/render/Profile';
import { QualityController, type QualityInfo } from '@/render/Quality';
import { Renderer } from '@/render/Renderer';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import type { Palette } from '@/scene/palette';
import { PrefabBuilder } from '@/scene/PrefabBuilder';
import { Generator } from '@/world/Generator';
import { Emitter } from './Emitter';

/** Запас высоты камеры над облаками, ниже которого облака скрываются, юниты. */
const CLOUD_CLEARANCE = 12;

/** События приложения для UI-оболочки (design C1). */
export interface AppEvents extends Record<string, unknown> {
  started: undefined;
  pause: undefined;
  resume: undefined;
}

/** Снимок статистики для debug-оверлея и e2e (design → `window.__app`). */
export interface AppStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  emptySlots: number;
  gridCoords: { x: number; y: number };
  cameraHeight: number;
  builds: number;
  cacheHits: number;
  buildErrors: number;
  generatorErrors: number;
  mobs: MobStats;
  paused: boolean;
  quality: QualityInfo;
}

/** Точка города в абсолютных координатах (чанк × 60 + локальные). */
export interface CityPoint {
  x: number;
  z: number;
}

export interface AppOptions {
  readonly canvas: HTMLCanvasElement;
  readonly flags: AppFlags;
  readonly palette: Palette;
  readonly profile: Profile;
  readonly builder?: ChunkBuilder;
}

/**
 * Главный цикл (design C1): ввод → панорамирование → окно чанков → камера → рендер.
 * Пауза при скрытии вкладки и по запросу UI; `dt` ограничен `WORLD.MAX_DT` (FR-8.5).
 */
export class App extends Emitter<AppEvents> {
  readonly scene = new Scene();
  readonly renderer: Renderer;
  readonly rig: CameraRig;
  readonly input: InputManager;
  readonly pan: PanControls;
  readonly generator: Generator;
  readonly chunkWindow: ChunkWindow;
  readonly flags: AppFlags;
  readonly materials: Materials;
  readonly lighting: Lighting;
  readonly vignette: Vignette;
  readonly mobs: MobSystem;
  readonly quality: QualityController;

  private readonly scratch = new Vector3();
  private lastFrameTime = 0;
  private paused = false;
  private started = false;
  private pausedByVisibility = false;
  private rafHandle = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  private fps = 0;

  constructor(options: AppOptions) {
    super();
    this.flags = options.flags;
    this.renderer = new Renderer(options.canvas, options.profile);
    this.renderer.setClearColor(options.palette.sky);
    this.rig = new CameraRig(1);
    this.input = new InputManager(options.canvas);
    this.generator = new Generator(options.flags.seed);
    this.materials = new Materials(options.palette);
    this.chunkWindow = new ChunkWindow(
      this.generator,
      options.builder ?? new PrefabBuilder(this.materials),
    );
    this.scene.add(this.chunkWindow.root);
    this.lighting = new Lighting(
      this.scene,
      options.palette,
      options.profile,
      options.flags.season,
    );
    this.vignette = new Vignette();
    this.mobs = new MobSystem(this.chunkWindow, this.materials, options.profile);
    this.quality = new QualityController(
      {
        setShadowResolution: (size) => this.lighting.setShadowResolution(size),
        setPixelRatio: (ratio) => this.renderer.setPixelRatio(ratio),
        setCarProbability: (p) => this.mobs.setCarProbability(p),
      },
      options.profile,
      { enabled: options.flags.quality === null },
    );
    this.pan = new PanControls(this.input, this.rig, this.chunkWindow.root);
    this.pan.on('move', ({ dx, dy }) => this.chunkWindow.move(dx, dy));
    this.input.on('wheel', ({ deltaY }) => this.rig.wheel(deltaY));
    this.input.on('pinch', ({ ratio }) => this.rig.pinch(ratio));
    this.input.on('pinchstart', () => {
      this.pan.enabled = false;
    });
    this.input.on('pinchend', () => {
      this.pan.enabled = true;
    });
    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Стартовое окно, первый кадр, запуск цикла. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.chunkWindow.setCenter(0, 0);
    // Стартовое окно собираем целиком до первого кадра: пустых слотов быть не должно.
    this.chunkWindow.update(this.chunkWindow.size * this.chunkWindow.size);
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.loop();
    this.emit('started', undefined);
  }

  pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    cancelAnimationFrame(this.rafHandle);
    this.emit('pause', undefined);
  }

  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.lastFrameTime = performance.now();
    this.loop();
    this.emit('resume', undefined);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Один шаг симуляции с заданным `dt` и кадром (debug/e2e `step`). */
  step(dt: number): void {
    this.tick(Math.min(dt, WORLD.MAX_DT));
  }

  /** Ускоренное время: `seconds` симуляции шагами `dt` без рендера, один кадр в конце (TSK-062). */
  simulate(seconds: number, dt: number = 1 / 60): void {
    const step = Math.min(Math.max(dt, 1e-3), WORLD.MAX_DT);
    const steps = Math.max(1, Math.round(seconds / step));
    for (let i = 0; i < steps; i++) {
      this.advance(step);
    }
    this.render();
  }

  /** Точка города под пикселем канваса (AC-8.1) или `null`. */
  cityPointAt(px: number, py: number): CityPoint | null {
    const ndc = this.input.toNdc({ x: px, y: py });
    const hit = this.rig.groundPoint(ndc.x, ndc.y, this.scratch);
    if (hit === null) {
      return null;
    }
    const root = this.chunkWindow.root.position;
    const grid = this.chunkWindow.gridCoords;
    return {
      x: hit.x - root.x + grid.x * WORLD.CHUNK_SIZE,
      z: hit.z - root.z + grid.y * WORLD.CHUNK_SIZE,
    };
  }

  /** Пиксель канваса, в который проецируется точка города (AC-8.1). */
  screenPointOf(point: CityPoint): { x: number; y: number } {
    const root = this.chunkWindow.root.position;
    const grid = this.chunkWindow.gridCoords;
    const v = this.scratch.set(
      point.x - grid.x * WORLD.CHUNK_SIZE + root.x,
      0,
      point.z - grid.y * WORLD.CHUNK_SIZE + root.z,
    );
    v.project(this.rig.camera);
    const { width, height } = this.renderer.size;
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }

  /** Телепорт окна на чанк `(gx, gy)` с полной сборкой (debug/e2e, скриншоты ландмарков). */
  centerOn(gx: number, gy: number): void {
    this.pan.resetTo(0, 0);
    this.chunkWindow.setCenter(gx, gy);
    this.chunkWindow.update(this.chunkWindow.size * this.chunkWindow.size);
  }

  stats(): AppStats {
    const frame = this.renderer.stats;
    const cw = this.chunkWindow.stats;
    return {
      fps: this.fps,
      drawCalls: frame.drawCalls,
      triangles: frame.triangles,
      emptySlots: this.chunkWindow.emptySlots(),
      gridCoords: { ...this.chunkWindow.gridCoords },
      cameraHeight: this.rig.currentHeight,
      builds: cw.builds,
      cacheHits: cw.cacheHits,
      buildErrors: cw.buildErrors,
      generatorErrors: this.generator.errors,
      mobs: this.mobs.stats(),
      paused: this.paused,
      quality: this.quality.info,
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.rafHandle);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.input.dispose();
    this.renderer.dispose();
  }

  private readonly loop = (): void => {
    if (this.paused) {
      return;
    }
    this.rafHandle = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, WORLD.MAX_DT);
    this.lastFrameTime = now;
    this.tick(dt);
    this.countFps();
  };

  private tick(dt: number): void {
    this.advance(dt);
    this.render();
  }

  /** Шаг симуляции без рендера. */
  private advance(dt: number): void {
    this.pan.update(dt);
    this.chunkWindow.update();
    this.mobs.update(dt);
    this.rig.update(dt);
    this.mobs.setCloudsVisible(this.rig.currentHeight > CLOUD.ALTITUDE + CLOUD_CLEARANCE);
  }

  private render(): void {
    this.renderer.render(this.scene, this.rig.camera);
    this.vignette.render(this.renderer.gl);
  }

  private countFps(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsWindowStart));
      this.frames = 0;
      this.fpsWindowStart = now;
      this.quality.observe(this.fps);
    }
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.rig.setAspect(width / height);
    this.lighting.resize(width / height);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      if (!this.paused) {
        this.pausedByVisibility = true;
        this.pause();
      }
    } else if (this.pausedByVisibility) {
      this.pausedByVisibility = false;
      this.resume();
    }
  };
}
