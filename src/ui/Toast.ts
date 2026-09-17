import { UI } from '@/config';
import { el } from './theme';

/** Короткое уведомление внизу экрана (FR-2.3, AC-2.3): `role="status"`, само скрывается. */
export class Toast {
  readonly element: HTMLElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.element = el('div', 'toast');
    this.element.id = 'toast';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;
    parent.appendChild(this.element);
  }

  show(message: string, durationMs: number = UI.TOAST_MS): void {
    window.clearTimeout(this.timer);
    this.element.textContent = message;
    this.element.hidden = false;
    // Перезапуск анимации появления при повторном показе.
    this.element.classList.remove('is-visible');
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    this.timer = window.setTimeout(() => this.hide(), durationMs);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('is-visible');
    this.element.hidden = true;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.element.remove();
  }
}
