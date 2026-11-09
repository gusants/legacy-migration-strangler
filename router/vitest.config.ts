import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/routing/**/*.ts', 'src/handler.ts'],
      exclude: ['src/**/*.spec.ts', 'src/routing/routing-config.ts'],
      thresholds: { 100: true },
    },
  },
});
