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
  private cursor = 0;

  constructor(
    geometry: BufferGeometry,
    material: Material,
    readonly capacity: number,
    parent: Object3D,
    options: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = options.castShadow ?? true;
    this.mesh.receiveShadow = options.receiveShadow ?? false;
    this.mesh.name = options.name ?? 'instances';
    parent.add(this.mesh);
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
  }

  get active(): number {
    return this.cursor;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
