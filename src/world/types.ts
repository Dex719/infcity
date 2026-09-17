import type { LandmarkId } from '@/config';

/**
 * Словарь домена генерации (design → Data Models). Чистые типы без three.js:
 * дескриптор чанка сериализуем и снапшотится в тестах (AC-1.1, AC-2.1).
 */

/** Регулярные типы кварталов; порядок фиксирован — от него зависит хеш → тип (D9). */
export const REGULAR_BLOCK_TYPES = [
  'residential-panel',
  'residential-new',
  'business-glass',
  'commercial',
  'park',
  'square',
  'campus',
  'mall',
  'market',
] as const;

/** Регулярный тип квартала. */
export type RegularBlockTypeId = (typeof REGULAR_BLOCK_TYPES)[number];

/** Любой тип квартала: регулярный, редкий стадион, ландмарк или русло реки (FR-3, FR-4, FR-14). */
export type BlockTypeId = RegularBlockTypeId | 'stadium' | 'landmark' | 'river';

/** Варианты префаба прямой дороги. */
export type RoadVariantId = 'a' | 'b';

/** Варианты перекрёстка; порядок фиксирован (хеш → индекс). */
export const INTERSECTION_IDS = ['plain', 'lights', 'plaza'] as const;

/** Вариант перекрёстка. */
export type IntersectionId = (typeof INTERSECTION_IDS)[number];

/** Поворот квартала ×90° (FR-3.3). */
export type Rotation = 0 | 1 | 2 | 3;

/** Индекс полосы: 0–1 дорога N–S, 2–3 дорога E–W (FR-6.1). */
export type LaneIndex = 0 | 1 | 2 | 3;

/** Направление движения вдоль полосы. */
export type Direction = 1 | -1;

/** Класс чётности клетки: два 8-соседа никогда не совпадают по классу (D9). */
export type ParityClass = 0 | 1 | 2 | 3;

/** Машина, которую чанк порождает при сборке (FR-6.1). */
export interface CarSpawn {
  readonly lane: LaneIndex;
  /** Индекс модели в пуле `TRAFFIC.MODEL_POOL`. */
  readonly model: number;
  readonly dir: Direction;
  /**
   * Исходный бросок в [0, 1): дескриптор одинаков на всех платформах (AC-2.1),
   * а мобильный профиль отбрасывает машины с `roll >= P_CAR.mobile` (FR-6.1, NFR-1).
   */
  readonly roll: number;
}

/** Облако чанка (FR-7.1). */
export interface CloudSpawn {
  readonly model: number;
  /** Локальные координаты в чанке, [-CHUNK_SIZE/2, CHUNK_SIZE/2). */
  readonly x: number;
  readonly z: number;
  /** Фаза «дыхания» масштаба, [0, 1). */
  readonly phase: number;
  /** Множитель скорости дрейфа, [1, 1 + SPEED_JITTER). */
  readonly speedMul: number;
}

/** ЛРТ в чанке (FR-5.1, FR-5.2). */
export interface LrtInfo {
  readonly corridor: 'EW' | null;
  readonly station: boolean;
}

/** Дороги чанка: N–S вдоль западной кромки, E–W вдоль северной, перекрёсток в NW-углу. */
export interface RoadsInfo {
  readonly ns: RoadVariantId;
  readonly ew: RoadVariantId;
  readonly corner: IntersectionId;
}

/** Полное описание чанка — вход для `ChunkBuilder` (design → ChunkDescriptor). */
export interface ChunkDescriptor {
  readonly gx: number;
  readonly gy: number;
  /** `"${gx},${gy}"`. */
  readonly key: string;
  readonly block: BlockTypeId;
  readonly landmark: LandmarkId | null;
  readonly rotation: Rotation;
  /** 32-битное значение для вариаций префаба (перестановки зданий). */
  readonly variant: number;
  readonly roads: RoadsInfo;
  readonly lrt: LrtInfo;
  readonly cars: readonly CarSpawn[];
  readonly cloud: CloudSpawn | null;
  /** Чанк собран как запасной после ошибки генерации (NFR-7). */
  readonly fallback?: boolean;
}

/**
 * Соли хеша по назначению. Значения фиксированы навсегда: их изменение меняет
 * города для существующих seed (Migration and Compatibility → GEN_VERSION).
 */
export const Salt = {
  BLOCK: 1,
  BLOCK_PICK: 2,
  ROT: 3,
  VARIANT: 4,
  ROADS: 5,
  CLOUD: 6,
  CLOUD_PARAMS: 7,
  STADIUM: 8,
  /** + индекс полосы (0..3). */
  CAR_ROLL: 20,
  /** + индекс полосы. */
  CAR_MODEL: 30,
  /** + индекс полосы. */
  CAR_DIR: 40,
  /** + индекс ландмарка в `LANDMARK_IDS`. */
  LANDMARK_BASE: 100,
} as const;

/** Смещения 8 соседей (король-граф). */
export const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
