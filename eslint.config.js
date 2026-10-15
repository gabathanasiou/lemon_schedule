import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

// Minimal, type-aware lint for the e2e specs ONLY (the repo has no ESLint
// otherwise). The one rule that pays for itself: `no-floating-promises` —
// a missing `await` on a Playwright call is a classic flaky-test generator.
// Covers the default suite (e2e/) and the rooms suite (e2e-rooms/).
// Run: `npm run lint:tests` (chained into `npm run lint`).
export default tseslint.config(tseslint.configs.base, {
  files: ['e2e/**/*.ts', 'e2e-rooms/**/*.ts'],
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
});
