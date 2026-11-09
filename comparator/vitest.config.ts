import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.int-spec.ts',
        'src/**/*.test-support.ts',
        'src/tools/**',
        'src/adapters/**',
      ],
      thresholds: { 100: true },
    },
  },
});
