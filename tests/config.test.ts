import { describe, expect, it } from 'vitest';
import {
  CAMERA,
  CHUNK_LAYOUT,
  CLOUD,
  CONFIG,
  LANDMARKS,
  LANDMARK_IDS,
  LRT,
  RENDER,
  TRAFFIC,
  TRAIN,
  WORLD,
} from '@/config';
import { PALETTE_KEYS, parsePalette } from '@/scene/palette';
import paletteJson from '../public/assets/palette.json';
import winterJson from '../public/assets/palette.winter.json';

describe('WORLD', () => {
  it('окно нечётное — есть центральный слот', () => {
    expect(WORLD.WINDOW_SIZE % 2).toBe(1);
  });

  it('кэш вмещает всё окно целиком (FR-1.4)', () => {
    expect(WORLD.CACHE_CHUNKS).toBeGreaterThanOrEqual(WORLD.WINDOW_SIZE ** 2);
  });

  it('стартовая зона фиксированных ландмарков умещается в окне (FR-4.1)', () => {
    expect(WORLD.START_ZONE_RADIUS).toBeLessThanOrEqual((WORLD.WINDOW_SIZE - 1) / 2);
  });

  it('за кадр собирается меньше чанков, чем появляется при сдвиге на ряд', () => {
    expect(WORLD.BUILD_PER_FRAME).toBeGreaterThan(0);
    expect(WORLD.BUILD_PER_FRAME).toBeLessThan(WORLD.WINDOW_SIZE);
  });

  it('бюджет сборки укладывается в 8 мс из NFR-1 (BUG-9)', () => {
    expect(WORLD.BUILD_BUDGET_MS).toBeGreaterThan(0);
    expect(WORLD.BUILD_BUDGET_MS).toBeLessThanOrEqual(8);
  });

  it('шаг симуляции ограничен 50 мс (D8)', () => {
    expect(WORLD.MAX_DT).toBeCloseTo(0.05);
  });
});

describe('CAMERA и PAN', () => {
  it('диапазон высот корректен и включает стартовую высоту (FR-8.2)', () => {
    expect(CAMERA.HEIGHT_MIN).toBeLessThan(CAMERA.HEIGHT_MAX);
    expect(CAMERA.HEIGHT_START).toBeGreaterThanOrEqual(CAMERA.HEIGHT_MIN);
    expect(CAMERA.HEIGHT_START).toBeLessThanOrEqual(CAMERA.HEIGHT_MAX);
  });

  it('минимальная высота камеры выше самого высокого ландмарка (bugfix BUG-1)', () => {
    const tallest = Math.max(...Object.values(LANDMARKS.HEIGHT));
    expect(CAMERA.HEIGHT_MIN).toBeGreaterThanOrEqual(tallest + 8);
  });

  it('ближняя плоскость ближе дальней и дальняя перекрывает туман (FR-9.3)', () => {
    expect(CAMERA.NEAR).toBeLessThan(CAMERA.FAR);
    expect(CAMERA.FAR).toBeGreaterThanOrEqual(RENDER.FOG.far);
  });

  it('опорная высота панорамирования лежит в допустимом диапазоне (AC-8.1)', () => {
    expect(CONFIG.PAN.REFERENCE_HEIGHT).toBeGreaterThanOrEqual(CAMERA.HEIGHT_MIN);
    expect(CONFIG.PAN.REFERENCE_HEIGHT).toBeLessThanOrEqual(CAMERA.HEIGHT_MAX);
  });
});

describe('RENDER', () => {
  it('туман: near < far (FR-9.3)', () => {
    expect(RENDER.FOG.near).toBeLessThan(RENDER.FOG.far);
  });

  it('фрустум тени: near < far (design C12)', () => {
    expect(RENDER.SHADOW_CAMERA.near).toBeLessThan(RENDER.SHADOW_CAMERA.far);
    expect(RENDER.SHADOW_CAMERA.left).toBeLessThan(RENDER.SHADOW_CAMERA.right);
    expect(RENDER.SHADOW_CAMERA.bottom).toBeLessThan(RENDER.SHADOW_CAMERA.top);
  });

  it('карта теней — степень двойки, мобильный профиль не тяжелее десктопного (NFR-1)', () => {
    for (const res of [RENDER.SHADOW_RES.desktop, RENDER.SHADOW_RES.mobile]) {
      expect(Number.isInteger(Math.log2(res))).toBe(true);
    }
    expect(RENDER.SHADOW_RES.mobile).toBeLessThanOrEqual(RENDER.SHADOW_RES.desktop);
  });

  it('порог автопонижения ниже целевого FPS (NFR-1)', () => {
    expect(RENDER.AUTO_DOWNGRADE.fps).toBeLessThan(RENDER.BUDGET.fpsMobile);
    expect(RENDER.BUDGET.fpsMobile).toBeLessThanOrEqual(RENDER.BUDGET.fpsDesktop);
  });

  it('DPR ограничен сверху (NFR-1)', () => {
    expect(RENDER.MAX_DPR.desktop).toBeGreaterThan(1);
    expect(RENDER.MAX_DPR.mobile).toBeGreaterThanOrEqual(RENDER.MAX_DPR.desktop);
  });
});

describe('LRT', () => {
  it('ровно один коридор попадает в окно 9×9 (AC-5.1)', () => {
    const half = (WORLD.WINDOW_SIZE - 1) / 2;
    expect(LRT.PERIOD).toBeGreaterThan(half);
    expect(LRT.PERIOD).toBeGreaterThanOrEqual(WORLD.WINDOW_SIZE - 1);
  });

  it('станции встречаются чаще коридоров и видны в окне (FR-5.2)', () => {
    expect(LRT.STATION_PERIOD).toBeLessThan(LRT.PERIOD);
    expect(LRT.STATION_PERIOD).toBeLessThanOrEqual(WORLD.WINDOW_SIZE);
  });

  it('нитки эстакады лежат по обе стороны оси северной дороги (design C10)', () => {
    expect(LRT.TRACK_Z.east).toBeLessThan(LRT.AXIS_Z);
    expect(LRT.TRACK_Z.west).toBeGreaterThan(LRT.AXIS_Z);
    expect(LRT.AXIS_Z).toBe(CHUNK_LAYOUT.ROAD_AXIS);
  });

  it('эстакада проходит над домами по высоте и опоры реже чанка', () => {
    expect(LRT.BEAM_HEIGHT).toBeGreaterThan(0);
    expect(LRT.PILLAR_SPACING).toBeLessThan(WORLD.CHUNK_SIZE);
    expect(LRT.PLATFORM.length).toBeLessThan(CHUNK_LAYOUT.BLOCK_SIZE);
  });

  it('шаг спавна поездов даёт не более 4 поездов в окне (AC-5.4)', () => {
    expect(LRT.SPAWN_STEP.min).toBeLessThanOrEqual(LRT.SPAWN_STEP.max);
    expect(WORLD.WINDOW_SIZE / LRT.SPAWN_STEP.min).toBeLessThanOrEqual(TRAIN.IN_WINDOW.max);
  });
});

describe('Мобы', () => {
  it('поезд быстрее машины, тормозной путь меньше чанка (FR-5.3, FR-6)', () => {
    expect(TRAIN.MAX_SPEED).toBeGreaterThan(TRAFFIC.MAX_SPEED);
    expect(TRAIN.BRAKE_DISTANCE).toBeLessThan(WORLD.CHUNK_SIZE);
    expect(TRAIN.DWELL.min).toBeLessThanOrEqual(TRAIN.DWELL.max);
  });

  it('вероятности в [0,1], мобильный профиль легче десктопного (FR-6.1, FR-7.1)', () => {
    for (const p of [TRAFFIC.P_CAR.desktop, TRAFFIC.P_CAR.mobile, CLOUD.PROBABILITY]) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
    expect(TRAFFIC.P_CAR.mobile).toBeLessThan(TRAFFIC.P_CAR.desktop);
  });

  it('радар машины короче чанка, порог сектора в [0,1] (FR-6.2)', () => {
    expect(TRAFFIC.RADAR_RADIUS).toBeLessThan(WORLD.CHUNK_SIZE);
    expect(TRAFFIC.RADAR_DOT).toBeGreaterThan(0);
    expect(TRAFFIC.RADAR_DOT).toBeLessThan(1);
    expect(TRAFFIC.LANES).toBe(CHUNK_LAYOUT.LANE_OFFSETS.length * 2);
  });

  it('anti-deadlock даёт ненулевую, но малую скорость (FR-6.5)', () => {
    expect(TRAFFIC.DEADLOCK_MIN_SPEED_FACTOR).toBeGreaterThan(0);
    expect(TRAFFIC.DEADLOCK_MIN_SPEED_FACTOR).toBeLessThan(1);
    expect(TRAFFIC.DEADLOCK_TIMEOUT).toBeGreaterThan(0);
  });

  it('облака выше самого высокого ландмарка (FR-7.1)', () => {
    expect(CLOUD.ALTITUDE).toBeGreaterThan(Math.max(...Object.values(LANDMARKS.HEIGHT)));
    expect(CLOUD.SPEED).toBeLessThan(TRAFFIC.MAX_SPEED);
  });
});

describe('Ландмарки и геометрия чанка', () => {
  it('фиксированные ландмарки внутри стартовой зоны и различны (FR-4.1)', () => {
    const ids = new Set<string>();
    for (const fixed of LANDMARKS.FIXED) {
      expect(LANDMARK_IDS).toContain(fixed.id);
      expect(Math.max(Math.abs(fixed.gx), Math.abs(fixed.gy))).toBeLessThanOrEqual(
        WORLD.START_ZONE_RADIUS,
      );
      ids.add(fixed.id);
    }
    expect(ids.size).toBe(LANDMARKS.FIXED.length);
  });

  it('дистанция между фиксированными ландмарками не меньше 1 чанка (FR-4.2)', () => {
    const [first, second] = LANDMARKS.FIXED;
    expect(Math.abs(first.gx - second.gx) + Math.abs(first.gy - second.gy)).toBeGreaterThan(1);
  });

  it('плотность ландмарков при всех 12 типах попадает в вилку 1/17…1/26 (AC-4.2, итерация 2)', () => {
    const area = (2 * LANDMARKS.RADIUS + 1) ** 2;
    const perType = (1 - Math.exp(-LANDMARKS.PROBABILITY * area)) / area;
    const total = perType * LANDMARK_IDS.length;
    expect(total).toBeLessThanOrEqual(1 / 17);
    expect(total).toBeGreaterThanOrEqual(1 / 26);
    expect(LANDMARKS.RADIUS + 1).toBe(6);
    for (const id of LANDMARKS.ENABLED) {
      expect(LANDMARK_IDS).toContain(id);
    }
  });

  it('квартал, дороги и тротуары умещаются в чанк (design C7)', () => {
    const half = WORLD.CHUNK_SIZE / 2;
    expect(CHUNK_LAYOUT.BLOCK_SIZE + CHUNK_LAYOUT.ROAD_WIDTH).toBe(WORLD.CHUNK_SIZE);
    expect(Math.abs(CHUNK_LAYOUT.ROAD_AXIS)).toBeLessThan(half);
    expect(CHUNK_LAYOUT.INTERSECTION.x).toBe(CHUNK_LAYOUT.ROAD_AXIS);
    expect(CHUNK_LAYOUT.INTERSECTION.z).toBe(CHUNK_LAYOUT.ROAD_AXIS);
    for (const lane of CHUNK_LAYOUT.LANE_OFFSETS) {
      expect(Math.abs(lane - CHUNK_LAYOUT.ROAD_AXIS)).toBeLessThan(CHUNK_LAYOUT.ROAD_WIDTH / 2);
    }
  });
});

describe('Палитра', () => {
  it('зимняя палитра валидна: снег на земле, газонах, тротуарах и крышах (FR-13, AC-13.1)', () => {
    const winter = parsePalette(winterJson);
    expect(Object.keys(winter)).toHaveLength(PALETTE_KEYS.length);
    const luminance = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    for (const key of [
      'ground',
      'grass',
      'sidewalk',
      'stone-light',
      'sand',
      'roof-red',
      'roof-dark',
    ] as const) {
      expect(luminance(winter[key]), key).toBeGreaterThan(0.85);
    }
    const saturation = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return Math.max(...rgb) - Math.min(...rgb);
    };
    // Серо-голубое небо: заметно менее насыщенное, чем летнее.
    expect(saturation(winter.sky)).toBeLessThan(saturation(parsePalette(paletteJson).sky) / 2);
  });

  it('в палитре не больше 26 цветов и ключи уникальны (FR-9.4, итерация 2: +чёрный, +жёлтый)', () => {
    expect(PALETTE_KEYS.length).toBeLessThanOrEqual(26);
    expect(new Set(PALETTE_KEYS).size).toBe(PALETTE_KEYS.length);
  });

  it('palette.json содержит все ключи в формате #rrggbb (AC-9.3)', () => {
    const palette = parsePalette(paletteJson);
    expect(Object.keys(palette)).toHaveLength(PALETTE_KEYS.length);
  });

  it('цвет солнца из конфига существует в палитре (design C12)', () => {
    expect(PALETTE_KEYS).toContain(RENDER.SUN.colorKey);
  });
});

describe('CONFIG', () => {
  it('агрегат экспортирует все группы констант (TSK-002)', () => {
    expect(Object.keys(CONFIG)).toEqual([
      'WORLD',
      'GEN',
      'LANDMARKS',
      'BLOCKS',
      'LRT',
      'RIVER',
      'TRAIN',
      'TRAFFIC',
      'CLOUD',
      'CAMERA',
      'PAN',
      'CHUNK_LAYOUT',
      'RENDER',
      'DETAIL',
      'AO',
      'ASSETS',
      'UI',
    ]);
  });

  it('seed нормализуется по единому шаблону (FR-2.1)', () => {
    expect(CONFIG.GEN.SEED_PATTERN.test('astana')).toBe(true);
    expect(CONFIG.GEN.SEED_PATTERN.test('Astana!')).toBe(false);
    expect(CONFIG.GEN.SEED_LENGTH).toBeLessThanOrEqual(CONFIG.GEN.SEED_MAX_LENGTH);
    expect(CONFIG.GEN.VERSION).toBeGreaterThanOrEqual(1);
  });
});
