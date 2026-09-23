import { InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA, CLOUD } from '@/config';
import { cloudVisibility } from '@/mobs/Cloud';
import { MobSystem } from '@/mobs/MobSystem';
import { buildCloud } from '@/mobs/Vehicles';
import { profileFor } from '@/render/Profile';
import { ChunkNode } from '@/scene/ChunkNode';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { GeometryBatch } from '@/scene/procedural/GeometryBatch';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';
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

describe('Облака у низкой камеры (FR-19.10, AC-19.11, design D18)', () => {
  it('видимость: 0 не выше HIDE, 1 не ниже SHOW, между — монотонно', () => {
    expect(cloudVisibility(CLOUD.FADE.HIDE)).toBe(0);
    expect(cloudVisibility(CLOUD.FADE.HIDE - 30)).toBe(0);
    expect(cloudVisibility(CLOUD.FADE.SHOW)).toBe(1);
    expect(cloudVisibility(CLOUD.FADE.SHOW + 30)).toBe(1);
    let previous = -1;
    for (let h = CLOUD.FADE.HIDE; h <= CLOUD.FADE.SHOW; h += 0.5) {
      const v = cloudVisibility(h);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('у нижней границы облако не крупнее 2,5 масштаба города; стартовая высота — полная видимость', () => {
    expect(CLOUD.FADE.HIDE / (CLOUD.FADE.HIDE - CLOUD.ALTITUDE)).toBeLessThanOrEqual(2.5);
    expect(cloudVisibility(CAMERA.HEIGHT_START)).toBe(1);
  });
});

describe('Теневой двойник облаков (AC-19.11)', () => {
  class NodeOnlyBuilder implements ChunkBuilder {
    build(descriptor: ChunkDescriptor): ChunkNode {
      return new ChunkNode(descriptor);
    }
    buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
      return new ChunkNode(descriptor);
    }
    dispose(): void {}
  }

  function setup(): { mobs: MobSystem; root: ChunkWindow['root']; mats: Materials } {
    const window = new ChunkWindow(new Generator('astana'), new NodeOnlyBuilder());
    const mats = new Materials(parsePalette(paletteJson));
    const mobs = new MobSystem(window, mats, profileFor('high', false));
    window.setCenter(0, 0);
    window.update(window.size * window.size);
    mobs.update(0.016);
    return { mobs, root: window.root, mats };
  }

  /** Инстансный меш по имени; иначе — ошибка теста. */
  function instanced(root: ChunkWindow['root'], name: string): InstancedMesh {
    const object = root.getObjectByName(name);
    if (!(object instanceof InstancedMesh)) {
      throw new Error(`нет инстансного меша ${name}`);
    }
    return object as InstancedMesh;
  }

  function meshes(root: ChunkWindow['root']): { cloud: InstancedMesh; twin: InstancedMesh }[] {
    return Array.from({ length: CLOUD.MODELS }, (_, variant) => ({
      cloud: instanced(root, `clouds:${String(variant)}`),
      twin: instanced(root, `clouds:${String(variant)}:shadow`),
    }));
  }

  it('двойник делит буфер матриц и число инстансов с облаком', () => {
    const { root } = setup();
    for (const { cloud, twin } of meshes(root)) {
      expect(twin.instanceMatrix).toBe(cloud.instanceMatrix);
      expect(twin.count).toBe(cloud.count);
      expect(twin.castShadow).toBe(true);
    }
  });

  it('v = 1: облако непрозрачное и само даёт тень, двойник выключен', () => {
    const { mobs, root, mats } = setup();
    mobs.setCloudFade(1);
    expect(mats.cloud.transparent).toBe(false);
    for (const { cloud, twin } of meshes(root)) {
      expect(cloud.visible).toBe(true);
      expect(cloud.castShadow).toBe(true);
      expect(twin.visible).toBe(false);
    }
  });

  it('0 < v < 1: облако прозрачное без тени, тень даёт двойник', () => {
    const { mobs, root, mats } = setup();
    mobs.setCloudFade(0.4);
    expect(mats.cloud.transparent).toBe(true);
    expect(mats.cloud.opacity).toBeCloseTo(0.4, 9);
    for (const { cloud, twin } of meshes(root)) {
      expect(cloud.visible).toBe(true);
      expect(cloud.castShadow).toBe(false);
      expect(twin.visible).toBe(true);
    }
  });

  it('v = 0: облака не рисуются, тени остаются', () => {
    const { mobs, root } = setup();
    mobs.setCloudFade(0);
    for (const { cloud, twin } of meshes(root)) {
      expect(cloud.visible).toBe(false);
      expect(twin.visible).toBe(true);
      expect(twin.castShadow).toBe(true);
    }
  });
});
