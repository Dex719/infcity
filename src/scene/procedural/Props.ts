import type { Materials } from '@/scene/Materials';
import type { PaletteKey } from '@/scene/palette';
import { type GeometryBatch, Templates } from './GeometryBatch';

/** Приствольный круг — выше любого покрытия квартала (газоны ≤ 0.26). */
const PIT_Y = 0.28;
/** Основание изгородей, клумб и столбиков — уровень газона квартала. */
const HEDGE_BASE_Y = 0.2;

/** Детерминированный угол раскладки кроны от позиции дерева (без rng префабов). */
function treeAngle(x: number, z: number): number {
  const h = (Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663);
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

/** Малые формы: деревья, фонари, скамейки, фонтаны, памятники (FR-3.4, FR-3.5). */
export class Props {
  constructor(
    private readonly batch: GeometryBatch,
    private readonly m: Materials,
  ) {}

  /**
   * Дерево (FR-17.1): ствол с комлем, приствольный круг и объёмная крона.
   * `kind` 0 — лиственное (три объёма двух оттенков), 1 — хвойное (три яруса),
   * 2 — тополь (высокая узкая крона). Раскладка объёмов детерминирована позицией.
   */
  tree(x: number, z: number, scale = 1, kind = 0): void {
    const b = this.batch;
    const m = this.m;
    const trunkH = 1.6 * scale;
    b.plane(x, PIT_Y, z, 1.6 * scale, 1.6 * scale, m.shade('ground', 0.72));
    b.place(
      Templates.taper8,
      x,
      trunkH / 2,
      z,
      0.36 * scale,
      trunkH,
      0.36 * scale,
      m.color('brick'),
    );
    if (kind === 1) {
      const base = trunkH - 0.3 * scale;
      const tiers: readonly (readonly [number, number, number])[] = [
        [1.7, 2.3, 0],
        [1.35, 2.1, 1.3],
        [0.95, 1.9, 2.6],
      ];
      tiers.forEach(([r, h, dy], i) => {
        b.place(
          Templates.cone8,
          x,
          base + (dy + h / 2) * scale,
          z,
          r * scale,
          h * scale,
          r * scale,
          i === 2 ? m.shade('tree-dark', 1.15) : m.color('tree-dark'),
        );
      });
      return;
    }
    if (kind === 2) {
      const crownH = 6 * scale;
      const crownR = 1.1 * scale;
      b.place(
        Templates.blob,
        x,
        trunkH + crownH / 2 - 0.3,
        z,
        crownR,
        crownH / 2,
        crownR,
        m.color('grass'),
      );
      b.place(
        Templates.blobLow,
        x,
        trunkH + crownH - 0.4,
        z,
        crownR * 0.55,
        crownH * 0.16,
        crownR * 0.55,
        m.shade('grass', 1.12),
      );
      return;
    }
    const a = treeAngle(x, z);
    if (kind === 3) {
      // Цветущее (FR-17.5): розовая крона, белые цветы сверху, зелёный бок.
      const rb = 1.7 * scale;
      const cb = trunkH + rb - 0.3;
      b.place(Templates.blob, x, cb, z, rb, rb * 0.8, rb, m.shade('accent-red', 1.6));
      b.place(
        Templates.blobLow,
        x + Math.cos(a) * rb * 0.5,
        cb + rb * 0.25,
        z + Math.sin(a) * rb * 0.5,
        rb * 0.65,
        rb * 0.5,
        rb * 0.65,
        m.color('white'),
      );
      b.place(
        Templates.blobLow,
        x - Math.cos(a) * rb * 0.55,
        cb - rb * 0.1,
        z - Math.sin(a) * rb * 0.55,
        rb * 0.6,
        rb * 0.55,
        rb * 0.6,
        m.shade('grass', 0.85),
      );
      return;
    }
    const r = 1.9 * scale;
    const cy = trunkH + r - 0.3;
    b.place(Templates.blob, x, cy, z, r, r * 0.85, r, m.color('grass'));
    b.place(
      Templates.blobLow,
      x + Math.cos(a) * r * 0.6,
      cy - r * 0.15,
      z + Math.sin(a) * r * 0.6,
      r * 0.7,
      r * 0.6,
      r * 0.7,
      m.shade('grass', 0.85),
    );
    b.place(
      Templates.blobLow,
      x - Math.cos(a) * r * 0.55,
      cy + r * 0.1,
      z - Math.sin(a) * r * 0.55,
      r * 0.62,
      r * 0.55,
      r * 0.62,
      m.shade('grass', 1.12),
    );
  }

  /** Живая изгородь `w × d` (FR-17.3): тёмная подложка и светлый верх; `baseY` — для садов на подиумах. */
  hedge(x: number, z: number, w: number, d: number, rot = 0, baseY = HEDGE_BASE_Y): void {
    this.batch.box(x, baseY + 0.45, z, w, 0.9, d, this.m.shade('grass', 0.75), rot);
    this.batch.box(x, baseY + 0.95, z, w - 0.3, 0.2, d - 0.3, this.m.color('grass'), rot);
  }

  /** Куст: один объём кроны на уровне газона (FR-17.5). */
  bush(x: number, z: number, scale = 1, baseY = HEDGE_BASE_Y): void {
    const r = 0.9 * scale;
    this.batch.place(
      Templates.blobLow,
      x,
      baseY + r * 0.55,
      z,
      r,
      r * 0.7,
      r,
      this.m.shade('grass', 0.8),
    );
  }

  /** Круглая клумба: каменный бордюр и цветной «ковёр». */
  flowerBed(
    x: number,
    z: number,
    radius: number,
    color: PaletteKey = 'accent-red',
    baseY = HEDGE_BASE_Y,
  ): void {
    const b = this.batch;
    b.place(
      Templates.cylinder8,
      x,
      baseY + 0.2,
      z,
      radius,
      0.4,
      radius,
      this.m.color('stone-light'),
    );
    b.place(
      Templates.cylinder8,
      x,
      baseY + 0.42,
      z,
      radius - 0.4,
      0.3,
      radius - 0.4,
      this.m.color(color),
    );
  }

  /** Козырёк входа: плита на четырёх стойках. */
  canopy(x: number, z: number, w: number, d: number, height: number, rot = 0): void {
    const b = this.batch;
    const steel = this.m.color('steel');
    b.box(x, height, z, w, 0.3, d, this.m.color('white'), rot);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const lx = sx * (w / 2 - 0.3);
      const lz = sz * (d / 2 - 0.3);
      b.box(
        x + lx * cos + lz * sin,
        height / 2,
        z - lx * sin + lz * cos,
        0.22,
        height,
        0.22,
        steel,
      );
    }
  }

  /** Ряд столбиков от `(x1, z1)` до `(x2, z2)` (боксы — 12 треугольников на столбик). */
  bollards(x1: number, z1: number, x2: number, z2: number, count: number): void {
    const steel = this.m.color('steel');
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      this.batch.box(x, HEDGE_BASE_Y + 0.45, z, 0.28, 0.9, 0.28, steel);
    }
  }

  /** Прожектор на низкой стойке, наклонённый в сторону `facing` (радианы). */
  spotlight(x: number, z: number, facing = 0): void {
    const b = this.batch;
    b.box(x, 0.35, z, 0.6, 0.3, 0.6, this.m.color('roof-dark'));
    b.box(x, 0.9, z, 0.14, 0.9, 0.14, this.m.color('steel'));
    b.placeRotated(
      Templates.box,
      x,
      1.45,
      z,
      0.55,
      0.4,
      0.55,
      -0.7,
      facing,
      0,
      this.m.color('steel'),
    );
    b.placeRotated(
      Templates.box,
      x + Math.sin(facing) * 0.24,
      1.62,
      z + Math.cos(facing) * 0.24,
      0.4,
      0.3,
      0.12,
      -0.7,
      facing,
      0,
      this.m.color('yellow'),
    );
  }

  /** Уличный фонарь. */
  lamp(x: number, z: number, height = 5): void {
    const b = this.batch;
    b.box(x, height / 2, z, 0.25, height, 0.25, this.m.color('steel'));
    b.box(x, height + 0.15, z, 1.2, 0.3, 0.5, this.m.color('white'));
  }

  /**
   * Столик кафе под зонтом (FR-19.18, design «Волна 6»): стойка зонта сквозь столешницу,
   * купол-конус цвета `canopy`, два стула по бокам. ≈ 160 вершин. `baseY` — уровень покрытия.
   */
  cafeTable(x: number, z: number, canopy: PaletteKey, baseY = HEDGE_BASE_Y): void {
    const b = this.batch;
    b.box(x, baseY + 1.15, z, 0.08, 2.3, 0.08, this.m.color('steel'));
    b.place(Templates.cone8, x, baseY + 2.3 + 0.225, z, 1, 0.45, 1, this.m.color(canopy));
    b.place(Templates.cylinder8, x, baseY + 0.72, z, 0.5, 0.06, 0.5, this.m.color('white'));
    for (const side of [-1, 1]) {
      b.box(x + side * 0.75, baseY + 0.225, z, 0.4, 0.45, 0.4, this.m.color('brick'));
    }
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

  /**
   * Дорожный знак (FR-18.3, AC-18.3): стойка и щит на `facing` (радианы, направление лицом).
   * `kind` 0 — круглый предупреждающий (два диска «на ребре», ≤ 128 вершин), 1 — квадратный
   * указатель (72 вершины), 2 — круглый запрещающий с полосой (100 вершин).
   */
  roadSign(x: number, z: number, kind: 0 | 1 | 2, facing = 0): void {
    const b = this.batch;
    const m = this.m;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const overlay = 0.04;
    b.box(x, 1.3, z, 0.12, 2.6, 0.12, m.color('steel'));
    if (kind === 0) {
      // Диск ставится «на ребро» и разворачивается на `facing`. Порядок углов важен: Эйлер
      // 'XYZ' применяет Rz первым, поэтому нужная ориентация Ry(f)·Rx(π/2) записывается как
      // rx = π/2, rz = −f. В первой версии стоял ry = facing — ось цилиндра инвариантна к Ry,
      // и щит всегда смотрел в +Z независимо от аргумента (рецензия 2026-09-19).
      b.placeRotated(
        Templates.cylinder8,
        x,
        2.5,
        z,
        0.45,
        0.06,
        0.45,
        Math.PI / 2,
        0,
        -facing,
        m.color('accent-red'),
      );
      b.placeRotated(
        Templates.cylinder8,
        x + fx * overlay,
        2.5,
        z + fz * overlay,
        0.3,
        0.06,
        0.3,
        Math.PI / 2,
        0,
        -facing,
        m.color('white'),
      );
    } else if (kind === 1) {
      b.box(x, 2.5, z, 0.7, 0.7, 0.06, m.color('flag-blue'), facing);
      b.box(x + fx * overlay, 2.5, z + fz * overlay, 0.45, 0.45, 0.02, m.color('white'), facing);
    } else {
      b.placeRotated(
        Templates.cylinder8,
        x,
        2.5,
        z,
        0.45,
        0.06,
        0.45,
        Math.PI / 2,
        0,
        -facing,
        m.color('accent-red'),
      );
      b.box(x + fx * overlay, 2.5, z + fz * overlay, 0.5, 0.12, 0.02, m.color('white'), facing);
    }
  }

  /** Урна (FR-18.3, AC-18.3): цилиндрический корпус и крышка чуть шире (104 вершины). */
  trashBin(x: number, z: number): void {
    const b = this.batch;
    b.place(Templates.cylinder8, x, 0.45, z, 0.3, 0.9, 0.3, this.m.color('roof-dark'));
    b.place(Templates.cylinder8, x, 0.96, z, 0.34, 0.12, 0.34, this.m.color('steel'));
  }

  /** Велопарковка (FR-18.3, AC-18.3): перекладина на четырёх стойках (120 вершин), поворот `rot`. */
  bikeRack(x: number, z: number, rot = 0): void {
    const b = this.batch;
    const steel = this.m.color('steel');
    b.box(x, 0.75, z, 2.4, 0.08, 0.08, steel, rot);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const [lx, lz] of [
      [-1.2, -0.3],
      [-1.2, 0.3],
      [1.2, -0.3],
      [1.2, 0.3],
    ] as const) {
      b.box(x + lx * cos + lz * sin, 0.375, z - lx * sin + lz * cos, 0.08, 0.75, 0.08, steel, rot);
    }
  }

  /**
   * Пешеходный светофор (FR-18.4, AC-18.3): стойка, корпус и две секции (красная, зелёная)
   * на видимой стороне `facing` (96 вершин).
   */
  pedestrianLight(x: number, z: number, facing = 0): void {
    const b = this.batch;
    const m = this.m;
    const poleH = 2.4;
    const bodyY = poleH + 0.35;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const overlay = 0.14;
    b.box(x, poleH / 2, z, 0.12, poleH, 0.12, m.color('steel'));
    b.box(x, bodyY, z, 0.34, 0.7, 0.26, m.color('roof-dark'), facing);
    b.box(
      x + fx * overlay,
      bodyY + 0.15,
      z + fz * overlay,
      0.2,
      0.2,
      0.02,
      m.color('accent-red'),
      facing,
    );
    b.box(
      x + fx * overlay,
      bodyY - 0.15,
      z + fz * overlay,
      0.2,
      0.2,
      0.02,
      m.color('grass'),
      facing,
    );
  }
}
