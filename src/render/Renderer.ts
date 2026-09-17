import { Color, NoToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Camera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { Profile } from './Profile';

/** Бэкенд рендера (design D6): WebGL 2 по умолчанию, WebGPU за флагом `?gpu=1`. */
export type RenderBackend = 'webgl' | 'webgpu';

/** Общий тип двух рендереров three — приложение использует только пересечение их API. */
export type GpuRenderer = WebGLRenderer | WebGPURenderer;

/** Статистика последнего кадра (`renderer.info`). */
export interface FrameStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

/**
 * Обёртка над рендерером three (design C12, D6): DPR по профилю, sRGB-вывод без tone mapping
 * (цвета палитры должны совпадать с `palette.json`), тени PCF, события контекста.
 * WebGPU создаётся асинхронно фабрикой `Renderer.create` (динамический импорт `three/webgpu`).
 */
export class Renderer {
  readonly gl: GpuRenderer;
  readonly backend: RenderBackend;

  private width = 1;
  private height = 1;
  private lastStats: FrameStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly profile: Profile,
    gpu: WebGPURenderer | null = null,
  ) {
    if (gpu !== null) {
      this.gl = gpu;
      this.backend = 'webgpu';
    } else {
      this.gl = new WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.backend = 'webgl';
    }
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.shadowMap.enabled = profile.shadows;
    // PCFSoftShadowMap удалён в three r186 — мягкие тени даёт PCFShadowMap + radius.
    this.gl.shadowMap.type = PCFShadowMap;
    this.gl.autoClear = true;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxDpr));
  }

  /**
   * Фабрика (D6, TSK-073): при `preferWebGpu` и наличии `navigator.gpu` пробует WebGPURenderer;
   * любая ошибка инициализации → откат на WebGL без изменения остального приложения.
   */
  static async create(
    canvas: HTMLCanvasElement,
    profile: Profile,
    preferWebGpu: boolean,
  ): Promise<Renderer> {
    if (preferWebGpu && 'gpu' in navigator) {
      try {
        const { WebGPURenderer } = await import('three/webgpu');
        const gpu = new WebGPURenderer({
          canvas,
          antialias: true,
          powerPreference: 'high-performance',
          forceWebGL: false,
        });
        await gpu.init();
        return new Renderer(canvas, profile, gpu);
      } catch (error: unknown) {
        console.warn('WebGPU недоступен, используется WebGL 2', error);
      }
    }
    return new Renderer(canvas, profile);
  }

  /** Есть ли в браузере WebGL 2 (FR-11.3). */
  static supportsWebGL2(doc: Document = document): boolean {
    try {
      const probe = doc.createElement('canvas');
      return probe.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  }

  setClearColor(hex: string): void {
    this.gl.setClearColor(new Color(hex));
  }

  /** Ограничение DPR на лету (автопонижение, TSK-060). */
  setPixelRatio(maxRatio: number): void {
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
    this.gl.setSize(this.width, this.height, false);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.gl.setSize(this.width, this.height, false);
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Основной проход; статистика снимается сразу после него. */
  render(scene: Scene, camera: Camera): void {
    void this.gl.render(scene, camera);
    const info = this.gl.info;
    this.lastStats = {
      // WebGL: `render.calls` — draw calls кадра; WebGPU: `render.drawCalls` (calls там — с запуска).
      drawCalls: 'drawCalls' in info.render ? info.render.drawCalls : info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  get stats(): FrameStats {
    return this.lastStats;
  }

  /** Подписка на потерю/восстановление контекста (FR-11.4); для WebGPU события не приходят. */
  onContext(lost: () => void, restored: () => void): () => void {
    const onLost = (event: Event): void => {
      event.preventDefault();
      lost();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
      this.canvas.removeEventListener('webglcontextrestored', restored);
    };
  }

  dispose(): void {
    void this.gl.dispose();
  }
}
