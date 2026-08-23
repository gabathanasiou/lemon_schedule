# Agent Context

## Commands
- `npm run dev` — dev server (port 3000). `npm run lint` — `tsc --noEmit` (no ESLint/prettier). `npm run build` / `npm run preview`.
- `npx playwright test` — E2E (auto-starts dev server on 3001; tests in `e2e/`).
- `npx playwright test --config=playwright.perf.config.ts` / `playwright.perf-prod.config.ts` — perf/memory harness (dev :3001 / prod preview :4173; seeds Town; see `docs/PERF-DIAGNOSIS.md`).
- `e2e/helpers.ts`: `ensureProject(page)` (creates a project from Project Manager), `openSeededProject(page)` (loads "Town - Jason" from `~/Downloads` into localStorage pre-boot; override via `LEMON_SEED_PATH`). `seeded-smoke.spec.ts` exercises the real project: stripboard, calendar, glide, designer, print.
- `DISABLE_HMR=true` — disable HMR/file watching (AI Studio sets this).

## Core Rules (read first — these override convenience)
1. **Think in components & shared modules first.** Reuse existing primitives (`DropdownMenu`, `Modal`, `EntityDropdown`, `PageToolbar`, hooks in `src/lib/`) before writing new UI or logic. When you find yourself writing the second copy of anything (component, helper, class string, literal), extract it into a shared file and use it in both places.
2. **No monoliths.** Split files when they grow (~700+ lines): extract presentational JSX and pure logic into focused modules, keep state/refs in the composition root, re-export through a barrel so existing imports keep working. Never grow a file toward a monolith; split proactively at the second related feature.
3. **Narrow scope, no speculative abstractions.** Implement the smallest behavior that satisfies the request. Every new abstraction must map to a stated requirement — remove it if it doesn't. Prefer adapting into an existing pipeline over creating a parallel one.
4. **One source of truth per concern.** Duplicated logic (e.g. the stripboard/copy-paste/context-menu flows) MUST live in one shared module (`src/lib/`, `src/components/*/`) consumed by all views. See the Daybreak/Container models below — they are the canonical answers; do not re-derive them from code.
5. **Complexity reset.** When a second special case would extend the same abstraction, stop, re-read the requirement, and redesign narrower instead of patching.
6. **Small focused commits**, imperative mood, one revertible unit each.
7. **Verify before done.** After every change run `npm run lint`; run `npx playwright test` at meaningful milestones. Never claim done on a failing suite.

## Stack & Storage
- React 19 + Vite 6 + Tailwind v4 (`@tailwindcss/vite`). Path alias `@/*` → root. Deploy base `/lemon_schedule/`.
- State: Context + `useReducer` with undo/redo (`state.present` = active Project; `state.past/future`).
- localStorage: index key `lemon_schedule_project_index`, per-project `lemon_schedule_project_v1_{id}`. Cloud projects (Drive) are NOT in localStorage index (filtered on save).
- Bulk dispatches → wrap in `BATCH_START`/`BATCH_COMMIT` (nestable; outermost commits one undo entry).

## Domain Model (canonical — don't re-derive)

### Rows & Sections
- `ScheduleRow.type`: `SCENE | BREAK | NOTE | DAYBREAK`. `ScheduleVersion.rows` is the single source of truth for stripboard order.
- **Scene→Row invariant**: every `project.scenes` entry has exactly one SCENE row in every version (`LOAD` runs `ensureAllScenesHaveRows()`; `ADD_SCENE`/`RESTORE_SCENE`/`IMPORT_SCENES` push rows; `DELETE_SCENE` removes them; `NEW_VERSION` seeds them).
- **DAYBREAK rows split the stripboard into sections.** Each renders two visual rows: `SectionFooter` ("End of Day #N", totals — white bg) closes the section above; `Next Day Header` ("START OF DAY N", call-time input — dark header palette) opens the section below.

### Pinned Daybreak (section 0)
Every blank version starts with a pinned DAYBREAK at `containerId: 1, order: 0` (`pinned: true`). It is NOT a production day.
- Only visible when ≥1 other DAYBREAK exists; never draggable/deletable; insertion above it is blocked (index bumped to 1); footer suppressed; doesn't advance `sectionDateMap`/`sectionLabelMap`; excluded from `productionSections`.

### Call Time Model
- The **daybreak above a section** is the source of truth for its base call time: `sectionBaseTime = preceding daybreak's daybreakCallTime`; each row's `computedCallTime = sectionBaseTime + accumulated section elapsed`.
- Editing the "START OF DAY N" input updates the daybreak row's own `daybreakCallTime` (governs the section below).
- Calendar section swap: exchange the `daybreakCallTime` of the daybreaks above each swapped section so call times travel with content (pinned daybreak participates for section 1).

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
- Category registry: `ELEMENT_CATEGORIES` in `src/lib/categories.ts` (key/label/multiValue/fdxFallbacks). Add built-ins there only. Use `isMultiValue(field, customCategories)` + `getFieldItems(field, value)` — never raw `split(',')`.

### Scene Strip Colors
`sceneStyle(scene, sceneColors, fallback, rules)` from `lib/sceneColors.ts` (re-exported by `ribbonUtils`). Fallbacks: INT DAY white, EXT DAY `#d7da50`, INT NIGHT `#41a31a`, EXT NIGHT `#005c93`, MORNING `#ff9ca2`, EVENING `#ff9d25`. Text white for INT/EXT NIGHT, black otherwise.

## Tabs & Toolbars
- Top tabs (App header): breakdown, schedule, calendar, design, rules, reports. Shift+click / right-click = pop-out (desktop only, `!IS_COARSE`).
- `PageToolbar` (`src/components/PageToolbar.tsx`): reusable toolbar with optional sub-tabs. Active tab `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud: `bg-blue-950 text-blue-50`); inactive `text-zinc-500 hover:text-zinc-900`. Scrolls horizontally with edge fades. Usage: Breakdown (light; Sheet/Element Manager/Glide Breakdown), Design (dark; Ribbon Designer/Colors), Reports (dark; DOODs/Element Breakdown), Schedule (light, justify end, no tabs), Calendar (two light instances).
- **Header portal pattern**: parent puts `<div ref>` in `rightContent`; child accepts `headerTarget` and `createPortal`s its controls there (fallback: inline). Used by ElementManager, SceneSheet, GlideBreakdownTab, ColorsTab, RibbonTab.
- **Cloud coloring**: cloud projects switch light PageToolbars to `bg-blue-950` (active tabs/buttons); derive via `useIsCloudProject()`. Dark toolbars unaffected.

## UI Primitives (use these, not raw HTML)
- `DropdownMenu`/`DropdownItem`/`DropdownDivider`/`DropdownSubmenu` (Radix click-to-toggle), `Modal`+`ModalFooter` (resizable/draggable), `ContextMenu`/`ContextMenuItem`/`ContextMenuDivider` (fixed-position), `CellInput` (inline text, Enter confirm/Escape cancel; **commits on blur only — never per keystroke**), `EntityDropdown` (see below), `PageToolbar`, `ColorField`, `Tooltip`, `FloatingTooltip`.
- **Modal body rules**: wrap body in `<div className="p-6 space-y-5">`; labeled rows `flex items-center justify-between py-1` (label `text-xs text-zinc-300`, annotations `text-zinc-500`); segmented toggles `flex border border-zinc-700 rounded p-0.5` (selected `bg-white text-zinc-900`); footer Cancel `text-zinc-400` ghost, action `bg-zinc-800` solid.
- **EntityDropdown**: multi mode = comma-separated value typed in the input; single mode = search-then-select. `items` is REQUIRED (no context fallback — pass cast/entity items explicitly). As a cell editor ALWAYS separate commit from exit: `onChange` updates the value, `onExit` leaves edit mode (never call both in one handler — editor unmounts and can't reopen).
- **Key patterns**: click-to-toggle menus (never `group-hover`); Lucide icons `w-3.5 h-3.5 shrink-0` in menus; dark surfaces `bg-zinc-950/95 backdrop-blur-md border border-zinc-800`.

## Hover & Tap Feedback
- Hover variants use `@media (any-hover: hover)` (index.css `@custom-variant hover`) — Tailwind's default `(hover: hover)` is false on iPadOS (primary pointer stays coarse), which killed hover for the iPad cursor/pencil. Always use `any-*` media queries for hover; `group-hover` composes `hover` so it's covered. Same for `.hover-reveal` (`(any-hover: hover) and (any-pointer: fine)`).
- iOS sticky hover (tap → `:hover` sticks until the next tap) IS the tap feedback — no JS flash/pulse workarounds; they double with it and read as delays.
- Pen = finger = touch: Apple Pencil is `pointerType 'pen'` (`isTouchLike()` in device.ts). Safari doesn't synthesize clicks for pen in overlays (device.ts shim) and never fires `:active` for pen; the pencil's real hover works via the same `any-hover` styles.

## Store (`src/store/` — barrel `index.ts`)
- `storage.ts` (keys, ProjectMeta, load/migrate pipeline) · `reducer.ts` (59-type Action union, State, reducer → dispatches to `actions/{schedule,breakdown,design}.ts`; `rows.ts` holds `ensurePinnedDaybreak`/`ensureAllScenesHaveRows`) · `provider.tsx` (`ProjectProvider`, `useProject()`, `useIsCloudProject()`, connectivity probe, debounced save, cloud sync).
- `useProject()` → `{ state, dispatch, projectList, currentProjectId, readOnly, initialized, createProject, openProject, deleteProject, renameProject, duplicateProject, importProjectFromData, ... }`.
- **Context value is memoized — never re-create it inline** (`provider.tsx`). Per-row components (`SortableRowContent`, `EntityDropdown`, row renderers) MUST NOT call `useProject()`: they receive `dispatch`, `palette`, `castMembers`, `breakdownElements`, `customCategories`, `hiddenCategories`, and their own `scene` as props from StripBlock/BoneyardBlock/ScheduleOverlays. Adding `useProject()` to a row component re-renders every row on every dispatch.
- **Row identity is the memo contract**: `computeRowData` (`lib/daybreakUtils.ts`) reuses computed-row objects via a WeakMap + computed-field fingerprint, so unchanged rows keep identity across dispatches (rows are immutable — never mutate a `ComputedRow`). `SortableContext items` MUST be memoized by id-sequence (e.g. `ids.join('|')` key), never by array identity — dnd-kit re-renders all `useSortable` consumers when `items` changes. Prefer `UPDATE_ROW` (single-row patch) over rebuilding `UPDATE_VERSION` rows arrays.
- Drag ghosts (DayBlock/StripBlock): `day-{day}` ghosts before the SortableContext, `end-{day}` after it; in-row ghosts inside the map via `showGhosts && insertBeforeId === r.id`. Use component-level `showGhosts`, never per-row declarations.
- Collision detection: `useCallback` with empty deps reading `activeDragIdsRef.current` (stable ref) to filter dragged rows from droppables (falling back to `closestCorners`). `insertBeforeId` distinguishes `day-{day}` (start), `end-{day}` (end), row targets.

## Ribbon Cells (single source: `src/lib/ribbonUtils.ts`)
- ALL ribbon cells MUST use `getRibbonCellBaseStyle(cell, cellPaddingV?, cellPaddingH?, span?)` — never hardcode cell padding/font/text styles.
- Scene cell padding `cellPaddingV/H ?? 3`; banner pad `getNoteBreakPad(cellPaddingV, rowCount)` = `cellPaddingV * N + 6 * (N-1)` (matches scene height). `edgePadding` (default 3) applies to the outer ribbon container only.
- Padding/edge stored per `RibbonDesign`; setters `SET_RIBBON_CELL_PADDING_V/H`, `SET_RIBBON_EDGE_PADDING`. Pass through ScheduleTab → StripBlock → SortableRibbon, PrintSchedule/DaySection, PrintDialog, RibbonTab.
- View mode (`useViewMode`, `lemon_schedule_view_mode`): portrait 730px / landscape 1060px / full null. Cell borders (`useCellBorders`, `lemon_schedule_cell_borders`): none|vertical|horizontal|both via `getCellBorderProps(borders, textColor, isLastInRow, isLastRow)` (one-sided only).
- Ribbon designer (`RibbonTab`): designs in `project.ribbonDesigns`, active `activeRibbonId`; live preview uses `PREVIEW_SAMPLES` + merge groups. The cell context menu re-targets via `elementFromPoint` behind a `pointer-events: none` backdrop.

## Glide Breakdown (`BreakdownTabGlide.tsx`) — hard-won gotchas
- **`provideEditor` gets RAW indices (+1 row marker offset)** — `dataCol = col - 1`; every other callback gets adjusted 0-based indices. Always use `COLUMNS[col].key`, never hardcoded indices.
- **`onFinishedEditing` MUST receive the latest value** (`latestRef.current` via useRef) — calling it empty = cancel/discard.
- Canvas doesn't auto-repaint: bulk ops → `gridRef.current?.updateCells(damageList)` in `setTimeout(0)`; undo/redo → full-grid `updateCells` effect on `scenes`.
- All bulk ops wrap dispatches in `BATCH_START`/`BATCH_COMMIT`.
- Glide `Rectangle` bounds are exclusive — iterate with `<`, never `<=`.
- Row markers: `clickable-number`, `startIndex: 1`. Row-click selection doesn't set `current.range` — synthesize from `gridSelection.rows`.
- Context menu position = `bounds.x + localEventX`, `bounds.y + localEventY`; always `preventDefault()`.
- `drawCell` for the actions column (red trash icon, preloaded via `new Image()` data URL).

## Print
- `window.print()` on the main window; App early-returns a full-page `PrintSchedule`; `afterprint` restores UI. `@page { size: landscape; margin: 10mm 8mm; }`; inline `<style>`.
- Two-row scene layout (info + description). Row renderers live in `print/PrintRowParts.tsx` (share `PrintRowCtx`); styles in `print/printStyles.ts`.
- For headless print tests, stub `window.print()` or afterprint fires synchronously and the print view never renders.

## Rules Engine (`src/lib/rulesEngine.ts`)
`checkDay()`/`checkAllDays()`/`checkSection()`; rule types: MAX_HOURS, DATE_RESTRICTION, TIME_WINDOW, CAST_CONFLICT, CAST_SCENE_FLAG. Violations show as red Flag icons on day headers + scene strips (Schedule + Calendar).

## Import/Export (`src/lib/import/` — barrel)
CSV (PapaParse) / FDX (XML) / Fountain. `parseCSV`/`parseFDX`/`parseFountain` → `ImportResult`; `commitImport()` batches all dispatches for one undo entry; `exportBreakdownCSV()` exports visible columns. Shared `parseSceneHeading`, `FDX_CATEGORY_MAP`, `buildCSVLabelToKeyMap()`.

## Pop-out Windows (`PopoutWindow.tsx`)
- Desktop-only (`!IS_COARSE`): tabs/sub-tabs open in separate windows sharing state via `createPortal` (window opened synchronously in the click handler to dodge popup blockers; `cascadePosition()` tiles).
- App.tsx owns `poppedOutTabs`/`poppedOutSubTabs` + window refs; popups render `<VersionToolbar>` (+ decorative single-tab `PageToolbar` for sub-tabs). Scaffolding components: `popout/PopoutFrames.tsx` (`PopoutFrame`, `SubTabPopoutFrame`, `ReportCategorySidebar`).
- Shift+click / right-click on tabs pop out (gated `!IS_COARSE`); cross-tab navigation skips `setActiveTab` when target is popped out (state still flows via context).
- SceneSheet commits per field (dropdowns dispatch immediately; text inputs buffer in `edits`, flush on blur/navigation) so edits are live across windows.

## Security & Env
- Secrets/tokens MUST come from `import.meta.env.VITE_*` — never literals. `.env` gitignored; `.env.example` placeholders only. New Vite vars go in `.env.example`.
- OAuth token: `useRef` + `sessionStorage` only (never localStorage); exposed via `useGoogleAuth().accessToken`; never log it (log `error?.message` only) or expose in URLs/DOM.
- Don't add `@google/genai`, `dotenv`, or `express`. New deps must be imported by ≥1 source file.

## Agentic Debug Bridge
`window.__lemonSchedule` (`src/lib/debugBridge.ts`, installed in `provider.tsx`) — a read/write window over the store so agents can inspect and drive the app via `page.evaluate()`. **Not a product feature — dev tooling.**
- **Gate:** DEV builds always; prod/preview only when `localStorage LEMON_AGENT === '1'`. NEVER expose OAuth token/session through it.
- **Reads (deep-cloned, report state truth not DOM):** `getState()` (present/past/future), `getProject()`, `getVersion(id?)`, `getRows(id?)` (computed stripboard rows + sections — call times, daybreak labels, section sums), `getSceneValues()` (every scene × column value — the Glide canvas is opaque to the DOM), `getProjectList()`, `pastCount()/futureCount()`.
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
Read `docs/REPORTS-DESIGNER.md` first (three-pillar model: block tree / collection resolver / field registry — one canonical implementation each, never re-derive). Note: the designer is under the **Design tab**, not the Reports tab; the Reports tab (DOODs/Element Breakdown) is a separate hand-built feature. There is NO generic sum/count attribute on blocks — check the field registry before building aggregation.

## Roadmap Work (single agent)
- **One agent per item, on the current branch, in this tree** — no worktrees, no orchestrator, no parallel workers. Run `/roadmap-item <n>` (or just ask) and the agent works until the item is done.
- The agent: reads `AGENTS.md` + domain docs FIRST (same READ-FIRST list the old feature-worker had), implements with small focused commits, asks you blocking questions directly (question tool — no decisions channel), then **self-reviews**: verifies its diff against the documented invariants (canonical models in AGENTS.md/docs — no re-derivation), checks for duplicated logic/monoliths, runs `npm run lint` + `npx playwright test`.
- Then it **updates the docs itself**: loads the `write-agent-docs` skill, applies the `docs/*.md`/AGENTS.md updates its change calls for, and flips the item's `docs/ROADMAP.md` status `[ ]` → `[x]` with a one-line "Done:" note.
- **Optional second pair of eyes**: dispatch the `code-reviewer` subagent (read-only) on `git diff` whenever you want an independent pass before or after committing docs.
- **Phone notifications**: the agent pings ntfy (`NTFY_TOPIC` in `.env`, subscribed in the ntfy iOS app) before asking a blocking question and when the item is done — the streaming tab can sit idle; the phone still pings.
- Live phone streaming requires the TUI attached to the web server: `opencode attach http://localhost:4096` (`.opencode/scripts/tui.sh`). Web server: `.opencode/scripts/start-web.sh`, auto-started by a `~/.zshrc` guard.

## Legacy parallel machinery (DORMANT — do not use)
- The old worktree-orchestration pipeline is retired but left on disk for possible revival: `orchestrator`/`docs-curator` agents, `/spawn-feature` `/roadmap-sprint` `/cleanup-worker` commands, the `orchestrate-roadmap` skill, and scripts `hub-server.mjs` (`npm run hub`), `preview-workers.sh`, `worker-ports.sh`, `watch-workers.sh`. All carry a DEPRECATED banner; the `code-reviewer` agent stays LIVE as the on-demand reviewer.
- The **hub** (`hub-server.mjs`, port 3101+idx*10) only discovers `../lemon_schedule-wt/*` worktrees to serve per-worker dev tabs — with single-agent work in the main tree it has nothing to serve and is inert. It still works if parallel sprints ever return; nothing depends on it being stopped or started.

## File Layout (post-refactor — see `docs/REFACTOR-PLAN.md`)
- `src/store/` — barrel + storage/reducer(+actions)/provider/rows
- `src/lib/` — shared: `sceneFactory`, `glideCells`, `glidePaste`, `glideEditor`, `elements`, `paletteOps`, `mergeGroups`, `sceneColors`, `ribbonDefaults` (ribbonUtils re-exports these), `useStripboardContextMenu`, `useDriveProjectList`, `import/`
- `src/components/schedule/` — Toolbar/ContextMenu/Modals/Overlays + hooks (`useScheduleKeyboard`, `useScheduleDrag`, `useBoneyardSort`) — ScheduleTab is the composition root
- `src/components/calendar/` — SceneCard/DayCell/BoneyardSidebar/calendarUtils + hooks (`useCalendarKeyboard`, `useCalendarDrag`)
- `src/components/ribbon/` — row renderers (`SortableRow*`, `rowRenderTypes` RowRenderCtx), RibbonPalette/Toolbar/DesignerGrid/LivePreview/ContextMenu
- `src/components/print/` — PrintRowParts (PrintRowCtx), CastListPrint, printLayout, printStyles
- `src/components/{popout,elements,rules}/` + top-level AppHeader/OfflineStatus/ProjectCard/NewProjectModal/ColorRuleCard(+Meta)/projectManagerStyles
