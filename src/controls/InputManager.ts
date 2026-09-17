import { Emitter } from '@/app/Emitter';

/** Экранная позиция указателя в пикселях относительно канваса. */
export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/** События ввода (design C11). */
export interface InputEvents extends Record<string, unknown> {
  dragstart: PointerPoint;
  drag: PointerPoint;
  dragend: PointerPoint;
  wheel: { deltaY: number };
  pinchstart: undefined;
  /** `ratio` — отношение текущего расстояния между пальцами к стартовому. */
  pinch: { ratio: number };
  pinchend: undefined;
}

const GRABBING_CLASS = 'grabbing';

/**
 * Единый ввод: Pointer Events (мышь и touch), колесо, пинч двумя указателями, клавиатура.
 * Страница не скроллится при жестах на канвасе (`touch-action: none`, NFR-2).
 */
export class InputManager extends Emitter<InputEvents> {
  /** Удерживаемые клавиши (`event.code`), опрашивает `PanControls` (FR-8.3). */
  readonly keys = new Set<string>();

  private readonly pointers = new Map<number, PointerPoint>();
  private dragging = false;
  private pinching = false;
  private pinchStartDistance = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly body: HTMLElement = document.body,
  ) {
    super();
    this.bind();
  }

  /** Перевод пикселей канваса в NDC. */
  toNdc(point: PointerPoint): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    return { x: (point.x / width) * 2 - 1, y: -(point.y / height) * 2 + 1 };
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  dispose(): void {
    for (const fn of this.cleanup) {
      fn();
    }
    this.cleanup.length = 0;
  }

  private bind(): void {
    const canvas = this.canvas;
    const listen = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K | keyof WindowEventMap,
      handler: (event: never) => void,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => target.removeEventListener(type, handler as EventListener, options));
    };

    listen(canvas, 'pointerdown', (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, this.localPoint(event));
      if (this.pointers.size === 2) {
        this.beginPinch();
      } else if (this.pointers.size === 1) {
        this.beginDrag(this.localPoint(event));
      }
      event.preventDefault();
    });

    listen(canvas, 'pointermove', (event: PointerEvent) => {
      if (!this.pointers.has(event.pointerId)) {
        return;
      }
      const point = this.localPoint(event);
      this.pointers.set(event.pointerId, point);
      if (this.pinching) {
        const distance = this.pointerDistance();
        if (this.pinchStartDistance > 0) {
          this.emit('pinch', { ratio: distance / this.pinchStartDistance });
        }
      } else if (this.dragging) {
        this.emit('drag', point);
      }
      event.preventDefault();
    });

    const release = (event: PointerEvent): void => {
      if (!this.pointers.has(event.pointerId)) {
        return;
      }
      const point = this.localPoint(event);
      this.pointers.delete(event.pointerId);
      if (this.pinching && this.pointers.size < 2) {
        this.pinching = false;
        this.emit('pinchend', undefined);
        this.endDrag(point);
      } else if (this.dragging && this.pointers.size === 0) {
        this.endDrag(point);
      }
    };
    listen(canvas, 'pointerup', release);
    listen(canvas, 'pointercancel', release);
    listen(canvas, 'lostpointercapture', release);

    listen(
      canvas,
      'wheel',
      (event: WheelEvent) => {
        event.preventDefault();
        const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
        this.emit('wheel', { deltaY: event.deltaY * scale });
      },
      { passive: false },
    );

    listen(window, 'keydown', (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      this.keys.add(event.code);
    });
    listen(window, 'keyup', (event: KeyboardEvent) => {
      this.keys.delete(event.code);
    });
    listen(window, 'blur', () => {
      this.keys.clear();
    });
    listen(canvas, 'contextmenu', (event: Event) => {
      event.preventDefault();
    });
  }

  private localPoint(event: PointerEvent): PointerPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private beginDrag(point: PointerPoint): void {
    this.dragging = true;
    this.body.classList.add(GRABBING_CLASS);
    this.emit('dragstart', point);
  }

  private endDrag(point: PointerPoint): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.body.classList.remove(GRABBING_CLASS);
    this.emit('dragend', point);
  }

  private beginPinch(): void {
    if (this.dragging) {
      this.dragging = false;
      this.body.classList.remove(GRABBING_CLASS);
      this.emit('dragend', this.firstPointer());
    }
    this.pinching = true;
    this.pinchStartDistance = this.pointerDistance();
    this.emit('pinchstart', undefined);
  }

  private firstPointer(): PointerPoint {
    for (const point of this.pointers.values()) {
      return point;
    }
    return { x: 0, y: 0 };
  }

  private pointerDistance(): number {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (a === undefined || b === undefined) {
      return 0;
    }
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
