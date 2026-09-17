import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
} from 'three';
import { RENDER } from '@/config';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 1.41421356;
    float a = smoothstep(0.55, 1.05, d) * uOpacity;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

/**
 * Виньетка (FR-9.2, design C12): полноэкранный quad вторым проходом поверх сцены,
 * без EffectComposer — один дополнительный draw call.
 */
export class Vignette {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;

  constructor(opacity: number = RENDER.VIGNETTE_OPACITY) {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uOpacity: { value: opacity } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  set opacity(value: number) {
    this.material.uniforms.uOpacity = { value };
  }

  render(gl: WebGLRenderer): void {
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.render(this.scene, this.camera);
    gl.autoClear = autoClear;
  }

  dispose(): void {
    this.material.dispose();
  }
}
