import { DurableObject } from 'cloudflare:workers';
import {
  encodeRoomMessage,
  parseRoomClientMessage,
  type RevisionedAction,
  type RoomRole,
  type RoomServerMessage,
} from '../../../src/lib/rooms/protocol';
import { isRoomActionAllowed, roleCanWrite } from '../../../src/lib/rooms/policy';
import { parseDevToken, verifyRoomToken, type VerifiedRoomToken } from '../../../src/lib/rooms/roomToken';
import { deserializeProject, serializeProject } from '../../../src/lib/projectCodec';
import { reducer, type Action, type State } from '../../../src/store/reducer';
import type { Project } from '../../../src/types';

export interface Env {
  ROOMS: DurableObjectNamespace;
  /** Shared with the room-token issuer (Supabase Edge Function). Never set in dev. */
  ROOM_TOKEN_SECRET?: string;
  /** "1" only in local `.dev.vars` — accepts `dev:<userId>:<role>` tokens. Never deployed. */
  DEV_AUTH?: string;
  /** Comma-separated Origin allowlist. Defaults cover the GitHub Pages deploy + local dev. */
  ALLOWED_ORIGINS?: string;
}

/** Durable snapshot cadence (applied actions between snapshots). */
const SNAPSHOT_EVERY = 50;
/** How many snapshots to keep — the older ones widen the undo window. */
const SNAPSHOTS_KEPT = 4;
/** Cloudflare caps WebSocket messages at 1 MiB; refuse politely a touch earlier. */
const MAX_MESSAGE_CHARS = 1_000_000;
/** Per-socket message budget (OWASP: rate-limit incoming WebSocket messages). */
const RATE_BURST = 60;
const RATE_PER_SECOND = 20;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://gabathanasiou.github.io',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
];

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
} as const;

/** Per-socket identity, stored as a WebSocket attachment so it survives hibernation. */
interface ConnectionInfo {
  userId: string;
  role: RoomRole;
  /** Open client batch depth (BATCH_START…COMMIT). Grouping only — `present` never depends on it. */
  batchDepth: number;
  batchId: string | null;
}

/** One per-user undo unit: a single action, or every row of one client batch. */
interface UndoUnit {
  /** The client batch id (null = a single action) — reused when the unit is redone. */
  batchId: string | null;
  /** Stored rows, ascending rev. */
  rows: Array<{ rev: number; action: Action }>;
}

/**
 * One shared project's room (docs/COLLABORATION.md §6 S4).
 *
 * The room is the single ordering/validation authority: it folds every accepted
 * action through the app's own reducer, appends it to a durable action log
 * (periodic snapshots keep replay bounded), and broadcasts `remote` to every
 * connected client — sender included; senders dedupe by `actionId` because they
 * applied optimistically already.
 *
 * Sockets use the hibernation API: per-socket identity lives in attachments and
 * room state is reloaded from SQLite (latest snapshot + action replay) whenever
 * the object wakes.
 */
export class Room extends DurableObject<Env> {
  private projectId: string | null = null;
  /** null = empty room — the first editor client seeds it with `init`. */
  private present: Project | null = null;
  private headRev = 0;
  private snapshotRev = -1;
  private snapshotBlob: string | null = null;
  /** Serializes every message handler — the room is single-threaded by design. */
  private chain: Promise<unknown> = Promise.resolve();
  /** Per-socket message budget (in-memory; resets on hibernation — acceptable for abuse control). */
  private rate = new Map<WebSocket, { tokens: number; last: number }>();
  /**
   * Per-user redo stacks (LIFO of undone units). IN-MEMORY ONLY — a hibernated,
   * evicted or redeployed room loses them (`redo` then answers 'nothing to redo').
   * Undo itself is durable (log + snapshots); only the redo convenience is not.
   */
  private redoStacks = new Map<string, UndoUnit[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.initSchema();
      this.load();
    });
  }

  // ---- storage -------------------------------------------------------------

  private initSchema(): void {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_actions (
        rev INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        batch_id TEXT,
        action_json TEXT NOT NULL
      )`
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_snapshots (
        rev INTEGER PRIMARY KEY,
        blob TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    );
  }

  private load(): void {
    const meta = this.ctx.storage.sql
      .exec<{ key: string; value: string }>(`SELECT key, value FROM room_meta`)
      .toArray();
    for (const row of meta) {
      if (row.key === 'projectId') this.projectId = row.value;
      if (row.key === 'headRev') this.headRev = Number(row.value) || 0;
    }
    const snaps = this.ctx.storage.sql
      .exec<{ rev: number; blob: string }>(`SELECT rev, blob FROM room_snapshots ORDER BY rev DESC LIMIT 1`)
      .toArray();
    if (snaps.length === 0) return;
    this.snapshotRev = snaps[0].rev;
    this.snapshotBlob = snaps[0].blob;
    let project = deserializeProject(snaps[0].blob);
    const rows = this.ctx.storage.sql
      .exec<{ action_json: string }>(
        `SELECT action_json FROM room_actions WHERE rev > ? ORDER BY rev ASC`,
        this.snapshotRev
      )
      .toArray();
    for (const row of rows) {
      try {
        project = this.applyAction(project, JSON.parse(row.action_json) as Action);
      } catch {
        break; // never brick a room over one corrupt log line
      }
    }
    this.present = project;
  }

  private applyAction(project: Project, action: Action): Project {
    const state: State = { past: [], present: project, future: [], _batchDepth: 0 };
    return reducer(state, action).present;
  }

  private writeSnapshot(): void {
    if (this.present === null || this.headRev === this.snapshotRev) return;
    const blob = serializeProject(this.present);
    const rev = this.headRev;
    this.ctx.storage.transactionSync(() => {
      this.writeSnapshotRow(rev, blob);
      this.pruneStorage();
    });
    this.snapshotRev = rev;
    this.snapshotBlob = blob;
  }

  private writeSnapshotRow(rev: number, blob: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO room_snapshots (rev, blob, created_at) VALUES (?, ?, ?)
       ON CONFLICT(rev) DO UPDATE SET blob = excluded.blob`,
      rev,
      blob,
      Date.now()
    );
  }

  /** Keep the newest SNAPSHOTS_KEPT snapshots, and drop log rows at or below the
   *  oldest one — the retained window every rebuild (late join, undo) replays. */
  private pruneStorage(): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM room_snapshots WHERE rev NOT IN (SELECT rev FROM room_snapshots ORDER BY rev DESC LIMIT ?)`,
      SNAPSHOTS_KEPT
    );
    const oldest = this.ctx.storage.sql
      .exec<{ rev: number | null }>(`SELECT MIN(rev) AS rev FROM room_snapshots`)
      .one();
    if (oldest.rev !== null) {
      // Actions older than the oldest kept snapshot can no longer be undone (nor replayed).
      this.ctx.storage.sql.exec(`DELETE FROM room_actions WHERE rev <= ?`, oldest.rev);
    }
  }

  // ---- sockets -------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return this.json({ room: this.projectId, initialized: this.present !== null, rev: this.headRev });
    }
    const match = new URL(request.url).pathname.match(/\/room\/([^/]+)$/);
    if (!match) return new Response('bad room path', { status: 400, headers: SECURITY_HEADERS });
    const projectId = decodeURIComponent(match[1]);
    if (this.projectId === null) {
      this.projectId = projectId;
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO room_meta (key, value) VALUES ('projectId', ?)`,
        projectId
      );
    } else if (this.projectId !== projectId) {
      return new Response('room mismatch', { status: 400, headers: SECURITY_HEADERS });
    }
    const origin = request.headers.get('Origin');
    if (origin && !this.originAllowed(origin)) {
      console.warn(`rooms: rejected origin "${origin}" for room ${this.projectId}`);
      return new Response('origin not allowed', { status: 403, headers: SECURITY_HEADERS });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.send(ws, { t: 'error', message: 'binary messages are not supported' });
      ws.close(1003, 'binary messages are not supported');
      return;
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      console.warn(`rooms: oversized message (${message.length} chars) in room ${this.projectId}`);
      this.send(ws, { t: 'error', message: 'message too large' });
      ws.close(1009, 'message too large');
      return;
    }
    if (!this.takeRateToken(ws)) {
      console.warn(`rooms: rate limited a socket in room ${this.projectId}`);
      this.send(ws, { t: 'error', message: 'rate limited' });
      ws.close(1008, 'rate limited');
      return;
    }
    const run = this.chain.then(() => this.handleMessage(ws, message));
    this.chain = run.catch(() => {});
    try {
      await run;
    } catch {
      this.send(ws, { t: 'error', message: 'internal error' });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.rate.delete(ws);
  }

  private takeRateToken(ws: WebSocket): boolean {
    const now = Date.now();
    const state = this.rate.get(ws) ?? { tokens: RATE_BURST, last: now };
    const refill = ((now - state.last) / 1000) * RATE_PER_SECOND;
    state.tokens = Math.min(RATE_BURST, state.tokens + refill);
    state.last = now;
    const allowed = state.tokens >= 1;
    if (allowed) state.tokens -= 1;
    this.rate.set(ws, state);
    return allowed;
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const msg = parseRoomClientMessage(raw);
    if (!msg) {
      this.send(ws, { t: 'error', message: 'malformed message' });
      return;
    }
    if (msg.t === 'hello') {
      await this.handleHello(ws, msg.token, msg.projectId);
      return;
    }
    const info = this.connectionInfo(ws);
    if (!info) {
      this.send(ws, { t: 'error', message: 'unauthenticated' });
      ws.close(1008, 'unauthenticated');
      return;
    }
    switch (msg.t) {
      case 'sync':
        this.sendWelcome(ws, info);
        return;
      case 'init':
        this.handleInit(ws, info, msg.project);
        return;
      case 'act':
        this.handleAction(ws, info, msg.actionId, msg.action);
        return;
      case 'undo':
        this.handleUndo(ws, info);
        return;
      case 'redo':
        this.handleRedo(ws, info);
        return;
    }
  }

  private async handleHello(ws: WebSocket, token: string, projectId: string): Promise<void> {
    if (projectId !== this.projectId) {
      this.send(ws, { t: 'error', message: 'wrong room' });
      ws.close(1008, 'wrong room');
      return;
    }
    const auth = await this.authenticate(token);
    if (!auth) {
      console.warn(`rooms: authentication failed for room ${this.projectId}`);
      this.send(ws, { t: 'error', message: 'unauthenticated' });
      ws.close(1008, 'unauthenticated');
      return;
    }
    ws.serializeAttachment({
      userId: auth.userId,
      role: auth.role,
      batchDepth: 0,
      batchId: null,
    } satisfies ConnectionInfo);
    const info = this.connectionInfo(ws)!;
    if (this.present === null) {
      this.send(ws, { t: 'needInit' });
    } else {
      this.sendWelcome(ws, info);
    }
  }

  private async authenticate(token: string): Promise<VerifiedRoomToken | null> {
    if (this.env.DEV_AUTH === '1') {
      const dev = parseDevToken(token);
      if (dev) return dev;
    }
    if (!this.env.ROOM_TOKEN_SECRET || this.projectId === null) return null;
    return verifyRoomToken(this.env.ROOM_TOKEN_SECRET, token, this.projectId);
  }

  // ---- room protocol -------------------------------------------------------

  private connectionInfo(ws: WebSocket): ConnectionInfo | null {
    const info = ws.deserializeAttachment() as ConnectionInfo | null;
    return info && typeof info.userId === 'string' && typeof info.role === 'string' ? info : null;
  }

  private sendWelcome(ws: WebSocket, info: ConnectionInfo): void {
    if (this.present === null || this.snapshotBlob === null) {
      this.send(ws, { t: 'needInit' });
      return;
    }
    const replay: RevisionedAction[] = [];
    const rows = this.ctx.storage.sql
      .exec<{ rev: number; user_id: string; action_json: string }>(
        `SELECT rev, user_id, action_json FROM room_actions WHERE rev > ? ORDER BY rev ASC`,
        this.snapshotRev
      )
      .toArray();
    for (const row of rows) {
      try {
        replay.push({ rev: row.rev, userId: row.user_id, action: JSON.parse(row.action_json) as Action });
      } catch {
        // skip unparseable rows — never break a joiner over one corrupt log line
      }
    }
    this.send(ws, {
      t: 'welcome',
      userId: info.userId,
      role: info.role,
      rev: this.headRev,
      project: this.snapshotBlob,
      replay,
    });
  }

  private handleInit(ws: WebSocket, info: ConnectionInfo, blob: string): void {
    if (!roleCanWrite(info.role)) {
      this.send(ws, { t: 'error', message: 'view-only' });
      return;
    }
    if (this.present !== null) {
      this.sendWelcome(ws, info);
      return;
    }
    let project: Project;
    try {
      project = deserializeProject(blob);
    } catch {
      this.send(ws, { t: 'error', message: 'invalid project' });
      return;
    }
    if (!project || !Array.isArray(project.scenes) || !Array.isArray(project.versions)) {
      this.send(ws, { t: 'error', message: 'invalid project' });
      return;
    }
    this.present = project;
    this.headRev = 0;
    this.snapshotRev = 0;
    this.snapshotBlob = blob;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO room_snapshots (rev, blob, created_at) VALUES (0, ?, ?)
         ON CONFLICT(rev) DO UPDATE SET blob = excluded.blob`,
        blob,
        Date.now()
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO room_meta (key, value) VALUES ('headRev', '0')
         ON CONFLICT(key) DO UPDATE SET value = '0'`
      );
    });
    this.rewelcome();
  }

  private handleAction(ws: WebSocket, info: ConnectionInfo, actionId: string, action: Action): void {
    if (!roleCanWrite(info.role)) {
      this.send(ws, { t: 'rejected', actionId, reason: 'view-only' });
      return;
    }
    if (this.present === null) {
      this.send(ws, { t: 'rejected', actionId, reason: 'room not initialized' });
      return;
    }
    if (!isRoomActionAllowed(action.type)) {
      this.send(ws, { t: 'rejected', actionId, reason: 'action not allowed in rooms' });
      return;
    }
    // Undo-unit grouping: every row of one client batch shares a batch id.
    let rowBatchId = info.batchId;
    if (action.type === 'BATCH_START' && info.batchDepth === 0) rowBatchId = crypto.randomUUID();
    const rev = this.commitAction(info.userId, actionId, action, rowBatchId);
    if (rev === null) {
      this.send(ws, { t: 'rejected', actionId, reason: 'apply failed' });
      return;
    }
    // A new accepted action invalidates the sender's undone units.
    this.redoStacks.delete(info.userId);
    if (action.type === 'BATCH_START') {
      if (info.batchDepth === 0) info.batchId = rowBatchId;
      info.batchDepth += 1;
    } else if (action.type === 'BATCH_COMMIT') {
      info.batchDepth = Math.max(0, info.batchDepth - 1);
      if (info.batchDepth === 0) info.batchId = null;
    }
    ws.serializeAttachment(info);
  }

  /** The accept path shared by `act` and `redo`: fold, append to the log, bump
   *  the head rev, broadcast `remote`, snapshot on cadence. Returns the new rev,
   *  or null when the action does not apply (nothing written, never broadcast). */
  private commitAction(userId: string, actionId: string, action: Action, batchId: string | null): number | null {
    if (this.present === null) return null;
    let next: Project;
    try {
      next = this.applyAction(this.present, action);
    } catch {
      return null;
    }
    const rev = this.headRev + 1;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO room_actions (rev, user_id, batch_id, action_json) VALUES (?, ?, ?, ?)`,
        rev,
        userId,
        batchId,
        JSON.stringify(action)
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO room_meta (key, value) VALUES ('headRev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        String(rev)
      );
    });
    this.present = next;
    this.headRev = rev;
    this.broadcast({ t: 'remote', rev, userId, actionId, action });
    if (rev % SNAPSHOT_EVERY === 0) this.writeSnapshot();
    return rev;
  }

  // ---- per-user undo (the room rebases the shared log) ----------------------

  /**
   * `undo` removes the CALLER's latest remaining unit — one action, or one whole
   * client batch (rows sharing a batch id) — rebuilds `present` from the newest
   * snapshot older than the unit while skipping its rows, writes a fresh snapshot
   * at a NEW rev (so a hibernated room reloads the rebased state), deletes the
   * undone rows (no future rebuild replays them) and re-welcomes every socket —
   * clients converge through the existing `welcome`, there is no undo broadcast.
   * Undo depth = the retained snapshot window (SNAPSHOTS_KEPT × SNAPSHOT_EVERY).
   */
  private handleUndo(ws: WebSocket, info: ConnectionInfo): void {
    if (!roleCanWrite(info.role)) {
      this.send(ws, { t: 'error', message: 'view-only' });
      return;
    }
    if (this.present === null) {
      this.send(ws, { t: 'error', message: 'room not initialized' });
      return;
    }
    const unit = this.latestUnit(info.userId);
    if (!unit) {
      this.send(ws, { t: 'error', message: 'nothing to undo' });
      return;
    }
    const base = this.ctx.storage.sql
      .exec<{ rev: number; blob: string }>(
        `SELECT rev, blob FROM room_snapshots WHERE rev < ? ORDER BY rev DESC LIMIT 1`,
        unit.rows[0].rev
      )
      .toArray()[0];
    if (!base) {
      this.send(ws, { t: 'error', message: 'action too old to undo' });
      return;
    }
    let project: Project;
    try {
      project = this.rebuildFrom(base, new Set(unit.rows.map((row) => row.rev)));
    } catch {
      this.send(ws, { t: 'error', message: 'undo failed' });
      return;
    }
    const blob = serializeProject(project);
    const rev = this.headRev + 1;
    this.ctx.storage.transactionSync(() => {
      for (const row of unit.rows) {
        this.ctx.storage.sql.exec(`DELETE FROM room_actions WHERE rev = ?`, row.rev);
      }
      this.writeSnapshotRow(rev, blob);
      this.pruneStorage();
      this.ctx.storage.sql.exec(
        `INSERT INTO room_meta (key, value) VALUES ('headRev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        String(rev)
      );
    });
    this.present = project;
    this.headRev = rev;
    this.snapshotRev = rev;
    this.snapshotBlob = blob;
    const stack = this.redoStacks.get(info.userId) ?? [];
    stack.push({ batchId: unit.batchId, rows: unit.rows });
    this.redoStacks.set(info.userId, stack);
    this.rewelcome();
  }

  /** `redo` pops the caller's most recently undone unit and re-applies it as
   *  FRESH actions through the normal apply + log + broadcast path. */
  private handleRedo(ws: WebSocket, info: ConnectionInfo): void {
    if (!roleCanWrite(info.role)) {
      this.send(ws, { t: 'error', message: 'view-only' });
      return;
    }
    if (this.present === null) {
      this.send(ws, { t: 'error', message: 'room not initialized' });
      return;
    }
    const unit = this.redoStacks.get(info.userId)?.pop();
    if (!unit) {
      this.send(ws, { t: 'error', message: 'nothing to redo' });
      return;
    }
    // All-or-nothing: fold the unit on a scratch copy first, so a unit that no
    // longer applies changes nothing (the room is not left half-redone).
    let scratch = this.present;
    try {
      for (const row of unit.rows) scratch = this.applyAction(scratch, row.action);
    } catch {
      this.send(ws, { t: 'error', message: 'redo failed' });
      return;
    }
    for (const row of unit.rows) {
      // Fresh client ids — the log stores actions, not ids. The caller reads its
      // own redo through the same `remote` as everyone else (nothing was applied
      // optimistically client-side).
      this.commitAction(info.userId, crypto.randomUUID(), row.action, unit.batchId);
    }
  }

  /** The caller's newest remaining undo unit: their latest log row, widened to
   *  its whole client batch when it belongs to one. */
  private latestUnit(userId: string): UndoUnit | null {
    const latest = this.ctx.storage.sql
      .exec<{ rev: number; batch_id: string | null; action_json: string }>(
        `SELECT rev, batch_id, action_json FROM room_actions WHERE user_id = ? ORDER BY rev DESC LIMIT 1`,
        userId
      )
      .toArray()[0];
    if (!latest) return null;
    const stored = latest.batch_id === null
      ? [latest]
      : this.ctx.storage.sql
          .exec<{ rev: number; batch_id: string | null; action_json: string }>(
            `SELECT rev, batch_id, action_json FROM room_actions WHERE user_id = ? AND batch_id = ? ORDER BY rev ASC`,
            userId,
            latest.batch_id
          )
          .toArray();
    const rows: UndoUnit['rows'] = [];
    for (const row of stored) {
      rows.push({ rev: row.rev, action: JSON.parse(row.action_json) as Action });
    }
    return { batchId: latest.batch_id, rows };
  }

  /** Re-fold the retained log from `base` (a snapshot row), skipping `skipRevs`. */
  private rebuildFrom(base: { rev: number; blob: string }, skipRevs: ReadonlySet<number>): Project {
    let project = deserializeProject(base.blob);
    const rows = this.ctx.storage.sql
      .exec<{ rev: number; action_json: string }>(
        `SELECT rev, action_json FROM room_actions WHERE rev > ? ORDER BY rev ASC`,
        base.rev
      )
      .toArray();
    for (const row of rows) {
      if (skipRevs.has(row.rev)) continue;
      project = this.applyAction(project, JSON.parse(row.action_json) as Action);
    }
    return project;
  }

  private rewelcome(): void {
    for (const socket of this.ctx.getWebSockets()) {
      const socketInfo = this.connectionInfo(socket);
      if (socketInfo) this.sendWelcome(socket, socketInfo);
    }
  }

  // ---- plumbing ------------------------------------------------------------

  private originAllowed(origin: string): boolean {
    const list = (this.env.ALLOWED_ORIGINS?.split(',') ?? DEFAULT_ALLOWED_ORIGINS)
      .map((o) => o.trim())
      .filter(Boolean);
    return list.includes(origin);
  }

  private json(data: unknown): Response {
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', ...SECURITY_HEADERS },
    });
  }

  private send(ws: WebSocket, msg: RoomServerMessage): void {
    try {
      ws.send(encodeRoomMessage(msg));
    } catch {
      // socket already closed — the runtime cleans it up
    }
  }

  private broadcast(msg: RoomServerMessage): void {
    const encoded = encodeRoomMessage(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (!this.connectionInfo(ws)) continue;
      try {
        ws.send(encoded);
      } catch {
        // socket already closed
      }
    }
  }
}
