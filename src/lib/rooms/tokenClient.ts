/**
 * Room-token acquisition for the deployed path (S4) — DEPLOYED (2026-10-15).
 *
 * Calls the Supabase Edge Function `room-token`, which verifies the caller's
 * membership on the project server-side and mints the short-lived HMAC token
 * the room worker verifies (`src/lib/rooms/roomToken.ts`). Local development
 * (`npm run dev` + `wrangler dev`) uses `dev:` tokens instead and never reaches
 * this module (see `useRoomTransport` callers).
 *
 * A 401 means the auth server no longer accepts this session: refresh once,
 * and when even that fails drop the session LOCALLY — a revoked session must
 * end in a visible signed-out state, never a "signed in" zombie whose every
 * server-side call fails (docs/STORE-AND-SYNC.md §Realtime rooms).
 */
import { supabase } from '../supabase/client';

export async function fetchRoomToken(projectId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('not signed in');
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const url = `${base}/functions/v1/room-token?project=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    // The auth server no longer accepts this session (revoked — e.g. a
    // sign-out elsewhere used Supabase's global scope — or the token itself
    // aged out). Retrying the same token can never succeed, so revive it
    // properly: one refresh; when even that fails the session is dead for
    // good — drop it LOCALLY so the app visibly returns to signed-out
    // instead of pretending to be signed in while nothing server-side works
    // (the zombie session the 229 live pass reported: "my Mac can't connect
    // to the room, the iPad can"; the Mac held a revoked session).
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (!refreshed.session) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new Error('session expired — sign in again');
    }
    throw new Error(`room token request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(`room token request failed (${res.status})`);
  const body: unknown = await res.json();
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || token.length === 0) throw new Error('malformed room token response');
  return token;
}
