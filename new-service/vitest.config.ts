import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/charges/domain/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/charges/domain/charge.types.ts'],
      thresholds: { 100: true },
    },
  },
});
