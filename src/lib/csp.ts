// Content-Security-Policy for the app (roadmap 285) — the ONE place the policy
// is defined. `vite.config.ts` injects it as a `<meta http-equiv>` into
// index.html at build AND serve time; `src/lib/__tests__/csp.test.ts` pins the
// invariants and `e2e/csp.spec.ts` proves the built page carries it and boots
// without a single violation.
//
// Constraints to keep in mind when editing:
//  - `frame-ancestors` / `X-Frame-Options` CANNOT ride a meta tag — the
//    clickjacking gap and its accepted-risk note live in docs/SECURITY.md §7.
//    Don't add frame-ancestors here; it would be silently ignored.
//  - Production script-src has NO 'unsafe-inline' — that is what keeps the
//    stored-XSS inline-handler class inert (item 274's defense-in-depth). The
//    dev server relaxes this (Vite's react-refresh preamble is inline).
//  - A new external origin (API, tile, script, avatar host) MUST be added here
//    in the SAME commit — the default e2e run builds the app, so a blocked
//    origin fails the suite, but only for the surfaces specs exercise.
//  - The Google geocoding origins (roadmap 297) stay allowed even when no key
//    is configured — the keyless build falls back to Nominatim.

export interface CspOptions {
  /** Dev server: allow the inline react-refresh preamble and the local
   *  HMR / rooms websockets. Production stays strict. */
  dev: boolean;
}

// Every origin below is used by shipped code — keep the comment names in sync
// with the call sites. The full walk-through lives in docs/SECURITY.md §7.
const SCRIPT_SRC = [
  "'self'",
  'https://accounts.google.com', // Google Identity Services (gsi/client) — Drive sign-in
];
const IMG_SRC = [
  "'self'",
  'data:', // stored report images (data URLs)
  'blob:', // canvas / export previews
  'https://tile.openstreetmap.org', // Leaflet tiles (app + printed report maps)
  'https://*.googleusercontent.com', // Google account avatars
  'https://*.supabase.co', // Supabase profile imagery
];
const CONNECT_SRC = [
  "'self'",
  'https://accounts.google.com', // GIS token/status endpoints
  'https://www.googleapis.com', // Drive API + oauth2/v3/userinfo
  'https://places.googleapis.com', // Google address search + reverse geocoding (keyed, roadmap 297)
  'https://nominatim.openstreetmap.org', // keyless geocoding fallback + weather labels
  'https://api.open-meteo.com', // weather (forecast window)
  'https://archive-api.open-meteo.com', // weather (past dates)
  'https://www.gstatic.com', // connectivity probe (generate_204)
  'https://*.supabase.co', // auth / REST / Edge Functions
  'wss://*.supabase.co', // Realtime presence channel
  'https://*.workers.dev', // S4 room worker (HTTPS surfaces)
  'wss://*.workers.dev', // S4 room worker (room sockets)
  'ws://127.0.0.1:3939', // local MCP agent bridge (File → Connect agent bridge)
];
const DEV_CONNECT_EXTRA = [
  'ws://localhost:*', // Vite HMR (any dev port)
  'ws://127.0.0.1:*', // local rooms worker (tools/rooms-dev.mjs)
];

/** Serialise the policy for a `<meta http-equiv="Content-Security-Policy">`. */
export function buildCsp({ dev }: CspOptions): string {
  const scriptSrc = [...SCRIPT_SRC, ...(dev ? ["'unsafe-inline'"] : [])];
  const connectSrc = [...CONNECT_SRC, ...(dev ? DEV_CONNECT_EXTRA : [])];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'", // React / Leaflet / Glide inline styles
    `img-src ${IMG_SRC.join(' ')}`,
    "font-src 'self' data:", // bundled fonts only
    `connect-src ${connectSrc.join(' ')}`,
    'frame-src https://accounts.google.com', // GIS silent-refresh iframe
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
