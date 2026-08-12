import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'edit-toggle-flow.spec.ts',
  timeout: 300000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    screenshot: 'only-on-failure',
    browserName: 'webkit',
  },
  webServer: {
    command: 'npm run preview -- --port=4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
