import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix3,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Color,
} from 'three';

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
  /** Сфера r=1, 16×12 (шар Байтерека, Нур Алем). */
  sphere16: templateFrom(new SphereGeometry(1, 16, 12)),
  /** Плоскость 1×1 в XZ, нормаль вверх. */
  planeXZ: templateFrom(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
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

  /** Добавить шаблон, преобразованный матрицей, с одним цветом на все вершины. */
  add(template: Template, matrix: Matrix4, color: Color): void {
    const base = this.vertexCount;
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

  /** Перенести содержимое другого батча (в его локальных координатах), применив матрицу. */
  append(other: GeometryBatch, matrix: Matrix4): void {
    const base = this.vertexCount;
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
