import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RENDER } from '@/config';
import { parsePalette, type Palette, type PaletteKey } from '@/scene/palette';
import summerJson from '../../public/assets/palette.json';
import winterJson from '../../public/assets/palette.winter.json';

/**
 * Оракул тона кадра (FR-19.4, AC-19.4, design D17): модель Ламберта three r186 без tone
 * mapping — `radiance = albedo · (sun · NdotL · sunColor · lit + hemi(n)) / π`, вывод в sRGB.
 * Совпала с замером пикселей стартового кадра 2026-09-23 (площадь `stone-light` в тени:
 * расчёт 107, кадр 106), поэтому по ней подбираются экспозиция и палитра.
 */
interface Light {
  readonly sunIntensity: number;
  readonly sunPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly hemisphereIntensity: number;
}

const SUMMER: Light = {
  sunIntensity: RENDER.SUN.intensity,
  sunPosition: RENDER.SUN.position,
  hemisphereIntensity: RENDER.HEMISPHERE_INTENSITY,
};
const WINTER: Light = {
  sunIntensity: RENDER.WINTER.sunIntensity,
  sunPosition: RENDER.WINTER.sunPosition,
  hemisphereIntensity: RENDER.WINTER.hemisphereIntensity,
};

function toSrgb(linear: number): number {
  const l = Math.min(Math.max(linear, 0), 1);
  return l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
}

/** Выходной цвет поверхности (линейный) с нормалью `normal`; `lit` — на свету или в тени. */
function radiance(
  palette: Palette,
  light: Light,
  key: PaletteKey,
  normal: Vector3,
  lit: boolean,
): Color {
  const albedo = new Color(palette[key]);
  const sun = new Color(palette.sun);
  const sky = new Color(palette.sky);
  const ground = new Color(palette.ground);
  const dir = new Vector3(
    light.sunPosition.x,
    light.sunPosition.y,
    light.sunPosition.z,
  ).normalize();
  const nDotL = Math.max(normal.dot(dir), 0);
  const hemiWeight = 0.5 * normal.y + 0.5;
  const hemi = ground.clone().lerp(sky, hemiWeight).multiplyScalar(light.hemisphereIntensity);
  const direct = sun.multiplyScalar(light.sunIntensity * nDotL * (lit ? 1 : 0));
  const irradiance = hemi.add(direct);
  return new Color(
    (albedo.r * irradiance.r) / Math.PI,
    (albedo.g * irradiance.g) / Math.PI,
    (albedo.b * irradiance.b) / Math.PI,
  );
}

/** Яркость как в замере кадра: относительная яркость в линейном, закодированная в sRGB, 0…255. */
function brightness(c: Color): number {
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return toSrgb(y) * 255;
}

const UP = new Vector3(0, 1, 0);
const summer = parsePalette(summerJson);
const winter = parsePalette(winterJson);

describe('Тон кадра — оракул Ламберта (FR-19.4, AC-19.4, design D17)', () => {
  it('на свету: тротуар ≥ 210, асфальт 90…115, газон ≥ 150', () => {
    expect(brightness(radiance(summer, SUMMER, 'sidewalk', UP, true))).toBeGreaterThanOrEqual(210);
    const asphalt = brightness(radiance(summer, SUMMER, 'asphalt', UP, true));
    expect(asphalt).toBeGreaterThanOrEqual(90);
    expect(asphalt).toBeLessThanOrEqual(115);
    expect(brightness(radiance(summer, SUMMER, 'grass', UP, true))).toBeGreaterThanOrEqual(150);
  });

  it('контраст: тень / свет на тротуаре 0,50…0,62, тень холоднее света', () => {
    const lit = radiance(summer, SUMMER, 'sidewalk', UP, true);
    const shade = radiance(summer, SUMMER, 'sidewalk', UP, false);
    const ratio = brightness(shade) / brightness(lit);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
    expect(ratio).toBeLessThanOrEqual(0.62);
    expect(shade.b / shade.r).toBeGreaterThan(lit.b / lit.r);
  });

  it('белый на свету не уходит в пересвет ни в одном канале (лето и зима)', () => {
    for (const [palette, light] of [
      [summer, SUMMER],
      [winter, WINTER],
    ] as const) {
      const white = radiance(palette, light, 'white', UP, true);
      expect(Math.max(white.r, white.g, white.b)).toBeLessThan(1);
    }
  });

  it('зимой снег на свету светлее летнего тротуара в тени и не белее 250', () => {
    const snow = brightness(radiance(winter, WINTER, 'grass', UP, true));
    expect(snow).toBeLessThanOrEqual(250);
    expect(snow).toBeGreaterThan(brightness(radiance(summer, SUMMER, 'sidewalk', UP, false)));
  });
});
