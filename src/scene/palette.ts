import { ASSETS } from '@/config';
import type { Season } from '@/api/Seed';

/**
 * Палитра «Астана»: единственный источник цветов сцены и материалов (FR-9.4, AC-9.3).
 *
 * Ключи объявлены здесь и являются контрактом для `public/assets/palette.json`;
 * значения живут только в JSON, чтобы зимняя палитра (FR-13) подменялась файлом.
 */
export const PALETTE_KEYS = [
  'sky',
  'ground',
  'grass',
  'tree-dark',
  'water',
  'asphalt',
  'marking',
  'sidewalk',
  'concrete',
  'steel',
  'stone-light',
  'sand',
  'white',
  'panel-grey',
  'brick',
  'roof-red',
  'roof-dark',
  'glass-blue',
  'glass-teal',
  'glass-navy',
  'gold',
  'flag-blue',
  'accent-red',
  'sun',
  'black',
  'yellow',
] as const;

/** Имя цвета палитры. */
export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** Загруженная палитра: имя цвета → HEX-строка `#rrggbb`. */
export type Palette = Readonly<Record<PaletteKey, string>>;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * Проверяет, что распарсенный JSON содержит все ключи палитры в формате `#rrggbb`.
 * Бросает `Error` — вызывающий превращает его в ошибку загрузки (FR-11.2).
 */
export function parsePalette(raw: unknown): Palette {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('palette.json: ожидался объект');
  }
  const source = raw as Record<string, unknown>;
  const palette: Record<string, string> = {};
  for (const key of PALETTE_KEYS) {
    const value = source[key];
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
      throw new Error(`palette.json: цвет "${key}" отсутствует или не в формате #rrggbb`);
    }
    palette[key] = value;
  }
  return palette as Palette;
}

/**
 * Загружает палитру сезона относительно базового URL сборки (`base: './'` в vite.config.ts);
 * зимняя палитра (FR-13) лежит в отдельном файле и подменяет цвета без смены геометрии.
 */
export async function loadPalette(
  season: Season = 'summer',
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Palette> {
  const url = new URL(`${baseUrl}${ASSETS.PALETTE_FILES[season]}`, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`palette.json: HTTP ${String(response.status)}`);
  }
  return parsePalette(await response.json());
}
