import { Color, MeshLambertMaterial } from 'three';
import type { Palette, PaletteKey } from './palette';

/**
 * Материалы сцены (FR-9.4, AC-9.3): все цвета — из палитры, попадают в геометрию как
 * вершинные цвета, поэтому на весь город хватает двух материалов: непрозрачный и стекло.
 * Lambert выбран как «low»-профиль дизайна D4: плоский игрушечный вид и дёшево на мобильных.
 */
export class Materials {
  readonly opaque: MeshLambertMaterial;
  readonly glass: MeshLambertMaterial;
  private readonly colors = new Map<PaletteKey, Color>();

  constructor(readonly palette: Palette) {
    this.opaque = new MeshLambertMaterial({ vertexColors: true });
    this.opaque.name = 'palette-opaque';
    this.glass = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
    this.glass.name = 'palette-glass';
    this.glass.depthWrite = false;
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
  }
}
