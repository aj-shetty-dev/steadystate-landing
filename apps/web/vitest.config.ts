import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    include: ['app/**/*.spec.{ts,tsx}', 'components/**/*.spec.{ts,tsx}', 'lib/**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./test/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/.next': path.resolve(__dirname, './.next'),
    },
  },
});
