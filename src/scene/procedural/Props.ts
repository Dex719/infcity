import type { Materials } from '@/scene/Materials';
import { type GeometryBatch, Templates } from './GeometryBatch';

/** Малые формы: деревья, фонари, скамейки, фонтаны, памятники (FR-3.4, FR-3.5). */
export class Props {
  constructor(
    private readonly batch: GeometryBatch,
    private readonly m: Materials,
  ) {}

  /** Дерево: ствол + крона (конус или шар). `kind` 0 — лиственное, 1 — хвойное. */
  tree(x: number, z: number, scale = 1, kind = 0): void {
    const b = this.batch;
    const trunkH = 1.6 * scale;
    b.place(
      Templates.cylinder8,
      x,
      trunkH / 2,
      z,
      0.3 * scale,
      trunkH,
      0.3 * scale,
      this.m.color('brick'),
    );
    if (kind === 1) {
      const h = 4.5 * scale;
      b.place(
        Templates.cone8,
        x,
        trunkH + h / 2 - 0.2,
        z,
        1.6 * scale,
        h,
        1.6 * scale,
        this.m.color('tree-dark'),
      );
    } else {
      const r = 2 * scale;
      b.place(Templates.sphereLow, x, trunkH + r - 0.3, z, r, r * 0.9, r, this.m.color('grass'));
    }
  }

  /** Уличный фонарь. */
  lamp(x: number, z: number, height = 5): void {
    const b = this.batch;
    b.box(x, height / 2, z, 0.25, height, 0.25, this.m.color('steel'));
    b.box(x, height + 0.15, z, 1.2, 0.3, 0.5, this.m.color('white'));
  }

  /** Скамейка вдоль оси X (поворот `rot`). */
  bench(x: number, z: number, rot = 0): void {
    this.batch.box(x, 0.45, z, 1.8, 0.12, 0.6, this.m.color('brick'), rot);
    this.batch.box(x, 0.2, z, 1.6, 0.4, 0.15, this.m.color('steel'), rot);
  }

  /** Фонтан: чаша, вода, центральная колонна. */
  fountain(x: number, z: number, radius = 4): void {
    const b = this.batch;
    b.place(Templates.cylinder16, x, 0.4, z, radius, 0.8, radius, this.m.color('stone-light'));
    b.place(
      Templates.cylinder16,
      x,
      0.82,
      z,
      radius * 0.85,
      0.05,
      radius * 0.85,
      this.m.color('water'),
    );
    b.place(
      Templates.cylinder8,
      x,
      1.6,
      z,
      radius * 0.18,
      2.4,
      radius * 0.18,
      this.m.color('stone-light'),
    );
    b.place(
      Templates.cylinder8,
      x,
      2.9,
      z,
      radius * 0.45,
      0.25,
      radius * 0.45,
      this.m.color('white'),
    );
  }

  /** Памятник: постамент + обелиск. */
  monument(x: number, z: number, height = 9): void {
    const b = this.batch;
    b.box(x, 0.5, z, 5, 1, 5, this.m.color('stone-light'));
    b.box(x, 1.4, z, 3.2, 0.8, 3.2, this.m.color('white'));
    b.box(x, 1.8 + height / 2, z, 1.2, height, 1.2, this.m.color('stone-light'));
    b.place(
      Templates.pyramid4,
      x,
      1.8 + height + 0.5,
      z,
      0.9,
      1,
      0.9,
      this.m.color('gold'),
      Math.PI / 4,
    );
  }

  /** Флагшток с флагом Казахстана (голубой + золотая полоска). */
  flagpole(x: number, z: number, height = 12): void {
    const b = this.batch;
    b.box(x, height / 2, z, 0.2, height, 0.2, this.m.color('white'));
    b.box(x + 1.6, height - 1.2, z, 3.2, 2, 0.1, this.m.color('flag-blue'));
    b.box(x + 0.35, height - 1.2, z + 0.06, 0.5, 2, 0.02, this.m.color('gold'));
  }

  /** Автобусная остановка: навес на стойках. */
  busStop(x: number, z: number, rot = 0): void {
    const b = this.batch;
    b.box(x, 2.6, z, 4, 0.2, 1.6, this.m.color('flag-blue'), rot);
    b.box(x - 1.7, 1.3, z, 0.15, 2.6, 0.15, this.m.color('steel'), rot);
    b.box(x + 1.7, 1.3, z, 0.15, 2.6, 0.15, this.m.color('steel'), rot);
    b.box(x, 1.3, z - 0.7, 3.8, 2.4, 0.08, this.m.color('glass-blue'), rot);
  }

  /** Детская площадка: пара цветных модулей. */
  playground(x: number, z: number): void {
    const b = this.batch;
    b.plane(x, 0.2, z, 7, 7, this.m.color('sand'));
    b.box(x - 1.5, 1.2, z, 1.2, 2, 1.2, this.m.color('accent-red'));
    b.box(x + 1.5, 0.9, z + 1, 2.4, 0.2, 0.6, this.m.color('flag-blue'));
    b.box(x + 0.5, 0.5, z - 1.5, 0.3, 1, 0.3, this.m.color('gold'));
  }

  /** Припаркованная машина-заглушка (низкий бокс), для парковок. */
  parkedCar(x: number, z: number, rot = 0, colorIndex = 0): void {
    const colors = ['white', 'steel', 'accent-red', 'glass-navy'] as const;
    const color = colors[colorIndex % colors.length] ?? 'white';
    this.batch.box(x, 0.5, z, 3.6, 1, 1.7, this.m.color(color), rot);
    this.batch.box(x, 1.25, z, 2, 0.5, 1.5, this.m.color('glass-blue'), rot);
  }

  /** Забор по периметру прямоугольника. */
  fence(cx: number, cz: number, w: number, d: number): void {
    const b = this.batch;
    const c = this.m.color('steel');
    b.box(cx, 0.6, cz - d / 2, w, 1.2, 0.1, c);
    b.box(cx, 0.6, cz + d / 2, w, 1.2, 0.1, c);
    b.box(cx - w / 2, 0.6, cz, 0.1, 1.2, d, c);
    b.box(cx + w / 2, 0.6, cz, 0.1, 1.2, d, c);
  }
}
