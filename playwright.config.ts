import { defineConfig } from '@playwright/test';
import { availableParallelism } from 'node:os';

// Set PLAYWRIGHT_PORT to force an isolated port (default 3001). When
// overridden the server is OWNED (no reuse) so a run never silently tests
// another process's server (stale-code bugs).
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3001;
const isolated = process.env.PLAYWRIGHT_PORT !== undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // Distribute tests WITHIN a file across workers too — specs are independent
  // (fresh context per test, no module state); the 5 order-dependent specs opt
  // out via `test.describe.configure({ mode: 'serial' })`. Better load
  // balancing = shorter wall time at the same worker/CPU count.
  fullyParallel: true,
  // Retry once locally (twice on CI) so a transient flake doesn't read as a
  // regression and send an agent off to `git checkout` a baseline. The first
  // retry records a trace (`use.trace`) for the flaky test. Chronic flakers are
  // tagged `@quarantine` (excluded below) rather than retried forever — see
  // `docs/TESTING.md`.
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
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
  // Parallelism — each worker is a full Chromium, so N workers pins ~N cores
  // for the whole run. 5 (Playwright's cores/2 on a 10-core Mac) is the proven
  // baseline: roughly half the cores, no fan spin. 7+ pins most of the CPU and
  // ramps the fans; 8 is a bit faster (~62s) if you don't mind the heat. Raise
  // deliberately: `PLAYWRIGHT_WORKERS=8 npx playwright test`. Explicit cap (not
  // undefined) so a big machine can't silently oversubscribe. Timing-sensitive
  // morph/canvas specs can flake under heavy contention — see docs/TESTING.md.
  // The duration reporter prints the total at the end.
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : Math.min(5, availableParallelism()),
  reporter: [['list'], ['./scripts/pw-duration-reporter.mjs']],
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
  // `@quarantine` = known-flaky, tracked in docs/TESTING.md; run explicitly:
  //   npx playwright test --grep @quarantine
  grepInvert: /@perf|@quarantine/,
});