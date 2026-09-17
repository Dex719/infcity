import { describe, expect, it } from 'vitest';
import { LRT, TRAIN, WORLD } from '@/config';
import {
  describeLrt,
  isCorridorRow,
  isNsCorridorColumn,
  isStationColumn,
  isStationRow,
  nearestCorridorRow,
} from '@/world/LrtPlanner';

describe('LrtPlanner (FR-5.1, FR-5.2)', () => {
  it('в стартовом окне 9×9 ровно один ряд коридора и он проходит через gy = 0 (AC-5.1)', () => {
    const half = (WORLD.WINDOW_SIZE - 1) / 2;
    const rows: number[] = [];
    for (let gy = -half; gy <= half; gy++) {
      if (isCorridorRow(gy)) {
        rows.push(gy);
      }
    }
    expect(rows).toEqual([0]);
  });

  it('коридоры повторяются с шагом PERIOD, в том числе на отрицательных gy', () => {
    for (let gy = -100; gy <= 100; gy++) {
      expect(isCorridorRow(gy)).toBe(((gy % LRT.PERIOD) + LRT.PERIOD) % LRT.PERIOD === 0);
    }
  });

  it('станции только в коридоре и через каждые STATION_PERIOD чанков', () => {
    for (let gx = -20; gx <= 20; gx++) {
      expect(describeLrt(gx, 0).station).toBe(isStationColumn(gx));
      expect(describeLrt(gx, 1)).toMatchObject({ corridor: null, station: false });
    }
    expect(describeLrt(0, 8)).toMatchObject({ corridor: 'EW', station: true });
    expect(describeLrt(-3, -8)).toMatchObject({ corridor: 'EW', station: true });
    expect(describeLrt(4, 16)).toMatchObject({ corridor: 'EW', station: false });
  });

  it('ближайший ряд коридора', () => {
    expect(nearestCorridorRow(3)).toBe(0);
    expect(nearestCorridorRow(5)).toBe(8);
    expect(nearestCorridorRow(-5)).toBe(-8);
  });
});

describe('LRT N–S (TSK-072)', () => {
  it('столбцы N–S каждые NS_PERIOD со смещением; стартовое окно их не содержит', () => {
    expect(isNsCorridorColumn(LRT.NS_OFFSET)).toBe(true);
    expect(isNsCorridorColumn(LRT.NS_OFFSET + LRT.NS_PERIOD)).toBe(true);
    for (let gx = -4; gx <= 4; gx++) {
      expect(isNsCorridorColumn(gx)).toBe(false);
    }
    expect(isStationRow(0)).toBe(true);
    expect(isStationRow(1)).toBe(false);
  });

  it('развязка: балка N–S выше поездов E–W (нет наложения)', () => {
    const ewTrainTop = LRT.BEAM_HEIGHT + 0.7 + 1.5 + 0.3;
    expect(LRT.NS_BEAM_HEIGHT - 1.2).toBeGreaterThan(ewTrainTop);
    expect(TRAIN.MAX_INSTANCES).toBeGreaterThanOrEqual(8 * 3);
  });
});
