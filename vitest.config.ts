import { defineConfig } from 'vitest/config';

// Pure-logic unit tests (the bottom of the pyramid — see docs/TESTING.md).
// Node environment, no DOM: co-located under `src/**/__tests__/*.test.ts`.
// Run: `npm run test:unit` (watch: `npm run test:unit:watch`).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
