import {
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  type Vector3,
} from 'three';
import { CHUNK_LAYOUT, WORLD } from '@/config';
import { Lighting } from '@/render/Lighting';
import type { ChunkDescriptor } from '@/world/types';
import { ChunkNode } from './ChunkNode';
import type { ChunkBuilder } from './ChunkWindow';
import type { Materials } from './Materials';
import { buildBlock } from './procedural/BlockPrefabs';
import { GeometryBatch } from './procedural/GeometryBatch';
import { buildLrt } from './procedural/Lrt';
import { Props } from './procedural/Props';
import { buildRoads } from './procedural/Roads';
import { splitBySun } from './ShadowSplit';

const BLOCK_CENTER = CHUNK_LAYOUT.ROAD_WIDTH / 2; // 5
const IDENTITY = new Matrix4();

/**
 * Сборщик чанков из процедурных префабов (design C7, D2/D3): дороги + ЛРТ + квартал
 * сливаются в одну геометрию с вершинными цветами → 1 непрозрачный меш и, при наличии
 * стекла, 1 полупрозрачный. Геометрия уникальна для чанка и освобождается в `dispose`.
 */
export class PrefabBuilder implements ChunkBuilder {
  private readonly placeholderGeometry = new PlaneGeometry(
    WORLD.CHUNK_SIZE,
    WORLD.CHUNK_SIZE,
  ).rotateX(-Math.PI / 2);
  private readonly placeholderMaterial: MeshLambertMaterial;
  private readonly blockMatrix = new Matrix4();

  /** Суммарно собрано вершин (для отладки бюджета). */
  verticesBuilt = 0;

  constructor(
    private readonly materials: Materials,
    /** Направление на солнце: статика делится на грани, дающие тень, и освещённые (D20). */
    private readonly toSun: Vector3 = Lighting.sunDirection(),
  ) {
    this.placeholderMaterial = new MeshLambertMaterial({ color: materials.color('concrete') });
  }

  build(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    const opaque = new GeometryBatch();
    const glass = new GeometryBatch();
    // Мелочь (всё, что строит `Props`, дорожная разметка, детали крыш) собирается отдельным
    // батчем и вливается в статику чанка: LOD по расстоянию снят (BUG-10) — детали и их тени
    // видны всегда, ничего не появляется на глазах при панорамировании и зуме.
    const detail = new GeometryBatch();
    const props = new Props(detail, this.materials);

    buildRoads(
      opaque,
      detail,
      props,
      this.materials,
      descriptor.roads,
      descriptor.lrt,
      descriptor.block === 'river',
    );
    buildLrt(opaque, this.materials, descriptor.lrt);

    const block = buildBlock(descriptor, this.materials);
    this.blockMatrix.makeRotationY((descriptor.rotation * Math.PI) / 2);
    this.blockMatrix.setPosition(BLOCK_CENTER, 0, BLOCK_CENTER);
    opaque.append(block.opaque, this.blockMatrix);
    glass.append(block.glass, this.blockMatrix);
    detail.append(block.detail, this.blockMatrix);

    this.verticesBuilt += opaque.vertices + glass.vertices + detail.vertices;
    opaque.append(detail, IDENTITY);

    // Статика делится по солнцу (BUG-10, design D20): грани, смотрящие на солнце, в карту теней
    // не попадают никогда, поэтому идут в меш без тени — теневой проход становится вдвое легче,
    // а тени не меняются ни на пиксель.
    const { cast, lit } = splitBySun(opaque.build(), this.toSun);
    const solid = new Mesh(cast, this.materials.opaque);
    solid.name = 'statics';
    solid.castShadow = true;
    solid.receiveShadow = true;
    solid.matrixAutoUpdate = false;
    solid.updateMatrix();
    node.add(solid);
    if (lit.index !== null && lit.index.count > 0) {
      const sunlit = new Mesh(lit, this.materials.opaque);
      sunlit.name = 'statics:lit';
      sunlit.castShadow = false;
      sunlit.receiveShadow = true;
      sunlit.matrixAutoUpdate = false;
      sunlit.updateMatrix();
      node.add(sunlit);
    } else {
      lit.dispose();
    }

    if (!glass.isEmpty) {
      const pane = new Mesh(glass.build(), this.materials.glass);
      pane.name = 'glass';
      pane.renderOrder = 10;
      pane.matrixAutoUpdate = false;
      pane.updateMatrix();
      node.add(pane);
    }
    node.updateMatrix();
    return node;
  }

  buildPlaceholder(descriptor: ChunkDescriptor): ChunkNode {
    const node = new ChunkNode(descriptor);
    node.placeholder = true;
    const ground = new Mesh(this.placeholderGeometry, this.placeholderMaterial);
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    node.add(ground);
    node.updateMatrix();
    return node;
  }

  dispose(node: ChunkNode): void {
    for (const child of node.children) {
      if (
        child instanceof Mesh &&
        child.geometry instanceof BufferGeometry &&
        child.geometry !== this.placeholderGeometry
      ) {
        child.geometry.dispose();
      }
    }
    node.clear();
  }
}
