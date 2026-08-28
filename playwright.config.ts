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
    // The overlay morph (kit overlayMorph.ts) self-disables under
    // prefers-reduced-motion. Tests aren't about animation — motion OFF
    // removes the 220ms close-morph clone that intercepted clicks on menu
    // items and made ~15 specs flaky ("element is not stable"/"detached").
    // overlay-morph.spec.ts (the one spec ABOUT the morph) opts back in.
    contextOptions: { reducedMotion: 'reduce' },
    // The agentic debug bridge (window.__lemonSchedule) is gated behind
    // LEMON_AGENT in production builds — the suite runs the PRODUCTION
    // preview, so every test context opens agent mode. Inert unless a spec
    // calls the bridge (debug-bridge.spec.ts, report-page-breaks.spec.ts).
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'LEMON_AGENT', value: '1' }] }],
    },
  },
  // Tests run against the PRODUCTION build (vite build is ~4s): boots and page
  // loads are far faster than the dev server (no per-module transforms, no
  // HMR). To run against the dev server instead: PLAYWRIGHT_DEV=1.
  webServer: process.env.PLAYWRIGHT_DEV
    ? {
        command: `npm run dev -- --port=${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !isolated,
        timeout: 30000,
      }
    : {
        command: `npm run build && npm run preview -- --port=${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !isolated,
        timeout: 120000,
      },
  // The perf/memory harnesses have their own configs (playwright.perf*.config.ts)
  // and are NOT part of the default suite — run them explicitly via grep.
  grepInvert: /@perf/,
});