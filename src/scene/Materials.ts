import { BackSide, Color, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { CLOUD } from '@/config';
import type { Palette, PaletteKey } from './palette';

/**
 * Материалы сцены (FR-9.4, AC-9.3): все цвета — из палитры, попадают в геометрию как
 * вершинные цвета, поэтому весь город рисуется двумя материалами: непрозрачный и стекло
 * (облакам и их теневому двойнику — свои, design D18).
 * Lambert выбран как «low»-профиль дизайна D4: плоский игрушечный вид и дёшево на мобильных.
 * Непрозрачный материал затеняется по граням (FR-19.3, design D16): нормаль грани считается
 * в шейдере, поэтому кроны, облака и купола становятся гранёными, как у референса, без
 * единой новой вершины. Стекло остаётся гладким — прозрачный объём с гранями читается как сетка.
 */
export class Materials {
  readonly opaque: MeshLambertMaterial;
  readonly glass: MeshLambertMaterial;
  /**
   * Облака (FR-19.10, design D18): те же вершинные цвета и грани, что у `opaque`, но свой
   * экземпляр — у низкой камеры облака растворяются прозрачностью, не трогая город, и светятся
   * изнутри, чтобы читаться белыми, а не серыми (FR-19.19, design D21).
   */
  readonly cloud: MeshLambertMaterial;
  /**
   * Теневой двойник (design D18): в основном проходе не пишет ни цвет, ни глубину, а теневой
   * проход рисует объект своим материалом глубины — тень остаётся, сам объект не виден.
   */
  readonly shadowOnly: MeshBasicMaterial;
  private readonly colors = new Map<PaletteKey, Color>();

  constructor(readonly palette: Palette) {
    this.opaque = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.opaque.name = 'palette-opaque';
    // В карту теней пишутся только грани, обращённые от света, — это значение three по
    // умолчанию, но на нём держится деление статики по солнцу (`ShadowSplit`, design D20),
    // поэтому оно задано явно.
    this.opaque.shadowSide = BackSide;
    this.glass = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
    this.glass.name = 'palette-glass';
    this.glass.depthWrite = false;
    this.cloud = new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      color: new Color().setScalar(CLOUD.LOOK.ALBEDO),
      emissive: new Color(CLOUD.LOOK.GLOW.r, CLOUD.LOOK.GLOW.g, CLOUD.LOOK.GLOW.b),
    });
    this.cloud.name = 'palette-cloud';
    this.shadowOnly = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.shadowOnly.name = 'shadow-only';
  }

  /** Цвет палитры (кэшируется, не мутировать). */
  color(key: PaletteKey): Color {
    let color = this.colors.get(key);
    if (color === undefined) {
      color = new Color(this.palette[key]);
      this.colors.set(key, color);
    }
    return color;
  }

  /** Немного затемнённый/осветлённый вариант цвета палитры (для крыш, окон). */
  shade(key: PaletteKey, factor: number): Color {
    const id = `${key}*${factor.toFixed(2)}` as PaletteKey;
    let color = this.colors.get(id);
    if (color === undefined) {
      color = this.color(key).clone().multiplyScalar(factor);
      this.colors.set(id, color);
    }
    return color;
  }

  dispose(): void {
    this.opaque.dispose();
    this.glass.dispose();
    this.cloud.dispose();
    this.shadowOnly.dispose();
  }
}
