/**
 * The ONE local room-worker launcher (roadmap 246) — `wrangler dev` without
 * the manual background command and without fighting parallel worktrees.
 *
 *   - `ensureRoomsWorker()` health-probes the port: a running worker is REUSED
 *     (so N worktree dev servers share ONE worker, one `.dev.vars` and one
 *     Durable Object state), otherwise `wrangler dev` is spawned from the MAIN
 *     working tree's `workers/rooms` (resolved via `git worktree list` — the
 *     gitignored `.dev.vars` and `.wrangler` state live there, never in a
 *     fresh worktree).
 *   - `stopRoomsWorker()` kills ONLY what THIS process spawned — a dev server
 *     shutting down must never take a shared worker away from the others.
 *   - `killRoomsWorker()` force-kills whatever serves the port. Its ONLY
 *     caller is the two-window harness's outage simulation
 *     (workers/rooms/test/two-window-repro.mjs); dev servers use stop.
 *   - `node tools/rooms-dev.mjs serve [--port N] [--persist-to DIR]` =
 *     ensure + stay alive (the Playwright rooms config's worker webServer
 *     entry); SIGTERM/SIGINT stops the spawn.
 *
 * Logs are `[rooms]`-prefixed. A failure never throws into the caller's
 * critical path: `ensureRoomsWorker()` answers `{ ok: false, error }` and the
 * caller degrades (the app's badge goes `unreachable`, edits buffer — roadmap
 * 239). Concurrent ensures (two dev servers cold-starting together) may race a
 * second spawn into a doomed `wrangler dev` — it exits on "address already in
 * use", and the loser rides the winner's readiness with `started: false`.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/** Default local worker port (`ROOMS_PORT` overrides, for parallel work). */
export const DEFAULT_ROOMS_PORT = 8787;
export const roomsPort = () => Number(process.env.ROOMS_PORT) || DEFAULT_ROOMS_PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => process.stdout.write(`[rooms] ${line}\n`);
const logErr = (line) => process.stderr.write(`[rooms] ${line}\n`);

/** Prefix each line of a child stream (`[rooms]`), flushing partials on exit.
 *  ANSI colour codes are stripped — wrangler colours its errors even when
 *  piped, and the raw escapes made the dev-server log unreadable. */
function prefixer(write) {
  let buf = '';
  return {
    onData: (chunk) => {
      buf += chunk.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        write(`[rooms] ${buf.slice(0, i)}\n`);
        buf = buf.slice(i + 1);
      }
    },
    flush: () => {
      if (buf) {
        write(`[rooms] ${buf}\n`);
        buf = '';
      }
    },
  };
}

/**
 * The main working tree — `git worktree list` lists it FIRST (porcelain:
 * blank-line-separated blocks). The worker runs from HERE so every worktree
 * shares `.dev.vars` + Durable Object state. Falls back to this tree when git
 * cannot answer (not a checkout).
 */
export function mainWorktreeRoot() {
  try {
    const out = execFileSync('git', ['-C', REPO, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    const first = out.split('\n\n')[0] ?? '';
    const match = /^worktree (.*)$/m.exec(first);
    if (match) return match[1];
  } catch {
    /* not a git working tree — use this one */
  }
  return REPO;
}

/** Loopback hosts only — the local worker, never a deployed one. */
export function isLoopbackRoomsUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

/** The port of a loopback rooms URL, or null (non-loopback / unparseable). */
export function localPortFromUrl(url, fallback = roomsPort()) {
  if (!isLoopbackRoomsUrl(url)) return null;
  const raw = new URL(url).port;
  if (!raw) return fallback;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

/** True when a lemon-rooms worker answers `/health` on the port. */
async function healthy(port, timeoutMs = 800) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.service === 'lemon-rooms';
  } catch {
    return false;
  }
}

const state = { child: null, port: null, persistTo: undefined };

function killOwnSpawn() {
  const child = state.child;
  state.child = null;
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  // wrangler forwards SIGTERM to workerd; SIGKILL is the backstop when the
  // process is wedged (the timer never runs in a process-exit hook — the
  // direct-binary spawn makes SIGTERM reliable there).
  const hard = setTimeout(() => {
    try {
      if (child.exitCode === null) child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, 2500);
  hard.unref();
}

export function stopRoomsWorker() {
  killOwnSpawn();
}

/** How to launch wrangler: the pinned local binary (signals reach wrangler
 *  itself) from this tree or the main tree, else `npx`. */
function wranglerCommand({ port, persistTo }) {
  const args = ['dev', '--port', String(port)];
  if (persistTo) args.push('--persist-to', persistTo);
  const bin = [
    // this tree first (a worktree installs the pin itself), then the main
    // tree — both carry the same pinned version
    join(REPO, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    join(mainWorktreeRoot(), 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  ].find((p) => existsSync(p));
  return bin
    ? { cmd: process.execPath, args: [bin, ...args] }
    : { cmd: 'npx', args: ['wrangler', ...args] };
}

/** Spawn `wrangler dev` from the main tree, `[rooms]`-prefixed logs, tracked
 *  in `state` so stop/release know what this process owns. */
function spawnWrangler({ port, persistTo, cwd }) {
  const { cmd, args } = wranglerCommand({ port, persistTo });
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  // Never let the child HOLD the parent open: a script whose only job was
  // ensure() must be able to end naturally (its exit hook then stops the
  // spawn — nothing outlives its spawner by default; releaseRoomsWorker() is
  // the explicit handoff for the one caller that wants the worker to stay).
  child.unref();
  child.stdout?.unref?.();
  child.stderr?.unref?.();
  const out = prefixer((line) => process.stdout.write(line));
  const err = prefixer((line) => process.stderr.write(line));
  child.stdout.on('data', out.onData);
  child.stderr.on('data', err.onData);
  child.on('exit', (code, signal) => {
    out.flush();
    err.flush();
    if (state.child === child) {
      state.child = null;
      log(`worker exited (${signal ?? `code ${code}`})`);
    }
  });
  // One exit hook per process: nothing may outlive the process that spawned it.
  process.once('exit', () => stopRoomsWorker());
  return child;
}

/**
 * Bring the local worker up on `port` (default `ROOMS_PORT` || 8787): reuse a
 * healthy one, otherwise spawn and wait for `/health`. `persistTo` isolates
 * Durable Object state (the Playwright rooms config's clean-state runs).
 */
export async function ensureRoomsWorker({ port = roomsPort(), persistTo, readyTimeoutMs = 60_000 } = {}) {
  const url = `http://127.0.0.1:${port}`;
  if (await healthy(port)) {
    log(`reusing the worker on ${url}`);
    return { ok: true, started: false, url };
  }

  const own = state.child;
  const ownAlive = !!own && own.exitCode === null && state.port === port;
  if (!ownAlive) {
    if (own && own.exitCode === null) stopRoomsWorker(); // asked for another port
    const cwd = join(mainWorktreeRoot(), 'workers', 'rooms');
    if (!existsSync(join(cwd, 'wrangler.toml'))) {
      const error = `no workers/rooms in ${cwd}`;
      logErr(error);
      return { ok: false, started: false, url, error };
    }
    if (!existsSync(join(cwd, '.dev.vars'))) {
      log('warning: workers/rooms/.dev.vars is missing — dev tokens will be refused (DEV_AUTH=1 needed)');
    }
    log(`starting wrangler dev on :${port}${persistTo ? ` (persist-to ${persistTo})` : ''}`);
    state.port = port;
    state.persistTo = persistTo;
    state.child = spawnWrangler({ port, persistTo, cwd });
  }

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (await healthy(port)) {
      // `started` = we own a LIVE spawn. A concurrent ensure can lose the port
      // race (its doomed wrangler exits, the exit handler clears `state`) and
      // then ride the winner's readiness here — reuse, not a fake spawn.
      const started = !!state.child && state.child.exitCode === null;
      log(`ready on ${url}`);
      return { ok: true, started, url };
    }
    const child = state.child;
    if (child && child.exitCode !== null) {
      const error = `wrangler dev exited (code ${child.exitCode}) — is :${port} already taken?`;
      logErr(error);
      return { ok: false, started: false, url, error };
    }
    await sleep(250);
  }
  const error = `worker did not become ready within ${readyTimeoutMs}ms`;
  logErr(error);
  return { ok: false, started: false, url, error };
}

function run(cmd, args) {
  return new Promise((done) => {
    try {
      const child = execFile(cmd, args, () => done());
      child.on('error', () => done());
    } catch {
      done();
    }
  });
}

/** Poll `/health` until it matches `want` or the timeout lapses. */
async function waitForHealth(port, want, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let ok = await healthy(port);
  while (ok !== want && Date.now() < deadline) {
    await sleep(250);
    ok = await healthy(port);
  }
  return ok === want;
}

/**
 * Force-kill whatever serves `port` — the harness's outage simulation ONLY
 * (two-window-repro.mjs proves the offline buffer by taking the worker down
 * mid-session). Kills our own spawn when we have one, then the port's
 * listeners; resolves once `/health` stops answering (bounded wait).
 */
export async function killRoomsWorker({ port = roomsPort() } = {}) {
  killOwnSpawn();
  // Port-scoped force kill: the wrangler parent FIRST (killing only its
  // workerd lets the parent respawn one — verified), then any leftover
  // listener. The pattern covers every launch style (`wrangler.js`,
  // `.bin/wrangler`, wrangler-dist cli) without touching other ports.
  await run('pkill', ['-f', `wrangler.*--port ${port}`]);
  await run('sh', ['-c', `lsof -ti :${port} | xargs kill -9 2>/dev/null; true`]);
  if (await waitForHealth(port, false, 10_000)) return true;
  logErr(`the worker on :${port} did not stop`);
  return false;
}

/**
 * Hand the worker off to OUTLIVE this process — the two-window harness's
 * contract (its outage section kills the worker mid-session; the dev machine
 * keeps one afterwards). Our own spawn is restarted detached with ignored
 * stdio (nothing can write to a dead parent); a worker this process did NOT
 * spawn is left exactly as found.
 */
export async function releaseRoomsWorker({ port = roomsPort() } = {}) {
  const url = `http://127.0.0.1:${port}`;
  if (!state.child || state.child.exitCode !== null) {
    return { ok: await healthy(port), url };
  }
  stopRoomsWorker();
  await waitForHealth(port, false, 10_000);
  const cwd = join(mainWorktreeRoot(), 'workers', 'rooms');
  const { cmd, args } = wranglerCommand({ port, persistTo: state.persistTo });
  const child = spawn(cmd, args, { cwd, stdio: 'ignore', detached: true });
  child.unref();
  const ok = await waitForHealth(port, true, 60_000);
  log(ok ? `released the worker on ${url} — it outlives this process` : `failed to release the worker on ${url}`);
  return { ok, url };
}

// ---- CLI -------------------------------------------------------------------

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function cli() {
  const cmd = process.argv[2] ?? 'serve';
  if (cmd !== 'serve') {
    logErr(`unknown command "${cmd}" — use: node tools/rooms-dev.mjs serve [--port N] [--persist-to DIR]`);
    process.exit(2);
  }
  const port = Number(flagValue('--port')) || roomsPort();
  const persistTo = flagValue('--persist-to') ?? undefined;
  const res = await ensureRoomsWorker({ port, persistTo });
  if (!res.ok) process.exit(1);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopRoomsWorker();
      process.exit(0);
    });
  }
  // Keep serving until the caller kills us (the worker child holds the loop
  // open; this interval is the belt to that braces).
  setInterval(() => {}, 1 << 30);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli();
}
