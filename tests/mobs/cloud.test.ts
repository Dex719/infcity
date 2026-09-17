import { describe, expect, it } from 'vitest';
import { CLOUD } from '@/config';
import { buildCloud } from '@/mobs/Vehicles';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

function cloud(variant: number): { parts: number; colors: number; width: number; height: number } {
  const batch = new GeometryBatch();
  buildCloud(batch, materials, variant);
  const parts = batch.parts;
  const geometry = batch.build();
  const color = geometry.getAttribute('color');
  const seen = new Set<string>();
  for (let i = 0; i < color.count; i++) {
    seen.add([color.getX(i), color.getY(i), color.getZ(i)].map((v) => v.toFixed(3)).join(','));
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    throw new Error('no bounding box');
  }
  return {
    parts,
    colors: seen.size,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
  };
}

describe('Облака — три силуэта с тенью (FR-17.2, AC-17.2)', () => {
  it('в пуле три модели', () => {
    expect(CLOUD.MODELS).toBe(3);
  });

  it('каждая модель — ≥ 10 объёмов и три тона (верх, средний, подложка) — AC-17.2, AC-17.6', () => {
    for (let variant = 0; variant < CLOUD.MODELS; variant++) {
      const c = cloud(variant);
      expect(c.parts, `variant ${String(variant)}`).toBeGreaterThanOrEqual(10);
      expect(c.colors, `variant ${String(variant)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('силуэт 2 — вытянутый: ширина ≥ 2,5 высоты; силуэт 1 крупнее силуэта 0', () => {
    const stratus = cloud(2);
    expect(stratus.width / stratus.height).toBeGreaterThanOrEqual(2.5);
    expect(cloud(1).width).toBeGreaterThan(cloud(0).width);
  });

  it('вариант вне диапазона сворачивается по модулю, а не падает', () => {
    expect(cloud(5).parts).toBe(cloud(2).parts);
  });
});
