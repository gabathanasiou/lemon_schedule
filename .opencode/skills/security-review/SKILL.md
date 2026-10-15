---
name: security-review
description: Secure-build and security-review checklist for Lemon Schedule. Use whenever a task touches auth, permissions or roles, tokens or secrets, RLS/Supabase policies, the S4 room worker (WebSockets, Durable Objects, origin checks, room tokens), any network-facing surface (HTTP endpoints, Edge Functions, WebSocket endpoints), client credential storage, CSP/security headers, parsing of untrusted files (FDX/Fountain/CSV imports), or dependency bumps — and whenever asked to "security review", "audit", "harden", or "check this is safe". Also load before deploying the room worker or changing how sharing/access works.
---

# Security review — Lemon Schedule

Read `docs/SECURITY.md` first — it is the model (trust boundary, where every secret
lives, the owner checklist, the known gaps). This skill is the working checklist and
the verification commands. Don't re-derive either; if the model changes (a new secret,
a new network surface, a closed gap), update `docs/SECURITY.md` in the same commit.

Research basis (2026-10): OWASP WebSocket Security Cheat Sheet, Cloudflare
Workers/Durable Objects security guidance, Supabase RLS guidance. For Supabase schema
or RLS authoring, defer to the `supabase` / `supabase-postgres-best-practices` skills
(already loaded via `opencode.json`) instead of inventing patterns; for Workers
internals, Cloudflare's own skills pack (`npx skills add https://github.com/cloudflare/skills`)
is the reference.

## The non-negotiables (breaking one of these is a bug, not a style choice)

- **Server-side gates only.** RLS and the room's checks are enforcement; UI `locked`
  gating is cosmetic.
- **Secrets never leave provider stores.** Provider secret stores (Cloudflare worker
  secrets, Supabase function secrets) or gitignored local files only — never a `VITE_`
  var, never committed, never in URLs/query strings, logs, or chat. Generate locally,
  pipe into the store, never print.
- **Room tokens never ride the URL** — first-message `hello`, HMAC + expiry + bound to
  one project id.
- **Never log credentials** — `error?.message` only; the room logs security *events*,
  never content.
- **`readOnly` (connectivity) and `canEdit` (permission) are separate flags** — never
  overload either.

## Checklist by surface

### workers/rooms — the room worker

- [ ] Upgrade: Origin allowlist checked BEFORE accepting (`ALLOWED_ORIGINS` env >
      built-in defaults); 101 only after the checks pass.
- [ ] Auth: first message is `hello` (token); `verifyRoomToken` = HMAC-SHA256 + expiry
      + project binding. `DEV_AUTH` is `.dev.vars`-only — if you touch it, re-read the
      wrangler.toml comment and make sure a deployed env can never set it.
- [ ] Authorization per message: role lives in the socket attachment; viewers are
      refuse-all; the allowlist is `ACTION_TYPES` minus `LOAD`/`UNDO`/`REDO`.
- [ ] Abuse limits intact: message size cap + per-socket rate limit; rejected actions
      are never persisted or broadcast.
- [ ] `GET /health` stays auth-less, data-free and DO-free (the dev launcher's
      liveness probe, roadmap 246 — never add data or auth there).
- [ ] The reducer stays the semantic gate (apply errors → `rejected`, nothing written).
- [ ] Verify after ANY room change: `npx tsc -p workers/rooms`, then `wrangler dev` +
      `npx tsx workers/rooms/test/room-probe.ts` — the probe's negative cases (fake
      origin, no auth, wrong room, oversize, flood) must stay green.

### Supabase (RLS, sharing, presence, future Edge Functions)

- [ ] RLS on from day one for every table; non-members blocked; viewer writes rejected
      server-side — the acceptance lives in `supabase/tests/rls_s*.sql` (run after
      policy changes).
- [ ] Share links: sha256 at rest, raw token inviter-only via RLS, revoke evicts.
- [ ] Edge Functions (future): secrets via `supabase secrets set`; `service_role`
      never leaves the function; verify claims server-side, never trust the payload.

### Client (the app)

- [ ] New credentials: only the documented storages (Drive token = `useRef` +
      `sessionStorage`; Supabase session = localStorage, the one exception). Don't add
      a third.
- [ ] New remote calls: `https`/`wss` only; no secrets in query strings; if it's a
      save/upload path, read the Drive rules in `docs/STORE-AND-SYNC.md` first (the
      no-FormData / no-binary upload lessons apply to new fetch wrappers too).
- [ ] Import parsers handle untrusted files (FDX/Fountain/CSV/MSD): stay defensive, no
      `eval`/`Function` on file content, no `dangerouslySetInnerHTML` of imported text.

### Dependencies

- [ ] `npm audit` stays at 0; run it after every bump.
- [ ] A lockfile change means the FULL e2e suite (`npm run test:full`), not the smart
      subset — a green subset proves nothing about the shipped bundle.
- [ ] The Radix pins (roadmap 71) are a security rule: one shared
      `react-dismissable-layer`; never bump dialog/dropdown independently.

## Workflow when a change touches any of this

1. Read `docs/SECURITY.md` and name which surface(s) the change hits.
2. Apply the checklist; prefer adapting an existing gate over adding a parallel one
   (one source of truth — AGENTS.md core rule 4).
3. Run the verification block below; anything a human can confirm visually ends with a
   manual check instead (core rule 7).
4. If the security model changed, update `docs/SECURITY.md` (and this skill if the
   checklist changed) in the same commit.

## Verification block

```bash
npm run lint                     # app typecheck + docs budget + e2e eslint
npx tsc -p workers/rooms         # worker program (separate runtime, separate config)
cd workers/rooms && npx wrangler dev --port 8787 &   # local room (with .dev.vars DEV_AUTH=1)
npx tsx workers/rooms/test/room-probe.ts             # 31 checks incl. attack negatives
npm audit                        # must be 0
npm run test:full                # for logic/auth/dependency changes (rule 7)
```
