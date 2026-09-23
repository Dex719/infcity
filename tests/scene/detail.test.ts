import { Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA, DETAIL, RENDER, WORLD } from '@/config';
import { ChunkNode } from '@/scene/ChunkNode';
import { ChunkWindow, type ChunkBuilder } from '@/scene/ChunkWindow';
import { Materials } from '@/scene/Materials';
import { parsePalette } from '@/scene/palette';
import { buildBlock } from '@/scene/procedural/BlockPrefabs';
import { Generator } from '@/world/Generator';
import type { ChunkDescriptor } from '@/world/types';
import paletteJson from '../../public/assets/palette.json';

const materials = new Materials(parsePalette(paletteJson));

/** Сборщик с мешем деталей: отражает то, что делает `PrefabBuilder`. */
class DetailBuilder implements ChunkBuilder {
  builds = 0;

  build(descriptor: ChunkDescriptor): ChunkNode {
    this.builds++;
    const node = new ChunkNode(descriptor);
    const details = new Mesh();
    details.name = 'details';
    node.add(details);
    node.details = details;
    // Как в `PrefabBuilder`: свежий меш наследует текущее состояние узла.
    details.visible = node.detailsVisible;
    details.castShadow = node.detailsShadow;
    return node;
  }

  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    node.placeholder = true;
    return node;
  }

  dispose(): void {
    // Геометрии в тесте нет — освобождать нечего.
  }
}

function filledWindow(): { cw: ChunkWindow; builder: DetailBuilder } {
  const builder = new DetailBuilder();
  const cw = new ChunkWindow(new Generator('astana'), builder, WORLD.WINDOW_SIZE, 400);
  cw.setCenter(0, 0);
  let guard = 0;
  while (cw.emptySlots() > 0 && guard++ < 200) {
    cw.update(cw.size * cw.size);
  }
  return { cw, builder };
}

/** Камера стоит на месте: `CAMERA.OFFSET` по X и Z, высота — параметр (design C11). */
function cameraAt(height: number): Vector3 {
  return new Vector3(CAMERA.OFFSET.x, height, CAMERA.OFFSET.z);
}

describe('Границы LOD лежат в тумане (FR-18.10)', () => {
  it('SHOW < HIDE и обе внутри RENDER.FOG', () => {
    expect(DETAIL.SHOW_DISTANCE).toBeLessThan(DETAIL.HIDE_DISTANCE);
    expect(DETAIL.SHOW_DISTANCE).toBeGreaterThanOrEqual(RENDER.FOG.near);
    expect(DETAIL.HIDE_DISTANCE).toBeLessThanOrEqual(RENDER.FOG.far);
  });

  it('тень деталей — ближняя зона внутри зоны видимости (FR-18.13)', () => {
    expect(DETAIL.SHADOW_DISTANCE).toBeLessThan(DETAIL.SHOW_DISTANCE);
    expect(DETAIL.SHADOW_DISTANCE).toBeGreaterThan(0);
  });
});

describe('Слой деталей квартала (FR-18.9, design D14)', () => {
  it('парк отдаёт в слой деталей большую часть геометрии, корпуса остаются в основном батче', () => {
    const generator = new Generator('astana');
    let park: ReturnType<typeof buildBlock> | null = null;
    let housing: ReturnType<typeof buildBlock> | null = null;
    for (const descriptor of generator.describeWindow(0, 0, 21)) {
      if (descriptor.block === 'park' && park === null) {
        park = buildBlock(descriptor, materials);
      }
      if (descriptor.block === 'residential-panel' && housing === null) {
        housing = buildBlock(descriptor, materials);
      }
    }
    expect(park).not.toBeNull();
    expect(housing).not.toBeNull();
    const parkDetail = park?.detail.vertices ?? 0;
    const parkSolid = (park?.opaque.vertices ?? 0) + (park?.glass.vertices ?? 0);
    expect(parkDetail / (parkDetail + parkSolid)).toBeGreaterThan(0.5);
    // У жилого квартала корпуса домов весомы и остаются в основном батче.
    const houseSolid = (housing?.opaque.vertices ?? 0) + (housing?.glass.vertices ?? 0);
    expect(houseSolid).toBeGreaterThan(1000);
    expect(housing?.detail.vertices ?? 0).toBeGreaterThan(0);
  });
});

describe('Переключение деталей по расстоянию (FR-18.9, AC-18.10)', () => {
  it('центральный чанк показывает детали на любой высоте камеры', () => {
    const { cw } = filledWindow();
    for (const height of [CAMERA.HEIGHT_MIN, 100, CAMERA.HEIGHT_MAX]) {
      cw.updateDetailVisibility(cameraAt(height));
      const center = cw.slotAt(0, 0)?.node;
      expect(center?.detailsVisible).toBe(true);
      expect(center?.details?.visible).toBe(true);
    }
  });

  it('дальний угол окна гасит детали, ближний — нет', () => {
    const { cw } = filledWindow();
    cw.updateDetailVisibility(cameraAt(CAMERA.HEIGHT_MAX));
    const far = cw.slotAt(-4, -4)?.node;
    const near = cw.slotAt(1, 1)?.node;
    expect(far?.detailsVisible).toBe(false);
    expect(far?.details?.visible).toBe(false);
    expect(near?.detailsVisible).toBe(true);
  });

  it('гистерезис: между границами состояние не меняется', () => {
    const builder = new DetailBuilder();
    const cw = new ChunkWindow(new Generator('astana'), builder, 1, 8);
    cw.setCenter(0, 0);
    cw.update(1);
    const slot = cw.slotAt(0, 0);
    expect(slot).toBeDefined();
    const chunk = slot?.node;
    expect(chunk).toBeDefined();
    if (chunk === undefined || chunk === null) {
      return;
    }
    const between = (DETAIL.SHOW_DISTANCE + DETAIL.HIDE_DISTANCE) / 2;
    // Камера ровно над чанком на промежуточном расстоянии: состояние сохраняется.
    chunk.setDetailsVisible(true);
    cw.updateDetailVisibility(new Vector3(0, between, 0));
    expect(chunk.detailsVisible).toBe(true);
    chunk.setDetailsVisible(false);
    cw.updateDetailVisibility(new Vector3(0, between, 0));
    expect(chunk.detailsVisible).toBe(false);
    // За дальней границей гаснет, ближе ближней — зажигается.
    chunk.setDetailsVisible(true);
    cw.updateDetailVisibility(new Vector3(0, DETAIL.HIDE_DISTANCE + 1, 0));
    expect(chunk.detailsVisible).toBe(false);
    cw.updateDetailVisibility(new Vector3(0, DETAIL.SHOW_DISTANCE - 1, 0));
    expect(chunk.detailsVisible).toBe(true);
  });

  it('тень деталей только у ближних чанков, у дальних детали видны без тени (FR-18.13)', () => {
    const { cw } = filledWindow();
    cw.updateDetailVisibility(cameraAt(CAMERA.HEIGHT_MIN));
    let shadowCasters = 0;
    let visibleWithoutShadow = 0;
    for (const slot of cw.slots) {
      const node = slot.node;
      if (node === null) {
        continue;
      }
      if (node.detailsShadow) {
        shadowCasters++;
        expect(node.detailsVisible).toBe(true);
        expect(node.details?.castShadow).toBe(true);
      } else if (node.detailsVisible) {
        visibleWithoutShadow++;
      }
    }
    expect(shadowCasters).toBeGreaterThan(0);
    expect(visibleWithoutShadow).toBeGreaterThan(0);
    // Тень отбрасывает строго меньше чанков, чем показывает детали.
    expect(shadowCasters).toBeLessThan(shadowCasters + visibleWithoutShadow);
  });

  it('потолок: деталей не больше MAX_DETAIL_SLOTS на любой высоте', () => {
    const { cw } = filledWindow();
    for (const height of [CAMERA.HEIGHT_MIN, 90, CAMERA.HEIGHT_MAX]) {
      cw.updateDetailVisibility(cameraAt(height));
      let visible = 0;
      for (const slot of cw.slots) {
        if (slot.node?.detailsVisible === true) {
          visible++;
        }
      }
      expect(visible).toBeLessThanOrEqual(DETAIL.MAX_DETAIL_SLOTS);
      expect(visible).toBeGreaterThan(0);
    }
  });

  it('snap снимает гистерезис: после телепорта состояние не зависит от истории', () => {
    const { cw } = filledWindow();
    // Ставим всем чанкам «включено», затем пересчитываем со снятым гистерезисом:
    // результат обязан совпасть с расчётом с нуля, а не зависеть от прошлого состояния.
    for (const slot of cw.slots) {
      slot.node?.setDetailsVisible(true);
    }
    cw.updateDetailVisibility(cameraAt(CAMERA.HEIGHT_MAX), true);
    const afterAllOn = cw.slots.map((s) => s.node?.detailsVisible ?? false);
    for (const slot of cw.slots) {
      slot.node?.setDetailsVisible(false);
    }
    cw.updateDetailVisibility(cameraAt(CAMERA.HEIGHT_MAX), true);
    const afterAllOff = cw.slots.map((s) => s.node?.detailsVisible ?? false);
    expect(afterAllOn).toEqual(afterAllOff);
    expect(afterAllOn.some((v) => v)).toBe(true);
  });

  it('смена высоты камеры не вызывает пересборки чанков (AC-18.10)', () => {
    const { cw, builder } = filledWindow();
    const before = builder.builds;
    for (const height of [CAMERA.HEIGHT_MAX, 120, 90, CAMERA.HEIGHT_MIN, 120, CAMERA.HEIGHT_MAX]) {
      cw.updateDetailVisibility(cameraAt(height));
    }
    expect(builder.builds).toBe(before);
    expect(cw.stats.builds).toBe(before);
  });
});
