# Agent Context

## Commands
- `npm run dev` — dev server (port 3000). `npm run lint` — `tsc --noEmit` + `scripts/check-doc-budget.mjs` (doc budget, roadmap hygiene, orphan specs, wait ratchet) + `eslint e2e` (`no-floating-promises` only; no Prettier). `npm run lint:docs` / `lint:tests` run the pieces alone. `npm run test:unit` — Vitest pure-logic tests. `npm run build` / `npm run preview`.
- **After bumping `@gabriel/ui-kit`**: dev `SyntaxError: Indirectly exported binding name ... not found` = stale Vite pre-bundle — `rm -rf node_modules/.vite-*` and restart (the kit ships a committed `dist/`; the blocked `prepare` is fine).
- `npx playwright test` — E2E against the **production preview build** (auto `npm run build` + `vite preview` on 3001; `PLAYWRIGHT_DEV=1` = dev server instead). **Read `docs/TESTING.md`** (strategy, flake policy, `@quarantine`, "was it me?"): retries absorb transient flake; baseline a failing spec with `npm run test:baseline -- e2e/<spec>.spec.ts` — NEVER `git checkout`. Past failures: `docs/KNOWN-TEST-FAILURES.md`.
- **`npm run test:smart`** — diff-based E2E subset (`scripts/smart-test.mjs`): maps changed files → specs via its `RULES` table, runs only those + canaries + last-run failures; `store/**`, shared utils, configs and `e2e/helpers.ts` escalate to the FULL suite. `--list` prints the selection; `--full` forces everything; `npm run test:full` = full suite. **Extend `RULES` when adding features** — an unmapped spec is an orphan (`npm run lint` fails) and unmapped `src/` changes run canaries only. Rule 7: the full suite runs before done/commit **only for logic/data/store changes**.
- Perf/memory harnesses tagged `@perf` are excluded from the default run — run them explicitly: `npx playwright test --config=playwright.perf.config.ts` (dev :3001) / `playwright.perf-prod.config.ts` (preview :4173); see `docs/PERF-DIAGNOSIS.md`.
- Prod builds run agent mode (`LEMON_AGENT=1` via `storageState` in `playwright.config.ts`) so specs can read `window.__lemonSchedule` — prefer the bridge over localStorage reads (sync, no debounced-save waits). Prefer `expect`/`expect.poll`/`waitForFunction` over `waitForTimeout` (remaining waits are true drag/canvas pacing).
- `e2e/helpers.ts`: `ensureProject(page)`, `openSeededProject(page)` (committed `e2e/fixtures/seed.lemon`; `LEMON_SEED_PATH` overrides), `waitForPersistedProject(page, expr)` (persistence under test). **Specs must be seed-agnostic** — resolve cast/dates/elements/counts from the debug bridge (`seedLeadCast`, `seedDayDates`, `seedElement`, `activeCalendar`, `seedTitle`) — never hardcode seed content.
- `DISABLE_HMR=true` — disable HMR/file watching (AI Studio sets this).
- `/changelog` — on-demand: writes missing public `CHANGELOG.md` days from git history; never hand-edit it.

## Core Rules (read first — these override convenience)
1. **Think in components & shared modules first.** Reuse existing primitives (`DropdownMenu`, `Modal`, `EntityDropdown`, `PageToolbar`, hooks in `src/lib/`) before writing new UI or logic. When you find yourself writing the second copy of anything (component, helper, class string, literal), extract it into a shared file and use it in both places.
2. **No monoliths.** Split files when they grow (~700+ lines): extract presentational JSX and pure logic into focused modules, keep state/refs in the composition root, re-export through a barrel so existing imports keep working. Never grow a file toward a monolith; split proactively at the second related feature.
3. **Narrow scope, no speculative abstractions.** Implement the smallest behavior that satisfies the request. Every new abstraction must map to a stated requirement — remove it if it doesn't. Prefer adapting into an existing pipeline over creating a parallel one.
4. **One source of truth per concern.** Duplicated logic (e.g. the stripboard/copy-paste/context-menu flows) MUST live in one shared module (`src/lib/`, `src/components/*/`) consumed by all views. The domain models below are the canonical answers; do not re-derive them from code.
5. **Complexity reset.** When a second special case would extend the same abstraction, stop, re-read the requirement, and redesign narrower instead of patching.
6. **Small focused commits**, imperative mood, one revertible unit each.
7. **Verify before done.** Every change runs `npm run lint`. **Logic/data/store/behavior changes** run the full suite before done/commit — `npx playwright test`, or the `npm run test:smart` subset during work — never claim done on a failing suite. **Anything a human can confirm by looking** — styling, labels, ordering, "the panel opens" — gets **NO e2e test**: end with a numbered manual check instead (docs/TESTING.md §Manual verification). The suite is capped: automate only when a silent break is plausible (data loss, wrong computed value, persistence).
8. **Bump the version when done — do it, don't suggest.** The boot screen shows `v{package.json version}` (build-time `__APP_VERSION__` define — `vite.config.ts` + `src/lib/appVersion.ts`). Judge the DIFF'S IMPACT: internal work (refactor, plumbing, docs) = no bump; a user-visible feature or released-behavior fix = candidate. The app is pre-1.0 (`0.x`, `private`) — the number is an internal release marker, so unreleased/flagged work needs no bump; prefer a patch for everyday features, minor for real milestones. Bundle small fixes into ONE patch at the work's wrap — never per commit; skip if `package.json` already carries a newer version; when unsure, omit. Bump it YOURSELF (`npm version patch|minor|major`; on a dirty tree edit `package.json` and leave the tag to the release flow) and note it in ONE line of the done summary.

## Explaining to the User (plain language)
- Talk about features in real terms, not code: "scene 1. GEORGE in the kitchen" or "scene ribbon" not "a SCENE row"; "cast member 1. FISHERMAN" not "cast entity"; "the hold list on Jun 3" not "NonShootDate.lists".
- Ground explanations in how it plays out in real life: "drag scene 3. DINER onto Jun 4 → call time becomes 7:45 AM since the two scenes before run 2h 15m."
- Use project data for examples (seeded "IT'S A WONDERFUL LIFE" works). ASCII sketches/visuals welcome when they clarify.

## Stack & Storage
- React 19 + Vite 6 + Tailwind v4 (`@tailwindcss/vite`). Path alias `@/*` → root. Deploy base `/lemon_schedule/`.
- **Radix pins (roadmap 71)**: keep `@radix-ui/react-dialog` ≥1.1.23 + `@radix-ui/react-dropdown-menu` ≥2.1.24 (single `react-dismissable-layer` ≥1.1.19). The old layer (1.1.12) deferred touch outside-dismissal, leaving a stacked dialog's body locked at `pointer-events:none` on iPad (the Add-Events Cancel freeze). Never bump one without the other (a partial bump forks the shared layer and breaks menus inside modals); never add `.lemon`-seed-specific hardcoded dates to iPad specs.
- State: Context + `useReducer` with undo/redo (`state.present` = active Project; `state.past/future`). Persistence, sync and the memo contract: **read `docs/STORE-AND-SYNC.md`**.
- localStorage: index key `lemon_schedule_project_index`, per-project `lemon_schedule_project_v1_{id}`. Cloud projects (Drive) are NOT in localStorage index (filtered on save).
- Bulk dispatches → wrap in `BATCH_START`/`BATCH_COMMIT` (nestable; outermost commits one undo entry).
- **Collaboration S1–S4 built** — accounts, shared projects, roles/invites, view-only links, teams (254), Canva-style presence (live pointers, follow, peer highlights, drag ghosts + soft lock, the S3.5 save ping); `docs/COLLABORATION.md` is the manual (presence: `docs/PRESENCE.md`), `isSupabaseConfigured` the feature flag. `canEdit` (permission) and `readOnly` (connectivity) are separate flags — `locked = readOnly || !canEdit` gates editing surfaces; never overload either. Realtime rooms (S4) are **DEPLOYED** (worker + `room-token` function; dev tokens loopback-only; `docs/STORE-AND-SYNC.md` §Realtime rooms). Licensing (230) is **planned** — read `docs/COLLABORATION.md` + `docs/LICENSING.md` first.

## Domain Model (canonical — don't re-derive)
Deep dives live in `docs/`: daybreak/section model → `docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md`; day types + calendar axis → `docs/DAY-TYPES-AND-CALENDAR.md`; element/crew links → `docs/ELEMENT-LINKS.md`. The summaries + invariants below are the always-loaded contract.

### Rows & Sections
- `ScheduleRow.type`: `SCENE | BREAK | NOTE | DAYBREAK`. `ScheduleVersion.rows` is the single source of truth for stripboard order.
- **Scene→Row invariant**: every `project.scenes` entry has exactly one SCENE row in every version (`LOAD` runs `ensureAllScenesHaveRows()`; `ADD_SCENE`/`RESTORE_SCENE`/`IMPORT_SCENES` push rows; `DELETE_SCENE` removes them; `NEW_VERSION` seeds them). **Version trash retention**: `pruneVersionTrash` (storage.ts) — 30-day TTL + keep newest 10; pruned on local loads, CLOUD reads (`readDriveProject`), and every delete (unbounded trash made a 900KB file 69% trash). **Report-design trash**: same 30-day TTL (`pruneReportTrash`, pruned on local/Drive/online reads); restorable through File → Trash.
- **DAYBREAK rows split the stripboard into sections.** Each renders two visual rows: `SectionFooter` ("End of Day #N", totals — white bg) closes the section above; `Next Day Header` ("START OF DAY N", call-time input — dark header palette) opens the section below. Read `docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md` before touching schedule ordering/insertion.

### Pinned Daybreak (section 0)
Every blank version starts with a pinned DAYBREAK at `containerId: 1, order: 0` (`pinned: true`). It is NOT a production day.
- Only visible when ≥1 other DAYBREAK exists; never draggable/deletable; insertion above it is blocked (index bumped to 1); footer suppressed; doesn't advance `sectionDateMap`/`sectionLabelMap`; excluded from `productionSections`.

### Call Time Model
- The **daybreak above a section** is the source of truth for its base call time: `sectionBaseTime = preceding daybreak's daybreakCallTime`; each row's `computedCallTime = sectionBaseTime + accumulated section elapsed`.
- Editing the "START OF DAY N" input updates the daybreak row's own `daybreakCallTime` (governs the section below).
- Calendar section swap: exchange the `daybreakCallTime` of the daybreaks above each swapped section so call times travel with content (pinned daybreak participates for section 1).

### Day Properties (`daybreakMeta`)
- Per-day properties (master/key locations, notes, day crew, precalls, element call times, per-day call-sheet zones, manual weather overrides) live on the **governing DAYBREAK row** as `daybreakMeta` — the daybreak ABOVE the section (pinned for Day 1), same convention as `daybreakCallTime`. `src/lib/dayMeta.ts` is the ONE module (`getDayMeta`, `patchDayMeta` → `UPDATE_ROW`, `isEmptyDayMeta`, `daybreakAbove`, `sectionCallTime`, `pruneDayMetaRefs`); nothing reads the raw field.
- Whole-day drags carry the meta with the call time (insert rotation + swap in `useCalendarDrag`; index-0/pinned swaps leave it). Deleting a daybreak with details warns first; bulk daybreak ops restate the consequence.
- **Day Manager = the Production tab's Day Manager sub-tab** (items 103-109: Project Details + the Call-Times settings are draggable kit modals in its header — no sub-tabs): one `DayView` read model (`src/lib/dayView.ts`) feeds the registry-driven page, pop-outs and Copy-from-day; sections are pure props-in/patch-out (never `useProject()`). Two-column layout: the narrow meta band (Day Details · Locations/Events/Conflicts) on top, the wide grids (Scenes, Call Times, Crew) beneath (registry `wide` flag). Calendar's "Day Breakdown" → **Day Types**. Reports resolve a day's location via `getReportLocation` (master → DB-matched scene location → blank; London stub gone).
- **Call times (item 99)**: optional helper — `productionInfo.callTimes` (stages + per-category stage sets) + `project.crewTemplate`; `src/lib/callTimes.ts` `computeElementCallChain` walks stages backwards from the element's first-scene call (absolute/relative overrides, only overrides stored in `daybreakMeta.elementCalls`); `resolveCallExpression` resolves one expression against an anchor (department precalls). Hosts: the Day Manager header's **Call Times** modal (stages drag-reorderable) + the Day Manager's Call Times/Crew sections. Every crew role stays addable — the shared `CrewAddRoleMenu` (Day Crew header, next to Apply template; the Call Times modal) reaches departments with no card (a stored `crewTemplate.slots`/`daybreakMeta.crewSlots` predating a roster role must never dead-end). Day crew is slot-based — ONE owner `src/lib/dayCrew.ts` (`slotsForDay`/`groupSlotsByDept`/`resolveSlotCall`; `CrewRosterEditor` + `AddCrewMemberModal` are the shared surfaces). Report seams (contextual children of `days`): `crewOfDay` (resolved day crew + `crewCallTime`), `elementCallsOfDay` (per-element stage columns `call_{stageKey}`), `departmentCallsOfDay`, `locationsOfDay`; plus the `dayNotes` field.

### Container Model (`src/lib/containers.ts`)
Exactly three containers via `row.containerId`: `null` = Boneyard, `1` = Stripboard, `-1` = Clipboard (invisible cut buffer).
- **Never add more stripboard containers** — sections are DAYBREAK rows, not containerIds.
- Navigation (Tab/Arrows/Cmd+A/Shift+click) is container-scoped with per-container last-selected cursors.
- Use `getContainerBlock(row)` instead of raw `containerId` checks. `containerIdsRef` lists are pre-filtered (no `empty-`/pinned); `lastSelectedRef` tracks per-container cursor.

### Insert Position Rules (daybreak layout)
```
[DAYBREAK 0 pinned] [content 1] [DAYBREAK 1] [content 2] [DAYBREAK 2] ...
```
- Day has rows → target = last row, insert after it. Empty day → row before the closing daybreak. First production day empty → the pinned daybreak. Same logic for drag-drop, context-menu paste/add, and Calendar day-body actions. Banner mid-insertion uses `computeMiddleInsertIndex` (`lib/daybreakUtils.ts`).

### Cast & Entities (STRICT — `cast` is the ONE id-keyed category)
- **`scene.cast` stores comma-separated Board IDs, never names** (`project.castMembers`; compare by `e.id`; EntityDropdown `displayMode="id"`). **All other categories are name-keyed** (`project.breakdownElements[cat]`, scenes store `e.name`). Canonical module `src/lib/elements.ts` — use `isIdKeyed` / `getCategoryElements` / `elementMatchId` / `resolveTypedElementKey`; **MUST NOT** read `breakdownElements.cast`, hand-roll `isCast ? id : name`, or put a name in `scene.cast`. Dropdowns resolve a typed cast display NAME to the member's ID (`resolveTypedElementKey`), so typing "MARY" binds `2. MARY` — never a duplicate blank member; MCP/agents editing scenes MUST pass IDs.
- **Board IDs (257)**: every element has a per-category MMS number — cast's `CastMember.id`, every other category's `ProjectElement.boardId` (numeric string, unique per category). Numbers are LABELS, not references (scenes stay name-keyed; `isIdKeyed` unchanged). Allocation lives in `src/lib/boardIds.ts` / `src/lib/elements.ts` (`boardIdOf`/`nextBoardId`/`isDuplicateBoardId`) — never hand-roll `boardId ?? id`. New elements number after the highest (gaps stay), Auto-ID skips locked rows, duplicate numbers are rejected on commit; `migrateElementBoardIds` backfills blanks on every read path.
- **New cast via entity fields** (stripboard/Glide/Sheet) → shared `addNewElements` (`lib/newCastNaming.tsx`): creates the member BLANK and queues it for the naming modal (mounted in `App.tsx`); the queue takes a prefilled name + an `onCancel` that reverts whatever else the creation commit did (script tagging reverts the whole tag). Save = `UPDATE_CAST_MEMBER` (uppercased, one batch) — a **name-typed** segment (non-numeric, roadmap 228) is flagged: its typed text prefills the NAME, Save re-IDs it to the next free numeric Board ID via `UPDATE_ELEMENT` (the cast rename cascades scenes + script tags), Cancel deletes it. Per-entry undo = `DELETE_CAST_MEMBER`. Never dispatch `ADD_ELEMENT` cast with `name:''` outside it (CastTab's manager-add stays a blank inline row — no modal).
- **Every EntityDropdown auto-creates missing elements** via the `onCreateItem` prop: the component diffs each committed segment against `items` (comma-list in multi/select, whole string in single) and calls the prop for gaps. Wired in the Link Manager (anchor + linked rows), Color Rules conditions, the day/event modals (`EventModal`/`EventAdderModal`) and the Rule Editor cast picker — all route through `addNewElement`. The stripboard/Glide/SceneSheet do NOT pass it (their commit flow already creates), so creation never double-fires.
- Category registry: `ELEMENT_CATEGORIES` in `src/lib/categories.ts` (key/label/multiValue/fdxFallbacks). Add built-ins there only. Use `isMultiValue(field, customCategories)` + `getFieldItems(field, value)` — never raw `split(',')`.

### Scene Strip Colors
`sceneStyle(scene, sceneColors, fallback, rules)` from `lib/sceneColors.ts` (re-exported by `ribbonUtils`). Fallbacks: INT DAY white, EXT DAY `#d7da50`, INT NIGHT `#41a31a`, EXT NIGHT `#005c93`, MORNING `#ff9ca2`, EVENING `#ff9d25`. Text white for INT/EXT NIGHT, black otherwise.

### Day Types & Non-Shoot Status
- **Read `docs/DAY-TYPES-AND-CALENDAR.md` before touching statuses, non-shoot dates, DOODs or event cards.** `project.dayTypes` (`DayTypeDef[]`) is the registry; `NonShootDate.status` stores a **type key**, one write path `SET_DAY_TYPES` → `caseSetDayTypes` prunes keys gone from every calendar version. Work is the default day state and is never markable. Day-card events (`NonShootDate.lists`) count on every surface even without a day status (precedence: status letter → work → card letter → `H` gap). The section date cursor skips statused dates — a section can never sit on one.

### Calendar Versions (item 66 — independent axis)
- **Read `docs/DAY-TYPES-AND-CALENDAR.md` §Calendar Versions.** Calendar data lives in `CalendarVersion` (`project.calendarVersions` + `activeCalendarVersionId`), NOT `ScheduleVersion`: `nonShootDates`, `productionStart`, `prepStart`, `postEnd`, `weeklyDaysOff`. Every calendar-field write goes through `UPDATE_CALENDAR_VERSION` (never `UPDATE_VERSION` with calendar fields — TS enforces); `useProject().activeCalendarVersion` is the one memoized read. No header pickers — schedule picker in the Schedule toolbar, calendar picker in the Calendar tab's PageToolbar.

### Element Links (roadmap 44)
- **Read `docs/ELEMENT-LINKS.md` first.** One-way, anchor-based `project.elementLinks`, with one canonical module `src/lib/elementLinks.ts`. Scene entity-field edits MUST go through `useLinkedEditGuard(links, customCategories, dispatch).tryCommitSceneEdit(scene, updates)` — never raw `UPDATE_SCENE`. Sets are anchor-only; `notes` is not linkable.

### Crew ↔ elements (roadmap 11)
- **Read `docs/ELEMENT-LINKS.md` §Crew.** `CrewRole.categories` (position → categories, `resolveRoleCategories`) makes crew rule-bearing; `project.crewLinks` (person → element/crew, reserved `category: 'crew'`) lives in `lib/crewLinks.ts`; dangling-target warnings surface via the `dayWarnings` report field and the Day Manager Crew section.

## UI Primitives (read the docs before building UI)
- **`docs/DESIGN-LANGUAGE.md` is the canonical design booklet — read it before building/changing ANY UI, and update it in the same commit as a shared-pattern change or ui-kit bump.** `docs/UI-PRIMITIVES.md` holds the working summary: tabs/toolbars + header-portal/scene-sheet-view details, the primitive list + modal-body/footer rules, EntityDropdown gotchas, and the hover/tap model.
- Never write a second copy of a primitive — reuse kit primitives (`DropdownMenu`, `Modal`+`ModalFooter`, `EntityDropdown`, `PageToolbar`, `Button`, `CellInput`, …). Modal footer = exactly one hero (`ModalFooterButton`), every other button `variant="ghost"`. Every floating surface uses the kit overlay morph (`useOverlayMorph`); async pickers use the shared `DropdownPanel`, not the kit menu.
- Hover styles are **un-gated** (iOS tap-to-hover) — never wrap in `(hover: hover)`/`(any-hover: hover)`; pen = finger = touch. Project chrome: ONE source `useProjectTheme()` (`src/lib/projectTheme.ts`) — zinc / blue / emerald, no blue checks.
- **App navigation is history-backed** (roadmap 176, `docs/UI-PRIMITIVES.md` §App Navigation): tabs/sub-tabs (+ Days' Call Sheet) are hash places via `go()` in `App.tsx` — route ALL user navigation through `go` (never raw `setActiveTab`); the mounted surface lags the pill one frame (`useLaggingValue`, 263) — nav/pill/presence urgent.

## Store & Sync
- **Read `docs/STORE-AND-SYNC.md`** for the module layout, persistence keys, connectivity probe, Drive text-only upload rules, and the full memo contract.
- Non-negotiables: `readOnly` is driven ONLY by the probe (save failures never flip it); per-row components MUST NOT call `useProject()`; rows are immutable (never mutate a `ComputedRow`); prefer `UPDATE_ROW` over rebuilding row arrays; bulk dispatches wrap in `BATCH_START`/`BATCH_COMMIT`.
- **Editing surfaces commit on blur (roadmap 250/251)** — Enter/Tab/Escape/click-away, never per keystroke and never a Save button; typed-but-uncommitted text registers with `inFlightEdits.ts` so a peer's S3.5 save raises "Changes available" instead of reloading over it.

## Ribbon Cells
- **Read `docs/RIBBON.md`.** ALL cells use `getRibbonCellBaseStyle(...)` — never hardcode cell padding/font/text styles; per-cell size = `ribCellTextSize(master, cell)`; padding/edge/textSize are per-`RibbonDesign` (`SET_RIBBON_*`), thread the master through every renderer; toolbar numeric boxes are `LiveNumberInput`.
- **Editing focus is per-user, display is shared** (roadmap 233): the stripboard shows the shared `activeRibbonId`; the Ribbon Designer edits the per-user pref (`useActiveDesignId`) and never dispatches `SET_ACTIVE_RIBBON`.

## Glide Breakdown
- **Read `docs/GLIDE-BREAKDOWN.md`** before touching `BreakdownTabGlide.tsx` or `InlineGlideTable` (raw `provideEditor` indices, no canvas auto-repaint, the `@glide-overlay-editor` boot preload, the shared `InlineGlideTable` recipe).

## Print
- `window.print()` on the main window; App early-returns a full-page `PrintSchedule`; `afterprint` restores UI. `@page { size: landscape; margin: 10mm 8mm; }`; inline `<style>`.
- Two-row scene layout (info + description). Row renderers live in `print/PrintRowParts.tsx` (share `PrintRowCtx`); styles in `print/printStyles.ts`.
- For headless print tests, stub `window.print()` or afterprint fires synchronously and the print view never renders.

## Rules Engine (`src/lib/rulesEngine.ts`)
`checkDay()`/`checkAllDays()`/`checkSection()`; rule types: MAX_HOURS, DATE_RESTRICTION, TIME_WINDOW, CAST_CONFLICT, CAST_SCENE_FLAG. Violations show as red Flag icons on day headers + scene strips (Schedule + Calendar).

## Import/Export
Read `docs/IMPORT-EXPORT.md` before any import/export work (the single manual
for the `src/lib/import/` barrel). Key gates to remember: append parsers
CSV/FDX/Fountain → `ImportResult`; **MSD/SEX are NEW-PROJECT-ONLY** (build a
complete `Project` via `importProjectFromData` — no append, no review stage);
`commitImport()` batches dispatches into one undo entry; golden fixtures +
reference parsers live in `tools/` / `e2e/fixtures/`. FDX/Fountain also retain
the screenplay body (`ImportResult.script` → `project.scriptDocument` /
`scriptBaseline` via `src/lib/script/` + `SET_SCRIPT_DOCUMENT`; item 123 Phase 0).
**Script-tab perf: `docs/PERF-DIAGNOSIS.md` §Script tab** — per-scene `sceneSpans`
cache, memoized renderer, `cv-chunk` sections; never re-derive the whole
document, never window-mount the reading surface.

## Pop-out Windows (`PopoutWindow.tsx`)
- Desktop-only (`!IS_COARSE`): tabs/sub-tabs open in separate windows sharing state via `createPortal` (window opened synchronously in the click handler to dodge popup blockers; `cascadePosition()` tiles).
- App.tsx owns `poppedOutTabs`/`poppedOutSubTabs` + window refs; popups render `<VersionToolbar>` (+ decorative single-tab `PageToolbar` for sub-tabs). Scaffolding components: `popout/PopoutFrames.tsx` (`PopoutFrame`, `SubTabPopoutFrame`, `ReportCategorySidebar`).
- Shift+click / right-click on tabs pop out (gated `!IS_COARSE`); cross-tab navigation skips `setActiveTab` when target is popped out (state still flows via context).
- SceneSheet commits per field (dropdowns dispatch immediately; text inputs buffer in `edits`, flush on blur/navigation) so edits are live across windows.

## Security & Env
- Secrets/tokens MUST come from `import.meta.env.VITE_*` — never literals. `.env` gitignored; `.env.example` placeholders only. New Vite vars go in `.env.example`.
- **CSP (285)**: every build serves the meta policy from `src/lib/csp.ts` (injected by `vite.config.ts`; dev relaxes script-src for react-refresh). A new external origin goes in THERE in the same commit; `frame-ancestors` can't ride a meta tag — `docs/SECURITY.md` §7.
- OAuth token: `useRef` + `sessionStorage` only (never localStorage); exposed via `useGoogleAuth().accessToken`; never log it (log `error?.message` only) or expose in URLs/DOM. A localStorage FLAG (`lemon_google_was_signed_in`) records prior sign-in so fresh tabs can silently restore the GIS session (`prompt:''`) — the token itself never touches localStorage. **Supabase account sessions are the one deliberate localStorage exception** (`src/lib/supabase/client.ts` — decided in docs/COLLABORATION.md §11); this rule guards the Drive token only.
- Don't add `@google/genai`, `dotenv`, or `express`. New deps must be imported by ≥1 source file.
- **Full model, owner checklist + known gaps: `docs/SECURITY.md`; the working review checklist is the `security-review` skill (`.opencode/skills/`).**

## Agentic Debug Bridge
`window.__lemonSchedule` (`src/lib/debugBridge.ts`, installed in `provider.tsx`) — a read/write window over the store so agents can inspect and drive the app via `page.evaluate()`. **Not a product feature — dev tooling.** Full API (reads, factories, `onAction`, anchors): `help()` on the bridge + `docs/API.md` §Debug bridge; proven by `e2e/debug-bridge.spec.ts`.
- **Gate:** DEV builds always; prod/preview only when `localStorage LEMON_AGENT === '1'`. NEVER expose OAuth token/session through it.
- **Writes go through the SAME `Action` union the UI uses** (`src/store/reducer.ts`): `dispatch(action)` throws on unknown types/shape errors and flushes synchronously (`flushSync`) — reads right after a dispatch are fresh, no wait needed; `undo()/redo()`; `batch(fn)` = one undo entry. UI mutations MUST keep flowing through dispatch — any future feature is agent-reachable automatically.
- **New action types:** add to BOTH the `Action` union AND the `ACTION_TYPES` set ("KEEP IN SYNC").
- **Factories:** `makeBlankScene(partial?)`, `makeBlankProject(title?)`, `newId()` — build valid entities; never hand-craft state (cast referenced by ID, scene→row invariant, pinned daybreak).

### Local MCP bridge (roadmap 97, stage 1)
`tools/mcp/` exposes the open project to MCP clients (opencode / Claude Desktop / Cursor) over loopback (`127.0.0.1:3939`, stdio MCP, Origin+Host checked) — the app connects OUT when the user enables **File → Connect agent bridge** (the toggle is the consent); a second helper instance proxies to the first. Writes are refused when `readOnly` (or viewer `canEdit === false`); schemas are DERIVED (`tools/mcp/actionSchema.mjs`) — never hand-maintain one tool per action. **Local-only for now** — the ship path is a desktop app hosting the UI + MCP server (roadmap 145). Tool inventory, wire protocol, security model: `docs/API.md` — read it before changing the surface.

## Help Modal
New stripboard shortcuts/controls MUST be documented in `HelpModal.tsx` (`<Section>`/`<Row>`/`<Kbd>`; Unicode keys ⌘ ⌥ ⇧ ⌫ ⏎ ⎋ ↹).

## Reports Designer
Read `docs/REPORTS-DESIGNER.md` first (three-pillar model: block tree / collection resolver / field registry — one canonical implementation each, never re-derive; token/free-table reference: `docs/REPORTS-TOKENS-AND-TABLES.md`). Note: the designer is under the **Design tab**, not the Reports tab; the Reports tab (DOODs/Element Breakdown) is a separate hand-built feature. **The "Editing:" design pick is a per-user pref** (roadmap 233, `useActiveDesignId`) — contents are project state; the designer never dispatches `SET_ACTIVE_REPORT`. There is NO generic sum/count attribute on blocks — check the field registry before building aggregation. Day grid blocks (`callTimes`/`crewTable`, items 111/112) share `lib/reportGrids.ts` + `ReportGridBlock`/`InteractiveGridBlock` — never fork the table recipe. **The Call Sheet editor is this SAME editor in zone mode** (roadmap 212): `ReportDesigner zone={{…}}` + `zone.renderPage`; never add a second zone designer.

## Roadmap Work
- **One agent per item** — by default on the current branch, in this tree. When several items are in flight the user may hand you a worktree ("another agent is working rn"): load the `parallel-work` skill (worktree setup, merge conflict recipes, ff-only into `main`, the flake-triage ladder). Just ask and the agent works until the item is done.
- **Audit backlog** — "do the next audit item" = 274+ in the audit block of `docs/ROADMAP.md`.
- The agent: reads `AGENTS.md` + domain docs FIRST, implements with small focused commits, asks you blocking questions directly (question tool — no decisions channel), then **self-reviews**: verifies its diff against the documented invariants (canonical models in AGENTS.md/docs — no re-derivation), checks for duplicated logic/monoliths, runs `npm run lint` + `npx playwright test`.
- Then it **updates the docs itself**: loads the `write-agent-docs` + `manage-roadmap` skills, applies the `docs/*.md`/AGENTS.md updates its change calls for, and **closes the roadmap item** (the `manage-roadmap` skill holds the exact close-out steps).

## Requests & Triage (new asks → roadmap)
- **All feature asks funnel into `docs/ROADMAP.md` — no orphan features.** Before starting any work from a user ask (or numbering a new item), run the dedupe search in this order: live `docs/ROADMAP.md` → `docs/ROADMAP-ARCHIVE.md` (completed index) → AGENTS.md + `docs/*.md` → `git log --oneline --grep=<term>` → source code.
- Outcome: ask matches an **open** item → tell the user and run/merge into that item, never add a duplicate; matches an **in-progress** item → never implement in parallel; matches a **done** item → answer with the pointer (AGENTS.md/doc section + code path), no new work; overlaps **several** items → merge into ONE item; matches nothing → new numbered item.
- Items that relate to each other carry a `Relations:` line (`depends on` / `merges` / `supersedes` / `blocked by`) so future workers see the graph without re-reading the archive.
- **Doc budgets**: `AGENTS.md` is the always-loaded hub — keep it lean (target ≤ ~200 lines / < ~8k tokens); when a section grows, move the detail to its `docs/*.md` manual and leave a summary + `file:line` pointers + MUST-NOT invariants (see `write-agent-docs` skill). Per-feature `docs/*.md` ≤ ~200-400 lines each; the roadmap archive is index-only. Measure with `wc -l` and `wc -c`, not vibes. **Enforced deterministically**: `npm run lint` fails when `AGENTS.md` exceeds 200 lines / 36 KB (`scripts/check-doc-budget.mjs`); opt-in pre-commit gate via `npm run hooks:install`. Bloat is blocked by a check, not just this sentence.
- **Roadmap hygiene** (load the `manage-roadmap` skill): the live `docs/ROADMAP.md` holds OPEN items only; completed items are one-line rows in `docs/ROADMAP-ARCHIVE.md` (narratives in git history). Ids are stable and unique, never reused. `npm run lint` fails if a `[x]` item is left live or an archive id is duplicated.
