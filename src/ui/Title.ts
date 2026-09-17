import { UI } from '@/config';
import { el, prefersReducedMotion } from './theme';

export interface TitleOptions {
  /** Принудительно отключить анимацию (тесты, `prefers-reduced-motion`). */
  readonly reducedMotion?: boolean;
  readonly delayMs?: number;
  readonly holdMs?: number;
  readonly fadeMs?: number;
}

export type TitlePhase = 'idle' | 'visible' | 'leaving' | 'gone';

/**
 * Анимированный заголовок демо (FR-10.1, AC-10.1): появляется через `TITLE_DELAY_MS`
 * после старта (ширина → буквы), держится `TITLE_HOLD_MS` и плавно исчезает.
 * При `prefers-reduced-motion` — мгновенный показ и мгновенное скрытие (NFR-6).
 */
export class Title {
  readonly element: HTMLElement;
  private readonly timers: number[] = [];
  private readonly reducedMotion: boolean;
  private readonly delayMs: number;
  private readonly holdMs: number;
  private readonly fadeMs: number;
  private state: TitlePhase = 'idle';

  constructor(parent: HTMLElement, title: string, subtitle: string, options: TitleOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.delayMs = options.delayMs ?? UI.TITLE_DELAY_MS;
    this.holdMs = options.holdMs ?? UI.TITLE_HOLD_MS;
    this.fadeMs = this.reducedMotion ? 0 : (options.fadeMs ?? UI.TITLE_FADE_MS);

    this.element = el('div', 'title');
    this.element.id = 'title';
    this.element.hidden = true;
    if (this.reducedMotion) {
      this.element.classList.add('is-static');
    }
    const heading = el('h1', 'title__heading');
    heading.setAttribute('aria-label', title);
    let index = 0;
    for (const char of title) {
      const letter = el('span', 'title__letter', char === ' ' ? ' ' : char);
      letter.setAttribute('aria-hidden', 'true');
      letter.style.setProperty('--i', String(index));
      heading.appendChild(letter);
      index++;
    }
    const sub = el('p', 'title__subtitle', subtitle);
    this.element.append(heading, sub);
    parent.appendChild(this.element);
  }

  /** Запуск сценария показа; повторный вызов игнорируется. */
  show(): void {
    if (this.state !== 'idle') {
      return;
    }
    this.after(this.delayMs, () => {
      this.state = 'visible';
      this.element.hidden = false;
      void this.element.offsetWidth;
      this.element.classList.add('is-visible');
      this.after(this.holdMs, () => {
        this.state = 'leaving';
        this.element.classList.add('is-leaving');
        this.after(this.fadeMs, () => this.remove());
      });
    });
  }

  get phase(): TitlePhase {
    return this.state;
  }

  /** Убрать заголовок немедленно (открыт About, ошибка). */
  remove(): void {
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }
    this.timers.length = 0;
    this.state = 'gone';
    this.element.hidden = true;
    this.element.remove();
  }

  private after(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    this.timers.push(window.setTimeout(fn, ms));
  }
}
