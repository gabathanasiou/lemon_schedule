/**
 * Local S4 room probe — proves the room end-to-end against `wrangler dev`.
 *
 *   cd workers/rooms && npx wrangler dev --port 8787        (background)
 *   npx tsx workers/rooms/test/room-probe.ts
 *
 * Flow: A (editor) seeds the room via init → acts; B (editor) joins and must land
 * on A's state by folding snapshot + replay; B acts and A must see it; a viewer is
 * rejected; a reconnect must replay everything; the security negatives (fake origin,
 * no auth, wrong room, oversized frame, message flood) must be refused; HTTP info
 * reports the head rev. Exits non-zero on the first failure.
 */
import WebSocket from 'ws';
import { makeBlankProject, reducer, type Action, type State } from '../../../src/store/reducer';
import {
  encodeRoomMessage,
  parseRoomServerMessage,
  type RoomClientMessage,
  type RoomServerMessage,
  type RevisionedAction,
} from '../../../src/lib/rooms/protocol';
import { deserializeProject, serializeProject } from '../../../src/lib/projectCodec';
import type { Project } from '../../../src/types';

const BASE = process.env.ROOM_URL ?? 'http://127.0.0.1:8787';
// A fresh room per run: local Durable Object state persists in .wrangler/ across
// `wrangler dev` restarts, so a fixed id would hit the previous run's room.
const PROJECT_ID = process.env.ROOM_PROBE_ID ?? `probe-${Date.now().toString(36)}`;
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

function fold(project: Project, replay: RevisionedAction[]): Project {
  let p = project;
  for (const entry of replay) {
    p = reducer({ past: [], present: p, future: [], _batchDepth: 0 } as State, entry.action).present;
  }
  return p;
}

class Client {
  private ws: WebSocket;
  private messages: RoomServerMessage[] = [];
  private waiters: Array<{ pred: (m: RoomServerMessage) => boolean; resolve: (m: RoomServerMessage) => void }> = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data: WebSocket.RawData) => {
      const msg = parseRoomServerMessage(String(data));
      this.messages.push(msg ?? ({ t: 'error', message: `unparseable: ${String(data)}` } as RoomServerMessage));
      const idx = this.waiters.findIndex((w) => w.pred(this.messages[this.messages.length - 1]));
      if (idx >= 0) {
        const [waiter] = this.waiters.splice(idx, 1);
        waiter.resolve(this.messages[this.messages.length - 1]);
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(msg: RoomClientMessage): void {
    this.ws.send(encodeRoomMessage(msg));
  }

  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

  waitFor(pred: (m: RoomServerMessage) => boolean, timeoutMs = 10000): Promise<RoomServerMessage> {
    const existing = this.messages.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error('timeout waiting for message'));
      }, timeoutMs);
      const wrapped = (m: RoomServerMessage) => {
        clearTimeout(timer);
        resolve(m);
      };
      this.waiters.push({ pred, resolve: wrapped });
    });
  }

  close(): void {
    this.ws.close();
  }
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

function expectRejectedOrigin(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { origin: 'https://evil.example' });
    ws.on('open', () => {
      ws.close();
      resolve(false);
    });
    ws.on('error', () => resolve(true));
  });
}

async function main(): Promise<void> {
  await waitForServer();
  const project = makeBlankProject('Probe');

  // --- A seeds the room and acts ---
  const a = new Client(WS_URL);
  await a.open();
  a.send({ t: 'hello', token: 'dev:alice:editor', projectId: PROJECT_ID });
  check('A: empty room asks for init', (await a.waitFor((m) => m.t === 'needInit')).t === 'needInit');
  a.send({ t: 'init', project: serializeProject(project) });
  const welcomeA = await a.waitFor((m) => m.t === 'welcome');
  check('A: welcome at rev 0', welcomeA.t === 'welcome' && welcomeA.rev === 0 && welcomeA.replay.length === 0);

  const actionA: Action = { type: 'UPDATE_PROJECT', payload: { title: 'Renamed by Alice' } };
  a.send({ t: 'act', actionId: 'a-1', action: actionA });
  const echoA = await a.waitFor((m) => m.t === 'remote' && m.actionId === 'a-1');
  check('A: own action echoes back at rev 1', echoA.t === 'remote' && echoA.rev === 1 && echoA.userId === 'alice');

  // --- B joins mid-session and folds snapshot + replay ---
  const b = new Client(WS_URL);
  await b.open();
  b.send({ t: 'hello', token: 'dev:bob:editor', projectId: PROJECT_ID });
  const welcomeB = await b.waitFor((m) => m.t === 'welcome');
  if (welcomeB.t === 'welcome') {
    check('B: welcome at rev 1 with 1 replay action', welcomeB.rev === 1 && welcomeB.replay.length === 1, welcomeB.rev);
    const foldedB = fold(deserializeProject(welcomeB.project), welcomeB.replay);
    check("B: folded state has A's title", foldedB.title === 'Renamed by Alice', foldedB.title);
  }

  // --- B acts; A receives it ---
  b.send({ t: 'act', actionId: 'b-1', action: { type: 'UPDATE_PROJECT', payload: { title: 'Round two' } } });
  const remoteAtA = await a.waitFor((m) => m.t === 'remote' && m.actionId === 'b-1');
  check('A: sees B\'s action at rev 2', remoteAtA.t === 'remote' && remoteAtA.rev === 2 && remoteAtA.userId === 'bob');

  // --- viewer cannot write ---
  const c = new Client(WS_URL);
  await c.open();
  c.send({ t: 'hello', token: 'dev:carol:viewer', projectId: PROJECT_ID });
  const welcomeC = await c.waitFor((m) => m.t === 'welcome');
  check('C: viewer welcome carries role', welcomeC.t === 'welcome' && welcomeC.role === 'viewer');
  c.send({ t: 'act', actionId: 'c-1', action: { type: 'UPDATE_PROJECT', payload: { title: 'nope' } } });
  const rejectedC = await c.waitFor((m) => m.t === 'rejected' && m.actionId === 'c-1');
  check('C: viewer write rejected', rejectedC.t === 'rejected' && rejectedC.reason === 'view-only', rejectedC);

  // --- room-invalid actions rejected ---
  a.send({ t: 'act', actionId: 'a-load', action: { type: 'LOAD', payload: project } as Action });
  const loadRejected = await a.waitFor((m) => m.t === 'rejected' && m.actionId === 'a-load');
  check('A: LOAD rejected in rooms', loadRejected.t === 'rejected', loadRejected);

  // --- reconnect replays everything ---
  b.close();
  await new Promise((r) => setTimeout(r, 200));
  a.send({ t: 'act', actionId: 'a-2', action: { type: 'UPDATE_PROJECT', payload: { title: 'After B left' } } });
  await a.waitFor((m) => m.t === 'remote' && m.actionId === 'a-2');

  const b2 = new Client(WS_URL);
  await b2.open();
  b2.send({ t: 'hello', token: 'dev:bob:editor', projectId: PROJECT_ID });
  const welcomeB2 = await b2.waitFor((m) => m.t === 'welcome');
  if (welcomeB2.t === 'welcome') {
    check('B2: reconnects at rev 3 with full replay', welcomeB2.rev === 3 && welcomeB2.replay.length === 3, welcomeB2.rev);
    const folded = fold(deserializeProject(welcomeB2.project), welcomeB2.replay);
    check('B2: folded state is converged', folded.title === 'After B left', folded.title);
  }

  // --- security negatives (OWASP WebSocket checklist) -------------------------------
  check('evil origin: handshake rejected', await expectRejectedOrigin());

  const d = new Client(WS_URL);
  await d.open();
  d.send({ t: 'act', actionId: 'd-1', action: { type: 'BATCH_START' } });
  const unauth = await d.waitFor((m) => m.t === 'error');
  check('D: unauthenticated write refused', unauth.t === 'error' && unauth.message === 'unauthenticated', unauth);

  const e = new Client(WS_URL);
  await e.open();
  e.send({ t: 'hello', token: 'dev:eve:editor', projectId: 'other-room' });
  const wrongRoom = await e.waitFor((m) => m.t === 'error');
  check('E: hello for another room refused', wrongRoom.t === 'error' && wrongRoom.message === 'wrong room', wrongRoom);

  const h = new Client(WS_URL);
  await h.open();
  h.sendRaw('x'.repeat(1_000_001));
  const tooLarge = await h.waitFor((m) => m.t === 'error');
  check('H: oversized message refused', tooLarge.t === 'error' && tooLarge.message === 'message too large', tooLarge);

  const f = new Client(WS_URL);
  await f.open();
  f.send({ t: 'hello', token: 'dev:frank:editor', projectId: PROJECT_ID });
  await f.waitFor((m) => m.t === 'welcome');
  for (let i = 0; i < 200; i++) f.send({ t: 'sync' });
  const limited = await f.waitFor((m) => m.t === 'error' && m.message === 'rate limited');
  check('F: message flood rate limited', limited.t === 'error' && limited.message === 'rate limited', limited);

  // --- HTTP info reflects head rev ---
  const info = (await (await fetch(`${BASE}/room/${PROJECT_ID}`)).json()) as { rev: number; initialized: boolean };
  check('HTTP info: rev 3, initialized', info.rev === 3 && info.initialized === true, info);

  a.close();
  b2.close();
  c.close();
  console.log(failures === 0 ? '\nPROBE PASSED' : `\nPROBE FAILED — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
