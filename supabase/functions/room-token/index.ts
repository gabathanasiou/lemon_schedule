/**
 * room-token — the deployed S4 token issuer (roadmap 229; docs/COLLABORATION.md §6 S4).
 *
 * The app's deployed build calls this via `src/lib/rooms/tokenClient.ts`
 * (`GET ?project=<id>` + the caller's Supabase access token). It resolves the
 * caller, reads their membership role on that project through a caller-scoped
 * (RLS-bound) client — never `service_role` — and mints the short-lived HMAC
 * room token the room worker verifies. The token FORMAT lives in ONE place,
 * `src/lib/rooms/roomToken.ts`, shared with the worker and the app; this
 * function only resolves the claims.
 *
 * Secrets: `ROOM_TOKEN_SECRET` (`npx supabase secrets set`), the SAME value as
 * the room worker's (`npx wrangler secret put ROOM_TOKEN_SECRET` in
 * `workers/rooms`). Never logged, never returned.
 */

import { createClient, isAuthRetryableFetchError } from 'npm:@supabase/supabase-js@2';
import { mintRoomToken } from '../../../src/lib/rooms/roomToken.ts';
import { ROOM_ROLES, type RoomRole } from '../../../src/lib/rooms/protocol.ts';

const CORS = {
  // No cookies/credentials on this endpoint — the caller's bearer token is the
  // only authority, so a wildcard origin exposes nothing a valid caller could
  // not already fetch. (The room WS origin allowlist is the worker's job.)
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
} as const;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  const projectId = new URL(req.url).searchParams.get('project') ?? '';
  if (!projectId) return json({ error: 'missing project' }, 400);

  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!jwt) return json({ error: 'not signed in' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const roomSecret = Deno.env.get('ROOM_TOKEN_SECRET') ?? '';
  if (!supabaseUrl || !anonKey || !roomSecret) return json({ error: 'server not configured' }, 500);

  // The caller's own token: identity + a membership read the database itself
  // scopes to the caller (RLS "memberships select own or owner"). A non-member
  // sees no row — indistinguishable from an unknown project, by design.
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(jwt);
  if (userError || !userData.user) {
    // A transient auth-server failure (fetch error, 5xx) is a SERVER condition:
    // answer 503 so it reads as retryable, and say so in the logs — the deployed
    // two-machine pass hit one silent 401 that was impossible to diagnose after
    // the fact (the client used to give up on it; it now retries). A rejected
    // token is the CALLER's problem: 401.
    if (userError && isAuthRetryableFetchError(userError)) {
      console.warn(`room-token: auth server unreachable (${userError.message})`);
      return json({ error: 'auth server unreachable' }, 503);
    }
    return json({ error: 'invalid session' }, 401);
  }

  const { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (membershipError) return json({ error: 'membership lookup failed' }, 500);

  const role = membership?.role as RoomRole | undefined;
  if (!role || !(ROOM_ROLES as readonly string[]).includes(role)) {
    return json({ error: 'not a project member' }, 403);
  }

  const token = await mintRoomToken(roomSecret, {
    projectId,
    userId: userData.user.id,
    role,
  });
  return json({ token });
});
