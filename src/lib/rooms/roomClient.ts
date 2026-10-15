/**
 * S4 room transport — the app-side client for one shared project's room
 * (docs/COLLABORATION.md §6 S4). Owns exactly one WebSocket: connects, says
 * `hello` with a room token, applies the room's snapshot + replay, streams
 * accepted local actions, and dedupes its own echo by `actionId` (the local
 * apply already happened optimistically).
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
    this.setStatus('closed');
  }

  getStatus(): RoomStatus {
    return this.status;
  }

  /** Send one accepted local action. False = not connected right now. */
  sendAction(actionId: string, action: Action): boolean {
    // Only once the room has welcomed us — a non-hello message before that is
    // refused and the socket closed, so never race the handshake.
    if (this.status !== 'open') return false;
    if (!this.rawSend({ t: 'act', actionId, action })) return false;
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
    } catch (e) {
      // No token = nothing to retry with; the owner of this client re-creates
      // it when the auth context changes.
      this.setStatus('closed');
      this.opts.onError?.(`could not obtain a room token: ${e instanceof Error ? e.message : String(e)}`);
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
        return;
      }
      case 'needInit': {
        const blob = this.opts.getInitProject();
        if (blob) this.rawSend({ t: 'init', project: blob });
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
