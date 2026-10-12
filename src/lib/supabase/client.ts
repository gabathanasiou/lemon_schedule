import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/**
 * The S1 collaboration feature flag (docs/COLLABORATION.md §6). False when the
 * deploy has no Supabase env — local installs, e2e, the free Drive tier —
 * and every online entry point stays invisible. Never read env values
 * anywhere else.
 */
export const isSupabaseConfigured = Boolean(url && key);

/**
 * One client for the whole app (roadmap 229 S1).
 *
 * - Sessions persist in localStorage deliberately: the AGENTS.md §Security
 *   sessionStorage rule guards the Google Drive access token; the Supabase
 *   account session is a different trust domain and must survive restarts
 *   to be useful (docs/COLLABORATION.md §11).
 * - PKCE: the OAuth / magic-link callback lands as `?code=` in the query
 *   string and is exchanged by `detectSessionInUrl` — it never collides with
 *   the app's `#/` hash routes.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;
