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

  /**
   * Флагшток с флагом Казахстана (FR-15.4): голубое полотно, золотое солнце с лучами,
   * силуэт орла под ним, орнамент у древка.
   */
  flagpole(x: number, z: number, height = 12): void {
    const b = this.batch;
    const blue = this.m.color('flag-blue');
    const gold = this.m.color('gold');
    const cy = height - 1.2;
    b.box(x, height / 2, z, 0.2, height, 0.2, this.m.color('white'));
    b.box(x + 1.7, cy, z, 3.2, 2, 0.1, blue);
    // Орнамент у древка: вертикальная полоса с зубцами.
    b.box(x + 0.32, cy, z, 0.28, 2, 0.14, gold);
    for (let i = 0; i < 4; i++) {
      b.box(x + 0.55, cy - 0.75 + i * 0.5, z, 0.16, 0.16, 0.14, gold);
    }
    // Солнце с восемью лучами.
    const sx = x + 1.95;
    const sy = cy + 0.2;
    b.placeRotated(Templates.cylinder16, sx, sy, z, 0.36, 0.14, 0.36, Math.PI / 2, 0, 0, gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.placeRotated(
        Templates.box,
        sx + Math.cos(a) * 0.58,
        sy + Math.sin(a) * 0.58,
        z,
        0.26,
        0.08,
        0.14,
        0,
        0,
        a,
        gold,
      );
    }
    // Орёл: тело и распахнутые крылья.
    b.box(sx, cy - 0.5, z, 0.5, 0.12, 0.14, gold);
    b.placeRotated(Templates.box, sx - 0.42, cy - 0.4, z, 0.6, 0.1, 0.14, 0, 0, 0.35, gold);
    b.placeRotated(Templates.box, sx + 0.42, cy - 0.4, z, 0.6, 0.1, 0.14, 0, 0, -0.35, gold);
  }

  /** Робот-гид у павильонов Expo (FR-15.3): корпус-цилиндр, голова с визором, руки, база. */
  robot(x: number, z: number, facing = 0): void {
    const b = this.batch;
    const white = this.m.color('white');
    const blue = this.m.color('flag-blue');
    const dark = this.m.color('roof-dark');
    b.place(Templates.cylinder8, x, 0.25, z, 0.55, 0.5, 0.55, dark);
    b.place(Templates.cylinder8, x, 1.1, z, 0.45, 1.3, 0.45, white);
    b.box(x, 1.05, z, 0.95, 0.35, 0.95, blue, facing);
    b.place(Templates.sphereLow, x, 2.05, z, 0.42, 0.4, 0.42, white);
    b.box(
      x + Math.cos(facing) * 0.3,
      2.1,
      z - Math.sin(facing) * 0.3,
      0.2,
      0.18,
      0.5,
      dark,
      facing,
    );
    b.box(
      x - Math.sin(facing) * 0.62,
      1.35,
      z - Math.cos(facing) * 0.62,
      0.22,
      0.7,
      0.22,
      white,
      facing,
    );
    b.box(
      x + Math.sin(facing) * 0.62,
      1.35,
      z + Math.cos(facing) * 0.62,
      0.22,
      0.7,
      0.22,
      white,
      facing,
    );
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
    b.plane(x, 0.26, z, 7, 7, this.m.color('sand'));
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
