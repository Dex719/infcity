import { Group, type Vector3 } from 'three';
import { Emitter } from '@/app/Emitter';
import { CAMERA, DETAIL, WORLD } from '@/config';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';
import type { ChunkNode } from './ChunkNode';

/** События окна: чанк вошёл в окно / покинул его (для спавна мобов). */
export interface WindowEvents extends Record<string, unknown> {
  enter: { key: string; descriptor: ChunkDescriptor };
  leave: { key: string };
}

/** Сборщик чанков: полноценная сборка, быстрый плейсхолдер и освобождение (design C7). */
export interface ChunkBuilder {
  build(descriptor: ChunkDescriptor): ChunkNode;
  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode;
  dispose(node: ChunkNode): void;
}

/** Слот окна: фиксированная позиция, содержимое подменяется при сдвиге. */
export interface Slot {
  /** Порядковый номер в `slots` — ключ предвычисленных таблиц слота. */
  readonly index: number;
  /** Смещение от центра окна в чанках. */
  readonly cx: number;
  readonly cy: number;
  readonly holder: Group;
  key: string | null;
  node: ChunkNode | null;
}

/**
 * Скользящее окно W×W слотов (design C6, FR-1): при `move(dx, dy)` координаты сетки
 * сдвигаются, корень смещается на целые чанки назад, слоты получают чанки из LRU или
 * ставят плейсхолдер и встают в очередь сборки (≤ BUILD_PER_FRAME за кадр, ближние первыми).
 */
export class ChunkWindow {
  readonly root = new Group();
  readonly size: number;
  readonly gridCoords = { x: 0, y: 0 };
  readonly slots: Slot[] = [];
  readonly events = new Emitter<WindowEvents>();

  private readonly keys = new Set<string>();
  private readonly built = new Map<string, ChunkNode>();
  private readonly queue: Slot[] = [];
  private buildsTotal = 0;
  private cacheHits = 0;
  private buildErrorsTotal = 0;
  private prefetchesTotal = 0;
  /** Расстояние от камеры до каждого слота по земле — ключ потолка детализации (design D14). */
  private readonly slotDistance: number[] = [];
  /** Радиус, внутри которого слот имеет право показывать детали (потолок `MAX_DETAIL_SLOTS`). */
  private readonly detailRadius: number;
  /** Смещения кольца вокруг окна (Chebyshev = half + 1), ближние первыми. */
  private readonly ring: readonly (readonly [number, number])[];
  /** Последнее направление сдвига окна: префетч идёт сначала по курсу (BUG-9). */
  private readonly heading = { x: 0, y: 0 };
  /** Порядки обхода кольца по направлениям — считаются один раз на каждое из девяти. */
  private readonly ringByHeading = new Map<string, readonly (readonly [number, number])[]>();
  /** Префетч включён, только если кэш вмещает окно и кольцо целиком. */
  private readonly prefetchEnabled: boolean;

  constructor(
    readonly generator: Generator,
    readonly builder: ChunkBuilder,
    size: number = WORLD.WINDOW_SIZE,
    private readonly cacheCapacity: number = WORLD.CACHE_CHUNKS,
  ) {
    this.size = size;
    this.root.name = 'chunk-window';
    const half = Math.floor(size / 2);
    for (let cy = -half; cy <= half; cy++) {
      for (let cx = -half; cx <= half; cx++) {
        const holder = new Group();
        holder.name = `slot:${String(cx)},${String(cy)}`;
        holder.position.set(cx * WORLD.CHUNK_SIZE, 0, cy * WORLD.CHUNK_SIZE);
        holder.matrixAutoUpdate = false;
        holder.updateMatrix();
        this.root.add(holder);
        this.slots.push({ index: this.slots.length, cx, cy, holder, key: null, node: null });
        // Камера стоит в стороне от центра окна (`CAMERA.OFFSET`), поэтому «ближние» слоты —
        // это слоты со стороны камеры, а не вокруг центра. Порядок по этой величине не зависит
        // от высоты: расстояние hypot(ground, h) монотонно по ground.
        this.slotDistance.push(
          Math.hypot(
            cx * WORLD.CHUNK_SIZE - CAMERA.OFFSET.x,
            cy * WORLD.CHUNK_SIZE - CAMERA.OFFSET.z,
          ),
        );
      }
    }
    // Радиус — наибольшее расстояние, при котором в потолок `MAX_DETAIL_SLOTS` целиком
    // помещается группа слотов с этим расстоянием: группы равных радиусов не разрываются,
    // поэтому симметричные соседи всегда выглядят одинаково, а потолок не превышается.
    const sorted = [...this.slotDistance].sort((a, b) => a - b);
    let radius = 0;
    for (const distance of sorted) {
      const withinGroup = sorted.filter((d) => d <= distance + 1e-6).length;
      if (withinGroup > DETAIL.MAX_DETAIL_SLOTS) {
        break;
      }
      radius = distance + 1e-6;
    }
    this.detailRadius = radius;
    const ring: [number, number][] = [];
    for (let cy = -half - 1; cy <= half + 1; cy++) {
      for (let cx = -half - 1; cx <= half + 1; cx++) {
        if (Math.max(Math.abs(cx), Math.abs(cy)) === half + 1) {
          ring.push([cx, cy]);
        }
      }
    }
    ring.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.ring = ring;
    this.prefetchEnabled = cacheCapacity >= this.slots.length + ring.length;
  }

  /** Ставит окно на чанк `(gx, gy)`; корень остаётся на месте. */
  setCenter(gx: number, gy: number): void {
    this.gridCoords.x = gx;
    this.gridCoords.y = gy;
    this.reassign();
  }

  /** Сдвиг окна на `(dx, dy)` чанков; корень уже сдвинут `PanControls`, здесь — только содержимое. */
  move(dx: number, dy: number): void {
    // Направление движения запоминается для префетча: при панорамировании нужны чанки
    // впереди, а симметричное кольцо тратит бюджет и на те, откуда мы уезжаем (BUG-9).
    if (dx !== 0 || dy !== 0) {
      this.heading.x = Math.sign(dx);
      this.heading.y = Math.sign(dy);
    }
    this.setCenter(this.gridCoords.x + dx, this.gridCoords.y + dy);
  }

  /** Кольцо префетча в порядке «сначала по курсу»: кэшируется по направлению движения. */
  private prefetchOrder(): readonly (readonly [number, number])[] {
    const key = `${String(this.heading.x)},${String(this.heading.y)}`;
    const cached = this.ringByHeading.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const { x: hx, y: hy } = this.heading;
    const order = [...this.ring].sort((a, b) => {
      // Больший проекционный вес — раньше; при равенстве ближе к центру — раньше.
      const wa = a[0] * hx + a[1] * hy;
      const wb = b[0] * hx + b[1] * hy;
      if (wa !== wb) {
        return wb - wa;
      }
      return a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]);
    });
    this.ringByHeading.set(key, order);
    return order;
  }

  /**
   * Собирает чанки из очереди, пока не исчерпан бюджет: не больше `perFrame` штук и не дольше
   * `budgetMs` миллисекунд (BUG-9). Лимит по времени сам подстраивается под стоимость чанка —
   * счётчик штук этого не умеет и потому недоиспользовал допуск NFR-1. Один чанк строится
   * всегда, даже при нулевом бюджете, иначе очередь не двигалась бы на тяжёлом кадре.
   * Возвращает число собранных.
   */
  update(
    perFrame: number = WORLD.BUILD_PER_FRAME,
    budgetMs: number = Number.POSITIVE_INFINITY,
  ): number {
    const startedAt = budgetMs === Number.POSITIVE_INFINITY ? 0 : performance.now();
    const outOfTime = (built: number): boolean =>
      built > 0 &&
      budgetMs !== Number.POSITIVE_INFINITY &&
      performance.now() - startedAt >= budgetMs;
    let built = 0;
    while (built < perFrame && !outOfTime(built)) {
      const slot = this.queue.shift();
      if (slot === undefined) {
        break;
      }
      if (slot.key === null || slot.node === null || !slot.node.placeholder) {
        continue;
      }
      const descriptor = slot.node.descriptor;
      const cached = this.built.get(slot.key);
      const node = cached ?? this.buildSafely(descriptor);
      if (cached === undefined) {
        this.buildsTotal++;
        this.remember(slot.key, node);
      }
      this.attach(slot, node);
      built++;
    }
    // Свободный бюджет кадра — на префетч кольца вокруг окна: при сдвиге новые слоты
    // берутся из кэша, и плейсхолдеров в кадре нет (AC-1.2).
    while (built < perFrame && this.prefetchEnabled && !outOfTime(built)) {
      const descriptor = this.nextPrefetch();
      if (descriptor === null) {
        break;
      }
      this.buildsTotal++;
      this.prefetchesTotal++;
      this.remember(descriptor.key, this.buildSafely(descriptor));
      built++;
    }
    return built;
  }

  /** Первый ещё не собранный чанк кольца вокруг окна или `null`; сначала — по курсу. */
  private nextPrefetch(): ChunkDescriptor | null {
    for (const [cx, cy] of this.prefetchOrder()) {
      const gx = this.gridCoords.x + cx;
      const gy = this.gridCoords.y + cy;
      if (!this.built.has(Generator.key(gx, gy))) {
        return this.generator.describe(gx, gy);
      }
    }
    return null;
  }

  /**
   * Сборка чанка с защитой от исключений в префабах (NFR-7): при ошибке чанк собирается
   * как парковый fallback, ошибка считается и логируется; приложение не падает.
   */
  private buildSafely(descriptor: ChunkDescriptor): ChunkNode {
    try {
      return this.builder.build(descriptor);
    } catch (error: unknown) {
      this.buildErrorsTotal++;
      console.error(`chunk ${descriptor.key}: build failed, using fallback`, error);
      return this.builder.build(Generator.fallbackDescriptor(descriptor.gx, descriptor.gy));
    }
  }

  /**
   * LOD слоя деталей (FR-18.9, FR-18.10, design D14): детали чанка горят, пока он ближе
   * `DETAIL.SHOW_DISTANCE` к камере, и гаснут за `DETAIL.HIDE_DISTANCE` — зазор между границами
   * не даёт им мигать на краю. Камера стоит на месте, город едет под ней (`PanControls` двигает
   * `root`), поэтому мировой центр чанка — это `root.position + holder.position`. Геометрия при
   * переключении не пересобирается: меняется только `visible` готового меша.
   */
  updateDetailVisibility(cameraPosition: Vector3, snap = false): void {
    for (const slot of this.slots) {
      const node = slot.node;
      if (node === null || node.placeholder) {
        continue;
      }
      const dx = this.root.position.x + slot.holder.position.x - cameraPosition.x;
      const dy = this.root.position.y + slot.holder.position.y - cameraPosition.y;
      const dz = this.root.position.z + slot.holder.position.z - cameraPosition.z;
      const distance = Math.hypot(dx, dy, dz);
      // `snap` снимает гистерезис: после телепорта окна состояние не должно зависеть от того,
      // где чанк был раньше, иначе кадр перестаёт быть детерминированным (visual-эталоны).
      const near =
        snap || !node.detailsVisible
          ? distance < DETAIL.SHOW_DISTANCE
          : distance <= DETAIL.HIDE_DISTANCE;
      // Потолок по числу чанков: сравнение с радиусом, а не с рангом, чтобы слоты на
      // одинаковом расстоянии не разрывались — иначе симметричные соседи выглядели бы по-разному.
      const next = near && (this.slotDistance[slot.index] ?? 0) <= this.detailRadius;
      if (next !== node.detailsVisible) {
        node.setDetailsVisible(next);
      }
      // Тень мелочи читается только вблизи, а в теневой проход попадает гораздо больше
      // чанков, чем видно глазом (FR-18.13): дальше границы детали видны, но тени не дают.
      const castsShadow = next && distance <= DETAIL.SHADOW_DISTANCE;
      if (castsShadow !== node.detailsShadow) {
        node.setDetailsShadow(castsShadow);
      }
    }
  }

  /** Слоты, в которых ещё плейсхолдер (AC-1.2). */
  emptySlots(): number {
    let count = 0;
    for (const slot of this.slots) {
      if (slot.node === null || slot.node.placeholder) {
        count++;
      }
    }
    return count;
  }

  /** Собранный чанк в окне по мировым координатам сетки, либо `undefined`. */
  chunkAt(gx: number, gy: number): ChunkNode | undefined {
    const slot = this.slotAt(gx - this.gridCoords.x, gy - this.gridCoords.y);
    if (slot === undefined || slot.node === null || slot.node.placeholder) {
      return undefined;
    }
    return slot.node;
  }

  /** Есть ли чанк с таким ключом в окне (собранный или плейсхолдер). */
  hasKey(key: string): boolean {
    return this.keys.has(key);
  }

  /** Слот по смещению от центра. */
  slotAt(cx: number, cy: number): Slot | undefined {
    const half = Math.floor(this.size / 2);
    if (Math.abs(cx) > half || Math.abs(cy) > half) {
      return undefined;
    }
    return this.slots[(cy + half) * this.size + (cx + half)];
  }

  forEachChunk(fn: (node: ChunkNode, slot: Slot) => void): void {
    for (const slot of this.slots) {
      if (slot.node !== null && !slot.node.placeholder) {
        fn(slot.node, slot);
      }
    }
  }

  /** Дескрипторы текущего окна построчно (debug `dumpWindow`). */
  dump(): ChunkDescriptor[] {
    return this.slots.map((slot) =>
      this.generator.describe(this.gridCoords.x + slot.cx, this.gridCoords.y + slot.cy),
    );
  }

  get stats(): {
    builds: number;
    cacheHits: number;
    cached: number;
    queued: number;
    buildErrors: number;
    prefetches: number;
  } {
    return {
      builds: this.buildsTotal,
      cacheHits: this.cacheHits,
      cached: this.built.size,
      queued: this.queue.length,
      buildErrors: this.buildErrorsTotal,
      prefetches: this.prefetchesTotal,
    };
  }

  private reassign(): void {
    this.queue.length = 0;
    const previous = new Set(this.keys);
    this.keys.clear();
    for (const slot of this.slots) {
      const gx = this.gridCoords.x + slot.cx;
      const gy = this.gridCoords.y + slot.cy;
      const key = Generator.key(gx, gy);
      this.keys.add(key);
      if (!previous.has(key)) {
        this.events.emit('enter', { key, descriptor: this.generator.describe(gx, gy) });
      }
      if (slot.key === key && slot.node !== null && !slot.node.placeholder) {
        // Освежаем позицию в LRU: чанки окна вытесняются последними.
        this.remember(key, slot.node);
        continue;
      }
      const cached = this.built.get(key);
      if (cached !== undefined) {
        this.cacheHits++;
        this.remember(key, cached);
        slot.key = key;
        this.attach(slot, cached);
        continue;
      }
      const descriptor = this.generator.describe(gx, gy);
      slot.key = key;
      this.attach(slot, this.builder.buildPlaceholder(descriptor));
      this.queue.push(slot);
    }
    this.queue.sort((a, b) => a.cx * a.cx + a.cy * a.cy - (b.cx * b.cx + b.cy * b.cy));
    for (const key of previous) {
      if (!this.keys.has(key)) {
        this.events.emit('leave', { key });
      }
    }
  }

  private attach(slot: Slot, node: ChunkNode): void {
    if (slot.node === node) {
      return;
    }
    if (slot.node !== null) {
      slot.holder.remove(slot.node);
      if (slot.node.placeholder) {
        this.builder.dispose(slot.node);
      }
    }
    if (node.parent !== null) {
      node.parent.remove(node);
    }
    slot.holder.add(node);
    slot.node = node;
  }

  /** LRU: свежий доступ — в конец; лишнее вытесняется и освобождается, если не в окне. */
  private remember(key: string, node: ChunkNode): void {
    this.built.delete(key);
    this.built.set(key, node);
    while (this.built.size > this.cacheCapacity) {
      const oldest = this.built.keys().next();
      if (oldest.done === true) {
        break;
      }
      const victim = this.built.get(oldest.value);
      this.built.delete(oldest.value);
      if (victim !== undefined && victim.parent === null) {
        this.builder.dispose(victim);
      }
    }
  }
}
