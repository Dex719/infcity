import { describe, expect, it } from 'vitest';
import { LANDMARKS, LANDMARK_IDS, WORLD, type LandmarkId } from '@/config';
import { Generator } from '@/world/Generator';
import { LandmarkPlanner } from '@/world/LandmarkPlanner';
import { chebyshev } from '@/world/math';

interface Placed {
  gx: number;
  gy: number;
  id: LandmarkId;
}

function collect(planner: LandmarkPlanner, x0: number, y0: number, size: number): Placed[] {
  const placed: Placed[] = [];
  for (let gy = y0; gy < y0 + size; gy++) {
    for (let gx = x0; gx < x0 + size; gx++) {
      const id = planner.pick(gx, gy);
      if (id !== null) {
        placed.push({ gx, gy, id });
      }
    }
  }
  return placed;
}

describe('LandmarkPlanner — стартовая зона (FR-4.1)', () => {
  it('для 100 seed фиксированные ландмарки стоят на своих местах и в окне нет других', () => {
    for (let i = 0; i < 100; i++) {
      const gen = new Generator(`start-${String(i)}`);
      const window = gen.describeWindow(0, 0);
      const landmarks = window.filter((c) => c.landmark !== null);
      expect(landmarks.map((c) => `${c.landmark ?? ''}@${c.key}`).sort()).toEqual(
        LANDMARKS.FIXED.map((f) => `${f.id}@${String(f.gx)},${String(f.gy)}`).sort(),
      );
      for (const chunk of landmarks) {
        expect(chunk.block).toBe('landmark');
      }
    }
  });

  it('в стартовой зоне радиуса START_ZONE_RADIUS случайных ландмарков нет', () => {
    const planner = new LandmarkPlanner(12345, [...LANDMARK_IDS]);
    const r = WORLD.START_ZONE_RADIUS;
    for (let gx = -r; gx <= r; gx++) {
      for (let gy = -r; gy <= r; gy++) {
        const id = planner.pick(gx, gy);
        expect(id).toBe(LandmarkPlanner.fixed(gx, gy));
      }
    }
  });
});

describe('LandmarkPlanner — редкие ландмарки (AC-4.2)', () => {
  const SIZE = 100;
  const ORIGIN = 1000;

  it('при всех 5 типах доля 1/25…1/40, одинаковые не ближе 6, соседних нет', () => {
    const planner = new LandmarkPlanner(777, [...LANDMARK_IDS]);
    const placed = collect(planner, ORIGIN, ORIGIN, SIZE);
    const share = placed.length / (SIZE * SIZE);
    expect(share).toBeGreaterThanOrEqual(1 / 40);
    expect(share).toBeLessThanOrEqual(1 / 25);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) {
          continue;
        }
        const distance = chebyshev(a.gx, a.gy, b.gx, b.gy);
        expect(distance).toBeGreaterThan(LANDMARKS.ADJACENCY_RADIUS);
        if (a.id === b.id) {
          expect(distance).toBeGreaterThanOrEqual(LANDMARKS.RADIUS + 1);
        }
      }
    }
    const types = new Set(placed.map((p) => p.id));
    expect(types.size).toBe(LANDMARK_IDS.length);
  });

  it('при 2 включённых типах доля пропорционально ниже: 1/100…1/55', () => {
    const planner = new LandmarkPlanner(777, ['baiterek', 'khan-shatyr']);
    expect(new LandmarkPlanner(777).enabledIds).toEqual(LANDMARKS.ENABLED);
    const placed = collect(planner, ORIGIN, ORIGIN, SIZE);
    const share = placed.length / (SIZE * SIZE);
    expect(share).toBeGreaterThanOrEqual(1 / 100);
    expect(share).toBeLessThanOrEqual(1 / 55);
  });

  it('включение новых типов не сдвигает уже существующие ландмарки', () => {
    const two = collect(
      new LandmarkPlanner(777, ['baiterek', 'khan-shatyr']),
      ORIGIN,
      ORIGIN,
      SIZE,
    );
    const five = collect(new LandmarkPlanner(777, [...LANDMARK_IDS]), ORIGIN, ORIGIN, SIZE);
    const fiveKeys = new Map(five.map((p) => [`${String(p.gx)},${String(p.gy)}`, p.id]));
    let kept = 0;
    for (const p of two) {
      if (fiveKeys.get(`${String(p.gx)},${String(p.gy)}`) === p.id) {
        kept++;
      }
    }
    // Потери допустимы только из-за подавления соседями новых типов.
    expect(kept / two.length).toBeGreaterThan(0.85);
  });

  it('результат детерминирован между экземплярами', () => {
    const a = collect(new LandmarkPlanner(42), ORIGIN, ORIGIN, 40);
    const b = collect(new LandmarkPlanner(42), ORIGIN, ORIGIN, 40);
    expect(a).toEqual(b);
  });
});
