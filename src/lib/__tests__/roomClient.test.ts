import { describe, expect, it, vi } from 'vitest';
import { RoomClient, type WebSocketLike } from '../rooms/roomClient';
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

  it('streams actions only while open, and dedupes its own echo', async () => {
    const { client, sockets, events } = makeClient();
    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    // Not open yet — an action would be refused (and close the socket) server-side.
    expect(client.sendAction('early-1', { type: 'BATCH_START' })).toBe(false);

    sockets[0].onopen?.();
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    sockets[0].receive({ t: 'welcome', userId: 'u-1', role: 'editor', rev: 0, project: PROJECT_BLOB, replay: [] });
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));

    expect(client.sendAction('a-1', { type: 'BATCH_START' })).toBe(true);
    expect(sockets[0].lastSent()).toEqual({ t: 'act', actionId: 'a-1', action: { type: 'BATCH_START' } });

    // Own echo: already applied optimistically — never forwarded.
    sockets[0].receive({ t: 'remote', rev: 1, userId: 'u-1', actionId: 'a-1', action: { type: 'BATCH_START' } });
    expect(events).not.toContain('remote:a-1');

    // A peer's action is applied.
    sockets[0].receive({ t: 'remote', rev: 2, userId: 'u-2', actionId: 'b-1', action: { type: 'BATCH_COMMIT' } });
    expect(events).toContain('remote:b-1');
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

  it('stops with an error when no token can be obtained', async () => {
    const { client, sockets, events } = makeClient({
      getToken: async () => {
        throw new Error('not signed in');
      },
    });
    client.start();
    await vi.waitFor(() => expect(client.getStatus()).toBe('closed'));
    expect(sockets).toHaveLength(0);
    expect(events).toContain('error:could not obtain a room token: not signed in');
  });
});
