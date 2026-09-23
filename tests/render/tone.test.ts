import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RENDER } from '@/config';
import { Materials } from '@/scene/Materials';
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

describe('Кровля (FR-19.11, AC-19.12)', () => {
  /** Цвет на свету в sRGB 0…255 по каналам. */
  function srgb(c: Color): [number, number, number] {
    return [toSrgb(c.r) * 255, toSrgb(c.g) * 255, toSrgb(c.b) * 255];
  }

  it('кровля на свету 110…140 — как серые крыши референса (≈ 134)', () => {
    const roof = brightness(radiance(summer, SUMMER, 'roof', UP, true));
    expect(roof).toBeGreaterThanOrEqual(110);
    expect(roof).toBeLessThanOrEqual(140);
  });

  it('каждый цвет парапета отличается от кровли на ≥ 60 в sRGB', () => {
    const roof = srgb(radiance(summer, SUMMER, 'roof', UP, true));
    const rims: PaletteKey[] = [
      'glass-teal',
      'white',
      'roof-red',
      'flag-blue',
      'gold',
      'accent-red',
    ];
    for (const key of rims) {
      const rim = srgb(radiance(summer, SUMMER, key, UP, true));
      expect(
        Math.hypot(rim[0] - roof[0], rim[1] - roof[1], rim[2] - roof[2]),
      ).toBeGreaterThanOrEqual(60);
    }
  });

  it('зимой кровля под снегом — светлее летней', () => {
    expect(brightness(radiance(winter, WINTER, 'roof', UP, true))).toBeGreaterThan(
      brightness(radiance(summer, SUMMER, 'roof', UP, true)),
    );
  });
});

describe('Облака (FR-19.19, AC-19.20, design D21)', () => {
  const FRONT = new Vector3(0, 0, 1);
  const SIDE = new Vector3(1, 0, 0);
  /** Замер референса: грань облака в тени, sRGB (стартовый кадр, p10 области облака). */
  const REFERENCE_SHADE = [195, 200, 209] as const;

  /**
   * Грань белого объёма облака в sRGB 0…255: альбедо палитры × цвет материала облаков под
   * светом (облака тень не принимают) плюс свечение материала — как считает Lambert three.
   */
  function cloudFace(palette: Palette, light: Light, normal: Vector3): [number, number, number] {
    const cloud = new Materials(palette).cloud;
    const base = radiance(palette, light, 'white', normal, true);
    return [
      toSrgb(base.r * cloud.color.r + cloud.emissive.r) * 255,
      toSrgb(base.g * cloud.color.g + cloud.emissive.g) * 255,
      toSrgb(base.b * cloud.color.b + cloud.emissive.b) * 255,
    ];
  }

  it('летом грань в тени — как у референса ± 8, верх 238…252, освещённый бок между ними', () => {
    const shade = cloudFace(summer, SUMMER, FRONT);
    const top = cloudFace(summer, SUMMER, UP);
    const side = cloudFace(summer, SUMMER, SIDE);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs((shade[c] ?? 0) - (REFERENCE_SHADE[c] ?? 0))).toBeLessThanOrEqual(8);
      expect(top[c]).toBeGreaterThanOrEqual(238);
      expect(top[c]).toBeLessThanOrEqual(252);
      expect(side[c]).toBeGreaterThan(shade[c] ?? 0);
      expect(side[c]).toBeLessThan(top[c] ?? 0);
    }
  });

  it('без свечения та же грань была бы серой (≤ 120): так облака выглядели до волны 7', () => {
    const base = radiance(summer, SUMMER, 'white', FRONT, true);
    expect(Math.max(toSrgb(base.r), toSrgb(base.g), toSrgb(base.b)) * 255).toBeLessThanOrEqual(120);
  });

  it('зимой грань в тени ≥ 185, освещённые грани не выжжены', () => {
    const shade = cloudFace(winter, WINTER, FRONT);
    for (const normal of [UP, SIDE]) {
      expect(Math.max(...cloudFace(winter, WINTER, normal))).toBeLessThan(254.5);
    }
    expect(Math.min(...shade)).toBeGreaterThanOrEqual(185);
  });

  it('город не тронут: у непрозрачного материала нет свечения и множителя цвета', () => {
    const materials = new Materials(summer);
    expect(materials.opaque.emissive.getHex()).toBe(0x000000);
    expect(materials.opaque.color.getHex()).toBe(0xffffff);
  });
});

describe('Стекло окон (FR-19.20, AC-19.21, design D22)', () => {
  const SIDE = new Vector3(1, 0, 0);
  const FRONT = new Vector3(0, 0, 1);
  /** Замер ближних окон референса (зелёный дом среднего плана), sRGB. */
  const REFERENCE_GLASS = [37, 39, 48] as const;
  const WALLS: PaletteKey[] = ['panel-grey', 'brick', 'sand', 'stone-light'];

  function srgb(c: Color): [number, number, number] {
    return [toSrgb(c.r) * 255, toSrgb(c.g) * 255, toSrgb(c.b) * 255];
  }

  it('на свету — как ближние окна референса ± 6, в тени темнее, но не чёрная дыра', () => {
    const lit = srgb(radiance(summer, SUMMER, 'window', SIDE, true));
    const shade = srgb(radiance(summer, SUMMER, 'window', FRONT, true));
    for (let c = 0; c < 3; c++) {
      expect(Math.abs((lit[c] ?? 0) - (REFERENCE_GLASS[c] ?? 0))).toBeLessThanOrEqual(6);
      expect(shade[c]).toBeLessThan(lit[c] ?? 0);
      expect(shade[c]).toBeGreaterThanOrEqual(8);
    }
  });

  it('на свету стекло не ярче 0,4 любой стены жилых домов летом и зимой; прежнее синее — ярче', () => {
    for (const [palette, light] of [
      [summer, SUMMER],
      [winter, WINTER],
    ] as const) {
      const glass = brightness(radiance(palette, light, 'window', SIDE, true));
      for (const wall of WALLS) {
        const lit = brightness(radiance(palette, light, wall, SIDE, true));
        expect(glass).toBeLessThanOrEqual(0.4 * lit);
      }
    }
    // Самая тёмная стена — кирпич: прежнее стекло `glass-navy` на нём было ярче 0,7.
    const brick = brightness(radiance(summer, SUMMER, 'brick', SIDE, true));
    expect(brightness(radiance(summer, SUMMER, 'glass-navy', SIDE, true))).toBeGreaterThan(
      0.7 * brick,
    );
  });

  it('оракул воспроизводит прежний проём кадра: синий (48, 87, 122) на свету', () => {
    const old = srgb(radiance(summer, SUMMER, 'glass-navy', SIDE, true));
    const frame = [48, 87, 122];
    for (let c = 0; c < 3; c++) {
      expect(Math.abs((old[c] ?? 0) - (frame[c] ?? 0))).toBeLessThanOrEqual(3);
    }
  });
});
