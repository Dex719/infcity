import { PerspectiveCamera, Plane, Ray, Vector3 } from 'three';
import { CAMERA } from '@/config';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const LOOK_AT = new Vector3(0, 0, 0);

/**
 * Камера в псевдо-изометрии (design C11): стоит в `(OFFSET.x, h, OFFSET.z)` и смотрит в начало
 * координат; меняется только высота `h ∈ [HEIGHT_MIN, HEIGHT_MAX]` — колесом, пинчем или API.
 * Сцена двигается под камерой, сама камера остаётся у начала координат (FR-1.4).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;

  /** Целевая высота; фактическая догоняет её экспоненциально (FR-8.2). */
  targetHeight: number = CAMERA.HEIGHT_START;

  private height: number = CAMERA.HEIGHT_START;
  private readonly ray = new Ray();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(CAMERA.FOV, aspect, CAMERA.NEAR, CAMERA.FAR);
    this.apply();
  }

  /** Текущая высота камеры. */
  get currentHeight(): number {
    return this.height;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Колесо: `deltaY > 0` (прокрутка вниз) — отдаляем, вверх — приближаем. */
  wheel(deltaY: number): void {
    this.setTargetHeight(this.targetHeight + deltaY * CAMERA.WHEEL_UNITS_PER_PX);
  }

  /** Пинч: `ratio > 1` (пальцы расходятся) — приближаем. */
  pinch(ratio: number): void {
    if (ratio > 0) {
      this.setTargetHeight(this.targetHeight / ratio);
    }
  }

  setTargetHeight(height: number): void {
    this.targetHeight = Math.min(CAMERA.HEIGHT_MAX, Math.max(CAMERA.HEIGHT_MIN, height));
  }

  /** Мгновенно ставит высоту (старт, тесты). */
  snapHeight(height: number): void {
    this.setTargetHeight(height);
    this.height = this.targetHeight;
    this.apply();
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt / CAMERA.HEIGHT_TAU);
    this.height += (this.targetHeight - this.height) * k;
    if (Math.abs(this.targetHeight - this.height) < 1e-3) {
      this.height = this.targetHeight;
    }
    this.apply();
  }

  /**
   * Точка плоскости земли (y = 0) под экранной позицией в NDC (`x, y ∈ [-1, 1]`).
   * Возвращает `null`, если луч не пересекает землю (не бывает при наших углах).
   */
  groundPoint(ndcX: number, ndcY: number, out: Vector3 = new Vector3()): Vector3 | null {
    this.ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
    this.ray.direction.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.ray.origin).normalize();
    return this.ray.intersectPlane(GROUND, out);
  }

  private apply(): void {
    this.camera.position.set(CAMERA.OFFSET.x, this.height, CAMERA.OFFSET.z);
    this.camera.lookAt(LOOK_AT);
    this.camera.updateMatrixWorld();
  }
}
