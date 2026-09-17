import { Vector3 } from 'three';
import { Emitter } from '@/app/Emitter';
import { PAN, WORLD } from '@/config';
import type { CameraRig } from './CameraRig';
import type { InputManager, PointerPoint } from './InputManager';

/** События панорамирования. */
export interface PanEvents extends Record<string, unknown> {
  /** Центр экрана перешёл в соседний слот: сцена сдвинута назад, окну нужно переназначить чанки. */
  move: { dx: number; dy: number };
}

/** Что панорамирование двигает: корень окна чанков. */
export interface PanTarget {
  readonly position: Vector3;
}

const KEY_AXES: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['ArrowLeft', [-1, 0]],
  ['KeyA', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['KeyD', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['KeyW', [0, -1]],
  ['ArrowDown', [0, 1]],
  ['KeyS', [0, 1]],
]);

const SQRT_HALF = Math.SQRT1_2;

/**
 * Панорамирование (design C11, FR-8.1): точка земли под указателем следует за указателем
 * (точное 1:1 через пересечение луча с плоскостью y = 0), инерция после отпускания,
 * клавиатура, и recentering: когда точка земли под центром экрана уходит из центрального
 * слота, корень сцены сдвигается на целое число чанков и излучается `move` (FR-1.4).
 */
export class PanControls extends Emitter<PanEvents> {
  enabled = true;

  /** Желаемая позиция корня; фактическая догоняет её со сглаживанием. */
  private readonly target = new Vector3();
  private readonly velocity = new Vector3();
  private readonly dragOrigin = new Vector3();
  private readonly targetAtDragStart = new Vector3();
  private readonly scratch = new Vector3();
  private readonly previousTarget = new Vector3();
  private dragging = false;
  private lastPointer: PointerPoint | null = null;

  constructor(
    private readonly input: InputManager,
    private readonly rig: CameraRig,
    private readonly root: PanTarget,
  ) {
    super();
    this.target.copy(root.position);
    input.on('dragstart', (point) => this.onDragStart(point));
    input.on('drag', (point) => this.onDrag(point));
    input.on('dragend', () => this.onDragEnd());
  }

  /** Мгновенно поставить корень в позицию (после `ChunkWindow.setCenter`, debug API). */
  resetTo(x = 0, z = 0): void {
    this.root.position.set(x, 0, z);
    this.target.copy(this.root.position);
    this.targetAtDragStart.copy(this.target);
    this.previousTarget.copy(this.target);
    this.velocity.set(0, 0, 0);
  }

  /** Программное панорамирование на `dx, dy` пикселей (debug API, e2e). */
  panByPixels(dx: number, dy: number): void {
    const rect = this.input.canvas.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    const from = this.groundAt(center);
    const to = this.groundAt({ x: center.x + dx, y: center.y + dy });
    if (from === null || to === null) {
      return;
    }
    this.target.add(to.sub(from));
    this.velocity.set(0, 0, 0);
  }

  update(dt: number): void {
    if (!this.enabled) {
      return;
    }
    if (this.dragging && this.lastPointer !== null) {
      this.followPointer(this.lastPointer, dt);
    } else {
      this.applyKeys(dt);
      this.applyInertia(dt);
    }

    const k = 1 - Math.exp(-dt / PAN.SMOOTH_TAU);
    this.root.position.lerp(this.target, k);
    this.recenter();
  }

  private onDragStart(point: PointerPoint): void {
    if (!this.enabled) {
      return;
    }
    const ground = this.groundAt(point);
    if (ground === null) {
      return;
    }
    this.dragging = true;
    this.lastPointer = point;
    this.dragOrigin.copy(ground);
    this.targetAtDragStart.copy(this.target);
    this.velocity.set(0, 0, 0);
  }

  private onDrag(point: PointerPoint): void {
    if (this.dragging) {
      this.lastPointer = point;
    }
  }

  private onDragEnd(): void {
    this.dragging = false;
    this.lastPointer = null;
    const speed = this.velocity.length();
    if (speed > PAN.MAX_INERTIA_SPEED) {
      this.velocity.multiplyScalar(PAN.MAX_INERTIA_SPEED / speed);
    }
  }

  /**
   * Точка земли под указателем следует за указателем; скорость цели оценивается
   * экспоненциальным средним, чтобы один «рывок» событий не давал огромной инерции.
   */
  private followPointer(point: PointerPoint, dt: number): void {
    const ground = this.groundAt(point);
    if (ground === null) {
      return;
    }
    this.previousTarget.copy(this.target);
    this.target.copy(this.targetAtDragStart).add(ground.sub(this.dragOrigin));
    if (dt > 0) {
      this.scratch.subVectors(this.target, this.previousTarget).divideScalar(dt);
      this.velocity.lerp(this.scratch, 1 - Math.exp(-dt / PAN.VELOCITY_TAU));
    }
  }

  /** Выбег после отпускания: экспоненциальное затухание скорости (FR-8.1). */
  private applyInertia(dt: number): void {
    if (dt <= 0) {
      return;
    }
    if (this.velocity.length() < PAN.INERTIA_STOP_SPEED) {
      this.velocity.set(0, 0, 0);
      return;
    }
    const decay = Math.exp(-dt / PAN.INERTIA_TAU);
    this.scratch.copy(this.velocity).multiplyScalar(PAN.INERTIA_TAU * (1 - decay));
    this.target.add(this.scratch);
    this.velocity.multiplyScalar(decay);
  }

  private applyKeys(dt: number): void {
    let kx = 0;
    let ky = 0;
    for (const code of this.input.keys) {
      const axis = KEY_AXES.get(code);
      if (axis !== undefined) {
        kx += axis[0];
        ky += axis[1];
      }
    }
    if (kx === 0 && ky === 0) {
      return;
    }
    const length = Math.hypot(kx, ky);
    kx /= length;
    ky /= length;
    // Стрелка «вправо» тянет мир влево по экрану: сцена движется против направления клавиши.
    const step = PAN.KEY_SPEED_UNITS * dt;
    this.target.x -= (kx + ky) * SQRT_HALF * step;
    this.target.z -= (ky - kx) * SQRT_HALF * step;
    this.velocity.set(0, 0, 0);
  }

  /** Центр экрана всегда в центральном слоте: иначе сдвигаем всё на целые чанки. */
  private recenter(): void {
    const ground = this.rig.groundPoint(0, 0, this.scratch);
    if (ground === null) {
      return;
    }
    const localX = ground.x - this.root.position.x;
    const localZ = ground.z - this.root.position.z;
    const dx = Math.round(localX / WORLD.CHUNK_SIZE);
    const dy = Math.round(localZ / WORLD.CHUNK_SIZE);
    if (dx === 0 && dy === 0) {
      return;
    }
    const shiftX = dx * WORLD.CHUNK_SIZE;
    const shiftZ = dy * WORLD.CHUNK_SIZE;
    this.root.position.x += shiftX;
    this.root.position.z += shiftZ;
    this.target.x += shiftX;
    this.target.z += shiftZ;
    this.targetAtDragStart.x += shiftX;
    this.targetAtDragStart.z += shiftZ;
    this.previousTarget.x += shiftX;
    this.previousTarget.z += shiftZ;
    this.emit('move', { dx, dy });
  }

  private groundAt(point: PointerPoint): Vector3 | null {
    const ndc = this.input.toNdc(point);
    return this.rig.groundPoint(ndc.x, ndc.y, new Vector3());
  }
}
