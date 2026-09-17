import { Group } from 'three';
import { WORLD } from '@/config';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';
import type { ChunkNode } from './ChunkNode';

/** Сборщик чанков: полноценная сборка, быстрый плейсхолдер и освобождение (design C7). */
export interface ChunkBuilder {
  build(descriptor: ChunkDescriptor): ChunkNode;
  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode;
  dispose(node: ChunkNode): void;
}

/** Слот окна: фиксированная позиция, содержимое подменяется при сдвиге. */
export interface Slot {
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

  private readonly built = new Map<string, ChunkNode>();
  private readonly queue: Slot[] = [];
  private buildsTotal = 0;
  private cacheHits = 0;

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
        this.slots.push({ cx, cy, holder, key: null, node: null });
      }
    }
  }

  /** Ставит окно на чанк `(gx, gy)`; корень остаётся на месте. */
  setCenter(gx: number, gy: number): void {
    this.gridCoords.x = gx;
    this.gridCoords.y = gy;
    this.reassign();
  }

  /** Сдвиг окна на `(dx, dy)` чанков; корень уже сдвинут `PanControls`, здесь — только содержимое. */
  move(dx: number, dy: number): void {
    this.setCenter(this.gridCoords.x + dx, this.gridCoords.y + dy);
  }

  /** Собирает до `BUILD_PER_FRAME` чанков из очереди; возвращает число собранных. */
  update(perFrame: number = WORLD.BUILD_PER_FRAME): number {
    let built = 0;
    while (built < perFrame) {
      const slot = this.queue.shift();
      if (slot === undefined) {
        break;
      }
      if (slot.key === null || slot.node === null || !slot.node.placeholder) {
        continue;
      }
      const descriptor = slot.node.descriptor;
      const cached = this.built.get(slot.key);
      const node = cached ?? this.builder.build(descriptor);
      if (cached === undefined) {
        this.buildsTotal++;
        this.remember(slot.key, node);
      }
      this.attach(slot, node);
      built++;
    }
    return built;
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

  get stats(): { builds: number; cacheHits: number; cached: number; queued: number } {
    return {
      builds: this.buildsTotal,
      cacheHits: this.cacheHits,
      cached: this.built.size,
      queued: this.queue.length,
    };
  }

  private reassign(): void {
    this.queue.length = 0;
    for (const slot of this.slots) {
      const gx = this.gridCoords.x + slot.cx;
      const gy = this.gridCoords.y + slot.cy;
      const key = Generator.key(gx, gy);
      if (slot.key === key && slot.node !== null && !slot.node.placeholder) {
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
