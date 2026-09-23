import { CLOUD, TRAFFIC, TRAIN, WORLD } from '@/config';
import type { Profile } from '@/render/Profile';
import type { ChunkWindow } from '@/scene/ChunkWindow';
import type { Materials } from '@/scene/Materials';
import { Generator } from '@/world/Generator';
import { NEIGHBOUR_OFFSETS, type ChunkDescriptor } from '@/world/types';
import { Car } from './Car';
import { Cloud } from './Cloud';
import { CAR_HALF_WIDTH, countOverlaps, overlaps, type CarBox } from './Collisions';
import { InstancePool } from './InstancePool';
import type { MobileObject, Transfer } from './MobileObject';
import { CARRIAGE_GAP, CARRIAGE_LENGTH, CARRIAGES, TRAIN_SEPARATION, Train } from './Train';
import { CAR_MODELS, buildCarriage, buildCloud, geometryOf } from './Vehicles';

/** Запас перед/за машиной при входе с другого края окна, юниты. */
const ENTRY_GAP = 8;
/** Поиск места входа вдоль полосы: от 12 юн от края (вне зоны перекрёстка) до 44 с шагом 4. */
const ENTRY_OFFSET_MIN = 12;
const ENTRY_OFFSET_MAX = 44;
const ENTRY_STEP = 4;

/** Снимок машины для диагностики пересечений. */
export interface CarSnapshot {
  key: string;
  x: number;
  z: number;
  wx: number;
  wz: number;
  dirX: number;
  dirZ: number;
  speed: number;
  halfLength: number;
  model: number;
  detected: boolean;
  stuck: number;
}

/** Статистика мобов для debug/e2e. */
export interface MobStats {
  cars: number;
  trains: number;
  clouds: number;
  stuckCars: number;
}

/**
 * Система мобов (design C10): машины, поезда и облака живут только в чанках окна —
 * вход чанка в окно спавнит их из дескриптора. Окно для мобов — тор, как в референсе:
 * объект, ушедший за край, входит с противоположного края (если вход свободен), поэтому
 * в неподвижном окне трафик не вымирает. Рендер — InstancedMesh-пулы в корне окна.
 */
export class MobSystem {
  private readonly carsByChunk = new Map<string, Car[]>();
  private readonly trains: Train[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly carPools: InstancePool[] = [];
  private readonly carriagePool: InstancePool;
  private readonly cloudPools: InstancePool[] = [];
  /** Общий материал облаков: его прозрачность меняет `setCloudFade` (design D18). */
  private readonly cloudMaterial: Materials['cloud'];
  private elapsed = 0;
  private carProbability: number;
  private readonly neighbourScratch: Car[] = [];
  private readonly pendingMoves: { car: Car; key: string; gx: number; gy: number }[] = [];

  constructor(
    private readonly window: ChunkWindow,
    materials: Materials,
    profile: Profile,
  ) {
    this.carProbability = profile.carProbability;
    this.cloudMaterial = materials.cloud;
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
          materials.cloud,
          CLOUD.MAX_INSTANCES,
          window.root,
          {
            name: `clouds:${String(variant)}`,
            receiveShadow: false,
            shadowTwin: materials.shadowOnly,
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
      if (spawn.roll >= this.carProbability) {
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
        if (Train.spawnsAt(d.gx, direction) && !this.trainNear(d.gx, d.gy, direction, null, 'x')) {
          this.trains.push(new Train(this.window.generator.seed, d.gx, d.gy, 0, direction, 'x'));
        }
      }
    }
    if (d.lrt.ns) {
      for (const direction of [1, -1] as const) {
        if (Train.spawnsAt(d.gy, direction) && !this.trainNear(d.gx, d.gy, direction, null, 'z')) {
          this.trains.push(new Train(this.window.generator.seed, d.gx, d.gy, 0, direction, 'z'));
        }
      }
    }
  }

  /** Сворачивание координат чанка внутрь окна (тор): выход за край → противоположный край. */
  private torusWrap(gx: number, gy: number): Transfer {
    const size = this.window.size;
    const half = Math.floor(size / 2);
    const grid = this.window.gridCoords;
    let wx = gx;
    let wy = gy;
    if (wx > grid.x + half) {
      wx -= size;
    } else if (wx < grid.x - half) {
      wx += size;
    }
    if (wy > grid.y + half) {
      wy -= size;
    } else if (wy < grid.y - half) {
      wy += size;
    }
    return { gx: wx, gy: wy, key: Generator.key(wx, wy) };
  }

  /** Откатить переход через границу и оставить объект у края чанка (вход занят). */
  private static holdAtEdge(mob: MobileObject, transfer: Transfer): void {
    mob.x += (transfer.gx - mob.gx) * WORLD.CHUNK_SIZE;
    mob.z += (transfer.gy - mob.gy) * WORLD.CHUNK_SIZE;
    const edge = WORLD.CHUNK_SIZE / 2 - 0.01;
    mob.x = Math.min(Math.max(mob.x, -edge), edge);
    mob.z = Math.min(Math.max(mob.z, -edge), edge);
    mob.speed = 0;
  }

  /**
   * Поставить машину на ближайшее свободное место полосы у входного края чанка `destination`
   * (вне зоны перекрёстка). `false`, если вся полоса занята — машина исчезает,
   * трафик восполняют входящие чанки.
   */
  private placeAtEntry(car: Car, destination: Transfer, gridX: number, gridY: number): boolean {
    const alongX = car.dirX !== 0;
    const sign = alongX ? car.dirX : car.dirZ;
    const edge = WORLD.CHUNK_SIZE / 2;
    for (let d = ENTRY_OFFSET_MIN; d <= ENTRY_OFFSET_MAX; d += ENTRY_STEP) {
      const candidate = sign * (d - edge);
      if (alongX) {
        car.x = candidate;
      } else {
        car.z = candidate;
      }
      if (!this.carBlocked(car, destination, gridX, gridY)) {
        return true;
      }
    }
    return false;
  }

  /** Занято ли место входа машины в чанке `destination` (с запасом ENTRY_GAP). */
  private carBlocked(car: Car, destination: Transfer, gridX: number, gridY: number): boolean {
    const box: CarBox = {
      x: (destination.gx - gridX) * WORLD.CHUNK_SIZE + car.x,
      z: (destination.gy - gridY) * WORLD.CHUNK_SIZE + car.z,
      dirX: car.dirX,
      dirZ: car.dirZ,
      halfLength: car.halfLength + ENTRY_GAP,
      halfWidth: CAR_HALF_WIDTH,
    };
    const check = (list: readonly Car[] | undefined): boolean =>
      list !== undefined &&
      list.some(
        (other) =>
          other !== car &&
          overlaps(box, {
            x: other.worldX(gridX),
            z: other.worldZ(gridY),
            dirX: other.dirX,
            dirZ: other.dirZ,
            halfLength: other.halfLength,
            halfWidth: CAR_HALF_WIDTH,
          }),
      );
    if (check(this.carsByChunk.get(destination.key))) {
      return true;
    }
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      if (check(this.carsByChunk.get(Generator.key(destination.gx + dx, destination.gy + dy)))) {
        return true;
      }
    }
    return false;
  }

  /** Есть ли поезд той же нитки ближе минимального интервала от точки входа (AC-5.4). */
  private trainNear(
    gx: number,
    gy: number,
    direction: 1 | -1,
    except: Train | null,
    axis: 'x' | 'z',
  ): boolean {
    const line = axis === 'x' ? gy : gx;
    const spawnAt = (axis === 'x' ? gx : gy) * WORLD.CHUNK_SIZE;
    for (const train of this.trains) {
      if (
        train === except ||
        train.axis !== axis ||
        train.direction !== direction ||
        train.lineIndex !== line
      ) {
        continue;
      }
      const at = axis === 'x' ? train.worldX(0) : train.worldZ(0);
      if (Math.abs(at - spawnAt) < TRAIN_SEPARATION) {
        return true;
      }
    }
    return false;
  }

  /** Снизить долю машин на лету (TSK-060): будущие спавны и уже живущие машины. */
  setCarProbability(probability: number): void {
    this.carProbability = probability;
    for (const cars of this.carsByChunk.values()) {
      for (let i = cars.length - 1; i >= 0; i--) {
        if ((cars[i]?.roll ?? 0) >= probability) {
          cars.splice(i, 1);
        }
      }
    }
  }

  /** Число пересекающихся пар машин в окне (AC-6.1, e2e/simulation). */
  overlaps(): number {
    const gridX = this.window.gridCoords.x;
    const gridY = this.window.gridCoords.y;
    const boxes: CarBox[] = [];
    for (const cars of this.carsByChunk.values()) {
      for (const car of cars) {
        boxes.push({
          x: car.worldX(gridX),
          z: car.worldZ(gridY),
          dirX: car.dirX,
          dirZ: car.dirZ,
          halfLength: car.halfLength,
          halfWidth: CAR_HALF_WIDTH,
        });
      }
    }
    return countOverlaps(boxes);
  }

  /** Снимок машины для диагностики. */
  private snapshot(car: Car): CarSnapshot {
    return {
      key: car.key,
      x: car.x,
      z: car.z,
      wx: car.worldX(this.window.gridCoords.x),
      wz: car.worldZ(this.window.gridCoords.y),
      dirX: car.dirX,
      dirZ: car.dirZ,
      speed: car.speed,
      halfLength: car.halfLength,
      model: car.model,
      detected: car.detected !== null,
      stuck: car.stuckSeconds,
    };
  }

  /** Снимки всех машин (debug API, QA). */
  carSnapshots(): CarSnapshot[] {
    return this.allCars().map((car) => this.snapshot(car));
  }

  /** Пары пересекающихся машин с деталями (диагностика, e2e). */
  overlapPairs(): { a: CarSnapshot; b: CarSnapshot }[] {
    const gridX = this.window.gridCoords.x;
    const gridY = this.window.gridCoords.y;
    const all = this.allCars();
    const snap = (car: Car): CarSnapshot => this.snapshot(car);
    const box = (car: Car): CarBox => ({
      x: car.worldX(gridX),
      z: car.worldZ(gridY),
      dirX: car.dirX,
      dirZ: car.dirZ,
      halfLength: car.halfLength,
      halfWidth: CAR_HALF_WIDTH,
    });
    const pairs: { a: CarSnapshot; b: CarSnapshot }[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a !== undefined && b !== undefined && overlaps(box(a), box(b))) {
          pairs.push({ a: snap(a), b: snap(b) });
        }
      }
    }
    return pairs;
  }

  /** Пересоздать всех мобов из дескрипторов окна — детерминированный стартовый кадр (visual e2e). */
  reset(): void {
    this.carsByChunk.clear();
    this.trains.length = 0;
    this.clouds.length = 0;
    this.elapsed = 0;
    for (const descriptor of this.window.dump()) {
      this.spawn(descriptor);
    }
    this.fillPools(this.window.gridCoords.x, this.window.gridCoords.y);
  }

  /**
   * Чанк покинул окно: его машины убираются (входящие чанки приносят свои), а поезда
   * и облака переезжают на противоположный край (тор); поезд без свободного входа
   * или с другим рядом коридора — удаляется.
   */
  despawn(key: string): void {
    this.carsByChunk.delete(key);
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const train = this.trains[i];
      if (train === undefined || train.key !== key) {
        continue;
      }
      const destination = this.torusWrap(train.gx, train.gy);
      const sameLine =
        train.axis === 'x' ? destination.gy === train.gy : destination.gx === train.gx;
      if (
        !sameLine ||
        this.trainNear(destination.gx, destination.gy, train.direction, train, train.axis)
      ) {
        this.trains.splice(i, 1);
      } else {
        train.moveTo(destination);
      }
    }
    for (const cloud of this.clouds) {
      if (cloud.key === key) {
        cloud.moveTo(this.torusWrap(cloud.gx, cloud.gy));
      }
    }
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
        car.sense(neighbours, dt, this.elapsed);
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
      const car = move.car;
      let target = this.carsByChunk.get(move.key);
      let destination: Transfer = move;
      if (target === undefined) {
        // Соседа в окне нет — вход с противоположного края окна (тор), если место свободно;
        // иначе машина ждёт у края и пробует в следующем кадре.
        destination = this.torusWrap(move.gx, move.gy);
        target = this.carsByChunk.get(destination.key);
        if (target === undefined || !this.placeAtEntry(car, destination, gridX, gridY)) {
          continue;
        }
      }
      car.moveTo(destination);
      target.push(car);
    }
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const train = this.trains[i];
      if (train === undefined) {
        continue;
      }
      train.step(dt, this.leaderDistance(train, gridX, gridY));
      const transfer = train.wrap();
      if (transfer === null) {
        continue;
      }
      if (this.window.hasKey(transfer.key)) {
        train.moveTo(transfer);
        continue;
      }
      // Ушёл за край окна — входит с противоположного края той же нитки (AC-5.4);
      // если там ближе минимального интервала уже есть поезд, ждёт у края.
      const destination = this.torusWrap(transfer.gx, transfer.gy);
      if (this.trainNear(destination.gx, destination.gy, train.direction, train, train.axis)) {
        MobSystem.holdAtEdge(train, transfer);
      } else {
        train.moveTo(destination);
      }
    }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      if (cloud === undefined) {
        continue;
      }
      cloud.update(dt, this.elapsed);
      const transfer = cloud.wrap();
      if (transfer !== null) {
        cloud.moveTo(
          this.window.hasKey(transfer.key) ? transfer : this.torusWrap(transfer.gx, transfer.gy),
        );
      }
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

  /**
   * Затухание облаков по высоте камеры (FR-19.10, design D18): прозрачность общего материала
   * облаков и флаги пулов (`InstancePool.setFade`). Смена `transparent` меняет программу
   * шейдера (define `OPAQUE`), поэтому `needsUpdate` ставится только при смене режима.
   */
  setCloudFade(v: number): void {
    const transparent = v < 1;
    if (this.cloudMaterial.transparent !== transparent) {
      this.cloudMaterial.transparent = transparent;
      this.cloudMaterial.needsUpdate = true;
    }
    this.cloudMaterial.opacity = v;
    for (const pool of this.cloudPools) {
      pool.setFade(v);
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
  private leaderDistance(train: Train, gridX: number, gridY: number): number {
    const at = (t: Train): number => (t.axis === 'x' ? t.worldX(gridX) : t.worldZ(gridY));
    const mine = at(train);
    let best = Number.POSITIVE_INFINITY;
    for (const other of this.trains) {
      if (
        other === train ||
        other.axis !== train.axis ||
        other.direction !== train.direction ||
        other.lineIndex !== train.lineIndex
      ) {
        continue;
      }
      const d = (at(other) - mine) * train.direction;
      if (d > 0 && d < best) {
        best = d;
      }
    }
    return best;
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
        this.carriagePool.push(
          wx - train.dirX * offset,
          train.y,
          wz - train.dirZ * offset,
          train.yaw,
        );
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

/** Экспорт для тестов: размер чанка. */
export const MOB_CHUNK_SIZE = WORLD.CHUNK_SIZE;
