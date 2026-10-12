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
  `useProject()`, `useIsCloudProject()`, connectivity probe, debounced save, cloud sync).

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

## `useProject()` API

`{ state, dispatch, projectList, currentProjectId, readOnly, initialized, createProject, openProject,
deleteProject, renameProject, duplicateProject, importProjectFromData, onlineProjects, onlineLoading,
onlineError, refetchOnlineProjects, collaborateProject, ... }`.

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
