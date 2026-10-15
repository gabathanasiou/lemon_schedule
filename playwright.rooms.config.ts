import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from './playwright.config';

// The S4 rooms suite (roadmap 246). Deliberately NOT part of the default suite:
// it needs the local room worker (tools/rooms-dev.mjs) and — for UI-level specs
// — a configured Supabase, while playwright.config.ts pins Supabase OFF so the
// default suite is hermetic. Run:
//
//   npx playwright test --config=playwright.rooms.config.ts
//
// Specs live in e2e-rooms/ (a sibling of e2e/), so the default config's
// testDir never picks them up and the e2e spec cap/orphan checks stay about
// the capped suite. Today the worker-level tests ARE the probes
// (workers/rooms/test/room-probe.ts + room-client-probe.ts), run by
// e2e-rooms/room-probes.spec.ts.
const ROOMS_PORT = Number(process.env.ROOMS_PORT) || 8787;
const ROOMS_URL = `http://127.0.0.1:${ROOMS_PORT}`;
// Clean Durable Object state when THIS config starts the worker. With a shared
// dev worker already up, `reuseExistingServer` keeps it (and its state) — by
// design: parallel dev servers share ONE worker.
const PERSIST_DIR = mkdtempSync(join(tmpdir(), 'lemon-rooms-'));

const baseServers = base.webServer
  ? Array.isArray(base.webServer) ? base.webServer : [base.webServer]
  : [];
const appServer = baseServers[0];
if (!appServer) throw new Error('playwright.config.ts must define the app webServer');

export default defineConfig({
  ...base,
  testDir: './e2e-rooms',
  webServer: [
    {
      ...appServer,
      // Bake the local worker URL into the prod build (process env beats .env).
      // The base config's empty-Supabase pin is deliberately NOT carried over:
      // room UI specs need a real account from the developer's .env.
      env: { VITE_ROOMS_URL: ROOMS_URL },
    },
    {
      // The worker rides the ONE launcher (serve = ensure + stay up until
      // Playwright kills us; SIGTERM stops the spawn — a shared worker this
      // process did not start is left alone).
      command: `node tools/rooms-dev.mjs serve --port ${ROOMS_PORT} --persist-to ${PERSIST_DIR}`,
      url: `${ROOMS_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
