import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Статическая сборка без бэкенда (design → Deployment): относительный `base`
 * позволяет раздавать `dist/` из любого подпути (GitHub Pages).
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
