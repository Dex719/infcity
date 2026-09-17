import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Unit-тесты `world/`, `mobs/`, `api/` — чистый TypeScript без three-рендера
 * (design → Testing Strategy), поэтому окружение по умолчанию — `node`.
 * Для тестов с DOM (`api/Seed`) окружение переключается директивой
 * `// @vitest-environment jsdom` в самом файле теста.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  }),
);
