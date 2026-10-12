# Online Collaboration — Vision, Architecture & Stages (PLAN — NOT BUILT)

Status: planning doc for roadmap 229. **Read this before starting any online-accounts,
sharing, presence or realtime-editing work.** The free local/Google Drive path must
stay exactly as it is today. **S1 in progress (2026-10-12): the Supabase project +
schema are live** (see the §6 runbook; RLS verified by `supabase/tests/rls_s1.sql`)
— the app-side S1 code lands next.

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

- **Stack**: Supabase = Auth (Google + magic link), Postgres + RLS (projects,
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

- **Keep-alive** (dev/beta): a scheduled GitHub Actions cron workflow pinging the
  REST endpoint with the anon key a few times a day — sanctioned, zero cost.
- **Upgrade trigger**: once the paid collaboration tier has real teams, Supabase
  Pro removes pausing and adds daily backups. The free tier has no backups/SLA,
  so paying customers must not run on it.
- The free Drive tier never touches Supabase, so pauses can never affect it.

## 6. Stages (each independently shippable)

**S1 — Accounts + online projects.** Supabase Auth (Google + magic link);
tables `profiles`, `projects` (owner, title, compressed JSON blob, revision),
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
3. Auth → Providers: keep Email (magic link); enable **Google** (Google Cloud
   OAuth client with redirect `https://<ref>.supabase.co/auth/v1/callback`).
4. Auth → URL Configuration: Site URL = the GitHub Pages deploy; add
   `http://localhost:3000` to the redirect allow-list.
5. Local `.env`: `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…` (gitignored;
   names documented in `.env.example`). GitHub repo secrets with the same two
   names are required for the Pages deploy — `deploy.yml` passes them through.
6. After it exists: repo secrets for the free-tier keep-alive workflow (`§5`).
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
- `src/lib/supabase/auth.tsx` — `SupabaseAuthProvider` / `useSupabaseAuth`
  (Google OAuth redirect + email magic link; `account` = id/email/name/avatar).
  Mounted in `main.tsx`; the callback returns to `origin + BASE_URL`.
- `src/components/UserPresenceCluster.tsx` — the header user cluster (§9):
  signed-out avatar → Google / magic link / Drive; signed-in avatar →
  Collaborate + sign out. AppHeader renders it after undo/redo; the File menu
  keeps its Drive items ONLY when the cluster is absent (no Supabase env).
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
  configured; signed-out shows the sign-in state. Session metas win over the
  fetched list for display.
- Debug bridge: `diagnostics()` adds `supabaseConfigured`, `supabaseSignedIn`,
  `projectIsOnline`, `onlineProjectCount`.

Remaining before S1 is done: dashboard auth setup (steps 3–4 above; magic-link
sending is rate-limited on Supabase's built-in SMTP), then the end-to-end pass
sign in → Collaborate → edit → reopen → verify RLS. Invites/roles stay S2.

**S2 — Sharing, roles, invites.** owner/editor/viewer; email + link invites;
view-only share links (hashed tokens, revocable); "Manage access" UI. Introduce
`canEdit` derived from membership and thread it through editing surfaces (same
pattern as `readOnly`). *Acceptance*: server rejects viewer actions; revoke
takes effect on next request; guest account needs no entitlement.

**S3 — Presence.** Who's here (avatars), live cursors, **follow mode**. Rides
Supabase Realtime (Broadcast + Presence); ephemeral messages only (`§9`).

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

- Sketch: `memberships(project_id, user_id, role)` where role ∈
  `owner | editor | viewer`; `share_links(token_hash, project_id, role, expires_at?)`.
- Owner: manage access, delete project, billing. Editor: write actions. Viewer:
  read only — server rejects writes; UI hides write affordances.
- Entitlement: the **owner's** active collaboration subscription enables the
  room; invited members never pay. Lapse behaviour is open (`§11`; recommended:
  project becomes read-only, export always allowed).
- All checks live in RLS policies + room auth (one source of truth); the client
  reads its own role to drive UI state only.

## 9. Presence & follow mechanics

- Ephemeral message: `{ userId, name, color, view: { tab, dayId, sceneId,
  rowId, selection }, cursor: { x, y }, ts }` — throttled, never persisted.
- **Prefer semantic anchors over pixels**: row/scene/cell/day ids survive
  scrolling, reordering and window sizes (stripboard, calendar, day manager).
  Glide (DOM canvas) falls back to coordinates mapped through cell rects.
- Script-body cursors (TipTap) need ProseMirror relative positions — flag, don't
  fake with indexes.
- **Follow**: follower applies the leader's `view` state; a "Following X" pill
  exits on any manual navigation.

**Header user & presence cluster (decided 2026-10).** The user control and
presence bubbles live in the AppHeader's right group, **after the undo/redo
pair** (`src/components/AppHeader.tsx:238-257` — append inside that flex group).
ONE shared component (`UserPresenceCluster`); never inline it per view.

- Signed out → a muted **Sign in** avatar button; opening it offers Google
  sign-in / magic link.
- Signed in → the avatar (photo/initials) opens the **User & sharing** surface:
  profile + **Collaborate**, **Who can access**, **Permissions**, **Allow others
  to invite**, **Copy Link**, **Manage Shared Project…**, **Stop Sharing…**
  (`§1` language). On Free, the same surface shows the upgrade path and no
  collab controls.
- Presence: live collaborators render as **stacked avatar bubbles** (Canva/Notion
  style) immediately left of your own avatar — max 3 + a `+N` chip; hover = name;
  click = follow (`§9`). Viewers appear without edit affordances.
- Surface shape: default to a kit `Modal` (the settings-modal pattern); a
  full page only if the modal proves too small.
- **Decided (user, 2026-10): the File menu's Google Drive sign-in MOVES into this
  cluster** when it lands (S1). The File menu keeps project actions only
  (Open/New/Import/Export/Print/Trash). Until the cluster ships, the File-menu
  item stays as-is.

## 10. Testing strategy

- Supabase local dev (CLI) for schema/RLS; Vitest for pure helpers (role → gate
  mapping, presence message shaping).
- Playwright: two browser contexts in one spec, driven through the debug bridge
  (dispatch on A → assert state on B) — no timing sleeps; presence/follow gets a
  rule-7 manual pass (docs/TESTING.md §Manual verification).
- e2e suite stays at its cap: merge online cases into focused specs; never grow
  specs for things a screenshot catches.

## 11. Open questions

- Billing model: per-seat vs per-project vs flat team plan.
- Supabase session storage: **DECIDED (2026-10-12) — localStorage** (the
  supabase-js default). The AGENTS.md §Security rule guards the Google Drive
  access token only; the Supabase account session is a separate trust domain
  (it must survive restart to be useful). Documented in AGENTS.md §Security;
  implemented in `src/lib/supabase/client.ts`.
- Subscription lapse behaviour (recommended: read-only + export).
- Guest edit limits; share-link expiry defaults.
- Script-body concurrency approach (v1 LWW vs later field diff/Yjs text).

## 12. Verification (when coding starts, per stage)

1. `npm run lint` (docs + roadmap hygiene) — this doc must keep its Status line.
2. S1+: `supabase/tests/rls_s1.sql` (paste into the SQL editor or psql; every
   row must be `ok = true`) + `get_advisors` security lint clean after any
   schema change. Targeted e2e; `npm run test:smart` before done; full suite
   for store/provider changes (AGENTS.md rule 7).
3. Never ship a stage that changes the Drive/local flow — regression-check
   `e2e/seeded-smoke.spec.ts` + the persistence specs.
