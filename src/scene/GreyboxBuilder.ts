import { BoxGeometry, Color, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import { CHUNK_LAYOUT, LANDMARKS, LRT, WORLD } from '@/config';
import type { BlockTypeId, ChunkDescriptor } from '@/world/types';
import { ChunkNode } from './ChunkNode';
import type { ChunkBuilder } from './ChunkWindow';
import type { Palette, PaletteKey } from './palette';

/** Цвет и высота greybox-квартала по типу (design → Phase 1 greybox). */
const BLOCK_STYLE: Record<BlockTypeId, { color: PaletteKey; height: [number, number] }> = {
  'residential-panel': { color: 'panel-grey', height: [12, 16] },
  'residential-new': { color: 'stone-light', height: [16, 22] },
  'business-glass': { color: 'glass-blue', height: [28, 44] },
  commercial: { color: 'brick', height: [5, 8] },
  park: { color: 'grass', height: [0.4, 0.4] },
  square: { color: 'sand', height: [0.4, 0.4] },
  campus: { color: 'sidewalk', height: [8, 12] },
  mall: { color: 'stone-light', height: [10, 12] },
  river: { color: 'water', height: [0.2, 0.2] },
  market: { color: 'roof-red', height: [4, 6] },
  stadium: { color: 'flag-blue', height: [12, 14] },
  landmark: { color: 'gold', height: [30, 30] },
};

const BLOCK_CENTER = CHUNK_LAYOUT.ROAD_WIDTH / 2;
const LANDMARK_FOOTPRINT = 12;

/**
 * Greybox-сборщик (TSK-013/025): цветные боксы вместо префабов. Живёт до конца проекта
 * как плейсхолдер очереди сборки и как fallback (design → Implementation Strategy).
 */
export class GreyboxBuilder implements ChunkBuilder {
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly groundPlane = new PlaneGeometry(WORLD.CHUNK_SIZE, WORLD.CHUNK_SIZE);
  private readonly blockPlane = new PlaneGeometry(CHUNK_LAYOUT.BLOCK_SIZE, CHUNK_LAYOUT.BLOCK_SIZE);

  constructor(private readonly palette: Palette) {}

  build(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    this.addGround(node, 'asphalt');
    this.addBlock(node, descriptor);
    if (descriptor.lrt.corridor !== null) {
      this.addLrt(node, descriptor.lrt.station);
    }
    node.updateMatrix();
    return node;
  }

  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    node.placeholder = true;
    this.addGround(node, 'concrete');
    node.updateMatrix();
    return node;
  }

  dispose(node: ChunkNode): void {
    // Геометрии и материалы общие — освобождать нечего, только отвязать детей.
    node.clear();
  }

  private material(key: PaletteKey, opacity = 1): MeshLambertMaterial {
    const id = `${key}:${String(opacity)}`;
    let material = this.materials.get(id);
    if (material === undefined) {
      material = new MeshLambertMaterial({ color: new Color(this.palette[key]) });
      if (opacity < 1) {
        material.transparent = true;
        material.opacity = opacity;
      }
      this.materials.set(id, material);
    }
    return material;
  }

  private addGround(node: ChunkNode, color: PaletteKey): void {
    const ground = new Mesh(this.groundPlane, this.material(color));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    node.add(ground);
  }

  private addBlock(node: ChunkNode, descriptor: ChunkDescriptor): void {
    const style = BLOCK_STYLE[descriptor.block];
    const [minH, maxH] = style.height;
    const height = minH + ((descriptor.variant % 1000) / 1000) * (maxH - minH);
    const isFlat = maxH < 1;
    const color: PaletteKey = descriptor.fallback === true ? 'accent-red' : style.color;

    const base = new Mesh(this.blockPlane, this.material(isFlat ? color : 'sidewalk'));
    base.rotation.x = -Math.PI / 2;
    base.position.set(BLOCK_CENTER, 0.05, BLOCK_CENTER);
    base.matrixAutoUpdate = false;
    base.updateMatrix();
    node.add(base);
    if (isFlat) {
      return;
    }

    if (descriptor.landmark !== null) {
      const tower = new Mesh(this.unitBox, this.material(color));
      const h = LANDMARKS.HEIGHT[descriptor.landmark];
      tower.scale.set(LANDMARK_FOOTPRINT, h, LANDMARK_FOOTPRINT);
      tower.position.set(BLOCK_CENTER, h / 2, BLOCK_CENTER);
      tower.castShadow = true;
      tower.matrixAutoUpdate = false;
      tower.updateMatrix();
      node.add(tower);
      return;
    }

    const inset = CHUNK_LAYOUT.BLOCK_SIZE - 8;
    const box = new Mesh(this.unitBox, this.material(color));
    box.scale.set(inset, height, inset);
    box.position.set(BLOCK_CENTER, height / 2, BLOCK_CENTER);
    box.rotation.y = (descriptor.rotation * Math.PI) / 2;
    box.castShadow = true;
    box.matrixAutoUpdate = false;
    box.updateMatrix();
    node.add(box);
  }

  private addLrt(node: ChunkNode, station: boolean): void {
    const beam = new Mesh(this.unitBox, this.material('steel'));
    beam.scale.set(WORLD.CHUNK_SIZE, 1, 3);
    beam.position.set(0, LRT.BEAM_HEIGHT, LRT.AXIS_Z);
    beam.castShadow = true;
    beam.matrixAutoUpdate = false;
    beam.updateMatrix();
    node.add(beam);

    const half = WORLD.CHUNK_SIZE / 2;
    for (let x = -half + LRT.PILLAR_SPACING / 2; x < half; x += LRT.PILLAR_SPACING) {
      const pillar = new Mesh(this.unitBox, this.material('concrete'));
      pillar.scale.set(1.2, LRT.BEAM_HEIGHT, 1.2);
      pillar.position.set(x, LRT.BEAM_HEIGHT / 2, LRT.AXIS_Z);
      pillar.matrixAutoUpdate = false;
      pillar.updateMatrix();
      node.add(pillar);
    }

    if (station) {
      const platform = new Mesh(this.unitBox, this.material('white'));
      platform.scale.set(LRT.PLATFORM.length, 0.6, LRT.PLATFORM.width + 4);
      platform.position.set(0, LRT.BEAM_HEIGHT + 0.8, LRT.AXIS_Z);
      platform.castShadow = true;
      platform.matrixAutoUpdate = false;
      platform.updateMatrix();
      node.add(platform);
    }
  }
}
