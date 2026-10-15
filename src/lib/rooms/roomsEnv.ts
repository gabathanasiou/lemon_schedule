/**
 * The effective rooms URL (roadmap 246) — the ONE read of `VITE_ROOMS_URL`.
 *
 * Production: exactly the configured var (unset = rooms off, the pre-S4 blob
 * path). Dev builds: an unset var falls back to the local worker, which the
 * dev server auto-starts (tools/rooms-dev.mjs) — `npm run dev` needs no .env
 * edit for a collab session. An explicit value always wins (e.g. another port
 * for parallel work, or the deployed worker).
 */
const DEV_FALLBACK_ROOMS_URL = 'http://127.0.0.1:8787';

export function roomsUrl(): string | undefined {
  const configured = import.meta.env.VITE_ROOMS_URL as string | undefined;
  if (configured) return configured;
  return import.meta.env.DEV ? DEV_FALLBACK_ROOMS_URL : undefined;
}

/** The feature flag surfaces read this (badge, diagnostics) — same source. */
export function roomsConfigured(): boolean {
  return !!roomsUrl();
}

/** Loopback = the local worker the dev server owns, never a deployed one. */
export function isLoopbackRoomsUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

/**
 * Which token flavour a DEV build mints. `dev:` tokens work ONLY against the
 * LOOPBACK worker (its local `.dev.vars` sets DEV_AUTH); the DEPLOYED worker
 * never has DEV_AUTH. So a dev build pointed at the deployed worker
 * (`VITE_ROOMS_URL` = the deployed URL — the real-server testing path, with
 * real accounts) must mint REAL tokens from the Supabase function like any
 * production client. Prod builds always use real tokens.
 */
export function usesDevRoomTokens(url: string | undefined, isDev: boolean): boolean {
  return isDev && (!url || isLoopbackRoomsUrl(url));
}

/**
 * Ask the DEV SERVER to bring the local worker up. A browser cannot spawn
 * processes — the Vite dev server's `GET /__rooms-dev/ensure` middleware owns
 * the launcher (`tools/rooms-dev.mjs`), reusing a running worker so parallel
 * dev servers share one. Dev-only + loopback-only; the timeout caps how long a
 * cold wrangler boot may delay `client.start()` (a worker that stays down
 * leaves the badge `unreachable` and the client's reconnect loop takes over).
 */
export async function ensureRoomsWorkerInDev(url: string, timeoutMs = 12_000): Promise<void> {
  if (!import.meta.env.DEV || !isLoopbackRoomsUrl(url)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`/__rooms-dev/ensure?url=${encodeURIComponent(url)}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
