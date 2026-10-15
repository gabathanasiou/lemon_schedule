# Store, Persistence & Sync — Agent Manual

Status: **read this before touching `src/store/`, persistence keys, the Drive sync path, or row
identity/memoization.** Storage keys and the load/migrate pipeline live in `src/store/storage.ts`.

## Mental model

1. **Context + `useReducer` with undo/redo** — `state.present` is the active Project, `state.past`/
   `state.future` the history. Bulk dispatches wrap in `BATCH_START`/`BATCH_COMMIT` so the outermost
   commit is one undo entry.
2. **Save failures never flip `readOnly`** — connectivity is driven only by the probe; a failed
   Drive write is not offline.
3. **Row identity is the memo contract** — `computeRowData` reuses computed rows so unchanged rows
   keep object identity across dispatches; this is what makes `React.memo` on rows work.

## Module layout (`src/store/` — barrel `index.ts`)

- `storage.ts` (keys, ProjectMeta, load/migrate pipeline) · `reducer.ts` (59-type Action union,
  State, reducer → dispatches to `actions/{schedule,breakdown,design}.ts`; `rows.ts` holds
  `ensurePinnedDaybreak`/`ensureAllScenesHaveRows`) · `provider.tsx` (`ProjectProvider`,
  `useProject()`, `useProjectTheme()`/`useIsOnlineProject()`, connectivity probe, debounced save,
  cloud sync).

## Persistence

- localStorage: index key `lemon_schedule_project_index`, per-project
  `lemon_schedule_project_v1_{id}`. Cloud projects (Drive) are NOT in localStorage index (filtered on
  save). `lemon_schedule_last_project` records the last successful open (`id`, `driveFileId?`, `at`)
  with a **1-hour TTL** — the boot auto-open (roadmap 178) reopens it; an explicit close/delete
  clears the record, and cloud records wait for the silent GIS session restore.
- **Project entries are `base64(gzip(json))` (roadmap 124)** — the localStorage boundary codec lives
  in `src/lib/projectCodec.ts` (`serializeProject`/`deserializeProject`, used by
  `saveProjectToStorage`/`loadProjectFromStorage`). Reads detect plain vs compressed by first char
  (`{`/`[` = legacy plain JSON, base64 never starts with them) so old entries keep loading; the next
  save rewrites them compressed. Same detection as the Drive path.
- **Empty scene element fields are dropped on serialize** (built-in + custom category keys) and
  rebuilt from `createBlankScene` defaults on load — pure codec boundary, so the in-memory Project and
  the row memo/immutability contract are untouched. Drive uploads and `.lemon` exports stay plain
  JSON (`exportProjectFromStorage` decodes first). Preserve `QuotaExceededError` handling
  (`saveProjectToStorage` is synchronous and throws like `setItem`).
- Bulk dispatches → wrap in `BATCH_START`/`BATCH_COMMIT` (nestable; outermost commits one undo
  entry).

## Connectivity model

- `readOnly` = `!realOnline`, driven ONLY by the probe/offline/auth events — **save failures never
  flip it** (a failed Drive write ≠ offline; that distinction locks the project and drops edits
  mid-flap).
- Probe = `HEAD` no-cors to `gstatic.com/generate_204` every 10s + focus/visibility/online events;
  **any resolved response = online**, only a thrown fetch = offline (CORS/API hiccups can't
  false-negative).
- Transient save failures set `driveErrorMsg` (raw detail via `driveErrorDetail`) and chain bounded
  auto-retries (4× exponential 2s/4s/8s/16s, `scheduleSaveRetry` — **fresh budget per save episode**,
  reset at the top of the save effect; never carries over between episodes): the header keeps its
  spinner while `driveRetryPending`, and `driveSaveError` → SaveIndicator rose "Sync failed" with the
  reason in the tooltip only once the budget is exhausted or the failure is terminal (401, signed
  out, needs reauth, offline).

## Drive uploads (TEXT-ONLY and SMALL, `googleDriveStorage.ts`)

- Updates = `uploadType=media` PATCH with the payload string; creates = manually-framed string
  multipart with explicit boundary (never FormData — wrappers drop its boundary header).
- Payloads >100KB are stored as `base64(gzip(json))` (pure ASCII; binary gzip and big bodies get
  corrupted/aborted by page-level ad-blocker fetch wrappers — verified against AdGuard in real
  Safari: "Load failed" on every save). Reads auto-detect plain vs base64 by first char.
- **Never reintroduce binary/FormData upload bodies.**

## Online projects (roadmap 229 S1 — env-gated; UI name: **Shared**; manual = `docs/COLLABORATION.md`)

- ONE module `src/lib/supabase/onlineProjects.ts` (list/upload/read/save/delete). `ProjectMeta.onlineId`
  = Supabase row id = project id; online metas live in provider session state (`onlineProjects`, refreshed
  on sign-in) and are filtered out of the localStorage index exactly like Drive
  (`saveProjectListToStorage`).
- **The row `title` is the durable project NAME**: the Project Manager's Shared list reads it (session
  metas merge on top, but online entries are dropped from the persisted index, so after a reload the row
  is the only source). `renameProject` pushes every rename straight to the row
  (`renameOnlineProject`; the OPEN project included — its next whole-blob save is NOT guaranteed, the room
  transport owns the writes while mounted — S4) and refetches the list so the manager updates at once.
  The app header reads the open document's own `title`.
- Saves are whole-blob `serializeProject` with an optimistic `revision` check + one last-write-wins retry;
  failures reuse the `driveSaveError` / `driveRetryPending` / `scheduleSaveRetry` surfaces (online branch
  in `scheduleSaveRetry` + `retryDriveSync`) and surface "Synced online" copy via `SaveIndicator
  isOnlineProject`. Online projects lock read-only when the probe is offline or the Supabase session is
  gone — same rule as Drive (`readOnly` ≠ permission `canEdit`, §S2 later).
- `collaborateProject(id)` = the Collaborate copy-up (offline original untouched; a Drive link is
  detached). Boot auto-open passes `openProject(id, undefined, onlineId)` from the last-project record —
  never wait for the list fetch. `isSupabaseConfigured` (env present) is the feature flag: without it
  nothing above is reachable and the Drive/local paths are byte-identical.

## Sharing, roles & invites (roadmap 229 S2)

- **`canEdit` is the permission flag; `readOnly` stays connectivity-only** (MUST NOT overload either).
  `useProject()` exposes both plus `locked = readOnly || !canEdit` — every editing surface gates on
  `locked`; only SaveIndicator/`OfflineStatus` read the source flags apart.
- ONE module `src/lib/supabase/sharing.ts` (members, pending invites, share links, stop-sharing,
  redeem). `openProject` reads the membership role alongside the blob (online projects only); a
  focus re-check + permission-shaped save failures (RLS rejection / the 0-row retry signature) lock a
  demoted project ("View only…") and a revoked one ("You no longer have access…") on the next request.
- `locked` also gates the write dispatch itself (`guardedDispatch`) — the single client-side
  enforcement point; RLS is the real one (`supabase/tests/rls_s2.sql`, 53 assertions).
- Share links store BOTH the raw token (inviter-only via RLS — the panel re-displays/copies it) and
  its sha256 (redemption key, `src/lib/shareTokens.ts`). Revoking evicts link-joined guests
  (`revoke_share_links` RPC); no-account guests ride Supabase anonymous sign-ins and are identified by
  `profiles.is_anonymous` (hidden from the People list; fun "Anonymous <Animal>" names).

## Presence & live refresh (roadmap 229 S3/S3.5)

- ONE client module `src/lib/supabase/presence.ts` (wire shapes, parse/clamp, `mergePeers` multi-window
  dedupe, ~20/s cursor throttle, the local save bus, `ProjectPresenceChannel`) + the React seam
  `src/lib/supabase/presenceContext.tsx` (`PresenceProvider`, mounted inside `ProjectProvider` in
  `App.tsx`). The channel is the ONE private `project:<uuid>` Realtime channel; server authorization is
  RLS on `realtime.messages` (`supabase/tests/rls_s3.sql`). Gating: no Supabase env / signed-out /
  local-Drive project ⇒ no channel, empty peers; teardown untracks + unsubscribes.
- Two contexts: STABLE `usePresenceActions()` (publishView/follow/stopFollowing/registerFollowApplier) vs
  `usePresenceState()` (peers/followingId/status). Per-row components MUST NOT subscribe to state —
  cursor traffic is ~20/s and would re-render everything (same spirit as the memo contract below).
- Cursors are semantic anchors + a pointer fraction (`fx/fy` inside the anchored element), a registered
  canvas-grid cell (`src/lib/presenceResolvers.ts`; the Glide Breakdown's `rowKey`/`colKey`), or a
  viewport-relative `screen` fallback; anchors off the local viewport are hidden and pointers glide via a
  CSS transform transition. **A peer's pointer renders only while you are on their exact place
  (tab + sub-tab + sub-sub mode; `sameViewPlace`)**; the header collaborator bubbles
  (`UserPresenceCluster`, follow toggles) are how you jump to their view (docs/COLLABORATION.md §9).
  One global mousemove tracker in the provider publishes; `PresenceOverlay` draws. Follow mode: App
  registers the navigation applier (a peer-driven `go`, which then re-publishes the mirrored view as
  ours so the lens fields survive) and every surface joins through ONE shared hook — `useFollowView`
  (`src/lib/supabase/useFollowView.ts`): declare the place + lens fields; register-time replay covers
  surfaces that mount mid-follow. Sheet scene / stripboard + Calendar switches / manager category /
  designer picks + Preview + Fields-Values / Day Manager day / script scene; any manual navigation
  exits (the hook's `noteUserChange()`).
- **Overlay cue + input glyph + pointer comfort (roadmaps 240/241/244)**: the peer's input modality
  (`mouse|touch|pen`) rides the cursor payload (re-sent only on change) and selects the pointer glyph; a
  separate `overlay` broadcast announces "this user is inside a menu/modal" (edges + a 6s heartbeat from
  `src/lib/localOverlaySignal.ts`, fed ONLY by the shared primitives) with a 12s receiver TTL — the dots
  render on the pointer tag + the header bubble (`PresenceDots`, `peer.overlay`). 244 adds the comfort
  rules, receiver-side: a FRESH overlay cue of ANY kind (menu/dropdown/context menu/modal) freezes that
  peer's pointer (`freezeCursorFor` ignores their cursor frames; the marker is exempt from the 20s idle
  TTL while frozen), a `modal` cue renders the modal-window glyph (`cursorGlyph`; menus keep the
  input-kind glyph), the sender pauses cursor publishing while its own hub reports any overlay, and a
  peer's marker the local pointer rested on for ~2s fades until they separate (`stepCollisionDwell`).
- **S3.5 save ping seam (store-owned)**: `changeCounterRef`/`persistedAtCounterRef` are the clean/dirty
  gate — every accepted write dispatch bumps the counter; `loadBaseline(project)` (LOAD + re-anchor) is
  used by every internal open/import/reload, and successful online saves capture the counter at save
  time. An online project with no new edits is **never re-pushed** (a peer LOAD cannot echo). On a
  successful online save the store calls `notifyLocalSave(revision)` (module bus → channel broadcast);
  on a received ping the presence provider calls `applyPeerSave(revision)`: re-read + silent LOAD when
  clean, else `onlineChangesAvailable` (the SaveIndicator "Changes available · Reload" chip).
  **"Clean" includes un-flushed text (roadmap 250/251)**: while a manager field or Report Designer
  text is being typed, the change counter has not moved yet, so `applyPeerSave` also consults
  `hasInFlightEdits()` (`src/lib/inFlightEdits.ts`) — a peer's save then raises the chip instead of a
  LOAD that would silently drop the text.
  `reloadOnlineProject()` is the explicit user action. Saves stay last-write-wins until S4 — never
  auto-apply over unsaved local edits.

## Realtime rooms (roadmap 229 S4 — room worker + client transport)

- ONE client module `src/lib/rooms/roomClient.ts` (WS transport: hello/token, snapshot + replay,
  own-echo dedupe by `actionId`, rejection → auto-resync, backoff reconnect, `sendUndo`/`sendRedo`,
  bounded offline buffer) + the React seam `src/lib/rooms/useRoomTransport.ts` (mounted in
  `ProjectProvider`; inert without `VITE_ROOMS_URL`). The room worker runs the SAME reducer
  (`workers/rooms`).
- **While a room transport is MOUNTED for the open shared project (any status) it owns the
  project's writes**: every accepted write dispatch streams an action (`guardedDispatch`;
  `LOAD`/`UNDO`/`REDO` excluded — the room's own refuse-set), welcome/remote messages apply
  through the RAW dispatch (never counted as local changes, never pushed back), and the
  whole-blob Supabase save is skipped — the blob is staging-only until the S4 persistence
  cutover. Shared projects WITHOUT a transport (rooms not configured / signed out) keep the
  pre-S4 blob path.
- **Offline buffer (roadmap 239 stage 2).** While the room is not `open`, `RoomClient.sendAction`
  BUFFERS accepted actions instead of dropping them (`MAX_QUEUED_ACTIONS`, oldest dropped past
  the cap and surfaced as `dropped`): the edit already applied locally via `guardedDispatch`.
  Right after the next `welcome` the buffer replays IN ORDER — each action is re-applied locally
  (`onReplayQueued`; the welcome reset the state to the room's snapshot, so the UI never flashes
  the edit away) and then sent through the normal optimistic path (echo deduped by `actionId`).
  A failed write keeps that entry and every later one buffered for the next welcome; the buffer
  is DROPPED (not replayed) when our own `init` seeded an empty room — that blob already carries
  it, and `ADD_*` replays are not idempotent (`ADD_SCENE` appends + pushes a fresh row). `stop()`
  clears the buffer (project switch — no cross-project bleed) and `diagnostics().roomPending`
  reports `{pending, dropped}`; the header badge's tooltip shows the count. In-memory only — a
  reload during an outage loses the buffer (stage 3's blob mirror is the persistence answer).
- **Per-user undo (built) — delivered as a NEW EDIT.** EVERY undo/redo affordance goes through ONE
  shared pair, `undo()` / `redo()` in the provider: Cmd+Z / Cmd+Shift+Z, the header + popout-toolbar
  buttons (`src/components/UndoRedoButtons.tsx` — the only copy) and popout windows. Every edit is
  dispatched when it finishes (commit on blur — roadmap 250/251), so undo granularity is per committed
  edit; there is no surface-local history any more. For a **shared** project the ROOM owns undo —
  never the local transcript (a local transcript UNDO is not transported, so it would revert this
  window alone; when the room is not connected the affordance warns instead of diverging). The
  buttons' enablement is per USER: `{t:'undoState', canUndo, canRedo}` is pushed to ONE socket
  whenever it changes (join, that user's own action, undo, redo), and a shared project's local
  transcript never gates them (it accumulates peer edits — a transcript undo would revert a peer in
  this window alone). The room removes the caller's latest unit —
  one action, or one whole client batch (its `batch_id` rows) — rebuilds `present` from the newest
  retained snapshot older than the unit while skipping its rows, writes a fresh snapshot at a NEW
  rev and deletes the undone rows (persistence), then **broadcasts the rebased state as ONE new
  `LOAD` action at that rev through the normal `remote` path**. Every client — the caller included —
  applies it exactly like a peer edit (`onRemote` → `loadBaseline`); there is NO `welcome` re-sync in
  the undo path, so an undo can never depend on join-shaped delivery. The fresh actionId means nobody
  dedupes it (nothing was applied optimistically). Redo re-applies the undone unit as fresh actions
  through the same normal path; the redo stack lives in room memory only (lost on hibernation) and a
  new accepted action from that user clears it. Undo depth = the retained snapshot window
  (`SNAPSHOTS_KEPT` = 4 snapshots ≈ 4 × `SNAPSHOT_EVERY` actions); a unit with no base snapshot
  answers "action too old to undo". **Blocked undo + redo safety (roadmap 242, built
  2026-10-15).** A peer's later whole-value edit can absorb your unit (they extend the text you
  had just typed): the rebuild then lands EXACTLY on the current state, so the undo cannot
  revert anything. The room compares the two whole states (`projectsEqual`,
  `src/lib/rooms/projectCompare.ts` — structural, because JSON key order is a fold artefact)
  and is honest about it: it answers the blocked message (shared constant,
  `src/lib/rooms/roomNotes.ts`), DELETES the unit's rows (so the next ⌘Z moves on to the
  caller's earlier units instead of re-blocking forever) and writes no snapshot, bumps no rev
  and broadcasts nothing — the state is unchanged, so every client is already correct. No redo
  entry is pushed: the stale redo that would later clobber the peer's text never exists. REDO
  gets the same treatment — an undone unit remembers the rev its undo snapshot landed at and
  only re-applies while the room is still at that state (`atUndoBaseline`: the snapshot read
  back + the same whole-state compare); a peer edit in between refuses the redo ("Can't redo —
  someone edited this after you") and drops the unit. Known edge, pinned by the probe and
  accepted for v1: consuming a unit's rows means a LATER peer undo rebuilds without them — the
  absorbed text goes with it. **Client surface:** every room error (blocked undo/redo,
  "nothing to undo/redo", "too old", refusals, a lost connection on undo) is shown as ONE
  transient note beside the header undo/redo buttons (`src/components/RoomNote.tsx` — also in
  the popout toolbar; 6s auto-hide, repeats re-arm; copy mapping `roomNoteText`) — advisory
  only, never a dialog, never blocking. The header + popout-toolbar buttons use the SAME room-routed
  pair (not a transcript undo — that was the "buttons bypassed the room" report); their enablement
  additionally requires the room to be **open**, so while it is connecting/unreachable the buttons
  are refused — there is nothing to rebase, and the offline buffer holds edits, never undo.
- **Delivery safety net (`RoomClient`).** The room stamps every `remote` with a CONTIGUOUS `rev`, so
  the client tracks the last applied rev: a jump (a dropped update — an undo `LOAD` included) makes
  it `sync` for a full snapshot instead of applying the delta against the wrong base — a peer that
  ever misses one update reconciles on the next one instead of drifting. The worker also WARNS
  (never silently swallows) on a failed `send`/peer broadcast — that silence once hid a whole class
  of "the peer never re-synced" reports. Manual two-window proof: `workers/rooms/test/two-window-repro.mjs`
  (real accounts + invite, WS-frame capture) asserts the peer receives the undo as a `remote`/`LOAD`
  update with no welcome, and that its stripboard store AND DOM revert.
- Not yet: room tokens are dev-only (`dev:<user>:<role>`, DEV builds + `wrangler dev`); the
  deployed path calls the Supabase `room-token` function (`src/lib/rooms/tokenClient.ts`), which
  is not deployed. Verify locally: `workers/rooms/test/room-probe.ts` (room, 47 checks — incl.
  the blocked-undo room + redo safety, roadmap 242) and
  `room-client-probe.ts` (the real `RoomClient`, 17 checks) against `wrangler dev`.
- **Header room-status badge (roadmap 239 stage 1, built 2026-10-15).** `roomStatus` is exposed
  reactively on `useProject()` (`useIsOnlineProject()` marks shared projects); `src/lib/rooms/roomBadge.ts`
  maps the transport status → `hidden | connecting | unreachable` + tooltip copy, rendered as an amber
  "!" on the header cloud (`SaveIndicator`, 2.5s grace so a normal join never flashes, hover tooltip +
  click-pin). Pure UI — stage 2 adds the offline action queue and the pending count (never blob-save a
  shared project while its room is down).

## `useProject()` API

`{ state, dispatch, projectList, currentProjectId, readOnly, initialized, createProject, openProject,
deleteProject, renameProject, duplicateProject, importProjectFromData, onlineProjects, onlineLoading,
onlineError, refetchOnlineProjects, collaborateProject, onlineChangesAvailable, applyPeerSave,
reloadOnlineProject, roomStatus, ... }` — shared-project chrome also has the
`useProjectTheme()` / `useIsOnlineProject()` selectors (the store barrel; roadmap 248).

## Re-render / memo contract (MUST NOT break)

- **Context value is memoized — never re-create it inline** (`provider.tsx`). Per-row components
  (`SortableRowContent`, `EntityDropdown`, row renderers) MUST NOT call `useProject()`: they receive
  `dispatch`, `palette`, `castMembers`, `breakdownElements`, `customCategories`, `hiddenCategories`,
  and their own `scene` as props from StripBlock/BoneyardBlock/ScheduleOverlays. Adding
  `useProject()` to a row component re-renders every row on every dispatch.
- **Row identity**: `computeRowData` (`lib/daybreakUtils.ts`) reuses computed-row objects via a
  WeakMap + computed-field fingerprint, so unchanged rows keep identity across dispatches (rows are
  immutable — never mutate a `ComputedRow`). `SortableContext items` MUST be memoized by id-sequence
  (e.g. `ids.join('|')` key), never by array identity — dnd-kit re-renders all `useSortable`
  consumers when `items` changes. Prefer `UPDATE_ROW` (single-row patch) over rebuilding
  `UPDATE_VERSION` rows arrays.
- Drag ghosts (DayBlock/StripBlock): `day-{day}` ghosts before the SortableContext, `end-{day}`
  after it; in-row ghosts inside the map via `showGhosts && insertBeforeId === r.id`. Use
  component-level `showGhosts`, never per-row declarations.
- Collision detection: `useCallback` with empty deps reading `activeDragIdsRef.current` (stable ref)
  to filter dragged rows from droppables (falling back to `closestCorners`). `insertBeforeId`
  distinguishes `day-{day}` (start), `end-{day}` (end), row targets.
