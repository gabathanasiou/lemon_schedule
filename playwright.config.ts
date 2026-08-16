import { defineConfig } from '@playwright/test';

// Workers get their own port via PLAYWRIGHT_PORT (spawn-feature assigns
// 3001/3011/3021/…). When overridden the server is OWNED (no reuse) so a
// worker never silently tests another worker's server (stale-code bugs).
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
