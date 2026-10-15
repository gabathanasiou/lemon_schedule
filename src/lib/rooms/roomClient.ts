/**
 * S4 room transport — the app-side client for one shared project's room
 * (docs/COLLABORATION.md §6 S4). Owns exactly one WebSocket: connects, says
 * `hello` with a room token, applies the room's snapshot + replay, streams
 * accepted local actions, and dedupes its own echo by `actionId` (the local
 * apply already happened optimistically).
 *
 * Offline buffer (roadmap 239 stage 2): while the room is not open, accepted
 * local actions are APPLIED LOCALLY (the caller does that) and BUFFERED here
 * (bounded) instead of being dropped; the buffer replays in order right after
 * the next welcome, riding the normal optimistic path. The same client
 * instance survives reconnects (so the buffer does too), and `stop()` clears
 * it — a project switch must never bleed the old room's edits into the new one.
 *
 * The socket interface is the `on*`-property slice both the browser WebSocket
 * and Node's `ws` satisfy, and `createSocket` is injectable so Vitest and the
 * `room-client-probe` can drive it without a browser.
 */
import { deserializeProject } from '../projectCodec';
import {
  encodeRoomMessage,
  parseRoomServerMessage,
  type RoomClientMessage,
  type RevisionedAction,
  type RoomRole,
} from './protocol';
import type { Action } from '../../store/reducer';
import type { Project } from '../../types';

export type RoomStatus = 'idle' | 'connecting' | 'syncing' | 'open' | 'reconnecting' | 'closed';

/** Bounded offline action buffer (roadmap 239 stage 2): actions accepted while
 *  the room is not open are applied locally and queued, then replayed in ORDER
 *  right after the next welcome. A pathological outage drops the OLDEST past
 *  this cap (the newest intent wins) and the drop is surfaced. */
export const MAX_QUEUED_ACTIONS = 1000;

export interface RoomQueueInfo {
  /** Actions waiting to be replayed after the next welcome. */
  pending: number;
  /** Oldest-first drops after the buffer hit `MAX_QUEUED_ACTIONS`. */
  dropped: number;
}

interface QueuedAction {
  actionId: string;
  action: Action;
}

export interface RoomWelcome {
  userId: string;
  role: RoomRole;
  rev: number;
  project: Project;
  replay: RevisionedAction[];
}

export interface RoomRemote {
  rev: number;
  userId: string;
  actionId: string;
  action: Action;
}

/** The WebSocket slice the transport uses (browser WebSocket + `ws` both fit). */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface RoomClientOptions {
  /** Full room URL, e.g. `wss://…/room/<projectId>`. */
  url: string;
  projectId: string;
  /** Resolved before every (re)connect — short-lived room tokens. */
  getToken: () => Promise<string>;
  /**
   * Serialized project (`serializeProject`) for seeding an empty room; null =
   * not allowed to seed (a viewer, or a client without state yet). Viewers wait
   * instead — the room broadcasts `welcome` once an editor seeds it.
   */
  getInitProject: () => string | null;
  onWelcome: (welcome: RoomWelcome) => void;
  onRemote: (remote: RoomRemote) => void;
  /** A buffered (offline) action is being replayed after a welcome — apply it
   *  locally too: the welcome reset the state to the room's snapshot, and the
   *  transport sends the action right after, so the UI never flashes the edit
   *  away and the echo is deduped like every optimistic local apply. */
  onReplayQueued?: (action: Action) => void;
  /** The offline buffer changed (enqueue / drain / drop / clear). */
  onPendingChange?: (info: RoomQueueInfo) => void;
  /** This user's room-side undo/redo availability (header button enablement). */
  onUndoState?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  /** Our own action was refused; the transport re-syncs automatically. */
  onRejected?: (actionId: string, reason: string) => void;
  onError?: (message: string) => void;
  onStatus?: (status: RoomStatus) => void;
  /** Injectable for tests/Node; defaults to the platform WebSocket. */
  createSocket?: (url: string) => WebSocketLike;
  /** Reconnect backoff in ms (last value repeats). */
  backoffMs?: number[];
}

const DEFAULT_BACKOFF = [1000, 2000, 5000, 10000, 30000];

export class RoomClient {
  private socket: WebSocketLike | null = null;
  private status: RoomStatus = 'idle';
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Action ids we applied optimistically and are still awaiting on the wire. */
  private pendingOwn = new Set<string>();
  /**
   * Highest room rev we have applied. The room stamps every `remote` with a
   * contiguous rev, so a jump means we MISSED a message — including the
   * whole-project `welcome` an undo emits. Applying later deltas against the
   * wrong base would silently diverge, so a gap triggers a full re-sync.
   */
  private lastRev: number | null = null;
  /** A re-sync is in flight — its `welcome` will carry everything we missed. */
  private syncPending = false;
  /** Offline buffer (roadmap 239 stage 2) — see the module header. */
  private queue: QueuedAction[] = [];
  private queueDropped = 0;
  /**
   * We seeded an EMPTY room with our current project (`needInit` → `init`) —
   * that blob already contains every queued edit, so the welcome that follows
   * must DROP the buffer, never replay it: an ADD_* replay would duplicate
   * what the init already carries (`ADD_SCENE` appends the scene + pushes a
   * fresh row; it is NOT idempotent). A seed RACE (another client's init won)
   * loses those edits — the pre-queue behavior, preferred over corruption.
   */
  private initSeeded = false;
  /** One header note per token outage — the retry loop must not spam it. */
  private tokenFailureNoted = false;

  constructor(private readonly opts: RoomClientOptions) {}

  start(): void {
    if (!this.stopped && (this.status === 'connecting' || this.status === 'syncing' || this.status === 'open')) {
      return;
    }
    this.stopped = false;
    this.attempt = 0;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close(1000, 'client stopped');
    } catch {
      // already closed
    }
    // The buffer is per-room-instance — never let it bleed into another
    // project (a switch stops this client and mounts a fresh one).
    const hadQueue = this.queue.length > 0 || this.queueDropped > 0;
    this.queue = [];
    this.queueDropped = 0;
    this.initSeeded = false;
    this.setStatus('closed');
    if (hadQueue) this.notifyQueue();
  }

  getStatus(): RoomStatus {
    return this.status;
  }

  getQueueInfo(): RoomQueueInfo {
    return { pending: this.queue.length, dropped: this.queueDropped };
  }

  /**
   * Accept one local action (roadmap 239 stage 2): sent immediately while the
   * room is open, otherwise QUEUED for replay right after the next welcome
   * (never sent before the handshake — the room closes unauthenticated
   * sockets). Returns false only when the client is stopped.
   */
  sendAction(actionId: string, action: Action): boolean {
    if (this.stopped) return false;
    if (this.status !== 'open') {
      this.enqueue(actionId, action);
      return true;
    }
    if (!this.rawSend({ t: 'act', actionId, action })) {
      // The socket died between the status flip and the write — buffer it;
      // the next welcome replays it instead of losing it.
      this.enqueue(actionId, action);
      return true;
    }
    this.pendingOwn.add(actionId);
    return true;
  }

  /** Ask the room for a fresh snapshot + replay (heals a conflict or a rev gap).
   *  Idempotent: one in-flight sync at a time; the welcome clears the flag. */
  requestSync(): void {
    if (this.status !== 'open' || this.syncPending) return;
    this.syncPending = true;
    this.rawSend({ t: 'sync' });
  }

  /**
   * Per-user undo: the room removes the caller's latest unit and re-syncs every
   * client through a fresh `welcome` (this client is rebaselined by `onWelcome`).
   * False = not connected right now — the caller must NOT fall back to a local
   * transcript undo while a room owns the project.
   */
  sendUndo(): boolean {
    if (this.status !== 'open') return false;
    return this.rawSend({ t: 'undo' });
  }

  /** Re-apply the caller's most recently undone unit (also a no-op unless open). */
  sendRedo(): boolean {
    if (this.status !== 'open') return false;
    return this.rawSend({ t: 'redo' });
  }

  // ---- internals -----------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let token: string;
    try {
      token = await this.opts.getToken();
      this.tokenFailureNoted = false;
    } catch (e) {
      // A token fetch is part of connecting — fail it like a dropped socket and
      // RETRY on the same backoff. A single transient failure here (edge blip,
      // auth-server hiccup, session-refresh race) must never kill the room for
      // the rest of the session: returning without a retry did exactly that,
      // and the deployed two-machine pass hit it (a lone transient 401 left one
      // device amber and stale until a reload). The note fires ONCE per outage;
      // the badge carries the ongoing state, and the token re-fetch makes a
      // recovered session self-heal without a reload.
      if (!this.tokenFailureNoted) {
        this.tokenFailureNoted = true;
        this.opts.onError?.(`could not obtain a room token: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) return;
    const create = this.opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    const socket = create(this.opts.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      // A new socket re-anchors on its welcome — drop any rev / pending sync
      // from the previous connection.
      this.lastRev = null;
      this.syncPending = false;
      this.setStatus('syncing');
      this.rawSend({ t: 'hello', token, projectId: this.opts.projectId });
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.handleMessage(ev.data);
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
    socket.onerror = () => {
      // onclose follows; nothing to do here
    };
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    const schedule = this.opts.backoffMs ?? DEFAULT_BACKOFF;
    const delay = schedule[Math.min(this.attempt - 1, schedule.length - 1)];
    this.setStatus('reconnecting');
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }

  private handleMessage(raw: string): void {
    const msg = parseRoomServerMessage(raw);
    if (!msg) {
      this.opts.onError?.('malformed room message');
      return;
    }
    switch (msg.t) {
      case 'welcome': {
        let project: Project;
        try {
          project = deserializeProject(msg.project);
        } catch {
          this.opts.onError?.('unreadable room snapshot');
          return;
        }
        // A welcome is a full snapshot: it re-anchors the rev and settles any
        // re-sync we asked for.
        this.lastRev = msg.rev;
        this.syncPending = false;
        this.setStatus('open');
        this.opts.onWelcome({
          userId: msg.userId,
          role: msg.role,
          rev: msg.rev,
          project,
          replay: msg.replay,
        });
        // Roadmap 239 stage 2: the offline buffer replays right after the
        // welcome — re-applied locally, then sent in order (the welcome reset
        // the state to the room's snapshot; the flush keeps the edits visible).
        if (this.initSeeded) {
          // We seeded this room with our current project, which already
          // contains every buffered edit — dropping beats replaying
          // (`ADD_SCENE` is not idempotent; see `initSeeded`).
          this.initSeeded = false;
          this.clearQueue();
        } else {
          this.flushQueue();
        }
        return;
      }
      case 'needInit': {
        const blob = this.opts.getInitProject();
        if (blob && this.rawSend({ t: 'init', project: blob })) this.initSeeded = true;
        // else: wait — an editor elsewhere seeds the room and the welcome follows
        return;
      }
      case 'remote': {
        // Rev gap = we missed at least one message (a dropped `remote`, or the
        // whole-project `welcome` an undo sends). This delta would land on the
        // wrong base, so re-sync instead of applying it — the welcome that
        // follows carries every missed action. A repeated gap while the sync is
        // in flight is skipped quietly.
        if (this.lastRev !== null && msg.rev !== this.lastRev + 1) {
          this.requestSync();
          return;
        }
        this.lastRev = msg.rev;
        // Our own echo: already applied optimistically, so just settle it.
        if (this.pendingOwn.delete(msg.actionId)) return;
        this.opts.onRemote({ rev: msg.rev, userId: msg.userId, actionId: msg.actionId, action: msg.action });
        return;
      }
      case 'rejected': {
        if (this.pendingOwn.delete(msg.actionId)) {
          this.opts.onRejected?.(msg.actionId, msg.reason);
          // Our optimistic apply diverged from the room — heal by re-syncing.
          this.requestSync();
        } else {
          this.opts.onError?.(`room rejected: ${msg.reason}`);
        }
        return;
      }
      case 'undoState': {
        this.opts.onUndoState?.({ canUndo: msg.canUndo, canRedo: msg.canRedo });
        return;
      }
      case 'error': {
        // An errored sync (e.g. rate-limited) must not wedge the gap detector.
        this.syncPending = false;
        this.opts.onError?.(msg.message);
        return;
      }
    }
  }

  private rawSend(msg: RoomClientMessage): boolean {
    if (!this.socket) return false;
    try {
      this.socket.send(encodeRoomMessage(msg));
      return true;
    } catch {
      // socket racing closed — onclose will handle reconnection
      return false;
    }
  }

  // ---- offline buffer (roadmap 239 stage 2) --------------------------------

  private enqueue(actionId: string, action: Action): void {
    this.queue.push({ actionId, action });
    if (this.queue.length > MAX_QUEUED_ACTIONS) {
      this.queue.shift();
      this.queueDropped += 1;
    }
    this.notifyQueue();
  }

  /**
   * Replay the offline buffer after a welcome: re-apply each action locally
   * (the welcome reset the state to the room's snapshot), then send it in
   * ORDER. A write that fails keeps that entry and every later one buffered
   * for the next welcome — an entry leaves the buffer only after its write
   * was handed to the socket (the same delivery guarantee as an online edit).
   */
  private flushQueue(): void {
    if (this.queue.length === 0) return;
    const queued = this.queue;
    this.queue = [];
    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i];
      this.opts.onReplayQueued?.(entry.action);
      if (!this.rawSend({ t: 'act', actionId: entry.actionId, action: entry.action })) {
        this.queue = queued.slice(i);
        break;
      }
      this.pendingOwn.add(entry.actionId);
    }
    if (this.queue.length === 0) this.queueDropped = 0;
    this.notifyQueue();
  }

  private clearQueue(): void {
    if (this.queue.length === 0 && this.queueDropped === 0) return;
    this.queue = [];
    this.queueDropped = 0;
    this.notifyQueue();
  }

  private notifyQueue(): void {
    this.opts.onPendingChange?.({ pending: this.queue.length, dropped: this.queueDropped });
  }

  private setStatus(status: RoomStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.opts.onStatus?.(status);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
