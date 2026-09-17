// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, ShareControl } from '@/ui/Share';
import { STRINGS } from '@/ui/strings.ru';
import { Toast } from '@/ui/Toast';

function navWith(writeText: (text: string) => Promise<void>): Navigator {
  return { clipboard: { writeText } } as unknown as Navigator;
}

describe('copyToClipboard', () => {
  it('false без Clipboard API и при отказе; true при успехе', async () => {
    expect(await copyToClipboard('x', {} as Navigator)).toBe(false);
    expect(
      await copyToClipboard(
        'x',
        navWith(() => Promise.reject(new Error('denied'))),
      ),
    ).toBe(false);
    const writeText = vi.fn(() => Promise.resolve());
    expect(await copyToClipboard('x', navWith(writeText))).toBe(true);
    expect(writeText).toHaveBeenCalledWith('x');
  });
});

describe('ShareControl — «Поделиться» (FR-2.3, AC-2.3)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('копирует ссылку и показывает тост «Ссылка скопирована»', async () => {
    const toast = new Toast(document.body);
    const writeText = vi.fn(() => Promise.resolve());
    const share = new ShareControl(document.body, {
      url: () => 'https://example.test/?seed=astana&v=1',
      toast,
      nav: navWith(writeText),
    });
    expect(share.button.textContent).toBe(STRINGS.buttons.share);
    await share.share();
    expect(writeText).toHaveBeenCalledWith('https://example.test/?seed=astana&v=1');
    expect(toast.visible).toBe(true);
    expect(toast.element.textContent).toBe(STRINGS.toasts.linkCopied);
    expect(share.fallbackVisible).toBe(false);
  });

  it('без буфера обмена показывает поле со ссылкой; Esc скрывает его', async () => {
    const toast = new Toast(document.body);
    const share = new ShareControl(document.body, {
      url: () => 'https://example.test/?seed=a&v=1',
      toast,
      nav: {} as Navigator,
    });
    await share.share();
    expect(share.fallbackVisible).toBe(true);
    expect(share.input.value).toBe('https://example.test/?seed=a&v=1');
    expect(share.input.readOnly).toBe(true);
    expect(document.activeElement).toBe(share.input);
    expect(toast.element.textContent).toBe(STRINGS.toasts.copyFailed);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(share.fallbackVisible).toBe(false);
    expect(document.activeElement).toBe(share.button);
  });

  it('тост скрывается сам через 2 с', () => {
    vi.useFakeTimers();
    const toast = new Toast(document.body);
    toast.show('hi');
    expect(toast.visible).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(toast.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast.visible).toBe(false);
    vi.useRealTimers();
  });
});
