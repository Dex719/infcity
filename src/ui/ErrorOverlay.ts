import { el, externalLink } from './theme';

export interface ErrorAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ErrorView {
  readonly title: string;
  readonly body: string;
  /** Кнопка действия («Повторить», «Перезагрузить»). */
  readonly action?: ErrorAction;
  /** Внешняя ссылка (например, проверка поддержки WebGL 2). */
  readonly link?: { readonly label: string; readonly href: string };
  /** Полупрозрачная подложка: сцена под оверлеем остаётся видна (потеря контекста). */
  readonly translucent?: boolean;
}

/**
 * Полноэкранный оверлей ошибок (FR-11.2–11.4, NFR-7, design → Error Handling):
 * нет WebGL 2, не загрузились ресурсы, потерян WebGL-контекст. Один экземпляр на страницу,
 * `role="alertdialog"`; тексты подставляются только через `textContent`.
 */
export class ErrorOverlay {
  readonly element: HTMLElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly bodyEl: HTMLParagraphElement;
  private readonly actions: HTMLElement;

  constructor(parent: HTMLElement = document.body) {
    this.element = el('div', 'error');
    this.element.id = 'error';
    this.element.hidden = true;
    this.element.setAttribute('role', 'alertdialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'error-title');
    this.element.setAttribute('aria-describedby', 'error-body');
    const card = el('div', 'error__card');
    card.tabIndex = -1;
    this.titleEl = el('h1', 'error__title');
    this.titleEl.id = 'error-title';
    this.bodyEl = el('p', 'error__body');
    this.bodyEl.id = 'error-body';
    this.actions = el('div', 'error__actions');
    card.append(this.titleEl, this.bodyEl, this.actions);
    this.element.appendChild(card);
    parent.appendChild(this.element);
  }

  show(view: ErrorView): void {
    this.titleEl.textContent = view.title;
    this.bodyEl.textContent = view.body;
    this.actions.replaceChildren();
    if (view.link !== undefined) {
      const link = externalLink(view.link.label, view.link.href);
      link.className = 'error__link';
      this.actions.appendChild(link);
    }
    let focusTarget: HTMLElement = this.element.firstElementChild as HTMLElement;
    if (view.action !== undefined) {
      const button = el('button', 'error__btn', view.action.label);
      button.type = 'button';
      button.addEventListener('click', view.action.onClick);
      this.actions.appendChild(button);
      focusTarget = button;
    }
    this.element.classList.toggle('error--translucent', view.translucent === true);
    this.element.hidden = false;
    focusTarget.focus();
  }

  hide(): void {
    this.element.hidden = true;
    this.actions.replaceChildren();
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  get title(): string {
    return this.titleEl.textContent ?? '';
  }

  dispose(): void {
    this.element.remove();
  }
}
