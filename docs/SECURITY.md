# Security Model & Review — Agent Manual

Public counterpart for reporters: root [`SECURITY.md`](../SECURITY.md) (GitHub
private vulnerability reporting only — roadmap 282).

Status: **read before touching auth, tokens, secrets, roles/RLS, the room worker, or
anything network-facing.** Research basis (2026-10): OWASP WebSocket Security Cheat
Sheet, Cloudflare Workers/Durable Objects security guidance, Supabase RLS guidance.
The working checklist is the `security-review` skill (`.opencode/skills/security-review`);
this doc is the model it checks against. Update BOTH whenever the model changes.

## 1. The model in one view

- **Free tier (local + Google Drive)** — a static SPA on GitHub Pages, HTTPS only. No
  backend; the only credential is the Google OAuth access token.
- **Collaboration tier** — Supabase (accounts, Postgres + RLS, Realtime, Edge
  Functions) + Cloudflare Workers + Durable Objects (S4 rooms). Everything is
  transport-encrypted: HTTPS/WSS everywhere (Cloudflare terminates TLS for the room
  worker; GitHub Pages is HTTPS-only; browsers refuse `ws://` from an `https://` page).
- **Trust boundary**: the SERVER is the authority. UI gating (`locked`) is cosmetic —
  RLS and the room's own checks are the real gates.

## 2. Where secrets live — and nowhere else

| Value | Lives in | Public? |
| --- | --- | --- |
| Google OAuth client ID | `VITE_GOOGLE_CLIENT_ID` (+ repo secret) | yes — client IDs are not secrets |
| Google Maps/Places key | `VITE_GOOGLE_MAPS_API_KEY` (+ repo secret; roadmap 297) | ships in the bundle — guarded by HTTP-referrer + API restrictions + quota caps (§6) |
| Supabase URL + publishable/anon key | `VITE_SUPABASE_*` (+ repo secrets) | yes by design — RLS is the gate |
| Supabase account session | browser `localStorage` (deliberate; COLLABORATION.md §11) | session tokens — the one web-storage exception |
| Google Drive access token | `useRef` + `sessionStorage` only | no — never logged, never localStorage |
| `ROOM_TOKEN_SECRET` | Cloudflare worker secret (`lemon-rooms`) + Supabase function secret (`room-token`) — both set 2026-10-15 | no — both server-side stores only |
| `service_role` key | never in the client; Edge Functions only — `delete-account` (caller-scoped admin delete + the archive RPCs); `room-token` does NOT use it (caller's own token under RLS) | no |

Rules:
- `VITE_*` variables are **public by definition** (they ship in the bundle). Only
  public-by-design values ever get a `VITE_` name.
- Generate secrets locally and pipe them into the store (`wrangler secret put`,
  `supabase secrets set`) — never printed, never a CLI argument (argv lands in shell
  history/process lists), never in chat, logs, or URLs.
- Local overrides: `.env*` and `.dev.vars*` are gitignored; placeholders only in
  `.env.example`. The repo is PUBLIC — treat every commit as world-readable.

## 3. S4 rooms — the worker's + token-issuance checklists (all implemented)

`workers/rooms/src/` — every item below is enforced there; re-check it when touching
the room:

- **TLS + origin**: browsers connect only via `wss://`; the upgrade is refused unless
  `Origin` is in the allowlist (`ALLOWED_ORIGINS` env, defaults cover the Pages deploy
  + local dev). Missing `Origin` (non-browser clients) still needs a valid token.
- **Auth**: the FIRST message is `hello` carrying the room token — tokens never ride
  the URL (query strings land in proxy/browser logs). Tokens are HMAC-SHA256 signed,
  expiry-checked, and bound to one project id (`src/lib/rooms/roomToken.ts`).
- **Dev auth**: `DEV_AUTH=1` only via the gitignored `.dev.vars`; never set in a
  deployed environment.
- **Authorization per message**: the socket's role lives in its attachment; viewers
  are refuse-all; the action allowlist is `ACTION_TYPES` minus `LOAD`/`UNDO`/`REDO`
  (`src/lib/rooms/policy.ts`).
- **Abuse limits**: message size cap (1M chars ≈ Cloudflare's 1 MiB WS limit) and a
  per-socket rate limit (burst 60, refill 20/s) — both close the socket with a policy
  code.
- **Validation**: the reducer is the semantic gate; a rejected action is never
  persisted nor broadcast.
- **Logging**: security events (`auth failed`, `origin rejected`, `rate limited`,
  oversized) log the event only — never tokens or message contents.
- **HTTP surface**: only a WebSocket upgrade is answered — any other request to
  `/room/<id>` is refused with `426` before any state is read (roadmap 277: a plain
  `GET` used to return `{room, initialized, rev}`, a project-existence/activity oracle).
- **Health**: `GET /health` (the local dev launcher's liveness probe, roadmap 246)
  is deliberately auth-less and data-free (`{ ok, service }`) and never reaches a
  Durable Object — it exists only so `tools/rooms-dev.mjs` can tell "worker up"
  from "port taken".
- **Proof**: `workers/rooms/test/room-probe.ts` (49 checks) includes the negatives —
  fake origin, no auth, wrong room, oversized frame, message flood, plain-GET
  metadata refused with 426.

**The `room-token` issuance path (deployed 2026-10-15, roadmap 229).** The Supabase
Edge Function `supabase/functions/room-token/index.ts` mints what the worker verifies,
using the ONE shared format `src/lib/rooms/roomToken.ts`:

- Gateway `verify_jwt` stays ON (`supabase/config.toml`) — missing/invalid JWTs never
  reach the function; the function then verifies the caller AGAIN (`auth.getUser`)
  and never trusts one gate alone.
- The membership-role read uses the CALLER's token through RLS ("memberships select
  own or owner") — no `service_role` anywhere; a non-member sees no row and gets 403
  (indistinguishable from a nonexistent project, by design).
- Tokens ride the RESPONSE BODY (never URLs), are HMAC-bound to one project id and
  expire in 1 h; the secret lives only in the two server-side stores.
- **Proof**: `workers/rooms/test/deployed-probe.mjs` — the minted token is accepted by
  the DEPLOYED worker over a real WebSocket; garbage and cross-project tokens are
  refused (1008); non-member → 403, no session → 401, CORS preflight 204.

**The account-erasure + recovery surface (roadmaps 281/294, live 2026-10-16).**
`supabase/functions/delete-account/` verifies the caller's JWT twice (gateway +
in-function) and uses `service_role` to delete the CALLER only — never an id from the
request body. Before `admin.deleteUser` it snapshots the full footprint via
`archive_account` and ABORTS (500, nothing deleted) if archiving fails. Recovery is
OPERATOR-only, 30 days — no user-facing path at all: `public.account_archive` is RLS
deny-all with NO policies, `archive_account`/`restore_account` are SECURITY DEFINER
(they must read `auth`) with `search_path = ''` and execute granted to `service_role`
ONLY, and the app's "permanently" copy is unchanged. The archived row includes the
password hash (a restore signs the person back in with their old password); a
same-email re-registration or a provider identity already attached elsewhere
makes the restore REFUSE rather than merge (the archive row is kept for a
retry); references to rows deleted during the window are skipped and reported,
never fatal. Purged daily by
`account-archive-purge` (`20261016142825_account_recovery_archive.sql`). **Proof**:
`supabase/tests/rls_delete_account.sql` (cascade, unchanged) +
`supabase/tests/rls_account_recovery.sql` (archive → delete → restore → re-delete;
clash refused; purge).

## 4. Client rules (touching auth, network, or storage)

- Drive token: `useRef` + `sessionStorage` only; expose via `useGoogleAuth().accessToken`;
  never log it (`error?.message` only), never localStorage, never URLs/DOM.
- The Supabase session in localStorage is the ONE deliberate exception — a known
  SPA trade-off so refresh keeps you signed in. Do not add a second credential to web
  storage; the mitigating controls are the app not running third-party scripts and the
  strict meta CSP every build now serves (§7).
- `readOnly` (connectivity) and `canEdit` (permission) never overloaded; every editing
  surface gates on `locked`.
- New mutations go through the ONE `Action` union — never a per-feature sync path;
  server-authoritative rooms then validate them by construction.
- **Sign-out scopes are deliberate (roadmap 266)**: the default sign-out is LOCAL
  (`{ scope: 'local' }`) so one device never revokes another; the Sessions tab
  exposes `'others'` (this device stays in) and `'global'` (this device included,
  behind a confirm). NEVER call `auth.signOut()` with no scope — the SDK default
  is `'global'` (the 229 live pass: one dev-app sign-out zombie-d every device).
- **Session expiry lives server-side (roadmap 266)**: a daily `pg_cron` sweep
  deletes sessions older than 180 days (`session-timebox-180d`, migration
  `20261015211212`) — the free-tier stand-in for Pro's inactivity timeout (§6).

## 5. Dependencies & supply chain

- `npm audit` must stay at **0**. Last sweep 2026-10-26: the 7 dev-only
  advisories cleared — MCP SDK transitives (express/ajv/zod) plus
  wrangler→miniflare→undici bumped (wrangler 4.152.0). miniflare pins `undici`
  exactly, so a surgical `overrides` entry in `package.json`
  (`miniflare > undici: 7.30.1` — EventSource-parser memory DoS) holds the fix;
  drop it once wrangler ships a patched pin. 2026-10-15 cleared 41 advisories
  (Tiptap `mergeAttributes` proto-pollution + markdown ReDoS → 3.30.1 bumped to 3.32.0;
  MCP SDK OAuth fix; source-map-js DoS). Run `npm audit` after every dependency change.
- After any lockfile change, run the FULL e2e suite (rule 7 — dependency changes
  escalate; a green subset proves nothing about the bundle).
- The Radix pins (AGENTS.md roadmap 71) are a security rule as much as a bug fix:
  one shared `react-dismissable-layer` — never bump dialog/dropdown independently.

## 6. Owner's checklist (user-side, one-time / occasional)

- **Two-factor authentication**: **Cloudflare — enabled 2026-10-15, verified via the API ✓**.
  Still to enable: **Supabase** (dashboard → Account → Security) and **GitHub**
  (Settings → Password and authentication). These accounts together control the
  collab backend; passwords alone are not acceptable protection for them.
- Supabase dashboard: keep "Automatically expose new tables" OFF (done 2026-10-12);
  never paste the `service_role` key anywhere shared.
- Rotating the room secret (deployed 2026-10-15 — see §3): set the new value in BOTH
  stores (Cloudflare worker + Supabase Edge Function), redeploy the function, then
  `npx wrangler deploy` the worker — in-flight sockets reconnect with fresh tokens.
- **User sessions (roadmap 266)**: the time-box sweep is LIVE — `session-timebox-180d`
  (daily 04:17 UTC) deletes sessions older than 180 days. It is the free-tier stand-in:
  Supabase's **Inactivity timeout is Pro-only** (the Management API answers
  `402 User sessions can only be configured on Pro Plans and up`), and this GoTrue
  version records no per-session activity timestamp (`auth.sessions.refreshed_at` is
  NULL, `updated_at` never moves, `auth.audit_log_entries` is empty). On Pro:
  Authentication → Sessions → **Inactivity timeout = 30 days**, then unschedule the
  sweep (`select cron.unschedule('session-timebox-180d');`).
- **Google Maps/Places key (roadmap 297)** — create ONE key in the same Cloud project
  as the Drive client: billing enabled; "Places API (New)" + "Geocoding API" enabled;
  application restriction = HTTP referrers (`https://<user>.github.io/*`,
  `http://localhost:3000/*`, dev ports as needed); API restriction = those two APIs;
  set daily quota caps (~500/day each) and a budget alert. Then add the value to the
  local `.env` AND the repo secret of the same name (`deploy.yml` reads it). The key
  is public in the bundle — the restrictions are the guard.

## 7. Honest gaps (planned, not yet done)

- **Clickjacking / framing (the one CSP gap).** The CSP ships as a meta tag
  (below), and `frame-ancestors` / `X-Frame-Options` CANNOT ride a meta tag —
  GitHub Pages serves no custom headers, so the hosted app stays framable.
  Resolve when a custom domain lands: put Cloudflare in front and send
  `Content-Security-Policy: frame-ancestors 'self'` + `X-Frame-Options: DENY`;
  until then this is accepted risk (low: the app exposes no cross-site
  privileged action a frame could leverage beyond its own UI).
- **CSP — SHIPPED 2026-10-16 (roadmap 285).** Every build serves a meta
  `Content-Security-Policy` — policy in `src/lib/csp.ts` (ONE source), injected
  by the `csp` plugin in `vite.config.ts`; the dev server gets a relaxed variant
  (react-refresh preamble + local websockets). `default-src 'self'`; script-src
  has NO `'unsafe-inline'`/`'unsafe-eval'` in production (the stored-XSS
  inline-handler class stays inert — item 274's defense-in-depth), with an
  explicit allowlist: GIS (`accounts.google.com` in script/frame/connect),
  Drive + userinfo (`www.googleapis.com`), Google geocoding
  (`places.` / `maps.googleapis.com`, roadmap 297), Nominatim fallback +
  Open-Meteo, the gstatic probe, Supabase (`https`/`wss://*.supabase.co`), the
  room worker (`*.workers.dev`), OSM tiles, Google avatars, and the local agent
  bridge (`ws://127.0.0.1:3939`). `index.html` also carries
  `Referrer-Policy: strict-origin-when-cross-origin` (meta `name="referrer"` —
  needed so the Maps key's referrer restriction can read the origin; a stricter
  policy would send no Referer and break it). Guards:
  `src/lib/__tests__/csp.test.ts` pins the policy invariants; the seeded-smoke
  canary asserts the built page carries the meta + zero violations on boot.
  **A new external origin must be added to `src/lib/csp.ts` in the same commit.**
- **Edge rate limits / WAF rules** on the room worker (Cloudflare dashboard) — cheap
  and worthwhile before a public launch, not before.
- **Chunked snapshot transfer** if a project's serialized blob exceeds the 1 MiB
  WebSocket message cap (today a huge project's `welcome` could silently fail).
- Anonymous-guest cleanup + CAPTCHA/Turnstile before public launch
  (docs/COLLABORATION.md §11).
