import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.contract.ts'],
    testTimeout: 60_000,
  },
});
