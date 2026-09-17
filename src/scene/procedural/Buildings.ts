import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { type GeometryBatch, Templates } from './GeometryBatch';

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
  constructor(
    private readonly batch: GeometryBatch,
    private readonly glass: GeometryBatch,
    private readonly m: Materials,
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
  }

  /** Промышленный цех с пилообразной крышей и трубой. */
  shed(f: Footprint, height = 6): void {
    const b = this.batch;
    b.box(f.x, height / 2, f.z, f.w, height, f.d, this.m.color('concrete'));
    const teeth = Math.max(2, Math.floor(f.d / 5));
    const step = f.d / teeth;
    for (let i = 0; i < teeth; i++) {
      const z = f.z - f.d / 2 + step * (i + 0.5);
      b.place(
        Templates.pyramid4,
        f.x,
        height + 0.7,
        z,
        f.w * 0.74,
        1.4,
        step * 0.74,
        this.m.color('steel'),
        Math.PI / 4,
      );
    }
    b.place(
      Templates.cylinder8,
      f.x + f.w / 2 - 1.5,
      height + 4,
      f.z - f.d / 2 + 1.5,
      0.7,
      8,
      0.7,
      this.m.color('brick'),
    );
    b.box(f.x, 1.5, f.z + f.d / 2 + 0.05, 4, 3, 0.1, this.m.color('roof-dark'));
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
