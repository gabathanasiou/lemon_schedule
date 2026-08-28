# Agent Context

## Commands
- `npm run dev` — dev server (port 3000). `npm run lint` — `tsc --noEmit` (no ESLint/prettier). `npm run build` / `npm run preview`.
- **After bumping `@gabriel/ui-kit`**: if dev throws `SyntaxError: Indirectly exported binding name ... not found`, Vite is serving stale pre-bundled deps — `rm -rf node_modules/.vite-*` and restart (kit ships a committed `dist/`, so the blocked `prepare` script is fine).
- `npx playwright test` — E2E against the **production preview build** (auto `npm run build` ~4s + `vite preview` on 3001; ~2× faster than dev since no per-module transforms). Set `PLAYWRIGHT_DEV=1` to run against the dev server instead. Tests in `e2e/`.
- **`npm run test:smart`** — smart E2E subset runner (`scripts/smart-test.mjs`): diffs the working tree vs `HEAD` (or `SMART_BASE=<ref>`), maps changed files to specs via the `RULES` table in the script, and runs only those + canaries (`seeded-smoke`, `debug-bridge`) + last-run failures. Core/shared files (`src/store/**`, `daybreakUtils`, `categories`, `ribbonUtils`, configs, `e2e/helpers.ts`…) escalate to the FULL suite; unmapped `src/` changes run canaries only, with a warning to add a RULES entry. `--list` prints the selection without running; `--full` forces everything; `npm run test:full` = full suite. **Extend `RULES` when adding features** (a feature with no rule gets skipped by name). Rule 7's safety net: the full suite runs before done/commit **only for logic/data/store changes** — visual-only changes (rule 7) skip it.
- Perf/memory harnesses are tagged `@perf` and EXCLUDED from the default run (`grepInvert`) — run them explicitly: `npx playwright test --config=playwright.perf.config.ts` (dev :3001) / `playwright.perf-prod.config.ts` (preview :4173); see `docs/PERF-DIAGNOSIS.md`.
- The suite opens agent mode in prod builds (`LEMON_AGENT=1` via `storageState` in `playwright.config.ts`) so specs can read `window.__lemonSchedule` state — prefer the bridge over localStorage reads (sync, no debounced-save waits). Prefer `expect`/`expect.poll`/`waitForFunction` over `waitForTimeout` (web-first; remaining waits are true interaction pacing: drags, canvas settles).
- `e2e/helpers.ts`: `ensureProject(page)`, `openSeededProject(page)` (seeds "Town - Jason" from `~/Downloads` pre-boot; override via `LEMON_SEED_PATH`; boots to the header anchor — no sleeps), `waitForPersistedProject(page, expr)` (polls localStorage for a normalized state — use before reads when persistence is under test). Seed + seed-script cached per project JSON/worker.
- `DISABLE_HMR=true` — disable HMR/file watching (AI Studio sets this).

## Core Rules (read first — these override convenience)
1. **Think in components & shared modules first.** Reuse existing primitives (`DropdownMenu`, `Modal`, `EntityDropdown`, `PageToolbar`, hooks in `src/lib/`) before writing new UI or logic. When you find yourself writing the second copy of anything (component, helper, class string, literal), extract it into a shared file and use it in both places.
2. **No monoliths.** Split files when they grow (~700+ lines): extract presentational JSX and pure logic into focused modules, keep state/refs in the composition root, re-export through a barrel so existing imports keep working. Never grow a file toward a monolith; split proactively at the second related feature.
3. **Narrow scope, no speculative abstractions.** Implement the smallest behavior that satisfies the request. Every new abstraction must map to a stated requirement — remove it if it doesn't. Prefer adapting into an existing pipeline over creating a parallel one.
4. **One source of truth per concern.** Duplicated logic (e.g. the stripboard/copy-paste/context-menu flows) MUST live in one shared module (`src/lib/`, `src/components/*/`) consumed by all views. See the Daybreak/Container models below — they are the canonical answers; do not re-derive them from code.
5. **Complexity reset.** When a second special case would extend the same abstraction, stop, re-read the requirement, and redesign narrower instead of patching.
6. **Small focused commits**, imperative mood, one revertible unit each.
7. **Verify before done.** Every change runs `npm run lint`. **Logic/data/store/behavior changes** run `npx playwright test` (or the `npm run test:smart` subset) — full suite before done/commit, never claim done on a failing suite. **Visual-only changes** (class strings, colors, hover/focus styles, padding/layout — no behavior impact) skip the suite: lint + a manual user check is enough; don't boot e2e for CSS tweaks.

## Explaining to the User (plain language)
- Talk about features in real terms, not code: "scene 1. GEORGE in the kitchen" or "scene ribbon" not "a SCENE row"; "cast member 1. FISHERMAN" not "cast entity"; "the hold list on Jun 3" not "NonShootDate.lists".
- Ground explanations in how it plays out in real life: "drag scene 3. DINER onto Jun 4 → call time becomes 7:45 AM since the two scenes before run 2h 15m."
- Use project data for examples (seeded "Town - Jason" works). ASCII sketches/visuals welcome when they clarify.

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

### Day Types & Non-Shoot Status
- `project.dayTypes` (`DayTypeDef[]` = `{key,label,color?,icon?,attachable?,markable?,builtin?}`) is the status registry; built-ins `work|hold|travel|holiday` = Work/Hold/Travel/Day Off (`DEFAULT_DAY_TYPES`, `lib/dayTypes.ts` — icons via `typeIconComponent`, one-letter DOOD codes via `codeForType`: T/H fixed, custom = label initial). `NonShootDate.status` stores a **type key (string)**, never a literal — resolve display via `getDayType`/`visualForType`/`dayTypeTextColor`.
- One write path: `SET_DAY_TYPES` → `caseSetDayTypes` (`store/actions/reports.ts`) prunes statuses whose key vanished from **every version** — "delete-in-use falls back to no status" lives there, nowhere else. Manager UI = the Calendar tab's **Day Types sub-tab** (`DayTypesTab` — ElementManager-style sidebar + `DayTypeModals`; built-ins fully locked — no edit/delete; LOAD normalizes built-ins to DEFAULT order and re-adds missing ones).
- **Work** (`work`, `markable: false`) is the DEFAULT state of every shooting day — never markable (excluded from the context menu + TravelHoldModal dropdown via `getMarkableDayTypes`; marking it would wrongly skip the date from the schedule). Its sidebar count and pane list the schedule's **production days**, derived from the canonical `useDaybreakSections` — never re-derived.
- **Day-card items (events)**: `NonShootDate.lists` = `Record<statusKey, Record<category, string[]>>` (cast = IDs, others = names, `'*'` = whole category) — the old `travel`/`hold`/`castIds` fields folded into `lists.travel`/`lists.hold` in the LOAD migration. `attachable` gates which types can carry lists (built-ins: hold/travel yes, holiday no). Day modal = the status dropdown (ui-kit) + list rows per picked type; helpers in `nonShootHelpers.ts` (status-keyed). DOODs: marked elements get the type's cell letter, header shows label + color, per-type count columns render for in-use attachable customs.
- **Events count everywhere, not just the day status**: a `lists` group WITHOUT a day `status` is an extra event on a normal day ("GEORGE has a travel card on his work day"). All count surfaces (DOOD cells/totals `deriveDood` in `nonShootStats.ts`, Element Manager day-type columns `computeElementDayStats`, Day Breakdown pane lists, reports `dayType` field) include card events. DOOD **cell precedence: status letter → work wins (`W`/`SW`/`WF`) → card letter → `H` gap**; totals count status AND card days (a travel card on a work day counts as a travel day even with a `W` cell). `elementDayStats`/`dayTypeForDate` scan `isElementMarked`/card groups — never key cells on `entry.status` alone. Multi-type days: first type in manager order in the cell, all counted in their lists.
- **Days-off pattern (Production Dates modal)**: `version.weeklyDaysOff` (Mon=0..Sun=6) is synced MMS-style both ways across the **scheduled span** — Apply and Save mark pattern weekdays as `holiday` from the start through the stripboard's last shooting day (walked with `advanceDateCursor` in `daybreakUtils.ts`, the same cursor `computeRowData` uses; `postEnd` only extends the window), and unchecking a weekday removes ONLY the statuses the pattern created (marked `NonShootDate.pattern = true` when added) — hand-made statuses and event cards are never touched or removed (a removed day's cards/notes survive with the status stripped). The flag is STICKY: `upsertNonShootDate` carries it across status edits, so a generated day off cycled through another status stays generated.
- **Invariant**: the section date cursor skips statused dates (`computeRowData` `getDate`) — a section can never sit on a statused date. Consequence: the reports `dayType` field (Days group) prints the day's status or its first card type; it prints EMPTY only for truly unmarked days — not a bug; don't "fix" it by shifting the cursor.

### Element Links (roadmap 44)
- One-way, anchor-based: `project.elementLinks: ElementLink[]` (flat; `{id, anchorCategory, anchorValue, linkedCategory, linkedValue}`) — anchor values via `elementMatchId` (cast = Board ID, others = name; name matching case-insensitive). No bidirectional index — derive anchor-of by scan (`getAnchorLinks`).
- **One canonical module: `src/lib/elementLinks.ts`** — `computePropagation` (anchors added between before/after → linked values), `computeRemovedLinks`/`cascadeRemoval` (anchor removal with remaining links = warning + cascade), `applyLinkToScenes` (retroactive), `addValueToField` (`isMultiValue`-aware; single-value fields only take the value when empty — never clobber). Re-derive nothing from it.
- **Write-path seam: `useLinkedEditGuard(links, customCategories, dispatch).tryCommitSceneEdit(scene, updates)`** instead of raw `UPDATE_SCENE` for entity-field edits — wired in SceneSheet `commitField`, Glide `commitEdit` (erase/paste route through it), stripboard/boneyard `updateScene` (SortableRibbon takes an `elementLinks` prop — memo-compared; per-row components MUST NOT call `useProject()`). Removal with links → ui-kit `dialog.confirm`; cancel = edit not applied, confirm = cascade.
- Link Manager = `elements/LinkManagerModal.tsx` (Element Manager → Links, header + action bar): **grouped anchor cards** — each card = anchor picker + linked-element rows (one row per category); links dispatch immediately (`UPDATE_PROJECT`, exact-duplicate dedupe). Linked rows + anchor pickers are the shared `rules/ElementPicker.tsx` `ElementPickerRow` (extracted from Color Rules' `RuleConditionRow` — extend the shared ones, never fork): CategoryDropdown + `EntityDropdown variant="chip"` — the **day-status modal pattern** (TravelHoldModal): dark chip trigger + dark dropdown panel (`DropdownPanel dark`), type-to-filter, multi-mode per category (one link per comma value via `getFieldItems`). Per-card Apply (retroactive, batch = one undo entry) + footer Apply All. Cast renders like the Glide ("1. FISHERMAN", `—` fallback). **One linked row per category per card** — "Add Linked Element" prefills the next unused category; changing a row's category onto an already-used one merges the values into that row (no duplicate rows). **Single-highlight rule (all `DropdownPanel`s, both themes)**: no CSS hover fills — `highlightedIndex` is written by pointer hover (`onItemHover`) AND the keyboard arrows (latest wins; `onHoverLeave` clears pointer-driven highlights); checked rows stay distinct (dark: Check glyph; light: blue bg). Modal pickers use `EntityDropdown variant="chip"` — see `docs/DESIGN-LANGUAGE.md` §EntityDropdown chip version.
- `notes` is not linkable; **Sets are anchor-only** — a set can be an anchor, never a linked target (adding a set replaces the field, so a set-target link would silently never apply; not offered in the linked category menu). Custom single-value categories stay linkable. Escape inside any open dropdown (`useEscapeCapture`, `lib/dropdown.ts`) dismisses ONLY the dropdown — never the enclosing modal.

## Tabs & Toolbars
- Top tabs (App header): breakdown, schedule, calendar, design, rules, reports. Shift+click / right-click = pop-out (desktop only, `!IS_COARSE`).
- `PageToolbar` (`src/components/PageToolbar.tsx`): reusable toolbar with optional sub-tabs. Active tab `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud: `bg-blue-950 text-blue-50`); inactive `text-zinc-500 hover:text-zinc-900`. Scrolls horizontally with edge fades. Usage: Breakdown (light; Sheet/Element Manager/Glide Breakdown), Design (dark; Ribbon Designer/Colors), Reports (dark; DOODs/Element Breakdown), Schedule (light, justify end, no tabs), Calendar (two light instances).
- **Header portal pattern**: parent puts `<div ref>` in `rightContent`; child accepts `headerTarget` and `createPortal`s its controls there (fallback: inline). Used by ElementManager, SceneSheet, GlideBreakdownTab, ColorsTab, RibbonTab.
- **Scene sheet view order** (`SceneSheet.tsx`): view-only pref `lemon_schedule_breakdown_order` (`sheet | sceneNumber | stripboard`, `usePersistState` — the object form `{order}`). A sorted COPY drives rendering/navigation — `project.scenes` is never reordered; the Sheet # column always shows the TRUE sheet number (array index + 1). `naturalSortSceneStrings`; stripboard order = active version's SCENE rows, boneyard scenes appended. `initialIndex` echo-guarded (`lastReportedIndexRef`) so the App→prop feedback doesn't yoyo the position in non-sheet orders.
- **Cloud coloring**: cloud projects switch light PageToolbars to `bg-blue-950` (active tabs/buttons); derive via `useIsCloudProject()`. Dark toolbars unaffected.

## UI Primitives (use these, not raw HTML)
- **Design language: `docs/DESIGN-LANGUAGE.md` is the canonical booklet — read it before building/changing any UI, and update it in the same commit when you change a shared pattern or bump the ui-kit** (principles → exact class recipes → primitive matrix → feedback taxonomy → anti-patterns).
- **Overlay morph (menus/panels/modals)**: every floating surface shares the modal FLIP motion language via kit `overlayMorph.ts` (`useOverlayMorph` — trigger-anchored scale+fade, animated close, `prefers-reduced-motion` + `localStorage lemon_schedule_modal_morph === '0'` opt-out; see DESIGN-LANGUAGE §Modal anatomy). New dropdown-like surfaces MUST use it (app shims in `src/components/` inject the opt-out key). Don't re-create menu/panel positioning, morphing, or Esc handling.
- `DropdownMenu`/`DropdownItem`/`DropdownDivider`/`DropdownSubmenu` (Radix click-to-toggle), `Modal`+`ModalFooter` (draggable; no manual resize — auto-fits content), `ContextMenu`/`ContextMenuItem`/`ContextMenuDivider` (fixed-position), `CellInput` (inline text, Enter confirm/Escape cancel; **commits on blur only — never per keystroke**), `EntityDropdown` (see below), `PageToolbar`, `Button` (ui-kit toolbar button — `subtle`/`primary`/`danger-ghost` variants, `cloud` prop for cloud coloring, `theme="dark"`; icon-only nav + status pills stay bespoke), `ColorField`, `Tooltip`, `FloatingTooltip`.
- **Modal body rules**: wrap body in `<div className="p-6 space-y-5">`; labeled rows `flex items-center justify-between py-1` (label `text-xs text-zinc-300`, annotations `text-zinc-500`); segmented toggles `flex border border-zinc-700 rounded p-0.5` (selected `bg-white text-zinc-900`). **Footer buttons — one hero, rest ghost**: every modal footer has exactly ONE hero button = the primary action (kit `ModalFooterButton`, default `variant` — solid `bg-zinc-800`, e.g. "+ New Project"); EVERY other button — Cancel, secondary actions, Import — is `variant="ghost"` (e.g. "Import"). Destructive: `variant="danger"` (ghost, `mr-auto`) for Delete, `variant="danger-solid"` for red confirms. Never hand-write footer button classes.
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
- ALL ribbon cells MUST use `getRibbonCellBaseStyle(cell, cellPaddingV?, cellPaddingH?, span?, textSize?)` — never hardcode cell padding/font/text styles. Effective per-cell size = `ribCellTextSize(master, cell)` (master `RibbonDesign.textSize`, default 14 for new designs; legacy unset = 8pt rendering; `RibbonCell.textSizeOffset` −8…+8). All renderers (stripboard, print, designer canvas/preview, reports ribbon block) thread the master through; `SET_RIBBON_TEXT_SIZE` setter.
- Scene cell padding `cellPaddingV/H ?? 3`; banner pad `getNoteBreakPad(cellPaddingV, rowCount)` = `cellPaddingV * N + 6 * (N-1)` (matches scene height). `edgePadding` (default 3) applies to the outer ribbon container only.
- Padding/edge/textSize stored per `RibbonDesign`; setters `SET_RIBBON_CELL_PADDING_V/H`, `SET_RIBBON_EDGE_PADDING`, `SET_RIBBON_TEXT_SIZE`. Pass through ScheduleTab → StripBlock → SortableRibbon, PrintSchedule/DaySection, PrintDialog, RibbonTab. RibbonToolbar numeric boxes are `LiveNumberInput` (free-typed draft, commit clamps on change, Enter/blur finalize, Escape reverts) — never a clamped controlled input.
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

## Import/Export
Read `docs/IMPORT-EXPORT.md` before any import/export work (the single manual
for the `src/lib/import/` barrel). Key gates to remember: append parsers
CSV/FDX/Fountain → `ImportResult`; **MSD/SEX are NEW-PROJECT-ONLY** (build a
complete `Project` via `importProjectFromData` — no append, no review stage);
`commitImport()` batches dispatches into one undo entry; golden fixtures +
reference parsers live in `tools/` / `e2e/fixtures/`.

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
- Then it **updates the docs itself**: loads the `write-agent-docs` skill, applies the `docs/*.md`/AGENTS.md updates its change calls for, and flips the item's `docs/ROADMAP.md` status `[ ]` → `[x]` with a one-line "Done:" note. Completed items' FULL narratives stay in git history; the live roadmap keeps only open items, and the completed index (`docs/ROADMAP-ARCHIVE.md`) is refreshed when an item closes.

## Requests & Triage (new asks → roadmap)
- **All feature asks funnel into `docs/ROADMAP.md` — no orphan features.** Before starting any work from a user ask (or numbering a new item), run the dedupe search in this order: live `docs/ROADMAP.md` → `docs/ROADMAP-ARCHIVE.md` (completed index) → AGENTS.md + `docs/*.md` → `git log --oneline --grep=<term>` → source code.
- Outcome: ask matches an **open** item → tell the user and run/merge into that item, never add a duplicate; matches an **in-progress** item → never implement in parallel; matches a **done** item → answer with the pointer (AGENTS.md/doc section + code path), no new work; overlaps **several** items → merge into ONE item; matches nothing → new numbered item.
- Items that relate to each other carry a `Relations:` line (`depends on` / `merges` / `supersedes` / `blocked by`) so future workers see the graph without re-reading the archive.
- **Doc budgets** (measured with `wc -l`): `AGENTS.md` ≤ ~200 lines — it is loaded every session, so when a section is added, compact or move detail to `docs/*.md` (see `write-agent-docs` skill, Maintenance); per-feature `docs/*.md` ≤ ~200-400 lines each; the roadmap archive is index-only.

- **Optional second pair of eyes**: dispatch the `code-reviewer` subagent (read-only) on `git diff` whenever you want an independent pass before or after committing docs.
- **Phone notifications**: the agent pings ntfy (`NTFY_TOPIC` in `.env`, subscribed in the ntfy iOS app) before asking a blocking question and when the item is done — the streaming tab can sit idle; the phone still pings.
## Legacy parallel machinery (REMOVED — do not use)
- The old worktree-orchestration pipeline was retired and removed from disk: `orchestrator`/`docs-curator` agents, `/spawn-feature` `/roadmap-sprint` `/cleanup-worker` commands, the `orchestrate-roadmap` skill, and the phone web-hub scripts (`hub-server.mjs`/`npm run hub`, `start-web.sh`, `tui.sh`, `preview-workers.sh`, `worker-ports.sh`, `watch-workers.sh`) plus the `~/.zshrc` autostart guard. If ever revived, all removed files are preserved in `.opencode/.trash-deprecated/`. The `code-reviewer` subagent stays LIVE as the on-demand reviewer.

## File Layout (post-refactor — see `plans/archive/REFACTOR-PLAN.md`)
- `src/store/` — barrel + storage/reducer(+actions)/provider/rows
- `src/lib/` — shared: `sceneFactory`, `glideCells`, `glidePaste`, `glideEditor`, `elements`, `paletteOps`, `mergeGroups`, `sceneColors`, `ribbonDefaults` (ribbonUtils re-exports these), `useStripboardContextMenu`, `useDriveProjectList`, `import/`
- `src/components/schedule/` — Toolbar/ContextMenu/Modals/Overlays + hooks (`useScheduleKeyboard`, `useScheduleDrag`, `useBoneyardSort`) — ScheduleTab is the composition root
- `src/components/calendar/` — SceneCard/DayCell/BoneyardSidebar/calendarUtils + hooks (`useCalendarKeyboard`, `useCalendarDrag`)
- `src/components/ribbon/` — row renderers (`SortableRow*`, `rowRenderTypes` RowRenderCtx), RibbonPalette/Toolbar/DesignerGrid/LivePreview/ContextMenu
- `src/components/print/` — PrintRowParts (PrintRowCtx), CastListPrint, printLayout, printStyles
- `src/components/{popout,elements,rules}/` + top-level AppHeader/OfflineStatus/ProjectCard/NewProjectModal/ColorRuleCard(+Meta)/projectManagerStyles
