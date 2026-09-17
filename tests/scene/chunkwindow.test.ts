import { describe, expect, it } from 'vitest';
import { WORLD } from '@/config';
import { ChunkNode } from '@/scene/ChunkNode';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';

class CountingBuilder implements ChunkBuilder {
  builds = 0;
  placeholders = 0;
  disposed = 0;

  build(descriptor: ChunkDescriptor): ChunkNode {
    this.builds++;
    return new ChunkNode(descriptor);
  }

  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
    this.placeholders++;
    const node = new ChunkNode(descriptor);
    node.placeholder = true;
    return node;
  }

  dispose(): void {
    this.disposed++;
  }
}

function makeWindow(cache: number = WORLD.CACHE_CHUNKS): {
  cw: ChunkWindow;
  builder: CountingBuilder;
} {
  const builder = new CountingBuilder();
  const cw = new ChunkWindow(new Generator('astana'), builder, WORLD.WINDOW_SIZE, cache);
  return { cw, builder };
}

describe('ChunkWindow (FR-1, design C6)', () => {
  it('стартовое окно: 81 слот, после сборки пустых нет (AC-1.2)', () => {
    const { cw, builder } = makeWindow();
    cw.setCenter(0, 0);
    expect(cw.slots).toHaveLength(81);
    expect(cw.emptySlots()).toBe(81);
    let guard = 0;
    while (cw.emptySlots() > 0 && guard++ < 100) {
      expect(cw.update()).toBeLessThanOrEqual(WORLD.BUILD_PER_FRAME);
    }
    expect(cw.emptySlots()).toBe(0);
    expect(builder.builds).toBe(81);
    const center = cw.chunkAt(0, 0);
    expect(center?.descriptor.key).toBe('0,0');
    expect(cw.chunkAt(1, -1)?.descriptor.landmark).toBe('baiterek');
  });

  it('очередь сборки идёт от центра к краям', () => {
    const { cw } = makeWindow();
    cw.setCenter(0, 0);
    cw.update(1);
    expect(cw.chunkAt(0, 0)).toBeDefined();
    expect(cw.chunkAt(4, 4)).toBeUndefined();
  });

  it('move(1,0): gridCoords сдвигается, пересобираются только 9 новых чанков', () => {
    const { cw, builder } = makeWindow();
    cw.setCenter(0, 0);
    cw.update(81);
    cw.move(1, 0);
    expect(cw.gridCoords).toEqual({ x: 1, y: 0 });
    expect(cw.emptySlots()).toBe(9);
    cw.update(81);
    expect(builder.builds).toBe(90);
    expect(cw.chunkAt(5, 0)?.descriptor.key).toBe('5,0');
    expect(cw.chunkAt(-4, 0)).toBeUndefined();
  });

  it('возврат назад берёт чанки из LRU без пересборки', () => {
    const { cw, builder } = makeWindow();
    cw.setCenter(0, 0);
    cw.update(81);
    cw.move(1, 0);
    cw.update(81);
    cw.move(-1, 0);
    expect(cw.emptySlots()).toBe(0);
    expect(builder.builds).toBe(90);
    expect(cw.stats.cacheHits).toBeGreaterThanOrEqual(9);
  });

  it('ноды окна остаются детьми своих слотов, слот держит ровно один чанк', () => {
    const { cw } = makeWindow();
    cw.setCenter(3, -2);
    cw.update(81);
    for (const slot of cw.slots) {
      expect(slot.holder.children).toHaveLength(1);
      expect(slot.node?.descriptor.gx).toBe(3 + slot.cx);
      expect(slot.node?.descriptor.gy).toBe(-2 + slot.cy);
    }
  });

  it('LRU вытесняет чанки вне окна и освобождает их', () => {
    const { cw, builder } = makeWindow(90);
    cw.setCenter(0, 0);
    cw.update(81);
    for (let step = 1; step <= 5; step++) {
      cw.move(1, 0);
      cw.update(81);
    }
    expect(cw.stats.cached).toBeLessThanOrEqual(90);
    expect(builder.disposed).toBeGreaterThan(0);
    expect(cw.emptySlots()).toBe(0);
  });

  it('dump() отдаёт дескрипторы окна в порядке слотов', () => {
    const { cw } = makeWindow();
    cw.setCenter(2, 2);
    const dump = cw.dump();
    expect(dump).toHaveLength(81);
    expect(dump[0]?.key).toBe('-2,-2');
    expect(dump[40]?.key).toBe('2,2');
    expect(dump[80]?.key).toBe('6,6');
  });
});
