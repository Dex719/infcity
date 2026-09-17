import { Color, NoToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Camera, Scene } from 'three';
import type { Profile } from './Profile';

/** Статистика последнего кадра (`renderer.info`). */
export interface FrameStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

/**
 * Обёртка над `WebGLRenderer` (design C12): DPR по профилю, sRGB-вывод без tone mapping
 * (цвета палитры должны совпадать с `palette.json`), тени PCF, события контекста.
 */
export class Renderer {
  readonly gl: WebGLRenderer;

  private width = 1;
  private height = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly profile: Profile,
  ) {
    this.gl = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.shadowMap.enabled = profile.shadows;
    // PCFSoftShadowMap удалён в three r186 — мягкие тени даёт PCFShadowMap + radius.
    this.gl.shadowMap.type = PCFShadowMap;
    this.gl.autoClear = true;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxDpr));
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

  /** Основной проход; статистика снимается сразу после него, до пост-проходов. */
  render(scene: Scene, camera: Camera): void {
    this.gl.render(scene, camera);
    const info = this.gl.info;
    this.lastStats = {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  private lastStats: FrameStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  get stats(): FrameStats {
    return this.lastStats;
  }

  /** Подписка на потерю/восстановление контекста (FR-11.4). */
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
    this.gl.dispose();
  }
}
