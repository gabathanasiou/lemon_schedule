/**
 * Local S4 room probe — proves the room end-to-end against `wrangler dev`.
 *
 *   npx tsx workers/rooms/test/room-probe.ts
 *
 * The worker comes up through the shared launcher (tools/rooms-dev.mjs, roadmap
 * 246) — reuse when one is already running, otherwise it is spawned from the
 * main tree and stopped again on exit. `ROOMS_PORT` picks another port
 * (parallel work); `ROOM_URL` overrides the base URL (no local ensure then).
 *
 * Flow: A (editor) seeds the room via init → acts; B (editor) joins and must land
 * on A's state by folding snapshot + replay; B acts and A must see it; a viewer is
 * rejected; a reconnect must replay everything; the security negatives (fake origin,
 * no auth, wrong room, oversized frame, message flood, plain-GET metadata) must be
 * refused; room info over the WebSocket reports the head rev; and a dedicated room
 * proves per-user undo/redo (rebase via fresh welcome, whole-batch units, empty-stack
 * + viewer refusals). Exits non-zero on the first failure.
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
import { ROOM_REDO_BLOCKED, ROOM_UNDO_BLOCKED } from '../../../src/lib/rooms/roomNotes';
import { ensureRoomsWorker, isLoopbackRoomsUrl } from '../../../tools/rooms-dev.mjs';
import type { Project } from '../../../src/types';

const PORT = Number(process.env.ROOMS_PORT || 8787);
const BASE = process.env.ROOM_URL ?? `http://127.0.0.1:${PORT}`;
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

function applyOne(project: Project, action: Action): Project {
  return reducer({ past: [], present: project, future: [], _batchDepth: 0 } as State, action).present;
}

function fold(project: Project, replay: RevisionedAction[]): Project {
  let p = project;
  for (const entry of replay) p = applyOne(p, entry.action);
  return p;
}

function foldWelcome(m: RoomServerMessage): Project | null {
  return m.t === 'welcome' ? fold(deserializeProject(m.project), m.replay) : null;
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
    return this.waitForNext(pred, timeoutMs);
  }

  /** How many messages this client has received — pair with `waitForAfter` to
   *  assert on messages that arrive AFTER a point (an earlier message with the
   *  same shape must not satisfy the predicate). */
  mark(): number {
    return this.messages.length;
  }

  /** Like `waitFor`, but only messages at/after `mark` count — race-free for
   *  back-to-back frames (the room writes `error` + `undoState` in one turn). */
  waitForAfter(mark: number, pred: (m: RoomServerMessage) => boolean, timeoutMs = 10000): Promise<RoomServerMessage> {
    const existing = this.messages.slice(mark).find(pred);
    if (existing) return Promise.resolve(existing);
    return this.waitForNext(pred, timeoutMs);
  }

  /** Wait for a message matching `pred` that arrives AFTER this call — history
   *  is ignored (for assertions whose predicate an EARLIER message already
   *  satisfies, e.g. a second `undoState`). Prefer `mark` + `waitForAfter`
   *  when the send and the assertion are not separated by other turns. */
  waitForNext(pred: (m: RoomServerMessage) => boolean, timeoutMs = 10000): Promise<RoomServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error('timeout waiting for next message'));
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

/** Head rev + initialized over the wire (roadmap 277 — the plain-GET metadata
 *  endpoint is refused with 426). A viewer hello reads without writing; an
 *  empty room answers needInit. */
async function roomInfo(projectId: string): Promise<{ rev: number; initialized: boolean }> {
  const c = new Client(BASE.replace(/^http/, 'ws') + `/room/${projectId}`);
  await c.open();
  c.send({ t: 'hello', token: 'dev:probe:viewer', projectId });
  const msg = await c.waitFor((m) => m.t === 'welcome' || m.t === 'needInit');
  c.close();
  return msg.t === 'welcome' ? { rev: msg.rev, initialized: true } : { rev: 0, initialized: false };
}

async function main(): Promise<void> {
  // The shared launcher brings the worker up (or reuses the one already
  // serving the port — parallel dev servers share ONE worker, roadmap 246).
  if (isLoopbackRoomsUrl(BASE)) {
    const ready = await ensureRoomsWorker({ port: PORT });
    if (!ready.ok) throw new Error(`room worker unavailable: ${ready.error}`);
  }
  await waitForServer();

  // --- HTTP surface (roadmap 277): plain GET refused, /health stays open ---
  check('plain GET: room metadata refused (426)', (await fetch(`${BASE}/room/${PROJECT_ID}`)).status === 426);
  check('health: still auth-less and open', (await fetch(`${BASE}/health`)).status === 200);

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

  // --- room info over the wire reflects head rev (plain GET refused, 277) ---
  const info = await roomInfo(PROJECT_ID);
  check('room info (ws): rev 3, initialized', info.rev === 3 && info.initialized === true, info);

  // --- per-user undo/redo (a dedicated room keeps the revs above stable) ---
  const UNDO_ROOM = `${PROJECT_ID}-undo`;
  const UNDO_WS_URL = BASE.replace(/^http/, 'ws') + `/room/${UNDO_ROOM}`;
  const ua = new Client(UNDO_WS_URL);
  await ua.open();
  ua.send({ t: 'hello', token: 'dev:alice:editor', projectId: UNDO_ROOM });
  await ua.waitFor((m) => m.t === 'needInit');
  ua.send({ t: 'init', project: serializeProject(makeBlankProject('Undo probe')) });
  await ua.waitFor((m) => m.t === 'welcome');

  const ub = new Client(UNDO_WS_URL);
  await ub.open();
  ub.send({ t: 'hello', token: 'dev:bob:editor', projectId: UNDO_ROOM });
  await ub.waitFor((m) => m.t === 'welcome');

  // Alice acts, Bob acts on a DISJOINT field, Alice undoes her OWN latest
  // action — the rebuild must replay Bob's later commit on top (a same-field
  // overwrite is the BLOCKED case, covered by the dedicated room further down).
  ua.send({ t: 'act', actionId: 'u-a1', action: { type: 'UPDATE_PROJECT', payload: { title: 'UA' } } });
  await ua.waitFor((m) => m.t === 'remote' && m.actionId === 'u-a1');
  check(
    'UA: undo availability pushed after its own action (undo yes, redo no)',
    (await ua.waitFor((m) => m.t === 'undoState' && m.canUndo && !m.canRedo)).t === 'undoState'
  );
  ub.send({ t: 'act', actionId: 'u-b1', action: { type: 'UPDATE_PROJECT', payload: { draftNumber: 'UB' } } });
  await ub.waitFor((m) => m.t === 'remote' && m.actionId === 'u-b1');
  ua.send({ t: 'undo' });
  // The undo is delivered as ONE new action at the rebased rev — the normal
  // update path, not a join-shaped welcome.
  const undoUpdateA = await ua.waitFor((m) => m.t === 'remote' && m.rev === 3);
  const undoUpdateB = await ub.waitFor((m) => m.t === 'remote' && m.rev === 3);
  const undoLoadA = undoUpdateA.t === 'remote' ? undoUpdateA.action : null;
  const undoLoadB = undoUpdateB.t === 'remote' ? undoUpdateB.action : null;
  check(
    'UA: undo broadcasts ONE LOAD action to every client at the rebased rev',
    undoUpdateA.t === 'remote' && undoUpdateB.t === 'remote' && undoLoadA?.type === 'LOAD' && undoLoadB?.type === 'LOAD'
  );
  const afterUndo = undoLoadA?.type === 'LOAD' ? undoLoadA.payload : null;
  const afterUndoB = undoLoadB?.type === 'LOAD' ? undoLoadB.payload : null;
  check("UA: Alice converged to the state with her title reverted", afterUndo?.title === 'Undo probe', afterUndo?.title);
  check("UB: Bob's disjoint edit SURVIVED Alice's undo", afterUndoB?.draftNumber === 'UB', afterUndoB?.draftNumber);
  check(
    'UA: after undo — undo exhausted, redo available (per-user)',
    (await ua.waitFor((m) => m.t === 'undoState' && !m.canUndo && m.canRedo)).t === 'undoState'
  );
  check(
    'UB: Bob still has his own undo available after Alice\u2019s undo',
    (await ub.waitFor((m) => m.t === 'undoState' && m.canUndo)).t === 'undoState'
  );
  ua.send({ t: 'redo' });
  const redoAtA = await ua.waitFor((m) => m.t === 'remote' && m.rev === 4);
  const redoAtB = await ub.waitFor((m) => m.t === 'remote' && m.rev === 4);
  check('UA: redo streams to the caller too', redoAtA.t === 'remote' && redoAtA.userId === 'alice');
  check('UB: redo streams to peers', redoAtB.t === 'remote' && redoAtB.userId === 'alice');
  check(
    'UA: redo restored the state',
    afterUndo !== null && redoAtA.t === 'remote' && applyOne(afterUndo, redoAtA.action).title === 'UA'
  );

  // Empty stacks and viewers.
  ua.send({ t: 'redo' });
  check('UA: empty redo errors', (await ua.waitFor((m) => m.t === 'error' && m.message === 'nothing to redo')).t === 'error');

  const ue = new Client(UNDO_WS_URL);
  await ue.open();
  ue.send({ t: 'hello', token: 'dev:erin:editor', projectId: UNDO_ROOM });
  await ue.waitFor((m) => m.t === 'welcome');
  ue.send({ t: 'undo' });
  check('UE: empty undo errors', (await ue.waitFor((m) => m.t === 'error' && m.message === 'nothing to undo')).t === 'error');

  const uv = new Client(UNDO_WS_URL);
  await uv.open();
  uv.send({ t: 'hello', token: 'dev:carol:viewer', projectId: UNDO_ROOM });
  await uv.waitFor((m) => m.t === 'welcome');
  uv.send({ t: 'undo' });
  check('UV: viewer undo refused', (await uv.waitFor((m) => m.t === 'error' && m.message === 'view-only')).t === 'error');
  check(
    'UV: a viewer is never told it can undo/redo',
    (await uv.waitFor((m) => m.t === 'undoState' && !m.canUndo && !m.canRedo)).t === 'undoState'
  );

  // A client batch is ONE undo unit (revs 5-7), undone and redone as one.
  ub.send({ t: 'act', actionId: 'u-b2s', action: { type: 'BATCH_START' } });
  ub.send({ t: 'act', actionId: 'u-b2', action: { type: 'UPDATE_PROJECT', payload: { title: 'UB2' } } });
  ub.send({ t: 'act', actionId: 'u-b2c', action: { type: 'BATCH_COMMIT' } });
  await ub.waitFor((m) => m.t === 'remote' && m.actionId === 'u-b2c');
  await ua.waitFor((m) => m.t === 'remote' && m.actionId === 'u-b2c');
  ub.send({ t: 'undo' });
  const batchUpdateA = await ua.waitFor((m) => m.t === 'remote' && m.rev === 8);
  const batchUpdateB = await ub.waitFor((m) => m.t === 'remote' && m.rev === 8);
  check(
    'UB: a batch undoes as ONE unit (one LOAD update at rev 8)',
    batchUpdateA.t === 'remote' && batchUpdateB.t === 'remote' && batchUpdateA.action.type === 'LOAD'
  );
  const batchState = batchUpdateA.t === 'remote' && batchUpdateA.action.type === 'LOAD' ? batchUpdateA.action.payload : null;
  check('UB: batch undo reverted the batch update', batchState?.title === 'UA', batchState?.title);

  ub.send({ t: 'redo' });
  const batchRedone: RevisionedAction[] = [];
  for (const rev of [9, 10, 11]) {
    const m = await ua.waitFor((x) => x.t === 'remote' && x.rev === rev);
    if (m.t === 'remote') batchRedone.push({ rev: m.rev, userId: m.userId, action: m.action });
  }
  check(
    'UB: batch redo re-applies all three rows as one unit',
    batchRedone.map((e) => e.action.type).join(',') === 'BATCH_START,UPDATE_PROJECT,BATCH_COMMIT',
    batchRedone.map((e) => e.action.type)
  );
  check(
    'UB: batch redo restored the state',
    batchState !== null && fold(batchState, batchRedone).title === 'UB2',
    batchState && fold(batchState, batchRedone).title
  );

  const undoInfo = await roomInfo(UNDO_ROOM);
  check('undo room info: head rev 11 after undo + batch redo', undoInfo.rev === 11, undoInfo);

  // --- blocked undo + redo safety (roadmap 242) ------------------------------
  // A types, B extends: A's undo rebuilds to the SAME state (B's whole-value
  // edit absorbed A's unit) — the room must answer with the blocked message,
  // consume the unit (so A's next undo moves on), and change NOTHING: no rev
  // bump, no broadcast, no redo entry.
  const BLOCKED_ROOM = `${PROJECT_ID}-blocked`;
  const BLOCKED_WS_URL = BASE.replace(/^http/, 'ws') + `/room/${BLOCKED_ROOM}`;
  const blockedInfo = () => roomInfo(BLOCKED_ROOM);
  const ka = new Client(BLOCKED_WS_URL);
  await ka.open();
  ka.send({ t: 'hello', token: 'dev:alice:editor', projectId: BLOCKED_ROOM });
  await ka.waitFor((m) => m.t === 'needInit');
  ka.send({ t: 'init', project: serializeProject(makeBlankProject('Blocked probe')) });
  await ka.waitFor((m) => m.t === 'welcome');
  const kb = new Client(BLOCKED_WS_URL);
  await kb.open();
  kb.send({ t: 'hello', token: 'dev:bob:editor', projectId: BLOCKED_ROOM });
  await kb.waitFor((m) => m.t === 'welcome');

  ka.send({ t: 'act', actionId: 'k-a1', action: { type: 'UPDATE_PROJECT', payload: { title: 'A first' } } });
  await ka.waitFor((m) => m.t === 'remote' && m.actionId === 'k-a1');
  ka.send({ t: 'act', actionId: 'k-a2', action: { type: 'UPDATE_PROJECT', payload: { title: 'hello' } } });
  await ka.waitFor((m) => m.t === 'remote' && m.actionId === 'k-a2');
  kb.send({ t: 'act', actionId: 'k-b1', action: { type: 'UPDATE_PROJECT', payload: { title: 'hello world' } } });
  await ka.waitFor((m) => m.t === 'remote' && m.actionId === 'k-b1');

  const blockedMark = ka.mark();
  ka.send({ t: 'undo' });
  const blockedError = await ka.waitForAfter(blockedMark, (m) => m.t === 'error');
  check('KA: undo absorbed by a peer edit is BLOCKED with the message', blockedError.t === 'error' && blockedError.message === ROOM_UNDO_BLOCKED, blockedError);
  const blockedState = await ka.waitForAfter(blockedMark, (m) => m.t === 'undoState');
  check(
    'KA: blocked undo offers NO redo — and no undo was consumed beyond the blocked unit',
    blockedState.t === 'undoState' && !blockedState.canRedo && blockedState.canUndo,
    blockedState
  );
  const afterBlocked = await blockedInfo();
  check('KA: blocked undo changed nothing (head rev still 3)', afterBlocked.rev === 3, afterBlocked);
  const kw = new Client(BLOCKED_WS_URL);
  await kw.open();
  kw.send({ t: 'hello', token: 'dev:dave:editor', projectId: BLOCKED_ROOM });
  const welcomeKw = await kw.waitFor((m) => m.t === 'welcome');
  if (welcomeKw.t === 'welcome') {
    check('KA: the room state still carries the peer text', fold(deserializeProject(welcomeKw.project), welcomeKw.replay).title === 'hello world');
  }

  // B's undo: their unit reverts — and A's CONSUMED text goes with it (the
  // documented edge: the rebuild cannot replay a row the blocked undo deleted).
  const bUndoMark = kb.mark();
  kb.send({ t: 'undo' });
  const bUndo = await kb.waitForAfter(bUndoMark, (m) => m.t === 'remote' && m.rev === 4);
  check(
    "KB: B's own undo reverts B's edit (A's absorbed text is gone too — pinned edge)",
    bUndo.t === 'remote' && bUndo.action.type === 'LOAD' && bUndo.action.payload.title === 'A first',
    bUndo.t === 'remote' ? bUndo.action : bUndo
  );

  // A's next undo moves ON to their earlier unit and succeeds.
  ka.send({ t: 'undo' });
  const aUndo = await ka.waitFor((m) => m.t === 'remote' && m.rev === 5);
  check(
    "KA: A's earlier unit still undoes (the blocked one was consumed)",
    aUndo.t === 'remote' && aUndo.action.type === 'LOAD' && aUndo.action.payload.title === 'Blocked probe',
    aUndo.t === 'remote' ? aUndo.action : aUndo
  );
  const aUndoState = await ka.waitFor((m) => m.t === 'undoState' && !m.canUndo && m.canRedo);
  check('KA: after the successful undo — redo is offered, undo exhausted', aUndoState.t === 'undoState' && aUndoState.canRedo, aUndoState);

  // Redo safety: a redo that is still at its baseline is allowed (it re-applies
  // the stored ACTIONS as fresh rows — a normal `remote`, never a LOAD)…
  ka.send({ t: 'redo' });
  const aRedo = await ka.waitFor((m) => m.t === 'remote' && m.rev === 6);
  check('KA: redo at the undo baseline re-applies the unit', aRedo.t === 'remote' && aRedo.action.type === 'UPDATE_PROJECT' && aRedo.action.payload.title === 'A first', aRedo);
  ka.send({ t: 'undo' });
  await ka.waitFor((m) => m.t === 'remote' && m.rev === 7);
  // …but a peer edit AFTER the undo makes it stale: refuse and drop it.
  kb.send({ t: 'act', actionId: 'k-b2', action: { type: 'UPDATE_PROJECT', payload: { title: 'B after' } } });
  await ka.waitFor((m) => m.t === 'remote' && m.actionId === 'k-b2');
  const staleMark = ka.mark();
  ka.send({ t: 'redo' });
  const staleRedo = await ka.waitForAfter(staleMark, (m) => m.t === 'error');
  check('KA: a redo over a peer\'s later edit is BLOCKED', staleRedo.t === 'error' && staleRedo.message === ROOM_REDO_BLOCKED, staleRedo);
  const staleState = await ka.waitForAfter(staleMark, (m) => m.t === 'undoState');
  check('KA: the stale redo was dropped (nothing to redo now)', staleState.t === 'undoState' && !staleState.canRedo, staleState);
  const afterRefusal = await blockedInfo();
  check("KA: the peer's later text survived the refused redo (rev 8)", afterRefusal.rev === 8, afterRefusal);
  const againMark = ka.mark();
  ka.send({ t: 'redo' });
  const nothingToRedo = await ka.waitForAfter(againMark, (m) => m.t === 'error');
  check('KA: redoing again answers nothing to redo', nothingToRedo.t === 'error' && nothingToRedo.message === 'nothing to redo');

  a.close();
  b2.close();
  c.close();
  ua.close();
  ub.close();
  ue.close();
  uv.close();
  ka.close();
  kb.close();
  kw.close();
  console.log(failures === 0 ? '\nPROBE PASSED' : `\nPROBE FAILED — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
