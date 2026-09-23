import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Color,
} from 'three';
import { AO } from '@/config';

/**
 * Множитель запечённого AO стены на высоте `t` над основанием (FR-19.1, design D15):
 * `AO.WALL_MIN` у земли, линейно до 1 на `AO.WALL_HEIGHT` и выше.
 */
export function wallAo(t: number): number {
  return AO.WALL_MIN + (1 - AO.WALL_MIN) * Math.min(Math.max(t, 0) / AO.WALL_HEIGHT, 1);
}

/**
 * Боковые грани бокса в локальных осях: начальный угол (x, z), направление обхода `u` и длина
 * вдоль него, нормаль. Обход выбран так, что `u × up` = нормаль — грань смотрит наружу (CCW).
 */
const AO_SIDES: readonly (readonly [number, number, number, number, 'w' | 'd', number, number])[] =
  [
    [1, 1, 0, -1, 'd', 1, 0],
    [-1, -1, 0, 1, 'd', -1, 0],
    [-1, 1, 1, 0, 'w', 0, 1],
    [1, -1, -1, 0, 'w', 0, -1],
  ];

/** Ширина ореола AO по сторонам прямоугольника: +X, −X, +Z, −Z (FR-19.2). */
export interface HaloWidths {
  readonly px: number;
  readonly nx: number;
  readonly pz: number;
  readonly nz: number;
}

/** Неизменяемый шаблон геометрии: позиции, нормали, индексы. */
export interface Template {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

/** Шаблон из геометрии three.js (индексированной или нет). */
export function templateFrom(geometry: BufferGeometry): Template {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const positions = new Float32Array(position.array);
  const normals = new Float32Array(normal.array);
  let indices: Uint32Array;
  if (geometry.index !== null) {
    indices = new Uint32Array(geometry.index.array);
  } else {
    indices = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      indices[i] = i;
    }
  }
  geometry.dispose();
  return { positions, normals, indices };
}

/** Плоские нормали: у неиндексированной геометрии `computeVertexNormals` считает нормаль на грань. */
function flatShaded(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** Низкополигональные шаблоны (единичный размер, центр в начале координат). */
export const Templates = {
  /** Куб 1×1×1. */
  box: templateFrom(new BoxGeometry(1, 1, 1)),
  /** Цилиндр r=1, h=1, 8 граней. */
  cylinder8: templateFrom(new CylinderGeometry(1, 1, 1, 8)),
  /** Цилиндр 16 граней (ландмарки). */
  cylinder16: templateFrom(new CylinderGeometry(1, 1, 1, 16)),
  /** Конус r=1, h=1, 8 граней. */
  cone8: templateFrom(new ConeGeometry(1, 1, 8)),
  /** Пирамида с квадратным основанием (4 грани), r описанной окружности 1. */
  pyramid4: templateFrom(new ConeGeometry(1, 1, 4)),
  /** Сфера r=1, 10×7 (деревья, купола). */
  sphereLow: templateFrom(new SphereGeometry(1, 10, 7)),
  /** Сфера r=1, 7×5 (48 вершин, 56 треугольников): главные объёмы крон и облаков (FR-17). */
  blob: templateFrom(new SphereGeometry(1, 7, 5)),
  /** Сфера r=1, 6×4 (35 вершин, 36 треугольников): боковые объёмы крон, подложки облаков (FR-17.4). */
  blobLow: templateFrom(new SphereGeometry(1, 6, 4)),
  /** Усечённый конус 8 граней (стволы деревьев — дешевле `taper` вдвое, FR-17.4). */
  taper8: templateFrom(new CylinderGeometry(0.6, 1, 1, 8)),
  /**
   * Гранёный шар: икосаэдр detail 3 — 320 треугольных панелей (20 × 4²) с плоскими нормалями
   * (неиндексированная геометрия, нормаль на грань). Шар Байтерека (FR-17.8).
   */
  icoFlat: templateFrom(flatShaded(new IcosahedronGeometry(1, 3))),
  /** Сфера r=1, 16×12 (шар Байтерека, Нур Алем). */
  sphere16: templateFrom(new SphereGeometry(1, 16, 12)),
  /** Плоскость 1×1 в XZ, нормаль вверх. */
  planeXZ: templateFrom(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  /** Вертикальная плоскость 1×1 в XY, нормаль +Z (оконные проёмы, FR-19.6). */
  planeXY: templateFrom(new PlaneGeometry(1, 1)),
  /** Конус 24 граней (шатёр). */
  cone24: templateFrom(new ConeGeometry(1, 1, 24)),
  /** Усечённый конус, сужающийся кверху (верх 0.6, низ 1), 16 граней. */
  taper: templateFrom(new CylinderGeometry(0.6, 1, 1, 16)),
  /** Расширяющаяся кверху чаша (верх 1, низ 0.35), 16 граней. */
  flare: templateFrom(new CylinderGeometry(1, 0.35, 1, 16)),
} as const;

const tmpMatrix = new Matrix4();
const tmpNormal = new Matrix3();
const tmpScale = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const UP = new Vector3(0, 1, 0);

/**
 * Накопитель геометрии с вершинными цветами (design → Prefabs): все статические детали
 * чанка складываются в один `BufferGeometry` → один draw call на материал (NFR-1).
 */
export class GeometryBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private vertexCount = 0;
  private partCount = 0;

  /** Добавить шаблон, преобразованный матрицей, с одним цветом на все вершины. */
  add(template: Template, matrix: Matrix4, color: Color): void {
    const base = this.vertexCount;
    this.partCount++;
    tmpNormal.getNormalMatrix(matrix);
    const e = matrix.elements;
    const n = tmpNormal.elements;
    const p = template.positions;
    const nm = template.normals;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] ?? 0;
      const y = p[i + 1] ?? 0;
      const z = p[i + 2] ?? 0;
      this.positions.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
      const nx = nm[i] ?? 0;
      const ny = nm[i + 1] ?? 0;
      const nz = nm[i + 2] ?? 0;
      const tx = n[0] * nx + n[3] * ny + n[6] * nz;
      const ty = n[1] * nx + n[4] * ny + n[7] * nz;
      const tz = n[2] * nx + n[5] * ny + n[8] * nz;
      const len = Math.hypot(tx, ty, tz) || 1;
      this.normals.push(tx / len, ty / len, tz / len);
      this.colors.push(color.r, color.g, color.b);
    }
    for (const index of template.indices) {
      this.indices.push(base + index);
    }
    this.vertexCount += p.length / 3;
  }

  /**
   * Как `add`, но грани красятся попеременно двумя цветами (индекс грани % 2) — панели
   * гранёного шара читаются отдельно при любом освещении (FR-17.8). Шаблон должен быть
   * неиндексированным (три вершины на грань), иначе цвета «поплывут» по общим вершинам.
   */
  addFacets(template: Template, matrix: Matrix4, colorA: Color, colorB: Color): void {
    const base = this.vertexCount;
    this.add(template, matrix, colorA);
    if (template.indices.length !== template.positions.length / 3) {
      throw new Error('addFacets: шаблон должен быть неиндексированным');
    }
    const faces = template.positions.length / 9;
    for (let face = 0; face < faces; face++) {
      if (face % 2 === 0) {
        continue;
      }
      for (let v = 0; v < 3; v++) {
        const offset = (base + face * 3 + v) * 3;
        this.colors[offset] = colorB.r;
        this.colors[offset + 1] = colorB.g;
        this.colors[offset + 2] = colorB.b;
      }
    }
  }

  /** Гранёный шаблон с масштабом, поворотом вокруг Y и двумя чередующимися цветами граней. */
  placeFacets(
    template: Template,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    colorA: Color,
    colorB: Color,
    rotationY = 0,
  ): void {
    tmpMatrix.makeRotationY(rotationY);
    tmpMatrix.scale(tmpScale.set(sx, sy, sz));
    tmpMatrix.setPosition(x, y, z);
    this.addFacets(template, tmpMatrix, colorA, colorB);
  }

  /**
   * Бокс с центром `(x, y, z)`, размером `(w, h, d)` и поворотом вокруг Y (радианы).
   * `y` — центр по высоте; для «поставить на землю» передавайте `h / 2`.
   */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: Color,
    rotationY = 0,
  ): void {
    tmpMatrix.makeRotationY(rotationY);
    tmpMatrix.scale(tmpScale.set(w, h, d));
    tmpMatrix.setPosition(x, y, z);
    this.add(Templates.box, tmpMatrix, color);
  }

  /**
   * Бокс с запечённым AO контакта (FR-19.1, design D15): те же аргументы, что у `box`, но
   * боковые грани темнеют к основанию (`wallAo`). У стены выше `AO.WALL_HEIGHT` боковые грани
   * получают третий пояс вершин на этой высоте, поэтому затемнение занимает ровно
   * `AO.WALL_HEIGHT` при любой высоте корпуса: 32 вершины и 20 треугольников вместо 24 и 12.
   * Бокс остаётся замкнутым: теневой проход рисует обратные грани, и без дна у основания стены
   * на теневой стороне появилась бы светлая щель.
   */
  boxAo(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: Color,
    rotationY = 0,
  ): void {
    this.partCount++;
    const base = y - h / 2;
    const hw = w / 2;
    const hd = d / 2;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    // Поворот вокруг Y как у `Matrix4.makeRotationY`: (x, z) → (x·cos + z·sin, −x·sin + z·cos).
    const vertex = (
      lx: number,
      ly: number,
      lz: number,
      nx: number,
      ny: number,
      nz: number,
      f: number,
    ): void => {
      this.positions.push(x + lx * cos + lz * sin, ly, z - lx * sin + lz * cos);
      this.normals.push(nx * cos + nz * sin, ny, -nx * sin + nz * cos);
      this.colors.push(color.r * f, color.g * f, color.b * f);
      this.vertexCount++;
    };
    const rows = h > AO.WALL_HEIGHT ? [0, AO.WALL_HEIGHT, h] : [0, h];
    for (const [sx, sz, ux, uz, along, nx, nz] of AO_SIDES) {
      const len = along === 'w' ? w : d;
      const first = this.vertexCount;
      for (const t of rows) {
        const f = wallAo(t);
        vertex(sx * hw, base + t, sz * hd, nx, 0, nz, f);
        vertex(sx * hw + ux * len, base + t, sz * hd + uz * len, nx, 0, nz, f);
      }
      for (let i = 0; i + 1 < rows.length; i++) {
        const l0 = first + 2 * i;
        this.indices.push(l0, l0 + 1, l0 + 3, l0, l0 + 3, l0 + 2);
      }
    }
    const top = base + h;
    const t0 = this.vertexCount;
    vertex(-hw, top, hd, 0, 1, 0, 1);
    vertex(hw, top, hd, 0, 1, 0, 1);
    vertex(hw, top, -hd, 0, 1, 0, 1);
    vertex(-hw, top, -hd, 0, 1, 0, 1);
    this.indices.push(t0, t0 + 1, t0 + 2, t0, t0 + 2, t0 + 3);
    const b0 = this.vertexCount;
    const fb = wallAo(0);
    vertex(-hw, base, hd, 0, -1, 0, fb);
    vertex(hw, base, hd, 0, -1, 0, fb);
    vertex(hw, base, -hd, 0, -1, 0, fb);
    vertex(-hw, base, -hd, 0, -1, 0, fb);
    this.indices.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
  }

  /**
   * Ореол AO на земле вокруг прямоугольника `w × d` с центром `(x, z)` (FR-19.2, design D15):
   * плоское кольцо из четырёх трапеций на высоте `y`, 8 вершин и 8 треугольников, нормаль вверх.
   * Внутренний край — `color · minFactor`, внешний — ровно `color`, поэтому кольцо цвета земли
   * растворяется в покрытии без шва. `widths` — ширина кольца по сторонам (+X, −X, +Z, −Z);
   * нулевая ширина схлопывает сторону в линию.
   */
  halo(
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    widths: HaloWidths,
    color: Color,
    minFactor: number,
  ): void {
    this.partCount++;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const corners: readonly (readonly [number, number, number])[] = [
      [x0, z0, minFactor],
      [x1, z0, minFactor],
      [x1, z1, minFactor],
      [x0, z1, minFactor],
      [x0 - widths.nx, z0 - widths.nz, 1],
      [x1 + widths.px, z0 - widths.nz, 1],
      [x1 + widths.px, z1 + widths.pz, 1],
      [x0 - widths.nx, z1 + widths.pz, 1],
    ];
    const first = this.vertexCount;
    for (const [cx, cz, f] of corners) {
      this.positions.push(cx, y, cz);
      this.normals.push(0, 1, 0);
      this.colors.push(color.r * f, color.g * f, color.b * f);
    }
    this.vertexCount += corners.length;
    // Сторона k: внутреннее ребро (k, k+1) и внешнее (k+4, k+5); обход CCW при взгляде сверху.
    for (let k = 0; k < 4; k++) {
      const a = first + k;
      const c = first + ((k + 1) % 4);
      this.indices.push(a, c, c + 4, a, c + 4, a + 4);
    }
  }

  /** Перенести содержимое другого батча (в его локальных координатах), применив матрицу. */
  append(other: GeometryBatch, matrix: Matrix4): void {
    const base = this.vertexCount;
    this.partCount += other.partCount;
    tmpNormal.getNormalMatrix(matrix);
    const e = matrix.elements;
    const n = tmpNormal.elements;
    const p = other.positions;
    const nm = other.normals;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] ?? 0;
      const y = p[i + 1] ?? 0;
      const z = p[i + 2] ?? 0;
      this.positions.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
      const nx = nm[i] ?? 0;
      const ny = nm[i + 1] ?? 0;
      const nz = nm[i + 2] ?? 0;
      const tx = n[0] * nx + n[3] * ny + n[6] * nz;
      const ty = n[1] * nx + n[4] * ny + n[7] * nz;
      const tz = n[2] * nx + n[5] * ny + n[8] * nz;
      const len = Math.hypot(tx, ty, tz) || 1;
      this.normals.push(tx / len, ty / len, tz / len);
    }
    for (const c of other.colors) {
      this.colors.push(c);
    }
    for (const index of other.indices) {
      this.indices.push(base + index);
    }
    this.vertexCount += other.vertexCount;
  }

  /** Произвольный шаблон с масштабом `(sx, sy, sz)`, поворотом вокруг Y и позицией. */
  place(
    template: Template,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color,
    rotationY = 0,
  ): void {
    tmpMatrix.makeRotationY(rotationY);
    tmpMatrix.scale(tmpScale.set(sx, sy, sz));
    tmpMatrix.setPosition(x, y, z);
    this.add(template, tmpMatrix, color);
  }

  /** Горизонтальная плоскость `w × d` с центром `(x, y, z)`. */
  plane(x: number, y: number, z: number, w: number, d: number, color: Color): void {
    this.place(Templates.planeXZ, x, y, z, w, 1, d, color);
  }

  /** Брус квадратного сечения `thickness` между точками A и B (решётки, ванты, распорки). */
  strut(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    thickness: number,
    color: Color,
  ): void {
    tmpA.set(ax, ay, az);
    tmpB.set(bx, by, bz);
    const length = tmpA.distanceTo(tmpB);
    if (length <= 0) {
      return;
    }
    tmpB.sub(tmpA).divideScalar(length);
    tmpQuat.setFromUnitVectors(UP, tmpB);
    tmpA.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    tmpMatrix.compose(tmpA, tmpQuat, tmpScale.set(thickness, length, thickness));
    this.add(Templates.box, tmpMatrix, color);
  }

  /** Шаблон с полным поворотом (Эйлер XYZ в радианах) и масштабом. */
  placeRotated(
    template: Template,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx: number,
    ry: number,
    rz: number,
    color: Color,
  ): void {
    tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz, 'XYZ'));
    tmpMatrix.compose(tmpA.set(x, y, z), tmpQuat, tmpScale.set(sx, sy, sz));
    this.add(template, tmpMatrix, color);
  }

  get vertices(): number {
    return this.vertexCount;
  }

  /** Сколько шаблонов добавлено (диагностика деталей, AC-17.1/17.2). */
  get parts(): number {
    return this.partCount;
  }

  get isEmpty(): boolean {
    return this.vertexCount === 0;
  }

  /** Собрать `BufferGeometry` (position/normal/color + index) и очистить накопитель. */
  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(
      this.vertexCount > 65535
        ? new BufferAttribute(new Uint32Array(this.indices), 1)
        : new BufferAttribute(new Uint16Array(this.indices), 1),
    );
    geometry.computeBoundingSphere();
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    this.vertexCount = 0;
    return geometry;
  }
}
