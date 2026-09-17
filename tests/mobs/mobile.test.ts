import { describe, expect, it } from 'vitest';
import { TRAFFIC, WORLD } from '@/config';
import { Car } from '@/mobs/Car';
import { Cloud } from '@/mobs/Cloud';
import { LANES, isOnIntersection, laneStart } from '@/mobs/Lanes';

const HALF = WORLD.CHUNK_SIZE / 2;

describe('MobileObject.wrap — перенос между чанками (FR-6.4, AC-6.3)', () => {
  it('пересечение восточной границы: чанк +1 по x, локальная x сворачивается', () => {
    const car = new Car(3, -2, { lane: 3, model: 0, dir: 1, roll: 0.3 }, 2);
    car.x = HALF - 0.5;
    const worldBefore = car.worldX(0);
    car.update(0.1); // +1.5 юнита
    const worldAfterMove = car.worldX(0);
    const transfer = car.wrap();
    expect(transfer).toEqual({ gx: 4, gy: -2, key: '4,-2' });
    car.moveTo(transfer ?? { gx: 0, gy: 0, key: '0,0' });
    expect(car.x).toBeCloseTo(-HALF + 1, 5);
    expect(Math.abs(car.worldX(0) - worldAfterMove)).toBeLessThan(0.05);
    expect(worldAfterMove - worldBefore).toBeCloseTo(TRAFFIC.MAX_SPEED * 0.1, 5);
  });

  it('пересечение северной границы: чанк −1 по y', () => {
    const car = new Car(0, 0, { lane: 1, model: 1, dir: -1, roll: 0.1 }, 2);
    car.z = -HALF + 0.2;
    car.update(0.05);
    const transfer = car.wrap();
    expect(transfer?.gy).toBe(-1);
    expect(transfer?.gx).toBe(0);
    expect(car.z).toBeLessThan(HALF);
    expect(car.z).toBeGreaterThanOrEqual(-HALF);
  });

  it('без пересечения границы wrap возвращает null', () => {
    const car = new Car(0, 0, { lane: 0, model: 0, dir: 1, roll: 0.2 }, 2);
    car.update(0.016);
    expect(car.wrap()).toBeNull();
  });

  it('облако дрейфует и переносится, масштаб дышит в пределах ±5 %', () => {
    const cloud = new Cloud(0, 0, { model: 0, x: 20, z: 0, phase: 0.3, speedMul: 1.2 });
    let transfers = 0;
    const scales: number[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      cloud.update(1 / 60, i / 60);
      scales.push(cloud.scale);
      if (cloud.wrap() !== null) {
        transfers++;
      }
    }
    expect(transfers).toBeGreaterThanOrEqual(1);
    const base = (Math.max(...scales) + Math.min(...scales)) / 2;
    expect(Math.max(...scales) / base).toBeLessThanOrEqual(1.051);
    expect(Math.min(...scales) / base).toBeGreaterThanOrEqual(0.949);
  });
});

describe('Lanes — правостороннее движение', () => {
  it('восточная полоса дороги N–S едет на север, южная полоса E–W — на восток', () => {
    const east = LANES.find((l) => l.axis === 'z' && l.offset === -22.5);
    const south = LANES.find((l) => l.axis === 'x' && l.offset === -22.5);
    expect(east?.dir).toBe(-1);
    expect(south?.dir).toBe(1);
  });

  it('стартовые позиции лежат внутри чанка на своей полосе', () => {
    for (const lane of LANES) {
      for (const t of [0, 0.5, 0.999]) {
        const p = laneStart(lane, t);
        expect(Math.abs(p.x)).toBeLessThan(HALF + 1e-9);
        expect(Math.abs(p.z)).toBeLessThan(HALF + 1e-9);
        expect(lane.axis === 'x' ? p.z : p.x).toBe(lane.offset);
      }
    }
  });

  it('зона перекрёстка — NW-угол чанка', () => {
    expect(isOnIntersection(-25, -25)).toBe(true);
    expect(isOnIntersection(-25, 0)).toBe(false);
    expect(isOnIntersection(5, 5)).toBe(false);
  });
});
