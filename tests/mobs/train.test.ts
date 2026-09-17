import { describe, expect, it } from 'vitest';
import { TRAIN, WORLD } from '@/config';
import { TRAIN_SPAWN_PERIOD, Train } from '@/mobs/Train';

describe('Train — профиль движения у станции (AC-5.3)', () => {
  it('тормозит, останавливается у центра станции, стоит 3–5 с и разгоняется', () => {
    // Чанк gx=0 — станционный (0 mod 3). Стартуем западнее центра на 25 юнитов.
    const train = new Train(1, 0, 0, -25, 1);
    let dwell = 0;
    let stopX: number | null = null;
    let reachedMax = false;
    for (let i = 0; i < 60 * 20; i++) {
      train.update(1 / 60);
      if (train.state === 'dwell') {
        dwell += 1 / 60;
        stopX ??= train.x;
      }
      if (train.state === 'moving' && dwell > 0 && train.speed >= TRAIN.MAX_SPEED) {
        reachedMax = true;
        break;
      }
    }
    expect(stopX).not.toBeNull();
    expect(Math.abs(stopX ?? 99)).toBeLessThanOrEqual(TRAIN.STOP_TOLERANCE);
    expect(dwell).toBeGreaterThanOrEqual(TRAIN.DWELL.min - 0.05);
    expect(dwell).toBeLessThanOrEqual(TRAIN.DWELL.max + 0.05);
    expect(reachedMax).toBe(true);
  });

  it('на нестанционном чанке не тормозит', () => {
    const train = new Train(1, 1, 0, -25, 1);
    for (let i = 0; i < 60 * 3; i++) {
      train.update(1 / 60);
    }
    expect(train.state).toBe('moving');
    expect(train.speed).toBe(TRAIN.MAX_SPEED);
  });

  it('после остановки повторно у той же станции не тормозит, у следующей — тормозит', () => {
    const train = new Train(1, 0, 0, -20, 1);
    let stops = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const wasDwell = train.state === 'dwell';
      train.update(1 / 60);
      const transfer = train.wrap();
      if (transfer !== null) {
        train.moveTo(transfer);
      }
      if (!wasDwell && train.state === 'dwell') {
        stops++;
      }
    }
    // За 40 с при 20 юн/с проходит ~13 чанков: станции на gx=0 и gx=3, 6, 9, 12.
    expect(stops).toBeGreaterThanOrEqual(3);
    expect(stops).toBeLessThanOrEqual(5);
  });

  it('поезд впереди ближе чанка заставляет притормозить', () => {
    const train = new Train(1, 1, 0, 0, 1);
    train.step(1 / 60, WORLD.CHUNK_SIZE / 2);
    expect(train.speed).toBeLessThan(TRAIN.MAX_SPEED);
  });

  it('спавн: восточные поезда каждые PERIOD чанков, западные со сдвигом; в окне 1…4', () => {
    let east = 0;
    let west = 0;
    for (let gx = -4; gx <= 4; gx++) {
      if (Train.spawnsAt(gx, 1)) {
        east++;
      }
      if (Train.spawnsAt(gx, -1)) {
        west++;
      }
    }
    expect(east + west).toBeGreaterThanOrEqual(TRAIN.IN_WINDOW.min);
    expect(east + west).toBeLessThanOrEqual(TRAIN.IN_WINDOW.max);
    expect(Train.spawnsAt(TRAIN_SPAWN_PERIOD * 7, 1)).toBe(true);
    expect(Train.spawnsAt(-TRAIN_SPAWN_PERIOD, 1)).toBe(true);
  });
});
