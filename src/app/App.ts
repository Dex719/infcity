import { Scene } from 'three';
import { WORLD } from '@/config';
import type { AppFlags } from '@/api/Seed';
import { CameraRig } from '@/controls/CameraRig';
import { InputManager } from '@/controls/InputManager';
import { PanControls } from '@/controls/PanControls';
import { Lighting } from '@/render/Lighting';
import { Vignette } from '@/render/Post';
import type { Profile } from '@/render/Profile';
import { Renderer } from '@/render/Renderer';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import type { Palette } from '@/scene/palette';
import { PrefabBuilder } from '@/scene/PrefabBuilder';
import { Generator } from '@/world/Generator';
import { Emitter } from './Emitter';

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
  generatorErrors: number;
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
    this.lighting = new Lighting(this.scene, options.palette, options.profile);
    this.vignette = new Vignette();
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

  /** Один шаг симуляции с заданным `dt` (debug/e2e `step`). */
  step(dt: number): void {
    this.tick(Math.min(dt, WORLD.MAX_DT));
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
      generatorErrors: this.generator.errors,
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
    this.pan.update(dt);
    this.chunkWindow.update();
    this.rig.update(dt);
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
