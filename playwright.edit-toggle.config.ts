import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'edit-toggle-perf.spec.ts',
  timeout: 300000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port=3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
