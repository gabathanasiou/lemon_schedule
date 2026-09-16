import { defineConfig } from 'vitest/config';

// Pure-logic unit tests (the bottom of the pyramid — see docs/TESTING.md).
// Node environment, no DOM: co-located under `src/**/__tests__/*.test.ts`.
// Run: `npm run test:unit` (watch: `npm run test:unit:watch`).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Coverage is a guide for where the next unit test pays off — scoped to
    // `src/lib` because `src/components` is browser-bound and covered by e2e.
    // Run: `npm run test:unit:coverage`.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**', 'src/lib/**/*.test.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
