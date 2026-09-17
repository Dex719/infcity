// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { About, parseCredits } from '@/ui/About';
import { STRINGS } from '@/ui/strings.ru';

const CREDITS = [
  '# Credits',
  '',
  'Вступление без маркера.',
  '- three.js — рендер, лицензия MIT — https://threejs.org',
  '- Палитра «Астана» — собственная, `palette.json`',
].join('\n');

function setup(): {
  about: About;
  host: { pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
  canvas: HTMLElement;
  hud: HTMLElement;
} {
  document.body.replaceChildren();
  const canvas = document.createElement('canvas');
  const hud = document.createElement('div');
  document.body.append(canvas, hud);
  const host = { pause: vi.fn(), resume: vi.fn() };
  const about = new About(hud, document.body, host, canvas, {
    credits: CREDITS,
    author: { name: 'author', url: 'https://example.test/author' },
    inertWhileOpen: [canvas, hud],
  });
  return { about, host, canvas, hud };
}

function key(name: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }));
}

describe('parseCredits', () => {
  it('берёт только строки с «- », отделяет ссылку после « — », чистит backticks', () => {
    expect(parseCredits(CREDITS)).toEqual([
      { text: 'three.js — рендер, лицензия MIT', url: 'https://threejs.org' },
      { text: 'Палитра «Астана» — собственная, palette.json', url: null },
    ]);
  });
});

describe('About — открытие/закрытие (FR-10.2, FR-10.3, AC-10.2)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('открытие ставит паузу, размывает канвас и переводит фокус в диалог', () => {
    const { about, host, canvas } = setup();
    expect(about.backdrop.hidden).toBe(true);
    about.button.click();
    expect(about.isOpen).toBe(true);
    expect(host.pause).toHaveBeenCalledTimes(1);
    expect(canvas.classList.contains('is-dimmed')).toBe(true);
    expect(about.backdrop.hidden).toBe(false);
    expect(about.button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(about.closeButton);
    expect(about.dialog.getAttribute('role')).toBe('dialog');
    expect(about.dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('крестик снимает размытие, возобновляет симуляцию и возвращает фокус на кнопку', () => {
    const { about, host, canvas } = setup();
    about.button.focus();
    about.open();
    about.closeButton.click();
    expect(about.isOpen).toBe(false);
    expect(host.resume).toHaveBeenCalledTimes(1);
    expect(canvas.classList.contains('is-dimmed')).toBe(false);
    expect(about.backdrop.hidden).toBe(true);
    expect(document.activeElement).toBe(about.button);
  });

  it('клик по подложке закрывает, клик внутри диалога — нет', () => {
    const { about } = setup();
    about.open();
    about.dialog.click();
    expect(about.isOpen).toBe(true);
    about.backdrop.click();
    expect(about.isOpen).toBe(false);
  });

  it('Esc закрывает, «?» переключает (NFR-6), в поле ввода горячие клавиши не работают', () => {
    const { about } = setup();
    key('?');
    expect(about.isOpen).toBe(true);
    key('Escape');
    expect(about.isOpen).toBe(false);
    key('?');
    expect(about.isOpen).toBe(true);
    key('?');
    expect(about.isOpen).toBe(false);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(about.isOpen).toBe(false);
  });

  it('содержит описание, «сделано с», credits с внешними ссылками и автора', () => {
    const { about } = setup();
    const text = about.dialog.textContent ?? '';
    expect(text).toContain(STRINGS.about.intro);
    expect(text).toContain(STRINGS.about.madeWithHeading);
    expect(text).toContain('three.js — рендер, лицензия MIT');
    const links = Array.from(about.dialog.querySelectorAll('a'));
    expect(links.some((a) => a.href === 'https://threejs.org/')).toBe(true);
    expect(links.every((a) => a.rel.includes('noopener'))).toBe(true);
    expect(text).toContain(`${STRINGS.about.authorLabel}: author`);
    expect(about.dialog.innerHTML).not.toContain('<script');
  });

  it('повторное open/close идемпотентно: pause/resume вызываются по одному разу', () => {
    const { about, host } = setup();
    about.open();
    about.open();
    about.close();
    about.close();
    expect(host.pause).toHaveBeenCalledTimes(1);
    expect(host.resume).toHaveBeenCalledTimes(1);
  });
});
