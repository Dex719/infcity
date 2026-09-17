/** Через сколько убрать полосу после 100 %, мс. */
const DONE_LINGER_MS = 400;

/**
 * Полоса загрузки 8 px вверху экрана (FR-11.1, design C13): прогресс — доля
 * фактически загруженных ресурсов; на 100 % плавно исчезает. Разметка живёт в `index.html`,
 * чтобы полоса была видна до исполнения скриптов.
 */
export class Loading {
  private readonly element: HTMLElement | null;
  private readonly bar: HTMLElement | null;

  constructor(element: HTMLElement | null = document.getElementById('loading')) {
    this.element = element;
    this.bar = element?.querySelector<HTMLElement>('#loading-bar') ?? null;
  }

  /** Прогресс `done` из `total` ресурсов. */
  set(done: number, total: number): void {
    const percent = total > 0 ? Math.round(Math.min(1, Math.max(0, done / total)) * 100) : 0;
    this.element?.setAttribute('aria-valuenow', String(percent));
    if (this.bar !== null) {
      this.bar.style.width = `${String(percent)}%`;
    }
  }

  get percent(): number {
    return Number(this.element?.getAttribute('aria-valuenow') ?? '0');
  }

  /** 100 % и плавное скрытие. */
  finish(): void {
    this.set(1, 1);
    const element = this.element;
    if (element === null) {
      return;
    }
    element.classList.add('is-done');
    window.setTimeout(() => {
      element.hidden = true;
    }, DONE_LINGER_MS);
  }

  /** Загрузка прервана ошибкой: полоса убирается, оверлей ошибки показывает вызывающий. */
  fail(): void {
    if (this.element !== null) {
      this.element.hidden = true;
    }
  }
}
