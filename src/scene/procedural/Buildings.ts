import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { mulberry32 } from '@/world/Hash';
import { type GeometryBatch, Templates } from './GeometryBatch';

/** Доля крыш с деталями (FR-15.5, AC-15.4: ≥ 40 %). */
export const ROOF_DETAIL_PROBABILITY = 0.65;

/** Высота этажа, юниты. */
export const FLOOR = 2.7;

/** Прямоугольник на земле: центр и размеры. */
export interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

/**
 * Процедурные здания low-poly (FR-3.4, D2/D3): корпус, оконные полосы по этажам,
 * крыша, вход. Стеклянные части идут в отдельный батч (`glass`), чтобы рендериться
 * полупрозрачными вторым draw call'ом.
 */
export class Buildings {
  /** Счётчики покрытия деталями крыш (AC-15.4). */
  roofs = 0;
  roofsWithDetails = 0;

  constructor(
    private readonly batch: GeometryBatch,
    private readonly glass: GeometryBatch,
    private readonly m: Materials,
    private readonly rng: () => number = mulberry32(1),
  ) {}

  /** Панельная/кирпичная жилая коробка с рядами окон на всех фасадах. */
  panelHouse(f: Footprint, floors: number, wall: PaletteKey = 'panel-grey'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(wall));
    const roof = this.m.shade('roof-dark', 1);
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, roof);
    this.windowRows(f, floors, 'glass-navy', 0.55);
    // Вход с козырьком на длинной стороне.
    b.box(f.x, 1.3, f.z + f.d / 2 + 0.4, 2.4, 2.6, 0.8, this.m.color('roof-dark'));
    b.box(f.x, 2.8, f.z + f.d / 2 + 0.8, 3.2, 0.2, 1.6, this.m.color('white'));
    // Лифтовая надстройка.
    b.box(f.x + f.w * 0.25, h + 1.2, f.z, 3, 2, 3, this.m.color(wall));
    this.roofDetails(f, h + 0.4);
  }

  /** Новостройка: светлый корпус с цветными балконными полосами. */
  modernTower(f: Footprint, floors: number, accent: PaletteKey = 'glass-teal'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('stone-light'));
    b.box(f.x, h + 0.2, f.z, f.w + 0.3, 0.4, f.d + 0.3, this.m.color('white'));
    this.windowRows(f, floors, 'glass-blue', 0.6);
    // Вертикальная акцентная полоса (лоджии).
    b.box(f.x - f.w / 2 - 0.15, h / 2, f.z, 0.3, h, f.d * 0.35, this.m.color(accent));
    b.box(f.x + f.w / 2 + 0.15, h / 2, f.z, 0.3, h, f.d * 0.35, this.m.color(accent));
    b.box(f.x, h + 1, f.z, f.w * 0.5, 1.6, f.d * 0.5, this.m.color('stone-light'));
    this.roofDetails(f, h + 0.4);
  }

  /** Стеклянная башня делового центра: корпус в стекле, стальные пояса, «корона». */
  glassTower(f: Footprint, floors: number, tint: PaletteKey = 'glass-blue'): void {
    const b = this.batch;
    const h = floors * FLOOR;
    // Непрозрачное ядро чуть меньше габарита, стеклянная оболочка — в glass-батче.
    b.box(f.x, h / 2, f.z, f.w - 0.8, h, f.d - 0.8, this.m.shade(tint, 0.55));
    this.glass.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(tint));
    const band = this.m.color('steel');
    for (let i = 1; i < floors; i += 2) {
      b.box(f.x, i * FLOOR, f.z, f.w + 0.2, 0.18, f.d + 0.2, band);
    }
    b.box(f.x, h + 0.3, f.z, f.w + 0.4, 0.6, f.d + 0.4, this.m.color('white'));
    b.box(f.x, h + 0.6 + 2, f.z, f.w * 0.6, 4, f.d * 0.6, this.m.shade(tint, 0.7));
    b.box(f.x, h + 4.6 + 2.5, f.z, 0.4, 5, 0.4, this.m.color('steel'));
    this.roofDetails(f, h + 0.6);
  }

  /** Торговый ряд: 2–3 этажа, витрины, маркизы, вывеска. */
  shopRow(f: Footprint, floors: number, wall: PaletteKey, awning: PaletteKey): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color(wall));
    b.box(f.x, h + 0.15, f.z, f.w + 0.3, 0.3, f.d + 0.3, this.m.color('roof-dark'));
    // Витрины первого этажа по фасаду +z.
    const front = f.z + f.d / 2;
    this.glass.box(f.x, 1.4, front + 0.05, f.w - 1, 2.2, 0.1, this.m.color('glass-blue'));
    const awningCount = Math.max(1, Math.floor(f.w / 4));
    const step = f.w / awningCount;
    for (let i = 0; i < awningCount; i++) {
      const ax = f.x - f.w / 2 + step * (i + 0.5);
      b.box(ax, 2.9, front + 0.7, step - 0.6, 0.15, 1.4, this.m.color(awning));
    }
    if (floors > 1) {
      this.windowRows({ ...f, d: f.d }, floors, 'glass-navy', 0.5, 1);
    }
    // Вывеска на крыше.
    b.box(f.x, h + 1.1, front - 0.6, f.w * 0.5, 1.4, 0.2, this.m.color('white'));
    b.box(f.x, h + 1.1, front - 0.45, f.w * 0.36, 0.5, 0.05, this.m.color(awning));
    this.roofDetails(f, h + 0.3);
  }

  /** Торговый центр (FR-15.1): широкий корпус, волнистый парапет, портал входа, вывеска. */
  mall(f: Footprint, accent: PaletteKey = 'gold'): void {
    const b = this.batch;
    const h = 12;
    const front = f.z + f.d / 2;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('stone-light'));
    b.box(f.x, h + 0.25, f.z, f.w + 0.4, 0.5, f.d + 0.4, this.m.color('white'));
    const seg = 6;
    let up = true;
    for (let x = f.x - f.w / 2 + seg / 2; x < f.x + f.w / 2; x += seg) {
      b.box(
        x,
        h + 0.5 + (up ? 0.9 : 0.4),
        front - 0.3,
        seg - 0.4,
        up ? 1.8 : 0.8,
        0.5,
        this.m.color(accent),
      );
      up = !up;
    }
    // Ленточное остекление второго этажа по фасаду и торцам.
    this.glass.box(f.x, 8.5, front + 0.06, f.w - 4, 2.4, 0.12, this.m.color('glass-teal'));
    this.glass.box(f.x - f.w / 2 - 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    this.glass.box(f.x + f.w / 2 + 0.06, 8.5, f.z, 0.12, 2.4, f.d - 4, this.m.color('glass-teal'));
    // Портал входа.
    b.box(f.x, 3.5, front + 1.2, 12, 7, 2.4, this.m.color('white'));
    this.glass.box(f.x, 2.6, front + 2.45, 9, 5, 0.15, this.m.color('glass-blue'));
    b.box(f.x, 7.2, front + 1.2, 13, 0.5, 3.2, this.m.color(accent));
    // Вывеска с «буквами».
    b.box(f.x, h + 2.4, front - 0.6, 14, 2.2, 0.4, this.m.color('white'));
    for (let i = 0; i < 4; i++) {
      b.box(f.x - 4.5 + i * 3, h + 2.4, front - 0.3, 2.0, 1.3, 0.2, this.m.color(accent));
    }
    this.roofDetails(f, h + 0.5);
  }

  /**
   * Детали крыши (FR-15.5): антенны, кондиционеры, баки, спутниковые тарелки, вентиляция —
   * детерминированно по `rng`, примерно на 65 % крыш.
   */
  roofDetails(f: Footprint, top: number): void {
    this.roofs++;
    if (this.rng() >= ROOF_DETAIL_PROBABILITY) {
      return;
    }
    this.roofsWithDetails++;
    const b = this.batch;
    const steel = this.m.color('steel');
    const dark = this.m.color('roof-dark');
    const white = this.m.color('white');
    const count = 1 + Math.floor(this.rng() * 3);
    for (let i = 0; i < count; i++) {
      const px = f.x + (this.rng() - 0.5) * Math.max(2, f.w - 5);
      const pz = f.z + (this.rng() - 0.5) * Math.max(2, f.d - 5);
      switch (Math.floor(this.rng() * 5)) {
        case 0:
          b.box(px, top + 3, pz, 0.14, 6, 0.14, steel);
          b.box(px, top + 4.6, pz, 1.6, 0.08, 0.08, steel);
          b.box(px, top + 5.5, pz, 1.0, 0.08, 0.08, steel);
          break;
        case 1:
          b.box(px, top + 0.5, pz, 1.6, 1.0, 1.3, this.m.color('panel-grey'));
          b.place(Templates.cylinder8, px, top + 1.05, pz, 0.45, 0.1, 0.45, dark);
          break;
        case 2:
          for (const [sx, sz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ] as const) {
            b.box(px + sx * 0.55, top + 0.6, pz + sz * 0.55, 0.12, 1.2, 0.12, steel);
          }
          b.place(Templates.cylinder8, px, top + 2.1, pz, 0.9, 1.8, 0.9, white);
          break;
        case 3:
          b.box(px, top + 0.9, pz, 0.18, 1.8, 0.18, steel);
          b.placeRotated(
            Templates.cylinder16,
            px,
            top + 2.0,
            pz + 0.4,
            0.9,
            0.12,
            0.9,
            -1.1,
            0,
            0,
            white,
          );
          break;
        default:
          b.box(px, top + 1.0, pz, 1.2, 2.0, 1.2, this.m.color('concrete'));
          b.box(px, top + 2.15, pz, 1.6, 0.3, 1.6, dark);
      }
    }
  }

  /** Крытый рынок: широкий низкий корпус с рядом навесов. */
  marketHall(f: Footprint): void {
    const b = this.batch;
    const h = 5;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('sand'));
    b.place(
      Templates.cylinder8,
      f.x,
      h + 1.4,
      f.z,
      f.d / 2,
      f.w,
      f.d / 2,
      this.m.color('roof-red'),
      Math.PI / 2,
    );
    b.box(f.x, h + 1.5, f.z, f.w * 0.9, 3.2, f.d * 0.3, this.m.color('roof-red'));
    b.box(f.x, 2.2, f.z + f.d / 2 + 0.3, f.w * 0.8, 0.2, 2, this.m.color('white'));
  }

  /** Торговый лоток с цветной крышей. */
  stall(x: number, z: number, roof: PaletteKey, rot = 0): void {
    const b = this.batch;
    b.box(x, 0.6, z, 2.6, 1.2, 1.6, this.m.color('brick'), rot);
    b.box(x, 2.3, z, 3, 0.15, 2.2, this.m.color(roof), rot);
    b.box(x - 1.3, 1.5, z - 0.9, 0.12, 1.4, 0.12, this.m.color('steel'), rot);
    b.box(x + 1.3, 1.5, z - 0.9, 0.12, 1.4, 0.12, this.m.color('steel'), rot);
  }

  /** Учебный корпус: длинный светлый блок с колоннадой и куполом. */
  campusHall(f: Footprint, floors = 3): void {
    const b = this.batch;
    const h = floors * FLOOR;
    b.box(f.x, h / 2, f.z, f.w, h, f.d, this.m.color('white'));
    b.box(f.x, h + 0.2, f.z, f.w + 0.4, 0.4, f.d + 0.4, this.m.color('glass-teal'));
    this.windowRows(f, floors, 'glass-navy', 0.5);
    const front = f.z + f.d / 2;
    const columns = Math.max(3, Math.floor(f.w / 3.5));
    for (let i = 0; i < columns; i++) {
      const x = f.x - f.w / 2 + 1.5 + ((f.w - 3) * i) / (columns - 1);
      b.place(Templates.cylinder8, x, h / 2, front + 1.2, 0.35, h, 0.35, this.m.color('white'));
    }
    b.box(f.x, h + 0.7, front + 1.2, f.w, 0.5, 2.6, this.m.color('white'));
    b.place(Templates.sphereLow, f.x, h + 1.5, f.z, 3.2, 2.4, 3.2, this.m.color('flag-blue'));
  }

  /** Стадион: овальная чаша, трибуны, поле, мачты освещения. */
  stadium(cx: number, cz: number, rx: number, rz: number): void {
    const b = this.batch;
    b.place(Templates.cylinder16, cx, 3, cz, rx, 6, rz, this.m.color('stone-light'));
    b.place(Templates.cylinder16, cx, 6.5, cz, rx * 0.92, 1, rz * 0.92, this.m.color('flag-blue'));
    b.place(Templates.cylinder16, cx, 6.6, cz, rx * 0.72, 1, rz * 0.72, this.m.color('grass'));
    b.place(Templates.cylinder16, cx, 8, cz, rx * 1.05, 0.6, rz * 1.05, this.m.color('white'));
    // Внешние рёбра-опоры.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.box(
        cx + Math.cos(a) * rx * 1.02,
        4,
        cz + Math.sin(a) * rz * 1.02,
        0.5,
        8.5,
        0.5,
        this.m.color('steel'),
        -a,
      );
    }
    const masts: [number, number][] = [
      [rx * 0.8, rz * 0.8],
      [-rx * 0.8, rz * 0.8],
      [rx * 0.8, -rz * 0.8],
      [-rx * 0.8, -rz * 0.8],
    ];
    for (const [mx, mz] of masts) {
      b.box(cx + mx, 9, cz + mz, 0.5, 18, 0.5, this.m.color('steel'));
      b.box(cx + mx, 18.5, cz + mz, 3, 1.2, 0.6, this.m.color('white'));
    }
  }

  /** Ряды окон по этажам на четырёх фасадах (тонкие выступающие полосы). */
  private windowRows(
    f: Footprint,
    floors: number,
    color: PaletteKey,
    ratio: number,
    fromFloor = 0,
  ): void {
    const b = this.batch;
    const c = this.m.color(color);
    for (let i = fromFloor; i < floors; i++) {
      const y = i * FLOOR + FLOOR * 0.55;
      const hh = FLOOR * 0.42;
      b.box(f.x, y, f.z + f.d / 2 + 0.06, f.w * ratio, hh, 0.12, c);
      b.box(f.x, y, f.z - f.d / 2 - 0.06, f.w * ratio, hh, 0.12, c);
      b.box(f.x + f.w / 2 + 0.06, y, f.z, 0.12, hh, f.d * ratio, c);
      b.box(f.x - f.w / 2 - 0.06, y, f.z, 0.12, hh, f.d * ratio, c);
    }
  }
}
