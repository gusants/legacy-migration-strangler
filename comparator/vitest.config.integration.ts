import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
