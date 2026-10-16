# Online Collaboration — Vision, Architecture & Stages (S1–S4 built; S4 deployed 2026-10-15)

Status: planning doc for roadmap 229 — **read before any online-accounts,
sharing, presence or realtime-editing work.** The free local/Google Drive path
must stay exactly as it is today. **Built:** S1 accounts + shared projects, S2
sharing/roles/invites + view-only links, S3 presence + the S3.5 save refresh
(§6 S1–S3 maps; presence: `docs/PRESENCE.md`); **S4 rooms deployed 2026-10-15**
(`lemon-rooms` worker + `room-token` function + `ROOM_TOKEN_SECRET`; flag
`VITE_ROOMS_URL`; deploy facts: `docs/STORE-AND-SYNC.md` §Realtime rooms). RLS
acceptance: `supabase/tests/rls_s1.sql` · `rls_s2.sql` · `rls_s3.sql` · `rls_s254.sql`.

Decisions (user, 2026-10): shared projects are online-only,
server-authoritative rooms (NOT CRDT — §3); collaboration is the paid add-on
(`docs/LICENSING.md`).

## 1. Product model

- **Free = today**: local + Google Drive, single-user, offline-capable, no account.
- **Collaboration = paid add-on** on top of a Studio licence (roadmap 230). The
  subscriber invites free guests/team members with a role (editor or view-only)
  and shares view-only links.
- Feel: Notion/Slack membership + invites + share links; Canva/Figma-style
  presence (live cursors, follow mode).
- Open: per-seat vs per-project billing (`§11`).

**UX language (Apple-aligned — use these exact strings in UI):**
- The action is **Collaborate** (the Share menu's top item); invite copy:
  "Invite others to collaborate".
- Access: **Who can access** → **Only invited people** / **Anyone with the link**.
- Permissions: **Can make changes** / **View only**; **Allow others to invite**.
- Management: **Manage Shared Project…** (avatar menu), **Share With More People**,
  **Copy Link**, **Stop Sharing…**.
- A shared project shows a person icon + tick; opening it lists who's collaborating.
- Projects on the collaboration backend live in the Project Manager's
  **Shared** tab — the UI calls them **shared projects**, never "online projects"
  ("online" stays architecture language for the docs).
- Internals/docs may say "copy/move online" — the UI never does. (Apple "moves the
  spreadsheet to iCloud"; we copy it to the hosted backend the first time.)

## 2. Current state (verified pointers)

- Free path: static SPA, **no backend**; localStorage index
  `lemon_schedule_project_index` + per-project files
  `lemon_schedule_project_v1_{id}` (`src/lib/projectCodec.ts:51/:68`); Drive
  uploads the whole file (`src/lib/googleDriveStorage.ts:111`) — concurrent
  writers are last-write-wins, undetected (docs/ROADMAP.md:228). Google OAuth
  is Drive-only — never extrapolate it into an identity system.
- Mutations: ONE `Action` union (`src/store/reducer.ts:155`) + `ACTION_TYPES`
  ("KEEP IN SYNC", `:262,264`); the reducer is nearly pure and already runs in
  Node (docs/ROADMAP.md:319-324) — that is what makes rooms hostable.
- Per-user prefs live OUTSIDE the project in `src/lib/persist.ts`; storage
  threads: 124 DONE (gzip codec); **125 parked, NOT a prerequisite** — a room
  persists actions + compact snapshots, never whole files
  (docs/PERF-DIAGNOSIS.md:74,119).

## 3. Architecture (decided)

**Server-authoritative action rooms.** The room runs the same pure reducer; it is
the single ordering/validation authority. No CRDT.

```
user dispatch ─▶ optimistic local apply ─▶ room: validate → apply → persist →
broadcast(action, revision) ─▶ peers apply via the SAME dispatch (memo intact)
```

- **Stack**: Supabase — Auth (email + password, Google, Apple), Postgres + RLS
  (projects, memberships, entitlements), Realtime, Edge Functions (webhooks,
  room tokens, licence signing). Cloudflare **Durable Objects** (SQLite) host
  the rooms. Cost ladder (2026-10): Supabase Free → Pro $25/mo; Workers Free →
  Paid $5/mo — **~$30/mo all-in at production**, covered by subscriptions.

- **Why not CRDT**: scheduling intents serialize (two drags must NOT merge);
  one enforcement point for permissions/validation; no second source of truth.
  Accepted loss: shared projects are online-only. Known weak spot: the script
  body (`§7`).

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
8. No secrets in the client beyond the documented session decision (`§11`); never log tokens.

## 5. Free-tier operations & pausing (Supabase)

Researched 2026-10: free projects pause after **7 days of low activity** (a few
requests/day avoid it; paused ≠ deleted — 1-year restore window, data intact).
Paid (Pro, $25/mo) never pauses.

- **Keep-alive** (dev/beta): `.github/workflows/supabase-keep-alive.yml` — a
  GitHub Actions cron pinging the REST endpoint with the anon key 3×/day
  (sanctioned, zero cost); fails loudly when paused/unreachable; skips when
  the `VITE_SUPABASE_*` repo secrets are absent.
- **Upgrade trigger**: once the paid tier has real teams, Pro removes pausing
  and adds daily backups — the free tier has no backups/SLA, so paying
  customers must not run on it.
- **Beta cost stance**: S1–S4 run on free tiers (Supabase Free + Workers
  Free); Pro/Paid is the production floor, triggered by quotas or the first
  paying customer (~$30/mo all-in — §3). The Drive tier never touches Supabase.

## 6. Stages (each independently shippable)

**S1 map — Accounts + online projects (built 2026-10-12).** Supabase Auth
(email + password, Google, Apple); `profiles` / `projects` (owner, title,
compressed JSON blob, revision) / `memberships`, RLS from day one; the
**Collaborate** action (`§1`) copies the project online via the export/import
codec (feature-flagged; no realtime; the header user cluster absorbs the Drive
sign-in — `docs/PRESENCE.md`). *Acceptance*: non-members cannot read, viewers
cannot write (RLS tests); the Collaborate round-trip preserves the project;
Drive/local flows untouched.

**S1 setup runbook (user side, ~15 min):**
1. Create the Supabase project (region: Europe/London); **Enable Data API** ON,
   **automatic RLS** ON, **expose new tables** OFF (the migrations grant
   explicitly to `authenticated`; the anon key 401s on tables by design). Copy
   the **Project URL** + **anon key** — never the `service_role` key.
2. SQL Editor → paste the **contents** of both migrations, in order —
   `20261012112752_init_collab_memberships.sql`, then
   `20261012112925_harden_rls_helpers.sql` — and expect "Success. No rows
   returned" (both already applied to the live dev project).
3. Auth → Providers: Email on (password sign-in + reset; for beta, "Confirm
   email" off — the built-in mailer is rate-limited); **Google** (OAuth client,
   redirect `https://<ref>.supabase.co/auth/v1/callback`); optionally **Apple**.
4. Auth → URL Configuration: Site URL = the Pages deploy; add
   `http://localhost:3000` to the redirect allow-list.
5. Env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (`.env.example`; the same
   names as GitHub repo secrets for `deploy.yml` and keep-alive — `§5`).
6. Agent tooling: `opencode mcp auth supabase` once (browser OAuth), restart.

**Modules** (one per concern — do not re-derive):

- `src/lib/supabase/client.ts` — the client + **the S1 feature flag**
  (`isSupabaseConfigured`: no env ⇒ every online entry point is invisible and
  the Drive/local flows are byte-identical). PKCE; localStorage session
  (deliberate, `§11`).
- `src/lib/supabase/auth.tsx` — `SupabaseAuthProvider` / `useSupabaseAuth`:
  password sign-in/up + reset,
  Google + Apple OAuth (`/auth/v1/settings` providers, buttons appear only when
  enabled), `pendingRecovery`; App-level in `main.tsx` (OAuth returns to
  `origin + BASE_URL`). A **dead reset link** (expired/used — GoTrue error
  params) surfaces via `recoveryLinkError` + `dismissRecoveryLinkError`
  (`src/lib/supabase/recoveryLink.ts`; params stripped from the address bar —
  roadmap 278).
- Account surfaces, App-level so boot/fresh tabs reach them: `AccountModal.tsx`
  (the ONE sign-in / create / reset surface; create-account captures the **name**
  → `handle_new_user` writes `profiles.display_name`), `AccountSettingsModal.tsx`
  (roadmap 256: Profile + Team + Sessions; the Profile tab's danger zone is
  **Delete account** — roadmap 281 + 294, `supabase/functions/delete-account`,
  deploy `npx supabase functions deploy delete-account --project-ref <ref>
  --use-api`: snapshots the full footprint to `public.account_archive` FIRST
  (aborts if archiving fails), then admin-deletes the CALLER only — every
  `auth.users` FK cascades so OWNED projects (+ blobs) die with the account
  while projects merely joined stay; the user-visible promise keeps its
  "permanently" — no self-restore, no UI, no cancel flow: the 30-day recovery
  window is OPERATOR-only (runbook below); catastrophic cases still have no
  backups (roadmap 279); guests share the path, stale reaping = roadmap 293;
  acceptance `supabase/tests/rls_delete_account.sql` +
  `supabase/tests/rls_account_recovery.sql`), `PasswordRecoveryModal.tsx`
  (valid link → new password; dead link → message + re-request — roadmap 278).
- `src/components/UserPresenceCluster.tsx` — the header user cluster (AppHeader,
  after undo/redo; the File menu keeps Drive items ONLY when it's absent — no
  Supabase env). Details: `docs/PRESENCE.md` §Header cluster.
- `src/lib/supabase/onlineProjects.ts` — every `projects`-table operation; the
  Shared list is walked with `fetchAllPages` (`./pagination.ts`) ordered by
  `updated_at` (indexed) + `id` — PostgREST caps one response at 1000 rows
  (roadmap 283);
  `data` = `serializeProject` blob; **row id = project id** (one identity for
  meta, document and the S4 room); saves are whole-blob, optimistic `revision`
  check + one LWW retry.
- Provider seam: `ProjectMeta.onlineId` marks an online project; online metas
  live in session state, never the local index; `openProject(id, undefined,
  onlineId)` resolves online (boot auto-open passes the id — no list race);
  `collaborateProject` = the copy-up (offline original untouched, Drive link
  detached); online projects lock read-only when the probe is offline or the
  session is gone; saves surface through the driveSaveError/retry UI.
- Project Manager: **Local / Cloud / Shared** tabs; signed-out shows the ONE
  sign-in CTA ("Sign in to collaborate"); signed-in shows the account bar
  (settings modal; **Sign out** closes an open shared project). The Shared list
  is **server truth** (`onlineProjectListForDisplay`): refetched on every open,
  `null` while signed out or after a failed fetch; session metas are
  lookup-only, never merged in (they used to resurrect externally revoked
  projects and pin stale titles). The OPEN project's row follows the open
  document's title, so a peer's rename lands in place.
- Debug bridge: `diagnostics()` adds `supabaseConfigured`, `supabaseSignedIn`,
  `projectIsOnline`, `onlineProjectCount`.

**Account restore — operator runbook (roadmap 294).** A mistaken delete is
recoverable ONLY by the operator, within 30 days — the person cannot log back
in (the auth row is gone immediately; sessions die with it) and there is no
self-restore surface (the RPCs are `service_role`-only; the table is RLS
deny-all; purged daily by `account-archive-purge`). The delete snapshots the
full footprint — `auth.users` + `auth.identities` (password hash), profile,
owned projects, memberships, invites, share links, team + roster — before
`admin.deleteUser`, and aborts if that snapshot fails.
1. Find the row:
   `select user_id, archived_at from public.account_archive where footprint -> 'users' ->> 'email' = '<their email>';`
2. `select public.restore_account('<user_id>');` — ids are preserved, the
   archive row is removed on success, and the person signs back in with their
   OLD password (their old sessions stay gone). Check the returned summary's
   `*_skipped_stale` counts (normally 0): references to accounts/projects/teams
   deleted during the window are skipped, never fatal — everything replayable
   comes back, and a non-zero count tells you exactly what could not.
3. Same-email re-registration (a NEW id exists): the restore is REFUSED —
   never a silent merge. Operator decides: delete the new account first and
   restore the old one (the new account's data is lost), or leave the new one
   (the archive purges after 30 days anyway). A provider identity already
   attached to another account ALSO refuses (the archive row is kept for a
   retry — resolve the conflict, then restore again). Restoring re-attaches
   the OLD account's history — it is not a fresh trial; new-email trial
   farming is a licensing-layer concern (`docs/LICENSING.md`), not something
   this archive tracks beyond its window. Do not wait past 30 days: the purge
   is automatic.
4. Sanity-check the purge occasionally: `select r.status, r.start_time from
   cron.job j join cron.job_run_details r on r.jobid = j.jobid where
   j.jobname = 'account-archive-purge' order by r.start_time desc limit 5;` —
   a failed run means rows past 30 days are still retained (real monitoring
   lands with roadmap 286).

**S2 map — Sharing, roles, invites (built + verified 2026-10-12).**
owner/editor/viewer; email + link invites; view-only share links; Manage access
UI; `canEdit` from membership. *Acceptance*: `supabase/tests/rls_s2.sql` (47
assertions green — viewer writes rejected; revoke/expiry on the next request;
guests need no entitlement; advisors clean). Migrations:
`20261012130425_s2_sharing_roles_invites.sql` +
`20261012130452_s2_rpc_invoker_wrappers.sql`.

- **Roles & gates**: `memberships` — members read the people list; insert =
  owner or allow-invites editor (editor/viewer roles only, never the structural
  owner row); owner-only update/delete, owner row protected.
  `projects.allow_invites` (default OFF) changes ONLY via
  `set_project_allow_invites`, which also makes `owner_id` API-immutable.
- **Invites**: `pending_invites` + `claim_pending_invites` (signup trigger) —
  email invites without mail delivery (real mail: `§11`).
- **Share links**: `share_links` — view-only by construction (`role='viewer'`
  CHECK); optional `expires_at`; the raw token is stored inviter-only (RLS) so
  the panel can re-display/copy the link; its sha256 is the redemption key
  (`redeem_share_link(hash)` inserts the viewer membership). Revoking also
  EVICTS link-admitted guests (`revoke_share_links`, definer RPC, can_invite
  checked).
- **No-account guests**: link visitors sign in anonymously (dashboard toggle)
  — a device-local id convertible in place ("Create account…" keeps access);
  fun `Anonymous <Animal>` name, kept OUT of the People list
  (`profiles.is_anonymous`) — they surface as live viewers via presence. RPC
  bodies live in `private` with public SECURITY INVOKER wrappers.
- **App**: `src/lib/supabase/sharing.ts` (the ONE sharing module) +
  `src/lib/shareTokens.ts` (tokens/sha256/URL). Seam: `locked = readOnly ||
  !canEdit`; role re-checked on focus + permission-shaped save failures (locks
  "View only…" / "no longer have access…"); `guardedDispatch` drops viewer
  writes; diagnostics adds `onlineRole`/`canEdit`/`editLocked`. UI:
  `SharingModal.tsx` (+ `sharingParts.tsx`) — Who can access / per-person
  Permissions / invite by email / Allow others to invite / Copy Link / Expires
  (never · 7 · 30) / Revoke Link / Stop Sharing…; entered from the avatar menu
  / Collaborate; viewers see the list + an explanatory line. `ShareLinkGate.tsx`
  — `#/share/<token>` capture + one-shot redeem → opens the project; bad links
  alert. `SaveIndicator` shows the view-only eye.
- **Teams + suggestions (roadmap 254, built 2026-10-15)**: migrations
  `20261015175044_s254_invite_suggestions` + `20261015175732_s254_teams`;
  acceptance `supabase/tests/rls_s254.sql` (38 assertions). Suggestions come
  from the caller's OWN orbit (co-members ∪ teammates) — never a global
  directory; row emails are a scoped exposure (never reveal a shared project).
  `invite_collaborator_by_id` twins the email path with a reachability guard
  (`shares_project_with OR in_same_team`). **Teams are an address book, NOT an
  access group**: one per account, claimed at signup; owner manages, members
  read; by-id adds need an existing collaboration; `is_real_account` keeps
  anonymous guests out. UI: `PeoplePicker` (thin `EntityDropdown` wrapper —
  single, chip variant, "Add …" = the email path) in the SharingModal invite
  row and the settings modal's **Team** tab; `src/lib/inviteTargets.ts`
  (`classifyInviteTarget`, Vitest) routes each commit. Teams = the future seat
  unit for S5 (roadmap 230).
- Known gaps (deliberate): no caller role badge on Shared cards; the view-only
  long tail relies on the dispatch guard (Color Rules/Trash `inert`, sort menus
  no-op); revoke/demote are ALSO pushed (S3 `access` event → immediate
  lock/kick; next-request reconcile = fallback).

**S3 map — Presence + live refresh (built + verified 2026-10-12).** Presence
is ephemeral; rides Supabase Realtime (Broadcast + Presence) on a per-project
private channel (members only). Guests appear as live pointers ("Anonymous
Otter"). **The S3.5 save ping**: a peer's save surfaces without a manual
refresh — auto-apply when the client is clean; edits/text in flight (roadmap
250/251, `src/lib/inFlightEdits.ts`) defer it, else a subtle "Changes
available · Reload" (whole-blob saves stay LWW until S4). *Acceptance*: two
members see each other's live pointers and can follow; a save ping updates a
clean peer; non-members cannot join. What stays in this doc:

- Migration/RLS: `20261012142846_s3_realtime_presence.sql` — private topic
  `project:<uuid>`, membership-only policies on `realtime.messages`; acceptance
  `supabase/tests/rls_s3.sql` (15 assertions). Dashboard: Realtime → Settings →
  **"Allow public access" OFF**.
- Save ping (`src/store/provider.tsx`): `changeCounterRef` /
  `persistedAtCounterRef` = the clean/dirty gate (LOADs and successful saves
  re-anchor; unchanged projects are never re-pushed, so peer LOADs cannot
  echo). `applyPeerSave(revision)` LOADs when clean, else raises
  `onlineChangesAvailable`; `reloadOnlineProject()` is the explicit reload;
  saves call `notifyLocalSave(revision)`.
- Access-change push (folded into S3 — the presence channel is the push path):
  `20261012161243_s3_access_events.sql` — a definer trigger on `memberships`
  broadcasts an ephemeral `access` event (role change → new role; delete →
  null) to the affected user only; the client gates immediately (demote →
  locked), shows a dialog, and revocation closes the project; revoked-link
  guests are evicted by the same membership delete. RLS stays the enforcement
  point; acceptance `rls_s3.sql` (`role_change_pushes_access_event` /
  `revoke_pushes_access_event`).
- Shared identity: `AccountAvatar` (photo, else DiceBear initials on
  `avatarColor` — roadmap 231) + `src/lib/avatarIdentity.ts` — one
  deterministic identity for the People list, avatars and pointers.

**S4 — Realtime collaborative editing.** Per-project room (DO) running the
pure reducer: validates, applies, persists (action log + periodic snapshot),
broadcasts `(action, revision)`; reconnect/late-join = snapshot + replay;
per-user undo. **Undo honesty (roadmap 242)**: when a peer's later edit
absorbed your unit, undo says so (a transient note by the header undo/redo
buttons), consumes the unit, and refuses a stale redo that could clobber the
peer's text. **Offline buffer (stage 2, built)**: while the room is unreachable
edits buffer in the client (bounded) and replay IN ORDER after the welcome —
reconnect loses nothing; the header badge shows the count. Whole-blob Supabase
saves are skipped for room-owned projects (a stale push would clobber LWW).
**Renames ride the room (roadmap 253)**: `renameProject` sends `UPDATE_PROJECT`
via `guardedDispatch` — a raw dispatch moves one window only.
*Acceptance*: two clients via the debug bridge stay convergent; reconnect
mid-session loses nothing; undo never reverts a peer's edit.

**Local dev (roadmap 246).** `npm run dev` auto-starts the room worker
(reuse-first, shared across worktrees; pinned `wrangler@4`); room specs:
`npx playwright test --config=playwright.rooms.config.ts` — see
`docs/STORE-AND-SYNC.md` §Realtime rooms.

**Deployed (S4 go-live, 2026-10-15).** Worker `lemon-rooms`
(`https://lemon-rooms.gabathanasiou.workers.dev`) + Edge Function `room-token`
(caller-scoped roles, `supabase/functions/room-token/`), sharing
`ROOM_TOKEN_SECRET`; the Pages build gets the URL via the `VITE_ROOMS_URL`
secret. Deploy steps + proof: `docs/STORE-AND-SYNC.md` §Realtime rooms,
`workers/rooms/test/deployed-probe.mjs`.

**S5 — Billing.** See `docs/LICENSING.md`: one merchant of record; collab =
Studio + active subscription; guests free.

## 7. Impact on future development (the contract)

**Multiplayer by construction**: every mutation flows through the one `Action`
union (`src/store/reducer.ts:155`); rooms transport actions without knowing
features — new feature → new action types → works automatically. Presence is
view-state based and equally feature-agnostic.

Four one-time seams to respect (not per-feature work):

1. **Project lifecycle** (create/open/delete/rename/duplicate/
   `importProjectFromData` — `src/store/provider.tsx:47-52`) lives in the
   provider; online mode needs server mirrors — route new methods through one
   module.
2. **Undo/redo becomes per-user in rooms** (one semantic change; S4).
3. **Validation parity**: keep validation in shared helpers (the reducer is
   permissive) so the room enforces what the UI enforces.
4. **Data boundary**: reducer = synced project state; `src/lib/persist.ts` =
   per-user prefs.

Known weak spot: the script body uses whole-document actions
(`SET_SCRIPT_DOCUMENT` / `UPDATE_SCRIPT_DOCUMENT`) — simultaneous script typing
is last-writer-wins for v1; a field-level diff (or Yjs text) only if needed.

**Multiplayer-readiness checklist**: mutation in the Action union + `ACTION_TYPES`;
no state outside the project unless a per-user pref; validation in a shared
helper; server mirrors for lifecycle-style ops; note whole-document concurrency.

## 8. Permission & entitlement model

- **Roles (S2)**: `memberships` role ∈ owner/editor/viewer; `share_links`
  (view-only, sha256 at rest); `pending_invites` claimed at signup;
  `projects.allow_invites` gates editor-invites (default off). Owner: manage
  access, delete, billing. Editor: write (+ invite when allowed). Viewer: read
  only — the server rejects writes; the UI gates on `locked` (`readOnly`
  connectivity | `!canEdit` permission).
- Entitlement: the **owner's** active collaboration subscription enables the
  room; invited members never pay. Lapse behaviour is open (`§11`). No
  entitlement checks exist yet — S5.
- All checks live in RLS policies + room auth; the client reads its own role for
  UI state only. The owner row is structural (`projects.owner_id`): policies
  refuse to demote/remove it.

## 9. Presence & follow mechanics

Moved to **`docs/PRESENCE.md`** — pointers & anchors, follow, the header user &
presence cluster, peer highlights, drag ghosts, overlay cues, the transport
split. The S3 map in §6 keeps the RLS facts, the S3.5 save ping, the access-push.

## 10. Testing strategy

- Supabase RLS acceptance: `supabase/tests/rls_s1.sql` + `rls_s2.sql` +
  `rls_s3.sql` + `rls_s254.sql` (SQL editor / psql; single transaction, `SET
  ROLE authenticated`, every row `ok = true`; run `get_advisors` after DDL —
  expect only the pre-existing lints). Pure helpers (tokens, gates, presence
  shaping/throttle/save decisions, `classifyInviteTarget`) are Vitest.
- Playwright: two browser contexts in one spec via the debug bridge (dispatch
  on A → assert on B) — no timing sleeps. The default suite pins the Supabase
  env OFF: online flows are the RLS tests + the rule-7 manual pass
  (docs/TESTING.md); a future opt-in online spec must not grow the capped suite.

## 11. Open questions

- Billing model: **one subscription with seats — the subscriber covers
  non-paying team members** (user's model, 2026-10-15; the roadmap-254 team is
  the seat unit; limit values open — `docs/LICENSING.md` §9).
- Supabase session storage: **DECIDED (2026-10-12) — localStorage**
  (supabase-js default; the AGENTS.md §Security rule guards the Drive token
  only — a separate trust domain; `src/lib/supabase/client.ts`).
- **Invite email delivery (S2 built without it)**: links are self-serve;
  invite-by-email grants existing accounts immediately and stores pending
  invites for unknown emails. Real mail needs an Edge Function + custom SMTP —
  decide later, then reuse `pending_invites`.
- Subscription lapse behaviour (recommended: read-only + export).
- Guest edit limits; share-link expiry defaults (S2 ships never/7/30 days).
- **Anonymous guests (S2.5)**: no built-in cleanup (the docs suggest a
  scheduled `delete from auth.users where is_anonymous and created_at < now()
  - interval '30 days'`); CAPTCHA/Turnstile recommended before a public launch.
- Script-body concurrency approach (v1 LWW vs later field diff/Yjs text).

## 12. Verification (per stage)

1. `npm run lint` (docs + roadmap hygiene) — this doc must keep its Status line.
2. S1+: the `supabase/tests/rls_s*.sql` suite (`ok = true` everywhere) +
   `get_advisors` clean after any schema change. Targeted e2e; `npm run
   test:smart` before done; full suite for store/provider changes (rule 7).
3. Never change the Drive/local flow — regression-check `e2e/seeded-smoke.spec.ts`
   + the persistence specs.
4. Online UI flows are a rule-7 manual pass: owner → Collaborate → Copy Link →
   private window → sign up → viewer lands locked with the eye cue; invite by
   email → role change → revoke.
5. S3 live pass (two clients + a guest): pointers glide per row + fall back to
   viewport over the header; click → "Following X" pill → their navigation
   moves you; Esc/navigation exits; a save lands silently on a clean peer or
   raises "Changes available · Reload"; closing a window drops its pointer.
   Follow completeness: Sheet scene flips mirror (also across different
   Breakdown orders), View menu + Calendar Strips/Events mirror, scrolls mirror
   (a peer deep in the stripboard lands on the same day via the day-block
   fallback); scrolling yourself keeps the pill; clicking a view control ends
   it. **Channel stability (the 2026-10-12 transport split, `docs/PRESENCE.md`):**
   flip Sheet scenes fast — the follower keeps up, no reconnect,
   `diagnostics().presence.trackCount` stays 1–2, no `ClientPresenceRateLimitReached`.
