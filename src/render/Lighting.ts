import { DirectionalLight, Fog, HemisphereLight, Vector3, type Scene } from 'three';
import type { Season } from '@/api/Seed';
import { RENDER } from '@/config';
import type { Palette } from '@/scene/palette';
import type { Profile } from './Profile';

/**
 * Свет, тени и туман (FR-9.1–9.3, design C12): одно солнце с PCF-тенью, полусферический
 * рассеянный свет неба/земли, линейный туман цвета неба. Тень покрывает окно вокруг
 * начала координат — сцена движется под камерой, поэтому цель света фиксирована.
 */
export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemisphere: HemisphereLight;

  constructor(scene: Scene, palette: Palette, profile: Profile, season: Season = 'summer') {
    const winter = season === 'winter';
    const sunPos = winter ? RENDER.WINTER.sunPosition : RENDER.SUN.position;
    this.sun = new DirectionalLight(
      palette[RENDER.SUN.colorKey],
      winter ? RENDER.WINTER.sunIntensity : RENDER.SUN.intensity,
    );
    this.sun.name = 'sun';
    this.sun.position.set(sunPos.x, sunPos.y, sunPos.z);
    this.sun.castShadow = profile.shadows;
    const shadow = this.sun.shadow;
    shadow.mapSize.set(profile.shadowResolution, profile.shadowResolution);
    shadow.bias = RENDER.SHADOW_BIAS;
    shadow.normalBias = RENDER.SHADOW_NORMAL_BIAS;
    shadow.camera.near = RENDER.SHADOW_CAMERA.near;
    shadow.camera.far = RENDER.SHADOW_CAMERA.far;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemisphere = new HemisphereLight(
      palette.sky,
      palette.ground,
      winter ? RENDER.WINTER.hemisphereIntensity : RENDER.HEMISPHERE_INTENSITY,
    );
    this.hemisphere.name = 'sky';
    scene.add(this.hemisphere);

    scene.fog = new Fog(palette.sky, RENDER.FOG.near, RENDER.FOG.far);
    this.resize(1);
  }

  /**
   * Направление от сцены на солнце для сезона (цель света — начало координат): тот же источник,
   * что у самого света, — им делится статика чанков по солнцу (`ShadowSplit`, design D20).
   */
  static sunDirection(season: Season = 'summer'): Vector3 {
    const p = season === 'winter' ? RENDER.WINTER.sunPosition : RENDER.SUN.position;
    return new Vector3(p.x, p.y, p.z).normalize();
  }

  /** Смена разрешения карты теней на лету (автопонижение, TSK-060). */
  setShadowResolution(size: number): void {
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x === size && shadow.mapSize.y === size) {
      return;
    }
    shadow.mapSize.set(size, size);
    if (shadow.map !== null) {
      shadow.map.dispose();
      shadow.map = null;
    }
  }

  /** Ортофрустум тени зависит от соотношения сторон, как в референсе (design C12). */
  resize(aspect: number): void {
    const c = RENDER.SHADOW_CAMERA;
    const extent = c.extent * Math.max(aspect, c.minAspect);
    const camera = this.sun.shadow.camera;
    camera.left = c.left * extent;
    camera.right = c.right * extent;
    camera.top = c.top * extent;
    camera.bottom = c.bottom * extent;
    camera.updateProjectionMatrix();
  }
}
