import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `fetchRoomToken` auth semantics (roadmap 229 live-pass hardening): a 401 from
 * the room-token function means the SESSION is dead server-side — refresh once,
 * and when even that fails sign out LOCALLY (a zombie "signed in" state whose
 * server calls all fail was the reported "my Mac can't connect" bug: signing
 * out on another device had globally revoked the session).
 */
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../supabase/client', () => ({
  supabase: { auth },
}));

async function importFetchRoomToken() {
  vi.resetModules();
  const mod = await import('../rooms/tokenClient');
  return mod.fetchRoomToken;
}

function session(accessToken = 'jwt-1') {
  return { data: { session: { access_token: accessToken } }, error: null };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  auth.getSession.mockReset();
  auth.refreshSession.mockReset();
  auth.signOut.mockReset();
});

describe('fetchRoomToken — dead-session handling', () => {
  it('returns the token on 200 without touching the session', async () => {
    auth.getSession.mockResolvedValue(session());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'v1.abc.def' }), { status: 200 })));
    const fetchRoomToken = await importFetchRoomToken();
    await expect(fetchRoomToken('p-1')).resolves.toBe('v1.abc.def');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('on 401 with a healthy session: refreshes and throws (the retry then heals)', async () => {
    auth.getSession.mockResolvedValue(session());
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'jwt-2' } }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const fetchRoomToken = await importFetchRoomToken();
    await expect(fetchRoomToken('p-1')).rejects.toThrow('room token request failed (401)');
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('on 401 with a dead session: signs out LOCAL scope and says so', async () => {
    auth.getSession.mockResolvedValue(session());
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('invalid refresh token') });
    auth.signOut.mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const fetchRoomToken = await importFetchRoomToken();
    await expect(fetchRoomToken('p-1')).rejects.toThrow('session expired — sign in again');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('on 403 (not a member): never touches the session', async () => {
    auth.getSession.mockResolvedValue(session());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    const fetchRoomToken = await importFetchRoomToken();
    await expect(fetchRoomToken('p-1')).rejects.toThrow('room token request failed (403)');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
