/**
 * delete-account — the account-erasure path (roadmap 281, audit F9).
 *
 * The caller's own JWT (verified twice: gateway + here) identifies the user;
 * deletion is ONE admin call. Every FK referencing auth.users CASCADEs —
 * profiles, OWNED projects (+ their opaque blobs), memberships, pending
 * invites, share links, teams + team rosters — so collaborator access to owned
 * projects ends with the account. That consequence is spelled out in the app's
 * confirm dialog (product decision, 2026-10-16) — the server does not
 * second-guess it. Guests (anonymous accounts) use the same path; reaping
 * STALE guests is roadmap 293, not this function.
 *
 * Recovery (roadmap 294): before the admin delete, the account's full footprint
 * is snapshotted via `archive_account` into public.account_archive (RLS
 * deny-all; RPC execute locked to service_role) — ids AND the password hash, so
 * an operator restore signs the person back in with their OLD password
 * (sessions stay gone). The window is 30 days (pg_cron purge) and OPERATOR-only:
 * the app's "permanently" copy is unchanged, no UI, no cancel flow. If
 * archiving fails the deletion ABORTS (500, nothing deleted) — fail closed.
 * Runbook: docs/COLLABORATION.md §account restore.
 *
 * Secrets: SUPABASE_SERVICE_ROLE_KEY (a hosted Edge-Function default) — never
 * returned, never logged (error.message only).
 *
 * Deploy: `npx supabase functions deploy delete-account --project-ref <ref> --use-api`
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  // No cookies/credentials on this endpoint — the caller's bearer token is the
  // only authority, so a wildcard origin exposes nothing a valid caller could
  // not already do. Same posture as room-token.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
} as const;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!jwt) return json({ error: 'not signed in' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'server not configured' }, 500);

  // The caller's own token — the delete target is ALWAYS this user, never an
  // id from the request body.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'invalid session' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Archive BEFORE the delete (roadmap 294): the snapshot is the recovery
  // window. An archiving failure aborts the whole call — nothing is deleted
  // without its archive row (fail closed).
  const { error: archiveError } = await admin.rpc('archive_account', {
    p_user: userData.user.id,
  });
  if (archiveError) {
    console.error('delete-account archive failed:', archiveError.message);
    return json({ error: 'Could not delete the account — try again.' }, 500);
  }

  const { error } = await admin.auth.admin.deleteUser(userData.user.id, false);
  if (error) {
    console.error('delete-account failed:', error.message);
    return json({ error: 'Could not delete the account — try again.' }, 500);
  }
  return json({ deleted: true });
});
