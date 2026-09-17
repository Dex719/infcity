// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GEN } from '@/config';
import {
  buildShareUrl,
  generateSeed,
  normalizeSeed,
  parseFlags,
  syncSeedToLocation,
} from '@/api/Seed';

describe('normalizeSeed (FR-2.4)', () => {
  it('допустимый seed проходит без изменений', () => {
    expect(normalizeSeed('astana')).toEqual({ seed: 'astana', normalized: false });
    expect(normalizeSeed('a_b-9')).toEqual({ seed: 'a_b-9', normalized: false });
  });

  it('регистр и пробелы нормализуются', () => {
    expect(normalizeSeed('  Astana ')).toEqual({ seed: 'astana', normalized: true });
  });

  it('недопустимые символы и длина > 64 заменяются хешем', () => {
    const bad = normalizeSeed('Астана!');
    expect(bad?.normalized).toBe(true);
    expect(bad?.seed).toMatch(GEN.SEED_PATTERN);
    const long = normalizeSeed('x'.repeat(65));
    expect(long?.normalized).toBe(true);
    expect(long?.seed.length).toBeLessThanOrEqual(GEN.SEED_MAX_LENGTH);
    expect(normalizeSeed('Астана!')).toEqual(bad);
  });

  it('пустая строка → null', () => {
    expect(normalizeSeed('   ')).toBeNull();
  });
});

describe('generateSeed / parseFlags (FR-2.2, design → URL)', () => {
  it('генерирует 8 символов [a-z0-9]', () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(GEN.SEED_LENGTH);
    expect(seed).toMatch(/^[a-z0-9]{8}$/);
    let i = 0;
    expect(generateSeed(() => (i++ % 36) / 36)).toBe('abcdefgh');
  });

  it('без seed — сгенерированный, с seed — нормализованный', () => {
    const generated = parseFlags('?debug=1', () => 0.5);
    expect(generated.seedGenerated).toBe(true);
    expect(generated.seed).toBe('ssssssss');
    expect(generated.debug).toBe(true);

    const given = parseFlags('?seed=Astana&season=winter&gpu=1&quality=low&v=2');
    expect(given).toEqual({
      seed: 'astana',
      seedGenerated: false,
      seedNormalized: true,
      debug: false,
      debugOverlay: false,
      season: 'winter',
      gpu: true,
      quality: 'low',
      version: 2,
    });
  });

  it('мусорные значения флагов игнорируются', () => {
    const flags = parseFlags('?seed=astana&quality=ultra&v=abc&season=spring');
    expect(flags.quality).toBeNull();
    expect(flags.version).toBeNull();
    expect(flags.season).toBe('summer');
  });
});

describe('buildShareUrl / syncSeedToLocation (FR-2.3, AC-2.2)', () => {
  it('ссылка содержит только seed и версию', () => {
    expect(buildShareUrl('https://example.com/city/?debug=1#x', 'astana')).toBe(
      `https://example.com/city/?seed=astana&v=${String(GEN.VERSION)}`,
    );
  });

  it('replaceState не растит историю и сохраняет другие параметры', () => {
    window.history.replaceState(null, '', '/?debug=1');
    const before = window.history.length;
    syncSeedToLocation('astana');
    expect(window.location.search).toBe('?debug=1&seed=astana');
    expect(window.history.length).toBe(before);
    syncSeedToLocation('astana');
    expect(window.location.search).toBe('?debug=1&seed=astana');
  });
});
