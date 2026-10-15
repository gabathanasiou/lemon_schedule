/**
 * The rooms suite's worker-level tests (playwright.rooms.config.ts, roadmap 246).
 *
 * The room's REAL test suites are the two probes — this spec runs them as child
 * processes, so one command covers the whole rooms stack (the worker webServer
 * entry + both probes) with a single green/red verdict. The probes reuse the
 * running worker through the shared launcher (tools/rooms-dev.mjs). The
 * two-window UI harness stays a manual tool (workers/rooms/test/two-window-repro.mjs
 * — real accounts + two browser contexts).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOMS_PORT = Number(process.env.ROOMS_PORT) || 8787;
const ROOM_URL = `http://127.0.0.1:${ROOMS_PORT}`;

/** Run one probe against the rooms config's worker; report its transcript on failure. */
function runProbe(rel: string): string {
  try {
    return execFileSync('npx', ['tsx', rel], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, ROOM_URL, ROOMS_PORT: String(ROOMS_PORT) },
    });
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    throw new Error(
      `${rel} failed (exit ${err.status ?? '?'})\n--- stdout ---\n${err.stdout ?? ''}\n--- stderr ---\n${err.stderr ?? ''}`
    );
  }
}

// Serial: both probes share the ONE worker; the transcript stays readable.
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('server probe — protocol, replay, hardening, per-user undo', () => {
  expect(runProbe('workers/rooms/test/room-probe.ts')).toContain('PROBE PASSED');
});

test('client probe — the app RoomClient transport, end to end', () => {
  expect(runProbe('workers/rooms/test/room-client-probe.ts')).toContain('CLIENT PROBE PASSED');
});
