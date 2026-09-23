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
