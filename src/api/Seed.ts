import { GEN } from '@/config';
import { seedToInt } from '@/world/Hash';

/** Сезон палитры (FR-13). */
export type Season = 'summer' | 'winter';

/** Профиль качества (design → URL-параметры). */
export type Quality = 'low' | 'medium' | 'high';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

/** Разобранные URL-параметры приложения (design → API Design). */
export interface AppFlags {
  readonly seed: string;
  /** Seed отсутствовал в URL и был сгенерирован (FR-2.2). */
  readonly seedGenerated: boolean;
  /** Seed был недопустимым и приведён к допустимому виду (FR-2.4). */
  readonly seedNormalized: boolean;
  /** `window.__app` установлен (`?debug=1` или `?debug=api`). */
  readonly debug: boolean;
  /** Визуальный debug-оверлей (`?debug=1`). */
  readonly debugOverlay: boolean;
  readonly season: Season;
  readonly gpu: boolean;
  readonly quality: Quality | null;
  /** Версия генератора из ссылки (`?v=`) или `null`. */
  readonly version: number | null;
}

const SEED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function cryptoRandom(): number {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    cryptoApi.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 4294967296;
  }
  return Math.random();
}

/** Случайный seed из `GEN.SEED_LENGTH` символов `[a-z0-9]` (AC-2.2). */
export function generateSeed(random: () => number = cryptoRandom): string {
  let seed = '';
  for (let i = 0; i < GEN.SEED_LENGTH; i++) {
    seed += SEED_ALPHABET.charAt(Math.floor(random() * SEED_ALPHABET.length));
  }
  return seed;
}

/**
 * Приводит произвольную строку к допустимому seed (FR-2.4): регистр понижается,
 * пробелы по краям срезаются; всё, что не подходит под `GEN.SEED_PATTERN`,
 * заменяется хешем исходной строки в base36. Пустая строка → `null`.
 */
export function normalizeSeed(raw: string): { seed: string; normalized: boolean } | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (GEN.SEED_PATTERN.test(lower)) {
    return { seed: lower, normalized: lower !== raw };
  }
  return { seed: seedToInt(trimmed).toString(36), normalized: true };
}

/** Разбор `location.search` в флаги приложения. */
export function parseFlags(search: string, random?: () => number): AppFlags {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  const normalized = rawSeed === null ? null : normalizeSeed(rawSeed);
  const seed = normalized?.seed ?? generateSeed(random);

  const rawQuality = params.get('quality');
  const quality = QUALITIES.find((value) => value === rawQuality) ?? null;

  const rawVersion = params.get('v');
  const parsedVersion = rawVersion === null ? Number.NaN : Number.parseInt(rawVersion, 10);

  return {
    seed,
    seedGenerated: normalized === null,
    seedNormalized: normalized?.normalized ?? false,
    debug: params.get('debug') === '1' || params.get('debug') === 'api',
    debugOverlay: params.get('debug') === '1',
    season: params.get('season') === 'winter' ? 'winter' : 'summer',
    gpu: params.get('gpu') === '1',
    quality,
    version: Number.isFinite(parsedVersion) ? parsedVersion : null,
  };
}

/** Ссылка для шаринга: только `seed` и версия генератора (FR-2.3). */
export function buildShareUrl(
  baseUrl: string,
  seed: string,
  version: number = GEN.VERSION,
): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', seed);
  url.searchParams.set('v', String(version));
  return url.toString();
}

/**
 * Отражает seed в адресной строке без перезагрузки и без роста истории (AC-2.2).
 * Остальные параметры (`debug`, `season`…) сохраняются.
 */
export function syncSeedToLocation(
  seed: string,
  location: Location = window.location,
  history: History = window.history,
): void {
  const url = new URL(location.href);
  if (url.searchParams.get('seed') === seed) {
    return;
  }
  url.searchParams.set('seed', seed);
  history.replaceState(history.state as unknown, '', url.toString());
}
