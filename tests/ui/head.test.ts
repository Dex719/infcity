// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePalette } from '@/scene/palette';
import { applyPalette } from '@/ui/theme';
import summerJson from '../../public/assets/palette.json';
import winterJson from '../../public/assets/palette.winter.json';

/** Файл из корня проекта: Vitest запускается из него (в jsdom `import.meta.url` не файловый). */
function file(path: string): Buffer {
  return readFileSync(resolve(process.cwd(), path));
}

const head = new DOMParser().parseFromString(file('index.html').toString('utf8'), 'text/html');

/** `content` мета-тега по `property` (Open Graph) или `name`. */
function meta(key: string): string | null {
  const node =
    head.querySelector(`meta[property="${key}"]`) ?? head.querySelector(`meta[name="${key}"]`);
  return node?.getAttribute('content') ?? null;
}

/** Ширина и высота PNG — из заголовка IHDR. */
function pngSize(bytes: Buffer): [number, number] {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/** Ширина и высота JPEG — из маркера SOF0…SOF3. */
function jpegSize(bytes: Buffer): [number, number] {
  expect(bytes.readUInt16BE(0)).toBe(0xffd8);
  let i = 2;
  while (i + 9 < bytes.length) {
    const marker = bytes.readUInt16BE(i);
    if (marker >= 0xffc0 && marker <= 0xffc3) {
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error('JPEG без маркера SOF');
}

describe('Карточка ссылки и значок (FR-19.28, AC-19.29, design D32)', () => {
  it('Open Graph и Twitter Card: заголовок, описание, картинка 1200 × 630 по абсолютному адресу', () => {
    expect(meta('og:type')).toBe('website');
    expect(meta('og:site_name')).toBe('Astana Infinite');
    expect(meta('og:locale')).toBe('ru_RU');
    expect(meta('og:title')).toBe(head.title);
    expect(meta('og:description')).toBe(meta('description'));
    const url = meta('og:url');
    expect(url).toMatch(/^https:\/\/[^/]+\/.*\/$/);
    expect(meta('og:image')).toBe(`${url ?? ''}og.jpg`);
    expect(meta('og:image:type')).toBe('image/jpeg');
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
    expect(meta('og:image:alt')?.length).toBeGreaterThan(10);
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('og.jpg — JPEG 1200 × 630, значки — PNG 32 × 32 и 180 × 180, ссылки на них в index.html', () => {
    expect(jpegSize(file('public/og.jpg'))).toEqual([1200, 630]);
    const icon = (selector: string): string | null =>
      head.querySelector(selector)?.getAttribute('href') ?? null;
    expect(icon('link[rel="icon"][type="image/svg+xml"]')).toBe('favicon.svg');
    expect(icon('link[rel="icon"][sizes="32x32"]')).toBe('favicon-32.png');
    expect(icon('link[rel="apple-touch-icon"]')).toBe('apple-touch-icon.png');
    expect(pngSize(file('public/favicon-32.png'))).toEqual([32, 32]);
    expect(pngSize(file('public/apple-touch-icon.png'))).toEqual([180, 180]);
    expect(file('public/favicon.svg').toString('utf8')).toContain('viewBox="0 0 64 64"');
  });

  it('все цвета SVG-значка — цвета палитры', () => {
    const svg = file('public/favicon.svg').toString('utf8');
    const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1]?.toLowerCase());
    expect(fills.length).toBeGreaterThanOrEqual(5);
    const palette = new Set(Object.values(summerJson).map((c) => c.toLowerCase()));
    for (const fill of fills) {
      expect(palette.has(fill ?? ''), fill).toBe(true);
    }
  });

  it('theme-color — небо текущей палитры: один мета-тег, зимой зимний', () => {
    const summer = parsePalette(summerJson);
    const winter = parsePalette(winterJson);
    applyPalette(summer);
    const tags = (): NodeListOf<HTMLMetaElement> =>
      document.head.querySelectorAll('meta[name="theme-color"]');
    expect(tags()).toHaveLength(1);
    expect(tags()[0]?.content).toBe(summer.sky);
    applyPalette(winter);
    expect(tags()).toHaveLength(1);
    expect(tags()[0]?.content).toBe(winter.sky);
  });
});
