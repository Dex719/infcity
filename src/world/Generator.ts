import { BLOCKS, CLOUD, TRAFFIC, WORLD, type LandmarkId } from '@/config';
import { hash32, hashUnit, rng, seedToInt } from './Hash';
import { LandmarkPlanner } from './LandmarkPlanner';
import { describeLrt } from './LrtPlanner';
import { mod, pick } from './math';
import { isRareWinner, type RareRule } from './Rare';
import {
  INTERSECTION_IDS,
  NEIGHBOUR_OFFSETS,
  REGULAR_BLOCK_TYPES,
  Salt,
  type BlockTypeId,
  type CarSpawn,
  type ChunkDescriptor,
  type CloudSpawn,
  type LaneIndex,
  type ParityClass,
  type RegularBlockTypeId,
  type RoadsInfo,
  type Rotation,
} from './types';

/** Опции генератора. */
export interface GeneratorOptions {
  /** Включённые ландмарки; по умолчанию `LANDMARKS.ENABLED`. */
  readonly enabledLandmarks?: readonly LandmarkId[];
}

const STADIUM_RULE: RareRule = {
  salt: Salt.STADIUM,
  probability: BLOCKS.STADIUM.PROBABILITY,
  radius: BLOCKS.STADIUM.RADIUS,
};

/** Верхняя граница мемоизации; при переполнении кэш просто сбрасывается (результат чистый). */
const MAX_CACHED = 4096;

/**
 * `(seed, gx, gy) → ChunkDescriptor` — чистая, детерминированная, без three.js (design C3).
 * Все случайности — целочисленные хеши клетки с солями из `Salt` (NFR-3).
 */
export class Generator {
  readonly seed: number;

  /** Сколько раз генерация падала и подставлялся fallback-чанк (NFR-7). */
  errors = 0;

  /** Последняя ошибка генерации, для debug-оверлея. */
  lastError: unknown = null;

  private readonly landmarks: LandmarkPlanner;
  private readonly descriptors = new Map<string, ChunkDescriptor>();
  private readonly blockTypes = new Map<string, BlockTypeId>();

  constructor(seed: string | number, options: GeneratorOptions = {}) {
    this.seed = typeof seed === 'string' ? seedToInt(seed) : seed >>> 0;
    this.landmarks = new LandmarkPlanner(this.seed, options.enabledLandmarks);
  }

  /** Ключ чанка `"gx,gy"`. */
  static key(gx: number, gy: number): string {
    return `${String(gx)},${String(gy)}`;
  }

  /** Класс чётности клетки (D9). */
  static parityClass(gx: number, gy: number): ParityClass {
    return (mod(gx, 2) + 2 * mod(gy, 2)) as ParityClass;
  }

  /** «Сырой» тип квартала — чистый хеш без учёта соседей. */
  rawBlockType(gx: number, gy: number): RegularBlockTypeId {
    return pick(
      REGULAR_BLOCK_TYPES,
      hash32(this.seed, gx, gy, Salt.BLOCK) % REGULAR_BLOCK_TYPES.length,
    );
  }

  /** Финальный тип квартала с учётом ландмарков, стадиона и соседей (FR-3.2, D9). */
  blockType(gx: number, gy: number): BlockTypeId {
    const key = Generator.key(gx, gy);
    const cached = this.blockTypes.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = this.computeBlockType(gx, gy);
    if (this.blockTypes.size >= MAX_CACHED) {
      this.blockTypes.clear();
    }
    this.blockTypes.set(key, value);
    return value;
  }

  /** Ландмарк клетки (делегирует планировщику). */
  landmarkAt(gx: number, gy: number): LandmarkId | null {
    return this.landmarks.pick(gx, gy);
  }

  /** Дескриптор чанка; при ошибке — запасной парковый чанк с `fallback: true` (NFR-7). */
  describe(gx: number, gy: number): ChunkDescriptor {
    const key = Generator.key(gx, gy);
    const cached = this.descriptors.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let descriptor: ChunkDescriptor;
    try {
      descriptor = this.compute(gx, gy, key);
    } catch (error: unknown) {
      this.errors++;
      this.lastError = error;
      descriptor = Generator.fallback(gx, gy, key);
    }
    if (this.descriptors.size >= MAX_CACHED) {
      this.descriptors.clear();
    }
    this.descriptors.set(key, descriptor);
    return descriptor;
  }

  /** Дескрипторы окна `size × size` вокруг `(cx, cy)`, построчно (для debug-дампа и тестов). */
  describeWindow(cx: number, cy: number, size: number = WORLD.WINDOW_SIZE): ChunkDescriptor[] {
    const half = Math.floor(size / 2);
    const result: ChunkDescriptor[] = [];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        result.push(this.describe(cx + dx, cy + dy));
      }
    }
    return result;
  }

  private computeBlockType(gx: number, gy: number): BlockTypeId {
    if (this.landmarks.pick(gx, gy) !== null) {
      return 'landmark';
    }
    if (isRareWinner(this.seed, gx, gy, STADIUM_RULE)) {
      return 'stadium';
    }
    const raw = this.rawBlockType(gx, gy);
    const cls = Generator.parityClass(gx, gy);
    if (cls === 0) {
      return raw;
    }
    const excluded = new Set<BlockTypeId>();
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (Generator.parityClass(nx, ny) < cls) {
        excluded.add(this.blockType(nx, ny));
      }
    }
    if (!excluded.has(raw)) {
      return raw;
    }
    const candidates = REGULAR_BLOCK_TYPES.filter((type) => !excluded.has(type));
    if (candidates.length === 0) {
      return raw;
    }
    return pick(candidates, hash32(this.seed, gx, gy, Salt.BLOCK_PICK) % candidates.length);
  }

  private compute(gx: number, gy: number, key: string): ChunkDescriptor {
    const seed = this.seed;
    const landmark = this.landmarks.pick(gx, gy);
    const block = landmark !== null ? 'landmark' : this.blockType(gx, gy);
    const rotation = landmark !== null ? 0 : ((hash32(seed, gx, gy, Salt.ROT) & 3) as Rotation);
    const variant = hash32(seed, gx, gy, Salt.VARIANT);

    const roadBits = hash32(seed, gx, gy, Salt.ROADS);
    const roads: RoadsInfo = {
      ns: (roadBits & 1) === 0 ? 'a' : 'b',
      ew: ((roadBits >>> 1) & 1) === 0 ? 'a' : 'b',
      corner: pick(INTERSECTION_IDS, (roadBits >>> 2) % INTERSECTION_IDS.length),
    };

    const cars: CarSpawn[] = [];
    for (let lane = 0; lane < TRAFFIC.LANES; lane++) {
      const roll = hashUnit(seed, gx, gy, Salt.CAR_ROLL + lane);
      if (roll < TRAFFIC.P_CAR.desktop) {
        cars.push({
          lane: lane as LaneIndex,
          model: hash32(seed, gx, gy, Salt.CAR_MODEL + lane) % TRAFFIC.MODEL_POOL,
          dir: (hash32(seed, gx, gy, Salt.CAR_DIR + lane) & 1) === 0 ? 1 : -1,
          roll,
        });
      }
    }

    let cloud: CloudSpawn | null = null;
    if (hashUnit(seed, gx, gy, Salt.CLOUD) < CLOUD.PROBABILITY) {
      const random = rng(seed, gx, gy, Salt.CLOUD_PARAMS);
      cloud = {
        model: Math.floor(random() * CLOUD.MODELS),
        x: (random() - 0.5) * WORLD.CHUNK_SIZE,
        z: (random() - 0.5) * WORLD.CHUNK_SIZE,
        phase: random(),
        speedMul: 1 + random() * CLOUD.SPEED_JITTER,
      };
    }

    return {
      gx,
      gy,
      key,
      block,
      landmark,
      rotation,
      variant,
      roads,
      lrt: describeLrt(gx, gy),
      cars,
      cloud,
    };
  }

  private static fallback(gx: number, gy: number, key: string): ChunkDescriptor {
    return {
      gx,
      gy,
      key,
      block: 'park',
      landmark: null,
      rotation: 0,
      variant: 0,
      roads: { ns: 'a', ew: 'a', corner: 'plain' },
      lrt: describeLrt(gx, gy),
      cars: [],
      cloud: null,
      fallback: true,
    };
  }
}
