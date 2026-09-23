import { Group, type Mesh } from 'three';
import type { ChunkDescriptor } from '@/world/types';

/** Собранный чанк в сцене: корень статики и мобов, знает свой дескриптор. */
export class ChunkNode extends Group {
  /** Плейсхолдер (greybox до сборки) или полноценный чанк. */
  placeholder = false;

  /**
   * Меш мелких деталей (FR-18.9, design D14): деревья, фонари, разметка, детали крыш.
   * Гасится по расстоянию от камеры — геометрия при этом не пересобирается.
   */
  details: Mesh | null = null;

  /** Текущее состояние слоя деталей; хранится на узле, а не на слоте: узлы переезжают. */
  detailsVisible = true;

  /**
   * Отбрасывает ли слой деталей тень (FR-18.13). Тень мелочи читается только вблизи, а в
   * теневой проход попадает заметно больше чанков, чем видно на глаз, — поэтому у дальних
   * чанков тень деталей выключается.
   */
  detailsShadow = true;

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

  /** Включает или гасит слой деталей (дешевле любой пересборки: один флаг на чанк). */
  setDetailsVisible(visible: boolean): void {
    this.detailsVisible = visible;
    if (this.details !== null) {
      this.details.visible = visible;
    }
  }

  /** Включает или выключает отбрасывание тени слоем деталей (FR-18.13). */
  setDetailsShadow(cast: boolean): void {
    this.detailsShadow = cast;
    if (this.details !== null) {
      this.details.castShadow = cast;
    }
  }
}
