import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    // Same rationale as playwright.config.ts: the overlay morph self-disables
    // under prefers-reduced-motion, removing 220ms of moving/attached-detached
    // chrome that flakes WebKit clicks on menu items.
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'npm run dev -- --port=3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ipad',
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'webkit',
      },
    },
  ],
});
