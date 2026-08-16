import { defineConfig } from '@playwright/test';

// Set PLAYWRIGHT_PORT to force an isolated port (default 3001). When
// overridden the server is OWNED (no reuse) so a run never silently tests
// another process's server (stale-code bugs).
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3001;
const isolated = process.env.PLAYWRIGHT_PORT !== undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port=${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isolated,
    timeout: 30000,
  },
});
