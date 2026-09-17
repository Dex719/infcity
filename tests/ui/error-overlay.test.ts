// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Renderer } from '@/render/Renderer';
import { ErrorOverlay } from '@/ui/ErrorOverlay';
import { Loading } from '@/ui/Loading';
import { STRINGS } from '@/ui/strings.ru';

describe('ErrorOverlay (FR-11.2–11.4)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('показывает заголовок, текст, ссылку и кнопку; кнопка вызывает действие', () => {
    const overlay = new ErrorOverlay();
    const onClick = vi.fn();
    expect(overlay.visible).toBe(false);
    overlay.show({
      title: 'T',
      body: 'B',
      link: { label: 'L', href: 'https://example.test/help' },
      action: { label: 'Retry', onClick },
    });
    expect(overlay.visible).toBe(true);
    expect(overlay.element.getAttribute('role')).toBe('alertdialog');
    expect(overlay.title).toBe('T');
    expect(overlay.element.textContent).toContain('B');
    const link = overlay.element.querySelector('a');
    expect(link?.href).toBe('https://example.test/help');
    expect(link?.rel).toContain('noopener');
    const button = overlay.element.querySelector('button');
    expect(button?.textContent).toBe('Retry');
    expect(document.activeElement).toBe(button);
    button?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    overlay.hide();
    expect(overlay.visible).toBe(false);
    expect(overlay.element.querySelector('button')).toBeNull();
  });

  it('полупрозрачный режим для потери контекста', () => {
    const overlay = new ErrorOverlay();
    overlay.show({ title: 't', body: 'b', translucent: true });
    expect(overlay.element.classList.contains('error--translucent')).toBe(true);
    overlay.show({ title: 't', body: 'b' });
    expect(overlay.element.classList.contains('error--translucent')).toBe(false);
  });
});

describe('Нет WebGL 2 (AC-11.3)', () => {
  const consoleError = vi.spyOn(console, 'error');
  afterEach(() => {
    consoleError.mockClear();
  });

  it('supportsWebGL2 → false при отсутствии контекста, заставка без ошибок в консоли', () => {
    const doc = {
      createElement: () => ({ getContext: () => null }),
    } as unknown as Document;
    expect(Renderer.supportsWebGL2(doc)).toBe(false);
    const overlay = new ErrorOverlay();
    overlay.show({
      title: STRINGS.errors.webglTitle,
      body: STRINGS.errors.webglBody,
      link: { label: STRINGS.errors.webglLink, href: 'https://get.webgl.org/webgl2/' },
    });
    expect(overlay.visible).toBe(true);
    expect(overlay.element.textContent).toContain(STRINGS.errors.webglTitle);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('supportsWebGL2 → false, если createElement бросает', () => {
    const doc = {
      createElement: () => {
        throw new Error('no DOM');
      },
    } as unknown as Document;
    expect(Renderer.supportsWebGL2(doc)).toBe(false);
  });
});

describe('Loading (FR-11.1)', () => {
  it('прогресс по факту и скрытие после 100 %', () => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    element.id = 'loading';
    const bar = document.createElement('div');
    bar.id = 'loading-bar';
    element.appendChild(bar);
    document.body.appendChild(element);
    const loading = new Loading(element);
    loading.set(0, 2);
    expect(loading.percent).toBe(0);
    loading.set(1, 2);
    expect(loading.percent).toBe(50);
    expect(bar.style.width).toBe('50%');
    loading.finish();
    expect(loading.percent).toBe(100);
    expect(element.classList.contains('is-done')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(element.hidden).toBe(true);
    vi.useRealTimers();
  });

  it('без элемента в DOM — безопасный no-op', () => {
    const loading = new Loading(null);
    loading.set(1, 1);
    loading.finish();
    loading.fail();
    expect(loading.percent).toBe(0);
  });
});
