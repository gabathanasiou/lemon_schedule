import { describe, expect, it, vi } from 'vitest';
import { MAX_QUEUED_ACTIONS, RoomClient, type WebSocketLike } from '../rooms/roomClient';
import { makeBlankProject, type Action } from '../../store/reducer';
import { serializeProject } from '../projectCodec';
import { encodeRoomMessage, type RoomServerMessage } from '../rooms/protocol';

const PROJECT_BLOB = serializeProject(makeBlankProject('Room client test'));

class FakeSocket implements WebSocketLike {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.onclose?.();
    }
  }

  receive(msg: RoomServerMessage): void {
    this.onmessage?.({ data: encodeRoomMessage(msg) });
  }

  receiveRaw(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  lastSent(): any {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const client = new RoomClient({
    url: 'ws://room.test/room/p-1',
    projectId: 'p-1',
    getToken: async () => 'tok-1',
    getInitProject: () => PROJECT_BLOB,
    onWelcome: (w) => events.push(`welcome:${w.rev}:${w.role}`),
    onRemote: (r) => events.push(`remote:${r.actionId}`),
    onRejected: (id, reason) => events.push(`rejected:${id}:${reason}`),
    onError: (m) => events.push(`error:${m}`),
    onStatus: (s) => events.push(`status:${s}`),
    onReplayQueued: (a) => events.push(`replay:${a.type}`),
    onPendingChange: (i) => events.push(`queue:${i.pending}:${i.dropped}`),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    backoffMs: [10],
    ...overrides,
  } as ConstructorParameters<typeof RoomClient>[0]);
  return { client, sockets, events };
}

/** start() + wait for the socket, open it, and deliver a welcome. */
async function openClient(client: RoomClient, sockets: FakeSocket[], rev = 3) {
  client.start();
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  sockets[0].onopen?.();
  await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
  sockets[0].receive({
    t: 'welcome',
    userId: 'u-1',
    role: 'editor',
    rev,
    project: PROJECT_BLOB,
    replay: [],
  });
  await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
}

describe('RoomClient', () => {
  it('connects, says hello with a fresh token, and opens on welcome', async () => {
    const { client, sockets, events } = makeClient();
    await openClient(client, sockets);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ t: 'hello', token: 'tok-1', projectId: 'p-1' });
    expect(events).toContain('status:connecting');
    expect(events).toContain('status:syncing');
    expect(events).toContain('welcome:3:editor');
  });

  it('queues actions before the handshake and replays them in order after the welcome', async () => {
    const { client, sockets, events } = makeClient();
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    // Not open yet — buffered, never sent (the room closes unauthenticated sockets).
    expect(client.sendAction('early-1', { type: 'BATCH_START' })).toBe(true);
    expect(client.sendAction('early-2', { type: 'BATCH_COMMIT' })).toBe(true);
    expect(sockets[0].sent).toHaveLength(0);
    expect(client.getQueueInfo()).toEqual({ pending: 2, dropped: 0 });

    sockets[0].onopen?.();
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));

    // The buffer re-applies locally (onReplayQueued) and replays IN ORDER, then drains.
    expect(events).toContain('replay:BATCH_START');
    expect(events).toContain('replay:BATCH_COMMIT');
    expect(sockets[0].sent.slice(1).map((s) => JSON.parse(s))).toEqual([
      { t: 'act', actionId: 'early-1', action: { type: 'BATCH_START' } },
      { t: 'act', actionId: 'early-2', action: { type: 'BATCH_COMMIT' } },
    ]);
    expect(events).toContain('queue:0:0');
    expect(client.getQueueInfo()).toEqual({ pending: 0, dropped: 0 });

    // While open an action streams immediately (nothing buffered).
    expect(client.sendAction('a-1', { type: 'BATCH_START' })).toBe(true);
    expect(sockets[0].lastSent()).toEqual({ t: 'act', actionId: 'a-1', action: { type: 'BATCH_START' } });

    // Own echo: already applied optimistically — never forwarded.
    sockets[0].receive({ t: 'remote', rev: 1, userId: 'u-1', actionId: 'a-1', action: { type: 'BATCH_START' } });
    expect(events).not.toContain('remote:a-1');

    // A peer's action is applied.
    sockets[0].receive({ t: 'remote', rev: 2, userId: 'u-2', actionId: 'b-1', action: { type: 'BATCH_COMMIT' } });
    expect(events).toContain('remote:b-1');
  });

  it('drops the OLDEST buffered actions past the cap and surfaces the drops', async () => {
    const { client, sockets } = makeClient();
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    for (let i = 0; i <= MAX_QUEUED_ACTIONS; i++) client.sendAction(`q-${i}`, { type: 'BATCH_COMMIT' });
    expect(client.getQueueInfo()).toEqual({ pending: MAX_QUEUED_ACTIONS, dropped: 1 });

    sockets[0].onopen?.();
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
    // q-0 was the drop; everything after it replayed in order.
    const acts = sockets[0].sent.slice(1).map((s) => JSON.parse(s));
    expect(acts).toHaveLength(MAX_QUEUED_ACTIONS);
    expect(acts[0]).toEqual({ t: 'act', actionId: 'q-1', action: { type: 'BATCH_COMMIT' } });
    expect(acts[acts.length - 1].actionId).toBe(`q-${MAX_QUEUED_ACTIONS}`);
    // A drained buffer resets the drop warning.
    expect(client.getQueueInfo()).toEqual({ pending: 0, dropped: 0 });
  });

  it('clears the buffer on stop — a project switch never bleeds edits', async () => {
    const { client, sockets } = makeClient();
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    client.sendAction('q-1', { type: 'BATCH_START' });
    expect(client.getQueueInfo().pending).toBe(1);
    client.stop();
    expect(client.getQueueInfo()).toEqual({ pending: 0, dropped: 0 });

    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].onopen?.();
    await vi.waitFor(() => expect(sockets[1].sent).toHaveLength(1));
    sockets[1].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
    expect(sockets[1].sent).toHaveLength(1); // hello only — the old buffer is gone
  });

  it('drops the buffer when OUR init seeded the room (the blob already carries it)', async () => {
    const { client, sockets, events } = makeClient();
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    client.sendAction('q-1', { type: 'UPDATE_PROJECT', payload: {} } as Action);
    sockets[0].onopen?.();
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    sockets[0].receive({ t: 'needInit' });
    expect(sockets[0].lastSent()).toEqual({ t: 'init', project: PROJECT_BLOB });
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
    // No act replay (ADD_* would duplicate what the init contains), buffer dropped.
    expect(sockets[0].sent).toHaveLength(2);
    expect(events).not.toContain('replay:UPDATE_PROJECT');
    expect(client.getQueueInfo()).toEqual({ pending: 0, dropped: 0 });
  });

  it('keeps unflushed actions buffered when a write fails mid-flush', async () => {
    const sockets: FakeSocket[] = [];
    let failSends = false;
    const { client, events } = makeClient({
      createSocket: (url: string) => {
        const socket = new FakeSocket(url);
        const send = socket.send.bind(socket);
        socket.send = (data: string) => {
          if (failSends) throw new Error('socket closed');
          send(data);
        };
        sockets.push(socket);
        return socket;
      },
    });
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    client.sendAction('q-1', { type: 'BATCH_START' });
    client.sendAction('q-2', { type: 'BATCH_COMMIT' });
    sockets[0].onopen?.();
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    failSends = true; // the socket dies as the welcome lands
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    expect(client.getQueueInfo()).toEqual({ pending: 2, dropped: 0 });
    // q-1 was re-applied locally before its failed write; q-2 was never reached.
    expect(events).toContain('replay:BATCH_START');
    expect(events).not.toContain('replay:BATCH_COMMIT');

    // Reconnect: the same instance retries the whole buffer in order.
    failSends = false;
    sockets[0].onclose?.();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1].onopen?.();
    await vi.waitFor(() => expect(sockets[1].sent).toHaveLength(1));
    sockets[1].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
    expect(events).toContain('replay:BATCH_COMMIT');
    expect(sockets[1].sent.slice(1).map((s) => JSON.parse(s).actionId)).toEqual(['q-1', 'q-2']);
    expect(client.getQueueInfo()).toEqual({ pending: 0, dropped: 0 });
  });

  it('seeds an empty room when asked, and stays quiet when it may not', async () => {
    const { client, sockets } = makeClient();
    await openClient(client, sockets);
    sockets[0].receive({ t: 'needInit' });
    expect(sockets[0].lastSent()).toEqual({ t: 'init', project: PROJECT_BLOB });

    const { client: viewer, sockets: viewerSockets } = makeClient({ getInitProject: () => null });
    await openClient(viewer, viewerSockets);
    const before = viewerSockets[0].sent.length;
    viewerSockets[0].receive({ t: 'needInit' });
    expect(viewerSockets[0].sent).toHaveLength(before);
  });

  it('sends per-user undo/redo only while open', async () => {
    const { client, sockets } = makeClient();
    // Nothing may be sent before the handshake (the room closes unauthenticated sockets).
    expect(client.sendUndo()).toBe(false);
    expect(client.sendRedo()).toBe(false);
    await openClient(client, sockets);

    expect(client.sendUndo()).toBe(true);
    expect(sockets[0].lastSent()).toEqual({ t: 'undo' });
    expect(client.sendRedo()).toBe(true);
    expect(sockets[0].lastSent()).toEqual({ t: 'redo' });

    client.stop();
    expect(client.sendUndo()).toBe(false);
    expect(client.sendRedo()).toBe(false);
  });

  it('forwards the room\u2019s per-user undo availability', async () => {
    const states: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    const { client, sockets } = makeClient({ onUndoState: (s: { canUndo: boolean; canRedo: boolean }) => states.push(s) });
    await openClient(client, sockets);
    sockets[0].receive({ t: 'undoState', canUndo: true, canRedo: false });
    sockets[0].receive({ t: 'undoState', canUndo: true, canRedo: true });
    expect(states).toEqual([{ canUndo: true, canRedo: false }, { canUndo: true, canRedo: true }]);
  });

  it('heals a rejection with a resync', async () => {
    const { client, sockets, events } = makeClient();
    await openClient(client, sockets);
    client.sendAction('a-2', { type: 'UPDATE_PROJECT', payload: {} } as Action);
    sockets[0].receive({ t: 'rejected', actionId: 'a-2', reason: 'view-only' });
    expect(events).toContain('rejected:a-2:view-only');
    expect(sockets[0].lastSent()).toEqual({ t: 'sync' });

    // A rejection that isn't ours is just an error signal.
    sockets[0].receive({ t: 'rejected', actionId: 'zzz', reason: 'nope' });
    expect(events).toContain('error:room rejected: nope');
  });

  it('ignores malformed messages', async () => {
    const { client, sockets, events } = makeClient();
    await openClient(client, sockets);
    sockets[0].receiveRaw('not json');
    expect(events).toContain('error:malformed room message');
    expect(client.getStatus()).toBe('open');
  });

  it('reconnects with backoff after a dropped socket, then stops when told', async () => {
    vi.useFakeTimers();
    try {
      const { client, sockets, events } = makeClient();
      client.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(sockets).toHaveLength(1);
      sockets[0].onopen?.();
      await vi.advanceTimersByTimeAsync(0);
      sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(client.getStatus()).toBe('open');

      sockets[0].onclose?.();
      expect(events).toContain('status:reconnecting');
      await vi.advanceTimersByTimeAsync(10);
      expect(sockets).toHaveLength(2);
      sockets[1].onopen?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(sockets[1].sent[0]).t).toBe('hello');

      client.stop();
      expect(client.getStatus()).toBe('closed');
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-syncs on a rev gap instead of applying a delta to the wrong base', async () => {
    const { client, sockets, events } = makeClient();
    await openClient(client, sockets, 5);
    // Contiguous peer action applies.
    sockets[0].receive({ t: 'remote', rev: 6, userId: 'u-2', actionId: 'b-1', action: { type: 'BATCH_COMMIT' } });
    expect(events).toContain('remote:b-1');
    // A skip (8 after 6) means we missed rev 7 — never apply it, ask for a snapshot.
    sockets[0].receive({ t: 'remote', rev: 8, userId: 'u-2', actionId: 'b-2', action: { type: 'BATCH_COMMIT' } });
    expect(events).not.toContain('remote:b-2');
    expect(sockets[0].lastSent()).toEqual({ t: 'sync' });
    // Further gaps do not spam the room while the sync is in flight…
    const sent = sockets[0].sent.length;
    sockets[0].receive({ t: 'remote', rev: 9, userId: 'u-2', actionId: 'b-3', action: { type: 'BATCH_COMMIT' } });
    expect(sockets[0].sent).toHaveLength(sent);
    // …and the welcome re-anchors, so the next contiguous delta applies again.
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 9, project: PROJECT_BLOB, replay: [] });
    sockets[0].receive({ t: 'remote', rev: 10, userId: 'u-2', actionId: 'b-4', action: { type: 'BATCH_COMMIT' } });
    expect(events).toContain('remote:b-4');
  });

  it("treats an undo's welcome as the new rev anchor (no false gap after it)", async () => {
    const { client, sockets, events } = makeClient();
    await openClient(client, sockets, 3);
    sockets[0].receive({ t: 'remote', rev: 4, userId: 'u-2', actionId: 'b-1', action: { type: 'BATCH_COMMIT' } });
    // An undo commits its rebased snapshot as the NEXT rev, then re-welcomes.
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 5, project: PROJECT_BLOB, replay: [] });
    sockets[0].receive({ t: 'remote', rev: 6, userId: 'u-2', actionId: 'b-2', action: { type: 'BATCH_COMMIT' } });
    expect(events).toContain('remote:b-2');
    expect(sockets[0].sent.some((s) => JSON.parse(s).t === 'sync')).toBe(false);
  });

  it('retries a failed token fetch on the reconnect backoff (one note per outage)', async () => {
    vi.useFakeTimers();
    try {
      const { client, sockets, events } = makeClient({
        getToken: async () => {
          throw new Error('not signed in');
        },
      });
      client.start();
      await vi.advanceTimersByTimeAsync(0);
      // NOT terminal: the token fetch is part of connecting, so it rides the
      // same backoff as a dropped socket (the deployed pass hit a transient
      // 401 that used to kill the room for the rest of the session).
      expect(client.getStatus()).toBe('reconnecting');
      expect(sockets).toHaveLength(0);
      expect(events).toContain('error:could not obtain a room token: not signed in');

      // The note does not repeat on every retry — the badge carries the state…
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      expect(events.filter((e) => e.startsWith('error:could not obtain'))).toHaveLength(1);

      // …and stop() ends the retry loop.
      client.stop();
      expect(client.getStatus()).toBe('closed');
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('connects after a TRANSIENT token failure without a reload', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const { client, sockets, events } = makeClient({
        getToken: async () => {
          calls += 1;
          if (calls === 1) throw new Error('room token request failed (503)');
          return 'tok-2';
        },
      });
      client.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(sockets).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(10);
      expect(sockets).toHaveLength(1);
      sockets[0].onopen?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(sockets[0].sent[0]).t).toBe('hello');

      sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(client.getStatus()).toBe('open');
      // Recovery clears the note latch: a LATER outage notes again.
      expect(events.filter((e) => e.startsWith('error:could not obtain'))).toHaveLength(1);
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
