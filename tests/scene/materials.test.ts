import { describe, expect, it } from 'vitest';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import paletteJson from '../../public/assets/palette.json';

describe('Materials (FR-19.3, design D16)', () => {
  const materials = new Materials(parsePalette(paletteJson));

  it('AC-19.3: непрозрачный материал затеняется по граням — гранёный low-poly', () => {
    expect(materials.opaque.flatShading).toBe(true);
    expect(materials.opaque.vertexColors).toBe(true);
  });

  it('AC-19.3: стекло остаётся гладким и полупрозрачным', () => {
    expect(materials.glass.flatShading).toBe(false);
    expect(materials.glass.transparent).toBe(true);
    expect(materials.glass.depthWrite).toBe(false);
  });
});

describe('Материалы облаков (FR-19.10, design D18)', () => {
  const materials = new Materials(parsePalette(paletteJson));

  it('облака — свой гранёный материал, отдельный от города', () => {
    expect(materials.cloud).not.toBe(materials.opaque);
    expect(materials.cloud.flatShading).toBe(true);
    expect(materials.cloud.vertexColors).toBe(true);
  });

  it('теневой двойник не пишет ни цвет, ни глубину в основном проходе', () => {
    expect(materials.shadowOnly.colorWrite).toBe(false);
    expect(materials.shadowOnly.depthWrite).toBe(false);
  });
});
