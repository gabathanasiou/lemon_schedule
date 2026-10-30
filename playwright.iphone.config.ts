import { defineConfig, devices } from '@playwright/test';

// iPhone portrait touch audit (roadmap 331). Mirrors playwright.ipad.config.ts
// (WebKit + a real device descriptor + the dev server) but is deliberately
// narrower: the phone shell is a different layout, so running the whole e2e
// suite here would test desktop surfaces that the phone presentation replaces.
// Only e2e/iphone-touch.spec.ts runs; the iPad suite stays the iPad gate.
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3002;

export default defineConfig({
  testDir: './e2e',
  testMatch: /iphone-touch\.spec\.ts/,
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    // Same rationale as playwright.ipad.config.ts: the overlay morph
    // self-disables under prefers-reduced-motion, removing 220ms of
    // moving/attached-detached chrome that flakes WebKit taps.
    contextOptions: { reducedMotion: 'reduce' },
    // The agentic debug bridge is gated behind LEMON_AGENT outside DEV; the
    // app specs read the seed through it (seed-agnostic contract).
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'LEMON_AGENT', value: '1' }] }],
    },
  },
  webServer: {
    command: `npm run dev -- --port=${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_GOOGLE_MAPS_API_KEY: '' },
  },
  projects: [
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 14 Pro'],
        browserName: 'webkit',
        hasTouch: true,
      },
    },
  ],
});
