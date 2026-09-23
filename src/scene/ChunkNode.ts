import { Group } from 'three';
import type { ChunkDescriptor } from '@/world/types';

/** Собранный чанк в сцене: корень статики и мобов, знает свой дескриптор. */
export class ChunkNode extends Group {
  /** Плейсхолдер (greybox до сборки) или полноценный чанк. */
  placeholder = false;

  constructor(readonly descriptor: ChunkDescriptor) {
    super();
    this.name = `chunk:${descriptor.key}`;
    this.matrixAutoUpdate = false;
  }

  get gx(): number {
    return this.descriptor.gx;
  }

  get gy(): number {
    return this.descriptor.gy;
  }
}
