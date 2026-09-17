import { describe, expect, it } from 'vitest';
import { TRAIN, WORLD } from '@/config';
import { MobSystem } from '@/mobs/MobSystem';
import type { Train } from '@/mobs/Train';
import { profileFor } from '@/render/Profile';
import { ChunkNode } from '@/scene/ChunkNode';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';
import paletteJson from '../../public/assets/palette.json';

class NodeOnlyBuilder implements ChunkBuilder {
  build(descriptor: ChunkDescriptor): ChunkNode {
    return new ChunkNode(descriptor);
  }
  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    node.placeholder = true;
    return node;
  }
  dispose(): void {
    // геометрии нет
  }
}

/** Поездов на самом загруженном коридоре (AC-5.4 — на коридор). */
function maxPerCorridor(trains: readonly Train[]): number {
  const counts = new Map<string, number>();
  for (const t of trains) {
    const key = `${t.axis}:${String(t.lineIndex)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function setup(seed: string): { window: ChunkWindow; mobs: MobSystem } {
  const window = new ChunkWindow(new Generator(seed), new NodeOnlyBuilder());
  const mobs = new MobSystem(
    window,
    new Materials(parsePalette(paletteJson)),
    profileFor('high', false),
  );
  window.setCenter(0, 0);
  window.update(window.size * window.size);
  return { window, mobs };
}

describe('Симуляция мобов без рендера (AC-6.1, AC-6.2, AC-5.4)', () => {
  it('стартовый спавн: машины не пересекаются, поездов 1…4', () => {
    const { mobs } = setup('astana');
    expect(mobs.overlaps()).toBe(0);
    const stats = mobs.stats();
    expect(stats.cars).toBeGreaterThan(50);
    expect(stats.trains).toBeGreaterThanOrEqual(TRAIN.IN_WINDOW.min);
    expect(stats.trains).toBeLessThanOrEqual(TRAIN.IN_WINDOW.max);
  });

  it('2 минуты при seed=astana со сдвигами окна: 0 пересечений, 0 заторов, поезда 1…4', () => {
    const { window, mobs } = setup('astana');
    const dt = 1 / 60;
    const violations: string[] = [];
    for (let second = 1; second <= 120; second++) {
      if (second % 20 === 0) {
        // Сдвиг окна на чанк: корень окна сдвигается на −60 (как делает PanControls).
        window.root.position.x -= WORLD.CHUNK_SIZE;
        window.move(1, 0);
        window.update(window.size * window.size);
      }
      for (let i = 0; i < 60; i++) {
        mobs.update(dt);
      }
      const stats = mobs.stats();
      const overlaps = mobs.overlaps();
      if (overlaps > 0) {
        violations.push(`t=${String(second)}s overlaps=${String(overlaps)}`);
      }
      if (stats.stuckCars > 0) {
        violations.push(`t=${String(second)}s stuck=${String(stats.stuckCars)}`);
      }
      if (
        stats.trains < TRAIN.IN_WINDOW.min ||
        maxPerCorridor(mobs.allTrains) > TRAIN.IN_WINDOW.max
      ) {
        violations.push(`t=${String(second)}s trains=${String(stats.trains)}`);
      }
    }
    expect(violations).toEqual([]);
  }, 60_000);

  it('неподвижное окно 3 минуты: трафик не вымирает, заторов и пересечений нет', () => {
    const { mobs } = setup('astana');
    const initial = mobs.stats().cars;
    const dt = 1 / 60;
    const violations: string[] = [];
    for (let second = 1; second <= 180; second++) {
      for (let i = 0; i < 60; i++) {
        mobs.update(dt);
      }
      const stats = mobs.stats();
      if (mobs.overlaps() > 0) {
        violations.push(`t=${String(second)}s overlaps`);
      }
      if (stats.stuckCars > 0) {
        violations.push(`t=${String(second)}s stuck=${String(stats.stuckCars)}`);
      }
      if (
        stats.trains < TRAIN.IN_WINDOW.min ||
        maxPerCorridor(mobs.allTrains) > TRAIN.IN_WINDOW.max
      ) {
        violations.push(`t=${String(second)}s trains=${String(stats.trains)}`);
      }
    }
    expect(violations).toEqual([]);
    expect(mobs.stats().cars).toBeGreaterThanOrEqual(Math.floor(initial * 0.9));
    expect(mobs.stats().clouds).toBeGreaterThan(0);
  }, 60_000);

  it('другие seed: старт без пересечений', () => {
    for (const seed of ['nur-sultan', 'esil', 'a1b2c3d4']) {
      const { mobs } = setup(seed);
      expect(mobs.overlaps(), seed).toBe(0);
    }
  });

  it('setCarProbability отсекает машины с roll выше порога; reset пересоздаёт всех', () => {
    const { mobs } = setup('astana');
    const before = mobs.stats().cars;
    mobs.setCarProbability(0.2);
    const after = mobs.stats().cars;
    expect(after).toBeLessThan(before);
    for (const car of mobs.allCars()) {
      expect(car.roll).toBeLessThan(0.2);
    }
    mobs.reset();
    expect(mobs.stats().cars).toBe(after);
    expect(mobs.overlaps()).toBe(0);
  });
});
