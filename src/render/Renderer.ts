import { Color, NoToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
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
 * (цвета палитры должны совпадать с `palette.json`), тени PCFSoft, события контекста.
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
    this.gl.shadowMap.type = PCFSoftShadowMap;
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

  render(scene: Scene, camera: Camera): void {
    this.gl.render(scene, camera);
  }

  get stats(): FrameStats {
    const info = this.gl.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
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
