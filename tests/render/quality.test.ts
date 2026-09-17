import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER, TRAFFIC } from '@/config';
import { profileFor } from '@/render/Profile';
import { median, QualityController, type QualityTarget } from '@/render/Quality';

function target(): QualityTarget & {
  shadows: ReturnType<typeof vi.fn>;
  dpr: ReturnType<typeof vi.fn>;
  cars: ReturnType<typeof vi.fn>;
} {
  const shadows = vi.fn();
  const dpr = vi.fn();
  const cars = vi.fn();
  return {
    shadows,
    dpr,
    cars,
    setShadowResolution: shadows,
    setPixelRatio: dpr,
    setCarProbability: cars,
  };
}

describe('median', () => {
  it('нечётное и чётное число значений, пустой массив', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('QualityController — автопонижение (NFR-1, TSK-060)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('high: медиана < 25 за 5 с → тени 1024; затем DPR 1; затем P_CAR 0.2; дальше — ничего', () => {
    const t = target();
    const q = new QualityController(t, profileFor('high', false), { enabled: true });
    for (let i = 0; i < 4; i++) {
      expect(q.observe(20)).toBeNull();
    }
    expect(q.observe(20)).toBe('shadows');
    expect(t.shadows).toHaveBeenCalledWith(RENDER.SHADOW_RES.mobile);
    expect(q.info.level).toBe(1);

    for (let i = 0; i < 5; i++) {
      q.observe(24);
    }
    expect(q.info.steps).toEqual(['shadows', 'dpr']);
    expect(t.dpr).toHaveBeenCalledWith(1);

    for (let i = 0; i < 5; i++) {
      q.observe(10);
    }
    expect(q.info.steps).toEqual(['shadows', 'dpr', 'traffic']);
    expect(t.cars).toHaveBeenCalledWith(TRAFFIC.P_CAR.mobile);
    expect(q.downgrade()).toBeNull();
  });

  it('хороший FPS не понижает; окно замеров сбрасывается после решения', () => {
    const t = target();
    const q = new QualityController(t, profileFor('high', false), { enabled: true });
    for (let i = 0; i < 12; i++) {
      expect(q.observe(60)).toBeNull();
    }
    // Один плохой сэмпл внутри окна из хороших — медиана выше порога.
    q.observe(5);
    for (let i = 0; i < 4; i++) {
      q.observe(60);
    }
    expect(q.info.level).toBe(0);
    expect(t.shadows).not.toHaveBeenCalled();
  });

  it('medium (mobile): шаг теней пропускается как бесполезный, первым идёт DPR', () => {
    const t = target();
    const q = new QualityController(t, profileFor('medium', true), { enabled: true });
    expect(q.downgrade()).toBe('dpr');
    expect(t.shadows).not.toHaveBeenCalled();
    expect(t.dpr).toHaveBeenCalledWith(1);
    // P_CAR уже мобильный → следующего шага нет.
    expect(q.downgrade()).toBeNull();
  });

  it('low: понижать нечего', () => {
    const t = target();
    const q = new QualityController(t, profileFor('low', false), { enabled: true });
    expect(q.downgrade()).toBeNull();
    expect(q.info.level).toBe(3);
  });

  it('явный ?quality= отключает автопонижение; fps=0 (скрытая вкладка) игнорируется', () => {
    const t = target();
    const q = new QualityController(t, profileFor('high', false), { enabled: false });
    for (let i = 0; i < 10; i++) {
      expect(q.observe(5)).toBeNull();
    }
    const auto = new QualityController(t, profileFor('high', false), { enabled: true });
    for (let i = 0; i < 10; i++) {
      expect(auto.observe(0)).toBeNull();
    }
    expect(auto.info.level).toBe(0);
  });
});
