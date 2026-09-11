# Agent Context

## Commands
- `npm run dev` — dev server (port 3000). `npm run lint` — `tsc --noEmit` + `scripts/check-doc-budget.mjs` (doc budget, roadmap hygiene, orphan specs, wait ratchet) + `eslint e2e` (`no-floating-promises` only; no Prettier). `npm run lint:docs` / `lint:tests` run the pieces alone. `npm run test:unit` — Vitest pure-logic tests. `npm run build` / `npm run preview`.
- **After bumping `@gabriel/ui-kit`**: if dev throws `SyntaxError: Indirectly exported binding name ... not found`, Vite is serving stale pre-bundled deps — `rm -rf node_modules/.vite-*` and restart (kit ships a committed `dist/`, so the blocked `prepare` script is fine).
- `npx playwright test` — E2E against the **production preview build** (auto `npm run build` ~4s + `vite preview` on 3001; ~2× faster than dev since no per-module transforms). Set `PLAYWRIGHT_DEV=1` to run against the dev server instead. Tests in `e2e/`. **Read `docs/TESTING.md`** (strategy, flake policy, `@quarantine`, "was it me?"): retries=1 locally absorbs transient flake; test a failing spec against clean HEAD with `npm run test:baseline -- e2e/<spec>.spec.ts` — NEVER `git checkout` to baseline. Past failures + triage: `docs/KNOWN-TEST-FAILURES.md`.
- **`npm run test:smart`** — smart E2E subset runner (`scripts/smart-test.mjs`): diffs the working tree vs `HEAD` (or `SMART_BASE=<ref>`), maps changed files to specs via the `RULES` table in the script, and runs only those + canaries (`seeded-smoke`, `debug-bridge`) + last-run failures. Core/shared files (`src/store/**`, `daybreakUtils`, `categories`, `ribbonUtils`, configs, `e2e/helpers.ts`…) escalate to the FULL suite; unmapped `src/` changes run canaries only, with a warning to add a RULES entry. `--list` prints the selection without running; `--full` forces everything; `npm run test:full` = full suite. **Extend `RULES` when adding features** (a feature with no rule gets skipped by name). Rule 7's safety net: the full suite runs before done/commit **only for logic/data/store changes** — visual-only changes (rule 7) skip it.
- Perf/memory harnesses are tagged `@perf` and EXCLUDED from the default run (`grepInvert`) — run them explicitly: `npx playwright test --config=playwright.perf.config.ts` (dev :3001) / `playwright.perf-prod.config.ts` (preview :4173); see `docs/PERF-DIAGNOSIS.md`.
- The suite opens agent mode in prod builds (`LEMON_AGENT=1` via `storageState` in `playwright.config.ts`) so specs can read `window.__lemonSchedule` state — prefer the bridge over localStorage reads (sync, no debounced-save waits). Prefer `expect`/`expect.poll`/`waitForFunction` over `waitForTimeout` (web-first; remaining waits are true interaction pacing: drags, canvas settles).
- `e2e/helpers.ts`: `ensureProject(page)`, `openSeededProject(page)` (seeds the committed `e2e/fixtures/seed.lemon` pre-boot; override via `LEMON_SEED_PATH`; boots to the header anchor — no sleeps), `waitForPersistedProject(page, expr)` (polls localStorage for a normalized state — use before reads when persistence is under test). Seed + seed-script cached per project JSON/worker. **Specs must be seed-agnostic** — resolve cast/dates/elements/counts from the debug bridge (`seedLeadCast`, `seedDayDates`, `seedElement`, `activeCalendar`, `seedTitle`) instead of hardcoding the seed's content (the seed is a real exported project and can change).
- `DISABLE_HMR=true` — disable HMR/file watching (AI Studio sets this).

## Core Rules (read first — these override convenience)
1. **Think in components & shared modules first.** Reuse existing primitives (`DropdownMenu`, `Modal`, `EntityDropdown`, `PageToolbar`, hooks in `src/lib/`) before writing new UI or logic. When you find yourself writing the second copy of anything (component, helper, class string, literal), extract it into a shared file and use it in both places.
2. **No monoliths.** Split files when they grow (~700+ lines): extract presentational JSX and pure logic into focused modules, keep state/refs in the composition root, re-export through a barrel so existing imports keep working. Never grow a file toward a monolith; split proactively at the second related feature.
3. **Narrow scope, no speculative abstractions.** Implement the smallest behavior that satisfies the request. Every new abstraction must map to a stated requirement — remove it if it doesn't. Prefer adapting into an existing pipeline over creating a parallel one.
4. **One source of truth per concern.** Duplicated logic (e.g. the stripboard/copy-paste/context-menu flows) MUST live in one shared module (`src/lib/`, `src/components/*/`) consumed by all views. The domain models below are the canonical answers; do not re-derive them from code.
5. **Complexity reset.** When a second special case would extend the same abstraction, stop, re-read the requirement, and redesign narrower instead of patching.
6. **Small focused commits**, imperative mood, one revertible unit each.
 7. **Verify before done.** Every change runs `npm run lint`. **Logic/data/store/behavior changes** run `npx playwright test` (or the `npm run test:smart` subset) — full suite before done/commit, never claim done on a failing suite. **Visual-only changes** (class strings, colors, hover/focus styles, padding/layout — no behavior impact) skip the suite: lint + a manual user check is enough; don't boot e2e for CSS tweaks.
 8. **Bump the version when done — do it, don't suggest.** The boot screen shows `v{package.json version}` (build-time `__APP_VERSION__` define — see `docs/ROADMAP.md` item 82). When work wraps, judge the DIFF'S IMPACT (not its size) and, if a bump is due, bump `package.json` YOURSELF — `npm version patch|minor|major` (auto-tags the release commit; when the working tree is dirty, edit `package.json`'s `version` directly and leave the tag/release commit to the release flow) — and note the new version in ONE short line of the done summary. Judge in three steps:
    - **What changed?** Internal work (refactor, plumbing, docs-only) = no bump. A visible feature or a fix to released behavior = candidate.
    - **Is it released?** The app is pre-1.0 (`0.x`, `private: true`) — the boot-screen number is an internal release marker, not a shipped product version. Unreleased/flagged/experimental work needs NO bump yet; bundle it into the release that ships it.
    - **How big?** Patch (`0.x.y` → `0.x.y+1`) = fixes / visual-only / small increments; minor = a user-visible feature milestone; major = a breaking change. In the 0.x era be CONSERVATIVE — prefer a patch for everyday features and reserve the minor for real milestones; don't inflate a feature into a minor when a patch describes it, and don't undersell a genuinely big milestone either.
    - **Signal, not noise.** Don't bump per commit; bundle small fixes/refactors into ONE patch when the work wraps. Batch multi-item work into ONE bump at a coherent milestone.
    - **Check the current version first.** If `package.json` is already newer than what your change adds (a release bump landed after the last user-visible change), skip it.
    - **When unsure, just omit** — no bump beats a wrong one.

## Explaining to the User (plain language)
- Talk about features in real terms, not code: "scene 1. GEORGE in the kitchen" or "scene ribbon" not "a SCENE row"; "cast member 1. FISHERMAN" not "cast entity"; "the hold list on Jun 3" not "NonShootDate.lists".
- Ground explanations in how it plays out in real life: "drag scene 3. DINER onto Jun 4 → call time becomes 7:45 AM since the two scenes before run 2h 15m."
- Use project data for examples (seeded "IT'S A WONDERFUL LIFE" works). ASCII sketches/visuals welcome when they clarify.

## Stack & Storage
- React 19 + Vite 6 + Tailwind v4 (`@tailwindcss/vite`). Path alias `@/*` → root. Deploy base `/lemon_schedule/`.
- **Radix pins (roadmap 71)**: keep `@radix-ui/react-dialog` ≥1.1.23 + `@radix-ui/react-dropdown-menu` ≥2.1.24 (single `react-dismissable-layer` ≥1.1.19). Older dismissable-layer (1.1.12) defers TOUCH outside-dismissal to the click, which on iPad left a stacked dialog's body locked at `pointer-events:none` when the top modal closed (the Add-Events Cancel freeze). Never bump one without the other (a partial bump forks the shared dismissable layer and breaks menus inside modals), and never add `.lemon`-seed-specific hardcoded dates to iPad specs.
- State: Context + `useReducer` with undo/redo (`state.present` = active Project; `state.past/future`). Persistence, sync and the memo contract: **read `docs/STORE-AND-SYNC.md`**.
- localStorage: index key `lemon_schedule_project_index`, per-project `lemon_schedule_project_v1_{id}`. Cloud projects (Drive) are NOT in localStorage index (filtered on save).
- Bulk dispatches → wrap in `BATCH_START`/`BATCH_COMMIT` (nestable; outermost commits one undo entry).

## Domain Model (canonical — don't re-derive)
Deep dives live in `docs/`: daybreak/section model → `docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md`; day types + calendar axis → `docs/DAY-TYPES-AND-CALENDAR.md`; element/crew links → `docs/ELEMENT-LINKS.md`. The summaries + invariants below are the always-loaded contract.

### Rows & Sections
- `ScheduleRow.type`: `SCENE | BREAK | NOTE | DAYBREAK`. `ScheduleVersion.rows` is the single source of truth for stripboard order.
- **Scene→Row invariant**: every `project.scenes` entry has exactly one SCENE row in every version (`LOAD` runs `ensureAllScenesHaveRows()`; `ADD_SCENE`/`RESTORE_SCENE`/`IMPORT_SCENES` push rows; `DELETE_SCENE` removes them; `NEW_VERSION` seeds them). **Version trash retention**: `pruneVersionTrash` (storage.ts) — 30-day TTL + keep newest 10; pruned on local loads, CLOUD reads (`readDriveProject`), and every delete (unbounded trash made a 900KB file 69% trash).
- **DAYBREAK rows split the stripboard into sections.** Each renders two visual rows: `SectionFooter` ("End of Day #N", totals — white bg) closes the section above; `Next Day Header` ("START OF DAY N", call-time input — dark header palette) opens the section below. Read `docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md` before touching schedule ordering/insertion.

### Pinned Daybreak (section 0)
Every blank version starts with a pinned DAYBREAK at `containerId: 1, order: 0` (`pinned: true`). It is NOT a production day.
- Only visible when ≥1 other DAYBREAK exists; never draggable/deletable; insertion above it is blocked (index bumped to 1); footer suppressed; doesn't advance `sectionDateMap`/`sectionLabelMap`; excluded from `productionSections`.

### Call Time Model
- The **daybreak above a section** is the source of truth for its base call time: `sectionBaseTime = preceding daybreak's daybreakCallTime`; each row's `computedCallTime = sectionBaseTime + accumulated section elapsed`.
- Editing the "START OF DAY N" input updates the daybreak row's own `daybreakCallTime` (governs the section below).
- Calendar section swap: exchange the `daybreakCallTime` of the daybreaks above each swapped section so call times travel with content (pinned daybreak participates for section 1).

### Day Properties (`daybreakMeta`)
- Per-day properties (master/key locations, notes, day crew, precalls, element call times, per-day call-sheet zones) live on the **governing DAYBREAK row** as `daybreakMeta` — the daybreak ABOVE the section (pinned for Day 1), same convention as `daybreakCallTime`. `src/lib/dayMeta.ts` is the ONE module (`getDayMeta`, `patchDayMeta` → `UPDATE_ROW`, `isEmptyDayMeta`, `daybreakAbove`, `sectionCallTime`, `pruneDayMetaRefs`); nothing reads the raw field.
- Whole-day drags carry the meta with the call time (insert rotation + swap in `useCalendarDrag`; index-0/pinned swaps leave it). Deleting a daybreak with details warns first; bulk daybreak ops restate the consequence.
- **Day Manager = the Production tab's Day Manager sub-tab** (items 103-109: Project Details + the Call-Times settings are draggable kit modals in its header — no sub-tabs): one `DayView` read model (`src/lib/dayView.ts`) feeds the registry-driven page, pop-outs and Copy-from-day; sections are pure props-in/patch-out (never `useProject()`). Two-column layout: the narrow meta band (Day Details · Locations/Events/Conflicts) on top, the wide grids (Scenes, Call Times, Crew) beneath (registry `wide` flag). Calendar's "Day Breakdown" → **Day Types**. Reports resolve a day's location via `getReportLocation` (master → DB-matched scene location → blank; London stub gone).
- **Call times (item 99)**: optional helper — `productionInfo.callTimes` (stages + per-category stage sets) + `project.crewTemplate`; `src/lib/callTimes.ts` `computeElementCallChain` walks stages backwards from the element's first-scene call (absolute/relative overrides, only overrides stored in `daybreakMeta.elementCalls`); `resolveCallExpression` resolves one expression against an anchor (department precalls). Hosts: the Day Manager header's **Call Times** modal (stages drag-reorderable) + the Day Manager's Call Times/Crew sections. Report seams (contextual children of `days`): `crewOfDay` (resolved day crew + `crewCallTime`), `elementCallsOfDay` (per-element stage columns `call_{stageKey}`), `departmentCallsOfDay`, `locationsOfDay`; plus the `dayNotes` field.

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

### Cast & Entities
- **Cast referenced by ID** (`scene.cast` = comma-separated IDs; compare by `e.id`; EntityDropdown `displayMode="id"`). **All other categories by name** (`e.name`).
- **New cast via entity fields** (stripboard/Glide/Sheet) → shared `addNewElement` (`lib/newCastNaming.tsx`): creates the member BLANK and queues it for the naming modal (mounted in `App.tsx`). Save = `UPDATE_CAST_MEMBER` (uppercased, one batch); per-entry undo = `DELETE_CAST_MEMBER`. Never dispatch `ADD_ELEMENT` cast with `name:''` outside it (CastTab's manager-add stays a blank inline row — no modal).
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
- Hover styles are **un-gated** (iOS tap-to-hover) — never wrap in `(hover: hover)`/`(any-hover: hover)`; pen = finger = touch. Cloud projects color light PageToolbars `bg-blue-950` (`useIsCloudProject()`); dark toolbars unaffected.

## Store & Sync
- **Read `docs/STORE-AND-SYNC.md`** for the module layout, persistence keys, connectivity probe, Drive text-only upload rules, and the full memo contract.
- Non-negotiables: `readOnly` is driven ONLY by the probe (save failures never flip it); per-row components MUST NOT call `useProject()`; rows are immutable (never mutate a `ComputedRow`); prefer `UPDATE_ROW` over rebuilding row arrays; bulk dispatches wrap in `BATCH_START`/`BATCH_COMMIT`.

## Ribbon Cells
- **Read `docs/RIBBON.md`.** ALL cells use `getRibbonCellBaseStyle(...)` — never hardcode cell padding/font/text styles; per-cell size = `ribCellTextSize(master, cell)`; padding/edge/textSize are per-`RibbonDesign` (`SET_RIBBON_*`), thread the master through every renderer; toolbar numeric boxes are `LiveNumberInput`.

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

## Pop-out Windows (`PopoutWindow.tsx`)
- Desktop-only (`!IS_COARSE`): tabs/sub-tabs open in separate windows sharing state via `createPortal` (window opened synchronously in the click handler to dodge popup blockers; `cascadePosition()` tiles).
- App.tsx owns `poppedOutTabs`/`poppedOutSubTabs` + window refs; popups render `<VersionToolbar>` (+ decorative single-tab `PageToolbar` for sub-tabs). Scaffolding components: `popout/PopoutFrames.tsx` (`PopoutFrame`, `SubTabPopoutFrame`, `ReportCategorySidebar`).
- Shift+click / right-click on tabs pop out (gated `!IS_COARSE`); cross-tab navigation skips `setActiveTab` when target is popped out (state still flows via context).
- SceneSheet commits per field (dropdowns dispatch immediately; text inputs buffer in `edits`, flush on blur/navigation) so edits are live across windows.

## Security & Env
- Secrets/tokens MUST come from `import.meta.env.VITE_*` — never literals. `.env` gitignored; `.env.example` placeholders only. New Vite vars go in `.env.example`.
- OAuth token: `useRef` + `sessionStorage` only (never localStorage); exposed via `useGoogleAuth().accessToken`; never log it (log `error?.message` only) or expose in URLs/DOM. A localStorage FLAG (`lemon_google_was_signed_in`) records prior sign-in so fresh tabs can silently restore the GIS session (`prompt:''`) — the token itself never touches localStorage.
- Don't add `@google/genai`, `dotenv`, or `express`. New deps must be imported by ≥1 source file.

## Agentic Debug Bridge
`window.__lemonSchedule` (`src/lib/debugBridge.ts`, installed in `provider.tsx`) — a read/write window over the store so agents can inspect and drive the app via `page.evaluate()`. **Not a product feature — dev tooling.**
- **Gate:** DEV builds always; prod/preview only when `localStorage LEMON_AGENT === '1'`. NEVER expose OAuth token/session through it.
- **Reads (deep-cloned, report state truth not DOM):** `getState()` (present/past/future), `getProject()`, `getVersion(id?)`, `getRows(id?)` (computed stripboard rows + sections — call times, daybreak labels, section sums), `getSceneValues()` (every scene × column value — the Glide canvas is opaque to the DOM), `decodeProject(raw)` (decode a persisted localStorage/Drive project string — gzip/base64 or legacy plain JSON; use this for persistence assertions, not `JSON.parse`), `diagnostics()` (connectivity/sync snapshot: probe result, `driveSaveError`+msg, save retry count, last upload payload bytes, auth state), `getProjectList()`, `pastCount()/futureCount()`.
- **Writes (the SAME `Action` union the UI uses, `src/store/reducer.ts`):** `dispatch(action)` — throws on unknown types/shape errors; `undo()/redo()`; `batch(fn)` = `BATCH_START/COMMIT` (one undo entry). UI mutations MUST keep flowing through dispatch — any future feature is agent-reachable automatically.
- **Observe:** `onAction(cb)` subscribes to every dispatched action (UI + bridge); returns unsubscribe.
- **Factories:** `makeBlankScene(partial?)`, `makeBlankProject(title?)`, `newId()` — build valid entities; never hand-craft state (cast referenced by ID, scene→row invariant, pinned daybreak).
- **`dispatch` flushes synchronously** (`flushSync` in provider) — state reads right after a dispatch are fresh; no wait/tick needed.
- **New action types:** add to BOTH the `Action` union AND the `ACTION_TYPES` set (`src/store/reducer.ts`, marked "KEEP IN SYNC").
- **Stable anchors:** `TEST_IDS` (`src/lib/testIds.ts`) — stripboard-day, daybreak-row, section-footer, next-day-header, palette-item; `#boneyard_rows_container` id exists. Prefer role/label/text queries first.
- **Proven by** `e2e/debug-bridge.spec.ts` (inject → mutate → verify → batch → undo/redo). `help()` on the bridge self-documents the full API.

## Help Modal
New stripboard shortcuts/controls MUST be documented in `HelpModal.tsx` (`<Section>`/`<Row>`/`<Kbd>`; Unicode keys ⌘ ⌥ ⇧ ⌫ ⏎ ⎋ ↹).

## Reports Designer
Read `docs/REPORTS-DESIGNER.md` first (three-pillar model: block tree / collection resolver / field registry — one canonical implementation each, never re-derive). Note: the designer is under the **Design tab**, not the Reports tab; the Reports tab (DOODs/Element Breakdown) is a separate hand-built feature. There is NO generic sum/count attribute on blocks — check the field registry before building aggregation. Day grid blocks (`callTimes`/`crewTable`, items 111/112) share `lib/reportGrids.ts` + `ReportGridBlock`/`InteractiveGridBlock` — never fork the table recipe.

## Roadmap Work (single agent)
- **One agent per item, on the current branch, in this tree** — no worktrees, no orchestrator, no parallel workers. Just ask and the agent works until the item is done.
- The agent: reads `AGENTS.md` + domain docs FIRST, implements with small focused commits, asks you blocking questions directly (question tool — no decisions channel), then **self-reviews**: verifies its diff against the documented invariants (canonical models in AGENTS.md/docs — no re-derivation), checks for duplicated logic/monoliths, runs `npm run lint` + `npx playwright test`.
- Then it **updates the docs itself**: loads the `write-agent-docs` + `manage-roadmap` skills, applies the `docs/*.md`/AGENTS.md updates its change calls for, and **closes the roadmap item** — flip `[ ]` → `[x]`, add its one-line row to `docs/ROADMAP-ARCHIVE.md`, then delete the live section (git keeps the narrative). Completed narratives never stay in the live roadmap.

## Requests & Triage (new asks → roadmap)
- **All feature asks funnel into `docs/ROADMAP.md` — no orphan features.** Before starting any work from a user ask (or numbering a new item), run the dedupe search in this order: live `docs/ROADMAP.md` → `docs/ROADMAP-ARCHIVE.md` (completed index) → AGENTS.md + `docs/*.md` → `git log --oneline --grep=<term>` → source code.
- Outcome: ask matches an **open** item → tell the user and run/merge into that item, never add a duplicate; matches an **in-progress** item → never implement in parallel; matches a **done** item → answer with the pointer (AGENTS.md/doc section + code path), no new work; overlaps **several** items → merge into ONE item; matches nothing → new numbered item.
- Items that relate to each other carry a `Relations:` line (`depends on` / `merges` / `supersedes` / `blocked by`) so future workers see the graph without re-reading the archive.
- **Doc budgets**: `AGENTS.md` is the always-loaded hub — keep it lean (target ≤ ~200 lines / < ~8k tokens); when a section grows, move the detail to its `docs/*.md` manual and leave a summary + `file:line` pointers + MUST-NOT invariants (see `write-agent-docs` skill). Per-feature `docs/*.md` ≤ ~200-400 lines each; the roadmap archive is index-only. Measure with `wc -l` and `wc -c`, not vibes. **Enforced deterministically**: `npm run lint` fails when `AGENTS.md` exceeds 200 lines / 36 KB (`scripts/check-doc-budget.mjs`); opt-in pre-commit gate via `npm run hooks:install`. Bloat is blocked by a check, not just this sentence.
- **Roadmap hygiene** (load the `manage-roadmap` skill): the live `docs/ROADMAP.md` holds OPEN items only; completed items are one-line rows in `docs/ROADMAP-ARCHIVE.md` (narratives in git history). Ids are stable and unique, never reused. `npm run lint` fails if a `[x]` item is left live or an archive id is duplicated.

## File Layout (post-refactor — see `plans/archive/REFACTOR-PLAN.md`)
- `src/store/` — barrel + storage/reducer(+actions)/provider/rows
- `src/lib/` — shared: `sceneFactory`, `glideCells`, `glidePaste`, `glideEditor`, `elements`, `paletteOps`, `mergeGroups`, `sceneColors`, `ribbonDefaults` (ribbonUtils re-exports these), `useStripboardContextMenu`, `useDriveProjectList`, `import/`
- `src/components/schedule/` — Toolbar/ContextMenu/Modals/Overlays + hooks (`useScheduleKeyboard`, `useScheduleDrag`, `useBoneyardSort`) — ScheduleTab is the composition root
- `src/components/calendar/` — SceneCard/DayCell/BoneyardSidebar/calendarUtils + hooks (`useCalendarKeyboard`, `useCalendarDrag`)
- `src/components/ribbon/` — row renderers (`SortableRow*`, `rowRenderTypes` RowRenderCtx), RibbonPalette/Toolbar/DesignerGrid/LivePreview/ContextMenu
- `src/components/print/` — PrintRowParts (PrintRowCtx), CastListPrint, printLayout, printStyles
- `src/components/InlineGlideTable.tsx` — shared compact Glide grid for page cards (Day Manager Call Times/Crew); `src/components/production/day/` — DayManagerPage + registry sections + DayTimesGlide (inline-grid adapter)
- `src/components/{popout,elements,rules}/` + top-level AppHeader/OfflineStatus/ProjectCard/NewProjectModal/ColorRuleCard(+Meta)/projectManagerStyles
