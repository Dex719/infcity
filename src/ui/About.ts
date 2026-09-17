import { STRINGS } from './strings.ru';
import { el, externalLink, isEditableTarget } from './theme';

/** Что About делает с приложением: пауза на время попапа (FR-10.2, FR-10.3). */
export interface AboutHost {
  pause(): void;
  resume(): void;
}

export interface AboutOptions {
  /** Текст `CREDITS.md`: строки `- …` становятся пунктами списка. */
  readonly credits: string;
  readonly author?: { readonly name: string; readonly url: string };
  /** Элементы, недоступные для фокуса и кликов, пока попап открыт (канвас). */
  readonly inertWhileOpen?: readonly HTMLElement[];
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
}

export interface CreditLine {
  readonly text: string;
  readonly url: string | null;
}

const BULLET = /^-\s+/;
const TRAILING_URL = /\s+—\s+(https?:\/\/\S+)\s*$/;

/** Пункты `CREDITS.md`: строки с `- `, ссылка — последний фрагмент после « — ». */
export function parseCredits(markdown: string): CreditLine[] {
  const lines: CreditLine[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    if (!BULLET.test(raw)) {
      continue;
    }
    let text = raw.replace(BULLET, '').trim();
    let url: string | null = null;
    const match = TRAILING_URL.exec(text);
    if (match?.[1] !== undefined) {
      url = match[1];
      text = text.slice(0, match.index).trim();
    }
    lines.push({ text: text.replaceAll('`', ''), url });
  }
  return lines;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Попап «О проекте» (FR-10.2–10.4, NFR-6): открывается клавишей `?` (кнопок на экране нет —
 * по запросу пользователя, итерация 2), закрывается крестиком, кликом по подложке, Esc.
 * Открытие ставит симуляцию на паузу и размывает канвас; фокус удерживается внутри диалога.
 * Внизу диалога — контейнер `actions` для кнопки «Поделиться».
 */
export class About {
  readonly backdrop: HTMLElement;
  readonly dialog: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  /** Контейнер действий (кнопка «Поделиться», поле-фолбэк). */
  readonly actions: HTMLElement;
  private opened = false;
  private lastFocus: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly host: AboutHost,
    private readonly canvas: HTMLElement,
    private readonly options: AboutOptions,
  ) {
    this.backdrop = el('div', 'about-backdrop');
    this.backdrop.id = 'about-backdrop';
    this.backdrop.hidden = true;

    this.dialog = el('div', 'about');
    this.dialog.id = 'about';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'about-heading');
    this.dialog.tabIndex = -1;

    const header = el('div', 'about__header');
    const heading = el('h2', 'about__heading', STRINGS.about.heading);
    heading.id = 'about-heading';
    this.closeButton = el('button', 'about__close');
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', STRINGS.buttons.close);
    this.closeButton.title = STRINGS.buttons.close;
    const cross = el('span', 'about__icon', '×');
    cross.setAttribute('aria-hidden', 'true');
    this.closeButton.appendChild(cross);
    header.append(heading, this.closeButton);

    this.actions = el('div', 'about__actions');
    const body = el('div', 'about__body');
    body.append(
      el('p', undefined, STRINGS.about.intro),
      el('p', undefined, STRINGS.about.controls),
      el('p', 'about__hint', STRINGS.about.seedHint),
      this.actions,
      el('h3', undefined, STRINGS.about.madeWithHeading),
      About.list(STRINGS.about.madeWith.map((item) => ({ text: item.name, url: item.url }))),
      el('h3', undefined, STRINGS.about.creditsHeading),
      el('p', 'about__hint', STRINGS.about.creditsHint),
      About.list(parseCredits(options.credits)),
      this.authorLine(),
    );

    this.dialog.append(header, body);
    this.backdrop.appendChild(this.dialog);
    parent.appendChild(this.backdrop);

    this.closeButton.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', (event) => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });
    window.addEventListener('keydown', this.onKey);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.host.pause();
    this.canvas.classList.add('is-dimmed');
    document.body.classList.add('about-open');
    for (const node of this.options.inertWhileOpen ?? []) {
      node.inert = true;
    }
    this.backdrop.hidden = false;
    this.closeButton.focus();
    this.options.onOpen?.();
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.backdrop.hidden = true;
    for (const node of this.options.inertWhileOpen ?? []) {
      node.inert = false;
    }
    document.body.classList.remove('about-open');
    this.canvas.classList.remove('is-dimmed');
    this.host.resume();
    this.lastFocus?.focus();
    this.lastFocus = null;
    this.options.onClose?.();
  }

  toggle(): void {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.close();
    this.backdrop.remove();
  }

  private authorLine(): HTMLElement {
    const line = el('p', 'about__author', `${STRINGS.about.authorLabel}: `);
    const author = this.options.author;
    if (author === undefined || author.name === '') {
      line.textContent = '';
      line.hidden = true;
      return line;
    }
    if (author.url === '') {
      line.appendChild(el('span', undefined, author.name));
    } else {
      line.appendChild(externalLink(author.name, author.url));
    }
    return line;
  }

  private static list(items: readonly CreditLine[]): HTMLUListElement {
    const list = el('ul', 'about__list');
    for (const item of items) {
      const li = el('li');
      if (item.url === null) {
        li.textContent = item.text;
      } else {
        li.append(externalLink(item.text, item.url));
      }
      list.appendChild(li);
    }
    return list;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }
    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (!this.opened) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  };

  private trapFocus(event: KeyboardEvent): void {
    const focusables = Array.from(this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
