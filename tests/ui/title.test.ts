// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI } from '@/config';
import { Title } from '@/ui/Title';

describe('Title — анимированный заголовок (FR-10.1, AC-10.1, NFR-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('появляется через 500 мс после show(), держится 7 с и исчезает', () => {
    const title = new Title(document.body, 'Astana Infinite', 'sub', { reducedMotion: false });
    expect(title.element.hidden).toBe(true);
    title.show();
    vi.advanceTimersByTime(UI.TITLE_DELAY_MS - 1);
    expect(title.phase).toBe('idle');
    vi.advanceTimersByTime(1);
    expect(title.phase).toBe('visible');
    expect(title.element.hidden).toBe(false);
    expect(title.element.classList.contains('is-visible')).toBe(true);
    vi.advanceTimersByTime(UI.TITLE_HOLD_MS);
    expect(title.phase).toBe('leaving');
    expect(title.element.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(UI.TITLE_FADE_MS);
    expect(title.phase).toBe('gone');
    expect(document.getElementById('title')).toBeNull();
  });

  it('буквы вынесены в span с индексом задержки; текст доступен через aria-label', () => {
    const title = new Title(document.body, 'Ab c', 'sub', { reducedMotion: false });
    const letters = title.element.querySelectorAll('.title__letter');
    expect(letters).toHaveLength(4);
    expect(letters[3]?.getAttribute('style')).toContain('--i: 3');
    expect(title.element.querySelector('h1')?.getAttribute('aria-label')).toBe('Ab c');
  });

  it('prefers-reduced-motion: класс is-static и скрытие без затухания', () => {
    const title = new Title(document.body, 'T', 's', { reducedMotion: true });
    expect(title.element.classList.contains('is-static')).toBe(true);
    title.show();
    vi.advanceTimersByTime(UI.TITLE_DELAY_MS + UI.TITLE_HOLD_MS);
    expect(title.phase).toBe('gone');
  });

  it('remove() отменяет таймеры и снимает заголовок (About открыт)', () => {
    const title = new Title(document.body, 'T', 's', { reducedMotion: false });
    title.show();
    title.remove();
    vi.advanceTimersByTime(UI.TITLE_DELAY_MS + UI.TITLE_HOLD_MS + UI.TITLE_FADE_MS);
    expect(title.phase).toBe('gone');
    expect(document.getElementById('title')).toBeNull();
  });
});
