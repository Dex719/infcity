import { WORLD } from '@/config';
import { Generator } from '@/world/Generator';

const HALF = WORLD.CHUNK_SIZE / 2;

/** Результат переноса: новый чанк, если объект пересёк границу. */
export interface Transfer {
  readonly gx: number;
  readonly gy: number;
  readonly key: string;
}

/**
 * Движущийся объект, живущий в чанке (design C10, FR-6.4, FR-5.5, FR-7.2).
 * Позиция локальная (`[-30, 30)` по x/z); при выходе за границу вычисляется соседний чанк,
 * а локальная координата сворачивается по модулю размера чанка — мировая позиция непрерывна.
 * Не наследует Object3D: рендер через InstancedMesh, здесь только состояние.
 */
export abstract class MobileObject {
  gx: number;
  gy: number;
  key: string;
  x: number;
  y: number;
  z: number;
  /** Направление движения (единичный вектор в плоскости). */
  dirX = 1;
  dirZ = 0;
  /** Поворот модели вокруг Y. */
  yaw = 0;
  /** Текущая скорость, юн/с. */
  speed = 0;
  /** Равномерный масштаб для рендера. */
  scale = 1;
  active = true;

  protected constructor(gx: number, gy: number, x: number, y: number, z: number) {
    this.gx = gx;
    this.gy = gy;
    this.key = Generator.key(gx, gy);
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** Шаг симуляции; `t` — общее время в секундах (для периодических эффектов). */
  abstract update(dt: number, t: number): void;

  /** Сместить вдоль направления на пройденный путь. */
  protected advance(distance: number): void {
    this.x += this.dirX * distance;
    this.z += this.dirZ * distance;
  }

  /**
   * Свернуть локальную позицию в чанк и вернуть новый чанк, если граница пересечена.
   * Вызывающий решает, существует ли сосед (окно) — иначе объект деактивируется.
   */
  wrap(): Transfer | null {
    let dx = 0;
    let dy = 0;
    while (this.x >= HALF) {
      this.x -= WORLD.CHUNK_SIZE;
      dx++;
    }
    while (this.x < -HALF) {
      this.x += WORLD.CHUNK_SIZE;
      dx--;
    }
    while (this.z >= HALF) {
      this.z -= WORLD.CHUNK_SIZE;
      dy++;
    }
    while (this.z < -HALF) {
      this.z += WORLD.CHUNK_SIZE;
      dy--;
    }
    if (dx === 0 && dy === 0) {
      return null;
    }
    const gx = this.gx + dx;
    const gy = this.gy + dy;
    return { gx, gy, key: Generator.key(gx, gy) };
  }

  /** Принять перенос в соседний чанк. */
  moveTo(transfer: Transfer): void {
    this.gx = transfer.gx;
    this.gy = transfer.gy;
    this.key = transfer.key;
  }

  /** Мировая (в системе корня окна) позиция при текущих `gridCoords`. */
  worldX(gridX: number): number {
    return (this.gx - gridX) * WORLD.CHUNK_SIZE + this.x;
  }

  worldZ(gridY: number): number {
    return (this.gy - gridY) * WORLD.CHUNK_SIZE + this.z;
  }

  /** Обновить `yaw` из направления (модель смотрит вдоль +x). */
  protected faceDirection(): void {
    this.yaw = Math.atan2(-this.dirZ, this.dirX);
  }
}
