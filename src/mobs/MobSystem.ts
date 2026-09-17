import { CLOUD, TRAFFIC, TRAIN, WORLD } from '@/config';
import type { Profile } from '@/render/Profile';
import type { ChunkWindow } from '@/scene/ChunkWindow';
import type { Materials } from '@/scene/Materials';
import { Generator } from '@/world/Generator';
import { NEIGHBOUR_OFFSETS, type ChunkDescriptor } from '@/world/types';
import { Car } from './Car';
import { Cloud } from './Cloud';
import { InstancePool } from './InstancePool';
import { CARRIAGE_GAP, CARRIAGE_LENGTH, CARRIAGES, Train } from './Train';
import { CAR_MODELS, buildCarriage, buildCloud, geometryOf } from './Vehicles';

/** Статистика мобов для debug/e2e. */
export interface MobStats {
  cars: number;
  trains: number;
  clouds: number;
  stuckCars: number;
}

/**
 * Система мобов (design C10): машины, поезда и облака живут только в чанках окна —
 * вход чанка в окно спавнит их из дескриптора, выход убирает. Рендер — InstancedMesh-пулы
 * в корне окна (координаты относительно `gridCoords`).
 */
export class MobSystem {
  private readonly carsByChunk = new Map<string, Car[]>();
  private readonly trains: Train[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly carPools: InstancePool[] = [];
  private readonly carriagePool: InstancePool;
  private readonly cloudPools: InstancePool[] = [];
  private elapsed = 0;
  private readonly neighbourScratch: Car[] = [];
  private readonly pendingMoves: { car: Car; key: string; gx: number; gy: number }[] = [];

  constructor(
    private readonly window: ChunkWindow,
    materials: Materials,
    private readonly profile: Profile,
  ) {
    for (const model of CAR_MODELS) {
      this.carPools.push(
        new InstancePool(
          geometryOf(model.build, materials),
          materials.opaque,
          TRAFFIC.MAX_INSTANCES,
          window.root,
          {
            name: `cars:${model.name}`,
          },
        ),
      );
    }
    this.carriagePool = new InstancePool(
      geometryOf(buildCarriage, materials),
      materials.opaque,
      TRAIN.MAX_INSTANCES,
      window.root,
      {
        name: 'trains',
      },
    );
    for (let variant = 0; variant < CLOUD.MODELS; variant++) {
      this.cloudPools.push(
        new InstancePool(
          geometryOf((b, m) => buildCloud(b, m, variant), materials),
          materials.opaque,
          CLOUD.MAX_INSTANCES,
          window.root,
          {
            name: `clouds:${String(variant)}`,
            receiveShadow: false,
          },
        ),
      );
    }
    window.events.on('enter', ({ descriptor }) => this.spawn(descriptor));
    window.events.on('leave', ({ key }) => this.despawn(key));
  }

  /** Спавн мобов чанка из дескриптора (детерминированно). */
  spawn(d: ChunkDescriptor): void {
    if (this.carsByChunk.has(d.key)) {
      return;
    }
    const cars: Car[] = [];
    for (const spawn of d.cars) {
      if (spawn.roll >= this.profile.carProbability) {
        continue;
      }
      const model = CAR_MODELS[spawn.model % CAR_MODELS.length];
      if (model === undefined) {
        continue;
      }
      cars.push(new Car(d.gx, d.gy, spawn, model.length / 2));
    }
    this.carsByChunk.set(d.key, cars);

    if (d.cloud !== null) {
      this.clouds.push(new Cloud(d.gx, d.gy, d.cloud));
    }
    if (d.lrt.corridor !== null) {
      for (const direction of [1, -1] as const) {
        if (Train.spawnsAt(d.gx, direction)) {
          this.trains.push(new Train(this.window.generator.seed, d.gx, d.gy, 0, direction));
        }
      }
    }
  }

  /** Убрать всех мобов чанка (он покинул окно). */
  despawn(key: string): void {
    this.carsByChunk.delete(key);
    removeWhere(this.trains, (t) => t.key === key);
    removeWhere(this.clouds, (c) => c.key === key);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const gridX = this.window.gridCoords.x;
    const gridY = this.window.gridCoords.y;

    // 1. Мировые координаты машин для радара.
    for (const cars of this.carsByChunk.values()) {
      for (const car of cars) {
        car.wx = car.worldX(gridX);
        car.wz = car.worldZ(gridY);
      }
    }
    // 2. Радар и скорость.
    for (const [key, cars] of this.carsByChunk) {
      if (cars.length === 0) {
        continue;
      }
      const neighbours = this.collectNeighbours(key, cars);
      for (const car of cars) {
        car.sense(neighbours, dt);
      }
    }
    // 3. Движение; переносы применяются после обхода, чтобы не обновить машину дважды.
    const moves = this.pendingMoves;
    moves.length = 0;
    for (const cars of this.carsByChunk.values()) {
      for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        if (car === undefined) {
          continue;
        }
        car.update(dt);
        const transfer = car.wrap();
        if (transfer === null) {
          continue;
        }
        cars.splice(i, 1);
        moves.push({ car, key: transfer.key, gx: transfer.gx, gy: transfer.gy });
      }
    }
    for (const move of moves) {
      const target = this.carsByChunk.get(move.key);
      if (target !== undefined) {
        move.car.moveTo(move);
        target.push(move.car);
      }
    }
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const train = this.trains[i];
      if (train === undefined) {
        continue;
      }
      train.step(dt, this.leaderDistance(train, gridX));
      if (!this.transferOrDrop(train, this.trains, i)) {
        continue;
      }
    }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      if (cloud === undefined) {
        continue;
      }
      cloud.update(dt, this.elapsed);
      this.transferOrDrop(cloud, this.clouds, i);
    }
    this.fillPools(gridX, gridY);
  }

  stats(): MobStats {
    let cars = 0;
    let stuck = 0;
    for (const list of this.carsByChunk.values()) {
      cars += list.length;
      for (const car of list) {
        if (car.stuckSeconds >= 10) {
          stuck++;
        }
      }
    }
    return { cars, trains: this.trains.length, clouds: this.clouds.length, stuckCars: stuck };
  }

  /** Облака скрываются, когда камера опускается к их высоте (FR-7, FR-8.2). */
  setCloudsVisible(visible: boolean): void {
    for (const pool of this.cloudPools) {
      pool.mesh.visible = visible;
    }
  }

  /** Все машины (для e2e-проверок пересечений). */
  allCars(): Car[] {
    const result: Car[] = [];
    for (const list of this.carsByChunk.values()) {
      result.push(...list);
    }
    return result;
  }

  get allTrains(): readonly Train[] {
    return this.trains;
  }

  private collectNeighbours(key: string, cars: Car[]): Car[] {
    const list = this.neighbourScratch;
    list.length = 0;
    list.push(...cars);
    const first = cars[0];
    if (first === undefined) {
      return list;
    }
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      const other = this.carsByChunk.get(Generator.key(first.gx + dx, first.gy + dy));
      if (
        other !== undefined &&
        other.length > 0 &&
        key !== Generator.key(first.gx + dx, first.gy + dy)
      ) {
        list.push(...other);
      }
    }
    return list;
  }

  /** Ближайший поезд впереди на той же нитке, расстояние в юнитах. */
  private leaderDistance(train: Train, gridX: number): number {
    const wx = train.worldX(gridX);
    let best = Number.POSITIVE_INFINITY;
    for (const other of this.trains) {
      if (other === train || other.dirX !== train.dirX || other.gy !== train.gy) {
        continue;
      }
      const d = (other.worldX(gridX) - wx) * train.dirX;
      if (d > 0 && d < best) {
        best = d;
      }
    }
    return best;
  }

  /** Перенос в соседний чанк окна или удаление, если сосед вне окна. */
  private transferOrDrop<T extends Train | Cloud>(mob: T, list: T[], index: number): boolean {
    const transfer = mob.wrap();
    if (transfer === null) {
      return false;
    }
    if (this.window.hasKey(transfer.key)) {
      mob.moveTo(transfer);
      return true;
    }
    list.splice(index, 1);
    return true;
  }

  private fillPools(gridX: number, gridY: number): void {
    for (const pool of this.carPools) {
      pool.begin();
    }
    for (const cars of this.carsByChunk.values()) {
      for (const car of cars) {
        this.carPools[car.model % this.carPools.length]?.push(
          car.worldX(gridX),
          0,
          car.worldZ(gridY),
          car.yaw,
        );
      }
    }
    for (const pool of this.carPools) {
      pool.end();
    }

    this.carriagePool.begin();
    const stride = CARRIAGE_LENGTH + CARRIAGE_GAP;
    for (const train of this.trains) {
      const wx = train.worldX(gridX);
      const wz = train.worldZ(gridY);
      for (let i = 0; i < CARRIAGES; i++) {
        const offset = (i - (CARRIAGES - 1) / 2) * stride;
        this.carriagePool.push(wx - train.dirX * offset, train.y, wz, train.yaw);
      }
    }
    this.carriagePool.end();

    for (const pool of this.cloudPools) {
      pool.begin();
    }
    for (const cloud of this.clouds) {
      this.cloudPools[cloud.model % this.cloudPools.length]?.push(
        cloud.worldX(gridX),
        cloud.y,
        cloud.worldZ(gridY),
        cloud.yaw,
        cloud.scale,
      );
    }
    for (const pool of this.cloudPools) {
      pool.end();
    }
  }

  dispose(): void {
    for (const pool of [...this.carPools, this.carriagePool, ...this.cloudPools]) {
      pool.dispose();
    }
    this.carsByChunk.clear();
    this.trains.length = 0;
    this.clouds.length = 0;
  }
}

function removeWhere<T>(list: T[], predicate: (item: T) => boolean): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (item !== undefined && predicate(item)) {
      list.splice(i, 1);
    }
  }
}

/** Экспорт для тестов: размер чанка. */
export const MOB_CHUNK_SIZE = WORLD.CHUNK_SIZE;
