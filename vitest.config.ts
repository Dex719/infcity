import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit-тесты `world/`, `mobs/`, `api/` — чистый TypeScript без three-рендера
 * (design → Testing Strategy), поэтому окружение по умолчанию — `node`.
 * Для тестов с DOM (`api/Seed`) окружение переключается директивой
 * `// @vitest-environment jsdom` в самом файле теста.
 * Алиас `@` объявлен здесь явно, чтобы не импортировать vite.config (native loader).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/world/**', 'src/api/**', 'src/mobs/**'],
    },
  },
});
