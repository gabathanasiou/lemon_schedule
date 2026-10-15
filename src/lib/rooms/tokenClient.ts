/**
 * Room-token acquisition for the deployed path (S4).
 *
 * Calls the Supabase Edge Function `room-token`, which verifies the caller's
 * membership on the project server-side and mints the short-lived HMAC token
 * the room worker verifies (`src/lib/rooms/roomToken.ts`). The function is not
 * deployed yet — this is the wired client seam for go-live. Local development
 * (`npm run dev` + `wrangler dev`) uses `dev:` tokens instead and never reaches
 * this module (see `useRoomTransport` callers).
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
  if (!res.ok) throw new Error(`room token request failed (${res.status})`);
  const body: unknown = await res.json();
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || token.length === 0) throw new Error('malformed room token response');
  return token;
}
