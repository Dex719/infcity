import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

const tmpMatrix = new Matrix4();
const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const AXIS_Y = new Vector3(0, 1, 0);

/**
 * Пул инстансов одной модели (design C10, NFR-1): каждый кадр заполняется заново —
 * `begin()` → `push()` для активных объектов → `end()`; один draw call на модель.
 */
export class InstancePool {
  readonly mesh: InstancedMesh;
  /**
   * Теневой двойник (design D18): та же геометрия и тот же буфер матриц инстансов, материал
   * без записи цвета и глубины — только тень. Есть у пулов, которые умеют растворяться.
   */
  readonly twin: InstancedMesh | null;
  private cursor = 0;

  constructor(
    geometry: BufferGeometry,
    material: Material,
    readonly capacity: number,
    parent: Object3D,
    options: {
      castShadow?: boolean;
      receiveShadow?: boolean;
      name?: string;
      shadowTwin?: Material;
    } = {},
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = options.castShadow ?? true;
    this.mesh.receiveShadow = options.receiveShadow ?? false;
    this.mesh.name = options.name ?? 'instances';
    parent.add(this.mesh);
    if (options.shadowTwin === undefined) {
      this.twin = null;
    } else {
      const twin = new InstancedMesh(geometry, options.shadowTwin, capacity);
      twin.instanceMatrix = this.mesh.instanceMatrix;
      twin.count = 0;
      twin.frustumCulled = false;
      twin.castShadow = true;
      twin.receiveShadow = false;
      twin.visible = false;
      twin.name = `${this.mesh.name}:shadow`;
      parent.add(twin);
      this.twin = twin;
    }
  }

  begin(): void {
    this.cursor = 0;
  }

  /** Добавить инстанс; лишние (сверх ёмкости) молча пропускаются. */
  push(x: number, y: number, z: number, yaw: number, scale = 1): void {
    if (this.cursor >= this.capacity) {
      return;
    }
    tmpQuat.setFromAxisAngle(AXIS_Y, yaw);
    tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(scale, scale, scale));
    this.mesh.setMatrixAt(this.cursor, tmpMatrix);
    this.cursor++;
  }

  end(): void {
    this.mesh.count = this.cursor;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.twin !== null) {
      this.twin.count = this.cursor;
    }
  }

  /**
   * Затухание пула (облака, FR-19.10, design D18): при `v` = 1 инстансы непрозрачны и сами
   * отбрасывают тень, двойник выключен; при 0 < `v` < 1 инстансы видны без тени, тень рисует
   * двойник; при `v` = 0 видимые инстансы выключены совсем. Прозрачность общего материала
   * задаёт его владелец (`MobSystem.setCloudFade`).
   */
  setFade(v: number): void {
    this.mesh.visible = v > 0;
    this.mesh.castShadow = v >= 1;
    if (this.twin !== null) {
      this.twin.visible = v < 1;
    }
  }

  get active(): number {
    return this.cursor;
  }

  dispose(): void {
    if (this.twin !== null) {
      // Двойник делит геометрию и буфер матриц — освобождаются один раз, вместе с основным мешем.
      this.twin.removeFromParent();
    }
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
