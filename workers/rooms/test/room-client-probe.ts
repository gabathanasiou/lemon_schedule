/**
 * Local S4 room CLIENT probe — drives the app's own `RoomClient` class (the
 * exact transport the provider mounts) against `wrangler dev`, end to end:
 *
 *   npx tsx workers/rooms/test/room-client-probe.ts
 *
 * The worker comes up through the shared launcher (tools/rooms-dev.mjs, roadmap
 * 246) — reuse when one is already running, otherwise it is spawned from the
 * main tree and stopped again on exit. `ROOMS_PORT` picks another port
 * (parallel work); `ROOM_URL` overrides the base URL (no local ensure then).
 *
 * Two editors + one viewer: editor 1 seeds the empty room through the client's
 * `needInit` path, editor 2 lands on the room state (welcome + replay), actions
 * flow both ways with the optimistic-echo dedupe, the viewer is refused and
 * auto-resyncs, a late joiner folds to the converged state, and a per-user
 * undo/redo roundtrip converges every client through the fresh welcome. Exits
 * non-zero on the first failure.
 */
import { WebSocket as NodeWebSocket } from 'ws';
import { RoomClient, type WebSocketLike } from '../../../src/lib/rooms/roomClient';
import { makeBlankProject, reducer, type Action, type State } from '../../../src/store/reducer';
import { serializeProject } from '../../../src/lib/projectCodec';
import { ensureRoomsWorker, isLoopbackRoomsUrl } from '../../../tools/rooms-dev.mjs';
import type { RevisionedAction } from '../../../src/lib/rooms/protocol';
import type { Project } from '../../../src/types';

const PORT = Number(process.env.ROOMS_PORT || 8787);
const BASE = process.env.ROOM_URL ?? `http://127.0.0.1:${PORT}`;
const PROJECT_ID = process.env.ROOM_PROBE_ID ?? `client-${Date.now().toString(36)}`;
const WS_URL = BASE.replace(/^http/, 'ws') + `/room/${PROJECT_ID}`;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function waitFor(cond: () => boolean, label: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for: ${label}`);
}

function fold(project: Project, replay: RevisionedAction[]): Project {
  let p = project;
  for (const entry of replay) p = applyAction(p, entry.action);
  return p;
}

function applyAction(project: Project, action: Action): Project {
  return reducer({ past: [], present: project, future: [], _batchDepth: 0 } as State, action).present;
}

function wsAdapter(url: string): WebSocketLike {
  const socket = new NodeWebSocket(url);
  const like: WebSocketLike = {
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.on('open', () => like.onopen?.());
  socket.on('message', (data) => like.onmessage?.({ data: String(data) }));
  socket.on('close', () => like.onclose?.());
  socket.on('error', () => like.onerror?.());
  return like;
}

interface Harness {
  client: RoomClient;
  welcomeCount: number;
  role: string | null;
  state: Project | null;
  remotes: string[];
  rejected: string[];
  errors: string[];
  statuses: string[];
  /** Per-user undo availability pushes, newest last. */
  undoStates: Array<{ canUndo: boolean; canRedo: boolean }>;
}

function makeHarness(tokenUserId: string, role: string, seedBlob: string | null): Harness {
  const h: Harness = {
    client: null as unknown as RoomClient,
    welcomeCount: 0,
    role: null,
    state: null,
    remotes: [],
    rejected: [],
    errors: [],
    statuses: [],
    undoStates: [],
  };
  h.client = new RoomClient({
    url: WS_URL,
    projectId: PROJECT_ID,
    getToken: async () => `dev:${tokenUserId}:${role}`,
    getInitProject: () => seedBlob,
    createSocket: wsAdapter,
    backoffMs: [250],
    onWelcome: (w) => {
      h.welcomeCount += 1;
      h.role = w.role;
      h.state = fold(w.project, w.replay);
    },
    onRemote: (r) => {
      h.remotes.push(r.actionId);
      if (h.state) h.state = applyAction(h.state, r.action);
    },
    onRejected: (id, reason) => h.rejected.push(`${id}:${reason}`),
    onUndoState: (s) => h.undoStates.push(s),
    onError: (m) => h.errors.push(m),
    onStatus: (s) => h.statuses.push(s),
  });
  return h;
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`room worker never came up at ${BASE}`);
}

async function main(): Promise<void> {
  // The shared launcher brings the worker up (or reuses the one already
  // serving the port — parallel dev servers share ONE worker, roadmap 246).
  if (isLoopbackRoomsUrl(BASE)) {
    const ready = await ensureRoomsWorker({ port: PORT });
    if (!ready.ok) throw new Error(`room worker unavailable: ${ready.error}`);
  }
  await waitForServer();
  const seed = makeBlankProject('Client probe');

  // --- editor 1 seeds the empty room through needInit ---
  const a = makeHarness('alice', 'editor', serializeProject(seed));
  a.client.start();
  await waitFor(() => a.welcomeCount === 1, 'A welcome');
  await waitFor(() => a.client.getStatus() === 'open', 'A open');
  check('A: seeded an empty room via needInit', a.welcomeCount === 1 && a.role === 'editor', a.errors);

  // --- editor 2 joins and lands on the room state ---
  const b = makeHarness('bob', 'editor', null);
  b.client.start();
  await waitFor(() => b.welcomeCount >= 1, 'B welcome');
  await waitFor(() => b.client.getStatus() === 'open', 'B open');
  check('B: joined at the room state', b.state !== null && b.role === 'editor');

  // --- actions flow A -> B (with optimistic-echo dedupe) ---
  const actionA: Action = { type: 'UPDATE_PROJECT', payload: { title: 'Live from A' } };
  check('A: sendAction accepted while open', a.client.sendAction('a-1', actionA));
  await waitFor(() => b.remotes.includes('a-1'), "B receives A's action");
  check("B: applied A's action", b.state?.title === 'Live from A', b.state?.title);
  check('A: own echo never re-applied', !a.remotes.includes('a-1'), a.remotes);

  // --- actions flow B -> A ---
  check('B: sendAction accepted while open', b.client.sendAction('b-1', { type: 'UPDATE_PROJECT', payload: { title: 'Live from B' } }));
  await waitFor(() => a.remotes.includes('b-1'), "A receives B's action");
  check('A: applied B\'s action', a.state?.title === 'Live from B', a.state?.title);

  // --- viewer is refused and auto-resyncs ---
  const c = makeHarness('carol', 'viewer', null);
  c.client.start();
  await waitFor(() => c.welcomeCount >= 1, 'C welcome');
  await waitFor(() => c.client.getStatus() === 'open', 'C open');
  check('C: viewer welcome carries the role', c.role === 'viewer');
  c.client.sendAction('c-1', { type: 'UPDATE_PROJECT', payload: { title: 'nope' } });
  await waitFor(() => c.rejected.length >= 1, 'C rejection');
  check('C: viewer write refused', c.rejected.includes('c-1:view-only'), c.rejected);
  await waitFor(() => c.welcomeCount >= 2, 'C resync after rejection');
  check('C: healed by a fresh sync', c.welcomeCount >= 2);
  check('C: no editor saw the refused action', !a.remotes.includes('c-1') && !b.remotes.includes('c-1'));

  // --- a late joiner folds to the converged state ---
  const d = makeHarness('dana', 'editor', null);
  d.client.start();
  await waitFor(() => d.welcomeCount >= 1, 'D welcome');
  check('D: late joiner converged', d.state?.title === 'Live from B', { title: d.state?.title, errors: d.errors });

  // --- per-user undo/redo roundtrip through the app's own transport ---
  check('A: undoable action accepted', a.client.sendAction('a-2', { type: 'UPDATE_PROJECT', payload: { title: 'A undo me' } }));
  await waitFor(() => b.state?.title === 'A undo me', "B applied A's undoable action");
  await waitFor(() => a.undoStates.some((s) => s.canUndo && !s.canRedo), "A told undo is available");
  check(
    'A: room pushed canUndo=true after its own action',
    a.undoStates.some((s) => s.canUndo && !s.canRedo),
    a.undoStates
  );

  // The undo arrives as a normal `remote` LOAD — the app applies it through the
  // same onRemote path as every other edit; no welcome involved.
  const aRemotes = a.remotes.length;
  const bRemotes = b.remotes.length;
  const dRemotes = d.remotes.length;
  check('A: sendUndo accepted', a.client.sendUndo());
  await waitFor(() => a.remotes.length > aRemotes, 'A received the undo update');
  await waitFor(() => b.remotes.length > bRemotes, 'B received the undo update');
  await waitFor(() => d.remotes.length > dRemotes, 'late joiner received the undo update');
  check(
    'undo: every client converges to the pre-action state',
    a.state?.title === 'Live from B' && b.state?.title === 'Live from B' && d.state?.title === 'Live from B',
    { a: a.state?.title, b: b.state?.title, d: d.state?.title }
  );
  check(
    'undo: no client was re-welcomed (delivery is the normal update path)',
    a.welcomeCount === 1 && b.welcomeCount === 1,
    { a: a.welcomeCount, b: b.welcomeCount }
  );
  await waitFor(() => a.undoStates.some((s) => s.canRedo), "A told redo is available");
  check(
    'A: after undo the room pushed canRedo=true',
    a.undoStates.some((s) => s.canRedo),
    a.undoStates
  );
  check(
    "B: the push reflects Bob's OWN history (his own action is undoable, nothing redone)",
    b.undoStates.length > 0 &&
      b.undoStates[b.undoStates.length - 1].canUndo === true &&
      b.undoStates.every((s) => !s.canRedo),
    b.undoStates
  );

  const remotesBeforeRedo = b.remotes.length;
  check('A: sendRedo accepted', a.client.sendRedo());
  await waitFor(() => b.remotes.length > remotesBeforeRedo, "B receives A's redone action");
  await waitFor(() => a.state?.title === 'A undo me' && b.state?.title === 'A undo me', 'redo re-applied for both');
  check(
    'redo: both editors converge back to the redone state',
    a.state?.title === 'A undo me' && b.state?.title === 'A undo me',
    { a: a.state?.title, b: b.state?.title }
  );

  for (const h of [a, b, c, d]) h.client.stop();
  console.log(failures === 0 ? '\nCLIENT PROBE PASSED' : `\nCLIENT PROBE FAILED — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('client probe crashed:', err);
  process.exit(1);
});
