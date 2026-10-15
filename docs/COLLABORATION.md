# Online Collaboration — Vision, Architecture & Stages (PLAN — S1–S3 BUILT; S4 BUILT LOCALLY)

Status: planning doc for roadmap 229. **Read this before starting any online-accounts,
sharing, presence or realtime-editing work.** The free local/Google Drive path must
stay exactly as it is today. **S1 + S2 are built and verified (2026-10-12)**: accounts +
shared projects (§6 S1 map) and sharing/roles/invites + view-only links (§6 S2 map);
**S3 is built (2026-10-12)**: presence (live pointers + follow) and the S3.5 save
refresh (§6 S3 map); **follow completeness is built (2026-10-12)**: the Sheet scene,
view switches and scroll mirroring, with the user decision that scrolling yourself
never ends follow while any view-changing click does (§9). RLS acceptance is
`supabase/tests/rls_s1.sql` + `rls_s2.sql` + `rls_s3.sql`. **S4 (rooms) is built locally**
(worker + client transport + per-user undo; flag-gated by `VITE_ROOMS_URL`) — deploy and the
live two-machine pass are next; runtime semantics: `docs/STORE-AND-SYNC.md` §Realtime rooms.

Decisions taken 2026-10 with the user: online-only editing for SHARED projects
(server-authoritative rooms, NOT CRDT); Supabase + Cloudflare Durable Objects;
the Drive tier stays free and unchanged; collaboration is the paid add-on
(Studio + subscription, invited guests free — see `docs/LICENSING.md`).

## 1. Product model

- **Free = today**: local + Google Drive, single-user, offline-capable, no account.
- **Collaboration = paid add-on** on top of a Studio licence (roadmap 230). The
  subscriber invites free guests/team members with a role (editor or view-only)
  and shares view-only links.
- Feel: Notion/Slack membership + invites + share links; Canva/Figma-style
  presence (live cursors, follow mode).
- Open: per-seat vs per-project billing (`§11`).

**UX language (Apple-aligned — use these exact strings in UI; sourced from the
Numbers guide):**
- The action is **Collaborate** (the Share menu's top item); invite copy:
  "Invite others to collaborate".
- Access: **Who can access** → **Only invited people** / **Anyone with the link**.
- Permissions: **Can make changes** / **View only**; **Allow others to invite**.
- Management: **Manage Shared Project…** (File menu), **Share With More People**,
  **Copy Link**, **Stop Sharing…**.
- A shared project shows a person icon + tick; opening it lists who's collaborating.
- Projects on the collaboration backend live in the Project Manager's
  **Shared** tab — the UI calls them **shared projects**, never "online projects"
  ("online" stays architecture language for the docs).
- Internals/docs may say "copy/move online" — the UI never does. (Apple "moves the
  spreadsheet to iCloud"; we copy it to the hosted backend the first time.)

## 2. Current state (verified pointers)

- Static SPA on GitHub Pages (`/lemon_schedule/`), **no backend, no accounts**.
  Google OAuth is Drive-only and its token lives in `useRef`/sessionStorage
  (AGENTS.md §Security) — never extrapolate it into an identity system.
- Persistence: localStorage index `lemon_schedule_project_index` + per-project
  `lemon_schedule_project_v1_{id}`, compressed by `src/lib/projectCodec.ts:51`
  (`serializeProject`) / `:68` (`deserializeProject`); Drive uploads the whole
  file (`src/lib/googleDriveStorage.ts:111`). Concurrent writers today =
  last-write-wins with no detection (docs/ROADMAP.md:228).
- Mutations: ONE `Action` union (`src/store/reducer.ts:155`, currently 100 types)
  registered in `ACTION_TYPES` under the "KEEP IN SYNC" mandate
  (`src/store/reducer.ts:262,264`). The reducer is nearly pure and already runs
  in Node (docs/ROADMAP.md:319-324); the debug bridge
  (`src/lib/debugBridge.ts`) dispatches, batches and undoes over it.
- Per-user UI prefs live OUTSIDE the project in `src/lib/persist.ts`
  (view mode `:27`, keyboard mode `:48`, cell borders `:84`, font sizes `:105`).
- Storage threads: 124 DONE (gzip codec); **125 is parked and NOT a prerequisite**
  — a room persists actions + compact snapshots and never re-uploads whole files;
  cloud whole-file re-upload was skipped by request (docs/PERF-DIAGNOSIS.md:74,119).

## 3. Architecture (decided)

**Server-authoritative action rooms.** The room runs the same pure reducer; it is
the single ordering/validation authority. No CRDT.

```
user dispatch ──▶ optimistic local apply (existing reducer)
      │
      └──▶ room (per project): validate → apply → persist → broadcast(action, revision)
                                                          │
                                    peers apply via the SAME dispatch (memo contract intact)
```

- **Stack**: Supabase = Auth (email + password, Google, Apple), Postgres + RLS (projects,
  memberships, entitlements), Realtime (presence, S3), Edge Functions (webhooks,
  room tokens, licence signing). Cloudflare **Durable Objects** (PartyKit-style,
  SQLite backend) host the rooms at S4. Cost ladder (2026-10 pricing):
  Supabase Free $0 → Pro $25/mo (no pausing, backups); Workers Free DOs →
  Workers Paid $5/mo. **~$30/mo all-in at production**, covered by subscriptions.
- **Why not CRDT** (Yjs/Automerge ruled out): scheduling intents serialize
  cleanly (two drags of the same row must NOT merge); permissions/validation get
  one enforcement point; no second source of truth for the Project. Accepted
  loss: shared projects are online-only; local/Drive projects stay offline-first.
  The one known weak spot is the script body (`§7`).
- **Presence is ephemeral** — never persisted, never part of the project JSON.

## 4. Non-negotiables (MUST NOT)

1. **MUST NOT touch the Drive path** — free users see byte-identical behaviour.
2. **One Project model** — online projects use the same `Project` type/reducer;
   no parallel schema, no server-only fields inside the document.
3. **`readOnly` (connectivity, probe-driven only — AGENTS.md) and `canEdit`
   (permission) MUST stay separate flags.** Never overload `readOnly`.
4. **Permissions are enforced server-side** (RLS + room auth). UI gating is
   cosmetic; a viewer's write must be rejected by the server.
5. **Actions are the transport unit** — no per-feature sync code; a new feature
   ships multiplayer by construction (`§7`).
6. **Guest access never requires the guest's own paid entitlement** — access
   comes from membership in the owner's project.
7. **MUST NOT put synced project state in `persist.ts`, or per-user prefs in the
   project** — the boundary is the contract.
8. No secrets in the client beyond the documented Supabase session decision
   (`§11`); never log tokens (AGENTS.md §Security).

## 5. Free-tier operations & pausing (Supabase)

Researched 2026-10 from `supabase.com/docs/guides/platform/free-project-pausing`:
Free projects pause after **7 days of low database activity**; the docs state a
few user requests per day avoid it and explicitly list "making API calls to your
project" as the way to prevent a pause after the warning email. Paused ≠ deleted:
**1-year restore window**, project returns with data and configuration intact.
Paid projects (Pro, $25/mo) never pause.

- **Keep-alive** (dev/beta): `.github/workflows/supabase-keep-alive.yml` — a
  scheduled GitHub Actions cron pinging the REST endpoint with the anon key
  three times a day (sanctioned, zero cost); it also fails loudly when the
  project is paused/unreachable. Uses the same `VITE_SUPABASE_*` repo secrets
  as the Pages deploy and skips when they are absent.
- **Upgrade trigger**: once the paid collaboration tier has real teams, Supabase
  Pro removes pausing and adds daily backups. The free tier has no backups/SLA,
  so paying customers must not run on it.
- **Beta cost stance**: S1–S3 (and S4's rooms) start entirely on free tiers —
  Supabase Free + Cloudflare Workers Free (SQLite Durable Objects). Pro/Paid
  are production-floor expenses triggered by quotas or the first paying
  customer, not prerequisites (~$30/mo all-in once both land, covered by the
  first subscription).
- The free Drive tier never touches Supabase, so pauses can never affect it.

## 6. Stages (each independently shippable)

**S1 — Accounts + online projects.** Supabase Auth (email + password, Google,
Apple); tables `profiles`, `projects` (owner, title, compressed JSON blob, revision),
`memberships` (project_id, user_id, role) with RLS from day one. App gains a
second project source; the **Collaborate** action (Apple language, `§1`) copies
the project online via the export/import codec (`src/lib/projectCodec.ts` /
`src/lib/utils.ts` export). Feature-flagged; no realtime. The header **user
cluster** appears and absorbs the Google Drive sign-in (`§9`). *Acceptance*: RLS
tests (non-member cannot read; viewer cannot write); Collaborate round-trip
preserves the project; Drive/local flows untouched.

**S1 setup runbook (user side, ~15 min — do this first):**
1. Create the Supabase project (region: Europe/London). Security checkboxes:
   **Enable Data API** ON, **Enable automatic RLS** ON, **Automatically expose
   new tables** OFF (Supabase's own recommendation — the migration grants
   explicitly to `authenticated` only). Save the database password in a password
   manager. Copy the **Project URL** + **anon public key** (Settings → API) —
   never the `service_role` key (server-side only).
2. SQL Editor → paste the **contents** of both migrations, IN ORDER —
   `supabase/migrations/20261012112752_init_collab_memberships.sql` then
   `20261012112925_harden_rls_helpers.sql` (open each file, select all, copy —
   not the file path) — expect "Success. No rows returned" for each. (Both are
   already applied to the live dev project; the filenames mirror the ledger.)
3. Auth → Providers: keep Email on (**password sign-in** + create account +
   reset; for frictionless beta testing, switch "Confirm email" off — the
   built-in mailer is rate-limited and confirms only project-team addresses);
   enable **Google** (Google Cloud OAuth client with redirect
   `https://<ref>.supabase.co/auth/v1/callback`); optionally **Apple** (needs
   an Apple Developer Service ID + key). The app reads the project's enabled
   providers and shows each social button only once it is actually on.
4. Auth → URL Configuration: Site URL = the GitHub Pages deploy; add
   `http://localhost:3000` to the redirect allow-list.
5. Local `.env`: `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…` (gitignored;
   names documented in `.env.example`). GitHub repo secrets with the same two
   names are required for the Pages deploy — `deploy.yml` passes them through.
6. Repo secrets (set 2026-10-12): `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   — both the Pages deploy and the `supabase-keep-alive` workflow (`§5`) read
   them. ("Automatically expose new tables" OFF means the anon key 401s on
   tables by design; the keep-alive ping treats that as healthy.)
7. Agent tooling (already in `opencode.json`): run `opencode mcp auth supabase`
   once (browser OAuth) and restart opencode — the agent then gets the official
   Supabase MCP tools (schema/migrations/SQL/docs). The official Supabase skills
   load automatically via `skills.urls`
   (`https://supabase.com/.well-known/agent-skills/`).

Then the coding starts: `@supabase/supabase-js`, a client module, an auth hook,
the project-source seam in `src/store/provider.tsx`, and the Collaborate flow.

**S1 implementation map (built 2026-10-12).** One module per concern; do not
re-derive any of it:

- `src/lib/supabase/client.ts` — the client + **the S1 feature flag**
  (`isSupabaseConfigured`: no env ⇒ every online entry point is invisible and
  the Drive/local flows are byte-identical). PKCE; localStorage session
  (deliberate, `§11`).
- `src/lib/supabase/auth.tsx` — `SupabaseAuthProvider` / `useSupabaseAuth`:
  email + password (`signInWithPassword` / `signUpWithPassword` /
  `sendPasswordReset`), Google + Apple OAuth redirects, `providers` from
  `/auth/v1/settings` (social buttons appear only when enabled), and
  `pendingRecovery` (PASSWORD_RECOVERY → new-password modal). Mounted in
  `main.tsx`; links return to `origin + BASE_URL`.
- `src/components/AccountModal.tsx` — the ONE account surface (sign in /
  create account / reset). Create account captures the **name** (`full_name`
  metadata → the `handle_new_user` trigger writes `profiles.display_name`).
  App-level (`App.tsx`) so the boot screen reaches it; the header cluster and
  the Project Manager's signed-out Shared tab open it.
- `src/components/ProfileModal.tsx` — rename the signed-in account (auth
  metadata + the `profiles` row, best-effort); avatar rendering shared via
  `AccountAvatar`.
- `src/components/PasswordRecoveryModal.tsx` — set-a-new-password after a
  reset link (also App-level; may land on a fresh tab).
- `src/components/UserPresenceCluster.tsx` — the header user cluster (§9):
  signed-out avatar → **Sign in / Create account** (opens the AccountModal) +
  Connect Google Drive; signed-in avatar → Collaborate + sign out. AppHeader
  renders it after undo/redo; the File menu keeps its Drive items ONLY when
  the cluster is absent (no Supabase env).
- `src/lib/supabase/onlineProjects.ts` — every `projects`-table operation.
  `data` = `serializeProject` blob; **row id = project id** (one identity for
  meta, document and the future S4 room). Saves are whole-blob with an
  optimistic `revision` check + one LWW retry (S1 has no room; mirrors
  Drive's concurrency semantics).
- Provider seam: `ProjectMeta.onlineId` marks an online project; online metas
  live in session state + `onlineProjects` (fetched, never in the local
  index — `saveProjectListToStorage` filters them like Drive). `openProject`
  resolves online: `openProject(id)` or `openProject(id, undefined, onlineId)`
  (boot auto-open passes the id directly — no list race). `collaborateProject`
  = the Collaborate copy-up (offline original untouched, Drive link detached).
  Online projects lock read-only when the probe says offline or the Supabase
  session is gone; saves surface through the existing driveSaveError/retry UI.
- Project Manager: **Local / Cloud / Shared** tabs — Shared appears only when
  configured; signed-out shows the sign-in state (the footer's "Sign in to
  collaborate" is the ONE sign-in CTA — no duplicate inline buttons). Signed-in
  shows the account bar — avatar + "Signed in as …" (click → `ProfileModal`;
  guests → create-account) + **Sign out** (closes an open shared project, parity
  with the header cluster). Session metas win over the fetched list for display.
- Debug bridge: `diagnostics()` adds `supabaseConfigured`, `supabaseSignedIn`,
  `projectIsOnline`, `onlineProjectCount`.

Remaining before S1 is done: **DONE 2026-10-12** — dashboard auth setup (steps 3–4
above; confirmation + reset emails are rate-limited on Supabase's built-in SMTP —
"Confirm email" is off for beta), the end-to-end pass sign in → Collaborate → edit →
reopen → verify RLS. Invites/roles are S2 (built, see the S2 map below).

**S2 — Sharing, roles, invites.** owner/editor/viewer; email + link invites;
view-only share links (hashed tokens, revocable); "Manage access" UI. Introduce
`canEdit` derived from membership and thread it through editing surfaces (same
pattern as `readOnly`). *Acceptance*: server rejects viewer actions; revoke
takes effect on next request; guest account needs no entitlement.

**S2 implementation map (built + verified 2026-10-12).**

- Schema/RLS: `20261012130425_s2_sharing_roles_invites.sql` +
  `20261012130452_s2_rpc_invoker_wrappers.sql`; acceptance `supabase/tests/rls_s2.sql`
  (47 assertions green — viewer writes rejected, redeem/expiry/revoke, pending claim,
  demote + revoke take effect on the next request; `rls_s1.sql` still green; advisors
  clean apart from the pre-existing Auth password lint).
  - `projects.allow_invites` — owner toggle, default OFF; direct UPDATE grants narrowed
    to (title, data, revision) so it changes ONLY via `set_project_allow_invites`
    (owner-checked) — which also makes `owner_id` API-immutable.
  - `memberships` — members read the people list; insert = owner or allow-invites
    editor (editor/viewer roles only, never the structural owner row); owner-only
    update/delete with the owner row protected.
  - `pending_invites` + `claim_pending_invites` (auth.users trigger) — email invites
    without any mail delivery.
  - `share_links` — view-only by construction (`role='viewer'` CHECK); optional
    `expires_at`; the raw token is stored inviter-only (RLS) so the panel can
    re-display/copy the link, with its sha256 as the redemption key
    (`redeem_share_link(hash)` inserts the view-only membership).
  - Revoking (Revoke Link / switching to Only invited people) also EVICTS the
    guests the link admitted — `revoke_share_links` (definer RPC, can_invite
    checked) deletes the links + link-joined anonymous memberships.
  - **No-account guests**: link visitors sign in anonymously (Supabase
    anonymous sign-ins; dashboard toggle) — no form, a device-local user id
    that can be converted to a real account in place ("Create account..." in
    the avatar menu keeps their access). Guests get a fun `Anonymous <Animal>`
    name (before-insert trigger → metadata + profiles.display_name) and stay
    OUT of the People list (`profiles.is_anonymous`, synced on conversion) —
    they surface as live viewers once presence lands (S3).
  - `profiles select co-member` feeds the Who-can-access list. RPC bodies live in
    `private` with public SECURITY INVOKER wrappers (advisor 0029 clean).
- App: `src/lib/supabase/sharing.ts` (the ONE sharing module) + `src/lib/shareTokens.ts`
  (token gen / sha256 / URL / hash parse).
  - Provider seam: `canEdit` (role ≠ viewer) + `locked = readOnly || !canEdit`; role read
    on open, re-checked on focus + permission-shaped save failures (locks "View only…" /
    "no longer have access…" on the next request); `guardedDispatch` drops viewer writes;
    diagnostics adds `onlineRole`/`canEdit`/`editLocked`.
  - UI: `src/components/sharing/SharingModal.tsx` (+ `sharingParts.tsx`) — Who can access /
    per-person Permissions / invite by email / Allow others to invite / Copy Link /
    Expires (never · 7 · 30 days) / Revoke Link / Stop Sharing…; entered from File menu +
    avatar menu "Manage Shared Project…" (Collaborate flows straight into it). Viewers see
    the people list + an explanatory line — link rows are inviter-only under RLS.
  - `src/components/ShareLinkGate.tsx` — `#/share/<token>` capture, invite notice on the
    account modal, one-shot redeem → opens the project; invalid/expired/revoked links alert.
  - SaveIndicator shows the view-only eye (with the reason when access changed); editing
    surfaces gate on `locked` (leaf widgets keep their generic `readOnly` input props).
- Decisions (user, 2026-10): links are **view-only** (Permissions is per-person); **no
  email is sent yet** — existing accounts are granted immediately, unknown emails become
  pending invites claimed at signup (real invite mail = Edge Function + custom SMTP,
  deferred §11); links are always visible/copyable (raw token stored inviter-only;
  redemption by hash — the S2 draft's hash-only rule was relaxed by user decision);
  revoke = evict; `allow_invites` defaults OFF.
- Known gaps (deliberate): Shared-tab cards don't show the caller's role badge; the
  view-only long tail beyond the gated surfaces relies on the dispatch guard (Color
  Rules/Trash are `inert`, sort menus no-op); revoke/demote are ALSO pushed now
  (S3's `access` event → message + immediate lock; revocation kicks the member
  out — see the S3 map), with the next-request reconcile as the fallback.

**S3 — Presence + live refresh.** Live cursors, **follow mode**; rides Supabase
Realtime (Broadcast + Presence) on a per-project **private** channel with RLS on
`realtime.messages` (members only). Ephemeral only — never persisted, never in
the project (`§9`). Guests appear as live pointers ("Anonymous Otter"); the
People list keeps hiding them (§6 S2 map). Also in this stage — **S3.5, the save
ping**: a peer's save surfaces without a manual refresh (auto-apply only when
the local client has no unsaved changes, else a subtle "Changes available ·
Reload" affordance; whole-blob saves stay last-write-wins until S4).
Script-body cursors are flagged, not faked (ProseMirror relative positions).
*Acceptance*: two signed-in members see each other's live pointers and can
follow; a save ping updates a clean peer; non-members cannot join the channel.

**S3 implementation map (built + verified 2026-10-12).**

- Migration/RLS: `20261012142846_s3_realtime_presence.sql` — private channel
  topic `project:<uuid>` (`private.project_id_from_topic` parses it),
  membership-only `select`/`insert` policies on `realtime.messages` for the
  `broadcast` + `presence` extensions. Acceptance `supabase/tests/rls_s3.sql`
  (15 assertions green: member/editor/viewer/guest send+receive; stranger, anon
  and postgres_changes topics rejected; revoke takes effect on the next
  request). Verified live 2026-10-12: signed-out and signed-in non-member joins
  fail `Unauthorized`, a member subscribes/tracks/broadcasts.
  Dashboard requirement: Realtime → Settings → **"Allow public access" OFF**.
- TWO client modules under `src/lib/supabase/`: `presence.ts` — wire shapes,
  parse/clamp (never trust payloads), `mergePeers` (multi-window dedupe by user,
  newest wins), stale-ts drops, coalescing throttles and the pure follow/scroll
  helpers; `presenceChannel.ts` — the Supabase transport: the local save bus
  (`notifyLocalSave`/`subscribeLocalSaves`) and `ProjectPresenceChannel` (the
  one channel; start/stop idempotent, untrack+unsubscribe on teardown).
  `presenceDiagnostics` (in `presenceChannel.ts`) is the module snapshot the
  debug bridge reads. **Transport split (user bug 2026-10-12):** Supabase caps
  presence calls at **5 per client per 30s** and SHUTS THE CHANNEL DOWN past it
  (`ClientPresenceRateLimitReached`) — so `track()` carries identity + a view
  snapshot on (re)join only; every view change rides a throttled `view`
  broadcast, answered to each newly joined peer (debounced).
- `src/lib/supabase/presenceContext.tsx`: `PresenceProvider` (mounted inside
  `ProjectProvider` in `App.tsx`) owns the channel for the open shared project.
  Two contexts — STABLE `usePresenceActions()` (publishView/follow) vs
  `usePresenceState()` (peers/followingId) — so cursor traffic never re-renders
  the app tree. ONE global `mousemove` tracker resolves the pointer: a
  registered canvas-grid cell (`src/lib/presenceResolvers.ts`; the Glide
  Breakdown registers `breakdown-glide` in `BreakdownTabGlide.tsx`) → the
  semantic element (row/cell/day section) → the nearest item within ~40px →
  global chrome (`<header>`) → viewport-relative `screen` fallback.
- UI: `src/components/PresenceOverlay.tsx` — the Canva-style pointer layer
  (arrow + name label in the peer's deterministic colour) + the bottom-centre
  "Following X" pill (peer-coloured); pointers glide between positions and are
  hidden when their anchor is off this client's viewport, and a peer's pointer
  only renders while you are on their EXACT place (tab + sub-tab + mode)
  (user decisions 2026-10-12: cell-accurate Glide, hide off-screen, below
  modals, same-view gate). Clicking a pointer follows that person.
  `UserPresenceCluster` carries the collaborator bubbles as follow toggles
  (max 3 + "+N"). `App.tsx` publishes the view on every navigation (the one
  `go()` entry point exits follow mode; the follow applier guards itself) and
  registers the follower.
- S3.5 provider seam (`src/store/provider.tsx`): `changeCounterRef` /
  `persistedAtCounterRef` = the clean/dirty gate (LOADs and successful saves
  re-anchor it; unchanged projects are never re-pushed, so peer LOADs cannot
  echo). `applyPeerSave(revision)` re-reads and LOADs when clean, else raises
  `onlineChangesAvailable` (the chip); `reloadOnlineProject()` is the explicit
  reload. Save success paths call `notifyLocalSave(revision)`.
- Access-change push (built 2026-10-12, user request; **folded into S3** since
  the presence channel is the push path): migration
  `20261012161243_s3_access_events.sql` — a definer trigger on `memberships`
  broadcasts an ephemeral `access` event to the project topic via
  `realtime.send` (role change → new role; delete → null). The channel delivers
  it only to the affected user; the client applies the gate immediately
  (demote → locked now), shows a dialog, and on revocation closes the project
  (kicked out). Guests admitted by a revoked link are evicted by the same
  membership delete. RLS remains the enforcement point; acceptance
  `rls_s3.sql` (`role_change_pushes_access_event` / `revoke_pushes_access_event`).
- `AccountAvatar` palette/initials moved to `src/lib/avatarIdentity.ts` (one
  deterministic identity for the People list, avatars and pointers).
- Follow completeness (built 2026-10-12): `PresenceView` gains `sheetIndex`,
  `viewMode`, `cellBorders` and `calendarView` (allow-list validated in
  `parseView`), and a `scroll` broadcast (`PresenceScrollSample`) rides the
  same channel (~8/s, coalescing + idle skip). `src/lib/presenceScroll.ts`
  (semantic anchors + the surface registry) and
  `src/lib/supabase/usePresenceScrollSurface.ts` (the per-surface hook) wire
  the stripboard, Calendar, Sheet and Glide grid; the provider's follow
  appliers became a registry (`registerFollowApplier` returns its unregister)
  so mounted surfaces apply their own view switches; `App.applyPlace` resolves
  a Sheet scene id to the follower's own order. Details + the user decision
  (scrolling yourself never ends follow; a view-changing click does) in §9.

**S4 — Realtime collaborative editing.** Per-project room (DO) running the pure
reducer: validates, applies, persists (action log + periodic snapshot), broadcasts
`(action, revision)`. Reconnect/late-join = latest snapshot + action replay.
Per-user undo (each user undoes their own actions only). Shared projects become
read-only while offline. *Acceptance*: two clients through the debug bridge stay
convergent; reconnect mid-session loses nothing; undo never reverts a peer's edit.

**S5 — Billing.** See `docs/LICENSING.md`: one merchant of record; collab =
Studio + active subscription; guests free.

## 7. Impact on future development (the contract)

**Multiplayer by construction**: every mutation already flows through the one
`Action` union (`src/store/reducer.ts:155`); the room transports actions without
knowing features. New feature → new action types → works in rooms automatically
(same property as the MCP schema derivation, docs/API.md). Presence is view-state
based (tab/day/selection) and equally feature-agnostic.

Four one-time seams to respect (not per-feature work):

1. **Project lifecycle** (create/open/delete/rename/duplicate/`importProjectFromData`
   — `src/store/provider.tsx:47-52`) lives in the provider, not the reducer; online
   mode needs server mirrors. Route any new lifecycle method through one module.
2. **Undo/redo becomes per-user in rooms** (one semantic change; S4).
3. **Validation parity**: keep validation in shared helpers (the reducer is
   permissive) so the room can enforce what the UI enforces.
4. **Data boundary**: reducer = synced project state; `src/lib/persist.ts` =
   per-user prefs. New prefs → `persist.ts`; new project data → the Action union.

Known weak spot: the script body uses whole-document actions
`SET_SCRIPT_DOCUMENT` / `UPDATE_SCRIPT_DOCUMENT`
(`src/store/actions/script.ts:17,30`), so simultaneous script typing is
per-commit last-writer-wins. Acceptable for v1; fix later via a field-level diff
or a Yjs text doc for `scriptDocument` only, if ever needed.

**Multiplayer-readiness checklist** (for future features): mutation goes in the
Action union + `ACTION_TYPES`; no new state outside the project unless it is a
per-user pref; validation in a shared helper; document lifecycle-style server
mirrors; if the feature writes a whole document in one action, note the
concurrency semantics in its doc.

## 8. Permission & entitlement model

- **Built (S2)**: `memberships(project_id, user_id, role)` role ∈
  `owner | editor | viewer`; `share_links(project_id, token_hash, role='viewer',
  expires_at?)` (sha256 at rest); `pending_invites(project_id, email, role)`
  claimed at signup. `projects.allow_invites` gates editor-invites (default off).
- Owner: manage access, delete project, billing. Editor: write actions (+ invite
  when allow_invites). Viewer: read only — server rejects writes; UI hides them
  behind `locked` (`readOnly` connectivity | `!canEdit` permission).
- Entitlement: the **owner's** active collaboration subscription enables the
  room; invited members never pay. Lapse behaviour is open (`§11`; recommended:
  project becomes read-only, export always allowed). No entitlement checks
  exist yet — S5.
- All checks live in RLS policies + room auth (one source of truth); the client
  reads its own role to drive UI state only. The owner row is structural
  (`projects.owner_id`): policies refuse to demote/remove it.
- Share links are view-only by construction (CHECK on `role`); redemption is a
  SECURITY DEFINER RPC that inserts the viewer membership idempotently.

## 9. Presence & follow mechanics

- Ephemeral shape (built S3): Presence tracks `{ userId, clientId, name,
  avatarUrl, isGuest, view, ts }` — tracked ONCE per (re)join (identity + a
  view snapshot for late joiners; presence is rate-limited to 5 calls per
  client per 30s — see the §6 transport split). Every later view change rides
  a throttled `view` broadcast; cursors ride `cursor`, scrolls ride `scroll`,
  save pings ride `save`. Never persisted, never in the project.
- **Semantic anchors, never raw pixels**: a cursor anchor is the element under
  the pointer — stripboard row id, calendar `data-date-key`, Day Manager
  section — **plus the pointer's position inside it (fx/fy ∈ 0..1)**, so the
  pointer glides Canva-style while still surviving scroll, reorder, zoom and
  window size.
- **Canvas grids register a grid scope** (`src/lib/presenceResolvers.ts`):
  `probe(x, y)` maps a pointer to a cell → stable `rowKey` (scene id) +
  `colKey` (breakdown column key) + indices; `locate(anchor)` maps that cell
  back with the receiver's OWN scroll/column widths/font scale (`getBounds`).
  The Glide Breakdown registers as `breakdown-glide`; a cell scrolled out of
  the grid's visible area is hidden, never painted over chrome.
  Crew/Locations/Call Times can register the same way.
- Everything else falls back in order: **nearest item within ~40px** (gutters
  and margins snap to the row/cell beside them) → **viewport-relative screen
  fractions**. **Visibility gate (user decision 2026-10-12): a peer's pointer
  renders ONLY while you are on their exact place — same tab, sub-tab and
  sub-sub mode (Day Manager vs Call Sheet, Crew/Locations manager vs Glide).
  The header/toolbar pointers follow the same rule, so nothing floats over a
  view the peer isn't looking at.** Anchors that resolve off this client's
  viewport are hidden (no edge chips; the header bubbles are how you jump to a
  colleague's place). Script-body cursors stay flagged, not faked
  (TipTap/ProseMirror relative positions — skipped in S3).
- Motion: pointers glide between positions with a **rAF glide loop inside
  `PresenceOverlay`** (exponential approach toward the anchor-resolved target,
  τ ≈ 110ms; targets refresh on a ~80ms measure tick + scroll/resize).
  `prefers-reduced-motion` snaps instantly. **Do NOT go back to a CSS
  `transition` on the pointer wrapper** — the cursor feed is ~12/s, so each
  update restarted the transition mid-flight and the pointer stuttered instead
  of gliding (reported 2026-10-15; worst while anchored, where the sender's
  thinned feed also travels through the anchor mapping). Transforms are written
  per frame through refs (React state holds only the marker SET/flip), so
  re-renders never clobber the smoothed position. Pointers render BELOW modals
  (z-30 vs the kit's z-[10000]) — decided 2026-10-12.
- **Libraries considered (2026-10)**: Liveblocks / Yjs awareness (`y-presence`)
  / tldraw presence all assume a shared canvas coordinate space; none solve a
  per-user-layout DOM app, and each adds a second realtime system — the hybrid
  above is the standard pattern (Supabase's own cursor-tracking guidance is
  normalized viewport coordinates).
- Throttling: ~20/s leading + coalesced trailing send (**timer + a next-emit
  flush** — background tabs throttle `setTimeout`, which alone froze the last
  position one item behind for peers), idle-skip by quantized anchor key,
  stale-ts drops per client, 20s pointer TTL on top of presence leave.
  Multi-window: same user = one pointer, newest window wins.
- Script-body cursors (TipTap) need ProseMirror relative positions — flag, don't
  fake with indexes (skipped in S3).
- **Follow**: follower applies the leader's `view` state; a "Following X" pill
  exits on any manual navigation, Esc, or clicking the pill. **Follow
  completeness (built 2026-10-12)** also mirrors in-view state that does NOT
  change the place:
  - the **Sheet's scene / sheet number** (arrow flips, scene jumps) —
    `PresenceView.sceneId` + `sheetIndex`; the Sheet publishes both, the
    follower resolves the scene id, so a different Breakdown order still
    lands on the right scene.
  - the **stripboard View menu** (A4 width, cell borders) and the **Calendar
    Strips/Events** switch — pref-shaped `PresenceView` fields applied by the
    mounted surfaces through the same setters the UI uses (they stick after
    unfollowing, like Figma keeping your last zoom). **Ribbon layout** is
    project state (`activeRibbonId`) and reaches peers through the S3.5 save
    ping, not presence.
  - the **scroll position** of the stripboard, Calendar, Sheet and Glide grid —
    a separate `scroll` broadcast (~8/s, coalescing + idle skip) with SEMANTIC
    anchors (never pixels): the top-edge item's key + a 0..1 offset, sampled
    and applied by `src/lib/presenceScroll.ts` (binary search over item
    offsetTops + one calibration rect) through the surface registry that
    `usePresenceScrollSurface` wires per surface. The stripboard carries a
    coarse day-block fallback for rows outside the receiver's render window
    (land → render → re-align); the Glide grid uses its first visible cell +
    `scrollTo`. Only the main window publishes/applies surface state — popout
    instances stay out, parity with the live-pointer rule.
  - **User decisions (2026-10-12, corrected same day): scrolling yourself
    NEVER ends follow** — look around freely; there is no pause state, your
    scroll is simply your position until the leader's next scroll sample
    re-syncs you. **Any click that changes your view ENDS follow** — the
    Sheet's arrows/sheet-number, the stripboard View menu, the Calendar month
    arrows and Strips/Events switch (each calls `noteUserViewChange`), the
    same rule as clicking a tab or scene; Esc and the pill end it too.
    Programmatic applies never count as a click or a user scroll (the applied
    echo is filtered — exact scrollTop for DOM surfaces, a short window for
    the canvas).

**Header user & presence cluster (decided 2026-10).** The user control lives in
the AppHeader's right group, **after the undo/redo pair**
(`src/components/AppHeader.tsx:238-257` — append inside that flex group).
ONE shared component (`UserPresenceCluster`); never inline it per view.

- Signed out → a muted **Sign in** avatar button; opening it offers
  **Sign in / Create account** (the app-level AccountModal — email+password,
  plus Google/Apple when the project has them enabled).
- Signed in → the avatar (photo/initials) opens the account menu: **Edit
  profile...** (display name — email sign-ups capture it at creation, OAuth
  sign-ups bring the provider name + photo), **Collaborate...** (copy-up; opens
  the panel right after), **Manage Shared Project...** (the User & sharing
  panel — S2, built), **Sign out** (+ Drive connect/disconnect). The panel is
  the §1 language: **Who can access**, **Permissions**, **Allow others to
  invite**, **Copy Link**, **Stop Sharing…**; on a viewer account it shows the
  people list + "Only the owner can change who has access". Signing out with a
  shared project open **closes it and returns to the opening page** (parity
  with Drive disconnect); a silent session expiry only locks the project
  read-only so signing back in resumes it.
- **Guests (S2.5)**: a link visitor lands signed in anonymously (no form) — the
  avatar shows their generated "Anonymous <Animal>" name with a **Create
  account...** item (converts in place: same user id, access kept), then
  **Sign out**; Collaborate waits until they have a real account.
- Presence: live collaborators render as **Canva-style live pointers** (arrow +
  name label in their deterministic colour); clicking a pointer follows that
  person (§9). **Header bubbles are BACK (user decision 2026-10-12 — the
  earlier "pointers only" call was superseded): stacked collaborator bubbles
  immediately LEFT of your own avatar (max 3 + a "+N" menu), each a FOLLOW
  TOGGLE — click to follow that person, click again (or Esc / navigate) to
  stop. Guest bubbles carry an amber dot / "(guest)" label; the header cluster
  keeps your own avatar as before.** Pointers from peers on another view or
  sub-tab stay hidden until you are on their place — the bubble is how you get
  there.
- Surface shape: default to a kit `Modal` (the settings-modal pattern); a
  full page only if the modal proves too small.
- **Decided (user, 2026-10): the File menu's Google Drive sign-in MOVES into this
  cluster** when it lands (S1). The File menu keeps project actions only
  (Open/New/Import/Export/Print/Trash). Until the cluster ships, the File-menu
  item stays as-is.

## 10. Testing strategy

- Supabase RLS acceptance: `supabase/tests/rls_s1.sql` + `rls_s2.sql` +
  `rls_s3.sql` (paste into the SQL editor / psql; single transaction,
  `SET ROLE authenticated`, every row must come back `ok = true`; run
  `get_advisors` after DDL — expect only the anonymous-sign-ins lint 0012 and
  the pre-existing Auth leaked-password config lint). Pure helpers (tokens,
  gates, presence shaping/throttle/save decisions) are Vitest
  (`src/lib/__tests__/shareTokens.test.ts`, `presence.test.ts`).
- Playwright: two browser contexts in one spec, driven through the debug bridge
  (dispatch on A → assert state on B) — no timing sleeps. The default suite pins
  the Supabase env OFF, so online flows are verified by the RLS tests above +
  the manual pass (docs/TESTING.md §Manual verification); a future opt-in online
  spec must not grow the capped suite.
- e2e suite stays at its cap: merge online cases into focused specs; never grow
  specs for things a screenshot catches.

## 11. Open questions

- Billing model: per-seat vs per-project vs flat team plan.
- Supabase session storage: **DECIDED (2026-10-12) — localStorage** (the
  supabase-js default). The AGENTS.md §Security rule guards the Google Drive
  access token only; the Supabase account session is a separate trust domain
  (it must survive restart to be useful). Documented in AGENTS.md §Security;
  implemented in `src/lib/supabase/client.ts`.
- **Invite email delivery (S2 built without it)**: share links are fully
  self-serve; invite-by-email grants existing accounts immediately and stores
  pending invites for unknown emails (claimed at signup). Sending real invite
  emails needs an Edge Function + custom SMTP (the built-in mailer is
  rate-limited and confirms only project-team addresses) — decide the provider
  + branding when it's worth the setup, then reuse `pending_invites`.
- Subscription lapse behaviour (recommended: read-only + export).
- Guest edit limits; share-link expiry defaults (S2 ships never/7/30 days).
- **Anonymous guests (S2.5 follow-ups)**: no built-in cleanup for anonymous users
  (docs suggest a scheduled `delete from auth.users where is_anonymous and created_at <
  now() - interval '30 days'`); CAPTCHA/Turnstile for the anonymous sign-up endpoint
  is recommended before a public launch (IP rate limit is 30/h by default).
- Script-body concurrency approach (v1 LWW vs later field diff/Yjs text).

## 12. Verification (per stage)

1. `npm run lint` (docs + roadmap hygiene) — this doc must keep its Status line.
2. S1+: `supabase/tests/rls_s1.sql` + (S2) `supabase/tests/rls_s2.sql` + (S3)
   `supabase/tests/rls_s3.sql` (paste into the SQL editor or psql; every row
   must be `ok = true`) + `get_advisors` security lint clean after any schema
   change. Targeted e2e; `npm run test:smart` before done; full suite for
   store/provider changes (AGENTS.md rule 7).
3. Never ship a stage that changes the Drive/local flow — regression-check
   `e2e/seeded-smoke.spec.ts` + the persistence specs.
4. Online UI flows are a rule-7 manual pass (the default e2e suite pins the
   Supabase env off): sign in as owner → Collaborate → Copy Link → open the
   link in a private window → sign up → viewer lands locked with the eye cue;
   invite by email → role change → revoke.
5. S3 live pass (two clients + a guest): both members see each other's live
   pointers (names/labels differ per person), pointers glide within a row and
   fall back to viewport positions over the header; click a pointer → "Following
   X" pill → their navigation moves you; Esc / any manual navigation exits; a
   save on one side either silently lands on a clean peer or raises "Changes
   available · Reload"; closing a window drops its pointer without ghosts.
   Follow completeness: the Sheet's scene flips mirror (also when the two
   clients use different Breakdown orders), the stripboard View menu + Calendar
   Strips/Events mirror, and the scroll of the stripboard/Calendar/Sheet/Glide
   mirrors — including a peer deep in the stripboard (rows outside your render
   window land on the same day via the day-block fallback). Scrolling yourself
   keeps the pill and the leader's next scroll re-syncs you; clicking a view
   control (Sheet arrows, View menu, Calendar month arrows) or navigating away
   drops the pill (follow ends).
   **Channel stability (the 2026-10-12 transport split):** flip Sheet scenes
   fast for a few minutes — the follower keeps up with no reconnect, and
   `diagnostics().presence.trackCount` stays at 1–2 for the whole session
   (Supabase caps presence calls at 5 per client per 30s and closes the
   channel past it — the logs must show no `ClientPresenceRateLimitReached`).
