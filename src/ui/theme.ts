import type { Palette, PaletteKey } from '@/scene/palette';

/**
 * Цвета UI берутся из той же палитры, что и сцена (FR-9.4): после загрузки `palette.json`
 * значения подставляются в CSS-переменные; в `shell.css` лежат идентичные значения по
 * умолчанию, чтобы оверлеи ошибок читались и до загрузки палитры.
 */
export const UI_PALETTE_VARS: readonly (readonly [string, PaletteKey])[] = [
  ['--c-sky', 'sky'],
  ['--c-white', 'white'],
  ['--c-stone-light', 'stone-light'],
  ['--c-sand', 'sand'],
  ['--c-roof-dark', 'roof-dark'],
  ['--c-asphalt', 'asphalt'],
  ['--c-gold', 'gold'],
  ['--c-flag-blue', 'flag-blue'],
  ['--c-glass-navy', 'glass-navy'],
  ['--c-accent-red', 'accent-red'],
];

export function applyPalette(palette: Palette, root: HTMLElement = document.documentElement): void {
  for (const [variable, key] of UI_PALETTE_VARS) {
    root.style.setProperty(variable, palette[key]);
  }
}

/** Пользователь просил меньше анимаций (NFR-6); в средах без `matchMedia` — `false`. */
export function prefersReducedMotion(win: Window = window): boolean {
  if (typeof win.matchMedia !== 'function') {
    return false;
  }
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Создаёт элемент с классом и, при необходимости, текстом (только `textContent`). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** Внешняя ссылка: `href` только через свойство, без `innerHTML`; открывается в новой вкладке. */
export function externalLink(text: string, href: string): HTMLAnchorElement {
  const link = el('a', undefined, text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

/** Цель события — поле ввода: глобальные горячие клавиши не должны срабатывать. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
