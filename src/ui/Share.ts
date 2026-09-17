import { STRINGS } from './strings.ru';
import type { Toast } from './Toast';
import { el } from './theme';

/** Копирование в буфер; `false`, если API нет или доступ отклонён (design → Error Handling). */
export async function copyToClipboard(text: string, nav: Navigator = navigator): Promise<boolean> {
  const clipboard = (nav as Partial<Navigator>).clipboard;
  if (clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface ShareOptions {
  /** Ссылка вычисляется в момент клика (seed может быть нормализован). */
  readonly url: () => string;
  readonly toast: Toast;
  /** Подмена `navigator` в тестах. */
  readonly nav?: Navigator;
}

/**
 * Кнопка «Поделиться» (FR-2.3, AC-2.3) внутри окна About: копирует ссылку с seed и показывает
 * тост; если буфер обмена недоступен — раскрывает под кнопкой поле `<input readonly>`
 * с выделенной ссылкой.
 */
export class ShareControl {
  readonly button: HTMLButtonElement;
  readonly fallback: HTMLElement;
  readonly input: HTMLInputElement;

  constructor(
    container: HTMLElement,
    private readonly options: ShareOptions,
  ) {
    this.button = el('button', 'about__share', STRINGS.buttons.share);
    this.button.type = 'button';
    this.button.id = 'share';

    this.fallback = el('div', 'share-fallback');
    this.fallback.id = 'share-fallback';
    this.fallback.hidden = true;
    this.input = el('input', 'share-fallback__input');
    this.input.type = 'text';
    this.input.readOnly = true;
    this.input.setAttribute('aria-label', STRINGS.aria.shareInput);
    const close = el('button', 'share-fallback__close', STRINGS.buttons.shareFallbackClose);
    close.type = 'button';
    close.addEventListener('click', () => this.hideFallback());
    this.fallback.append(this.input, close);
    container.append(this.button, this.fallback);

    this.button.addEventListener('click', () => {
      void this.share();
    });
    this.input.addEventListener('focus', () => this.input.select());
    window.addEventListener('keydown', this.onKey);
  }

  async share(): Promise<void> {
    const url = this.options.url();
    if (await copyToClipboard(url, this.options.nav ?? navigator)) {
      this.hideFallback();
      this.options.toast.show(STRINGS.toasts.linkCopied);
      return;
    }
    this.showFallback(url);
    this.options.toast.show(STRINGS.toasts.copyFailed);
  }

  showFallback(url: string): void {
    this.input.value = url;
    this.fallback.hidden = false;
    this.input.focus();
    this.input.select();
  }

  hideFallback(): void {
    if (this.fallback.hidden) {
      return;
    }
    this.fallback.hidden = true;
    this.button.focus();
  }

  get fallbackVisible(): boolean {
    return !this.fallback.hidden;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.button.remove();
    this.fallback.remove();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.fallbackVisible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.hideFallback();
    }
  };
}
