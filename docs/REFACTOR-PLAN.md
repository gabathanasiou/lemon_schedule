# Monolith Refactor Plan

Branch: `refactor/split-monoliths` · Started: 2026-08-01 · **STATUS: COMPLETE**

## Results (all phases landed)

| File | Before | After |
|---|---|---|
| `ScheduleTab.tsx` | 2559 | 2031 (+ `schedule/` 4 files) |
| `CalendarTab.tsx` | 2052 | 1558 (+ `calendar/` 4 files) |
| `store.tsx` | 2050 | deleted → `store/` barrel |
| `SortableRibbon.tsx` | 1473 | 745 (+ `ribbon/` 5 files) |
| `App.tsx` | 1325 | 1081 (+ `AppHeader`, `OfflineStatus`) |
| `RibbonTab.tsx` | 1324 | 1047 (+ `ribbon/` 3 files) |
| `BreakdownTabGlide.tsx` | 1089 | 1051 (+ `lib/glideCells`, `lib/sceneFactory`) |
| `PrintSchedule.tsx` | 908 | 236 (+ `print/` 4 files) |
| `ElementManager.tsx` | 865 | 700 (+ `elements/CategoryModals`, `lib/elements`) |
| `ProjectManager.tsx` | 810 | 672 (+ `ProjectCard`, `NewProjectModal`) |
| `importScreenplay.ts` | 736 | deleted → `lib/import/` 7 files |
| `ColorsTab.tsx` | 675 | 558 (+ `ColorRuleCard`, `lib/paletteOps`) |
| `ribbonUtils.ts` | 541 | 151 (re-export shim + `mergeGroups`/`sceneColors`/`ribbonDefaults`) |

**Dedup consolidation delivered:** `formatDateLong` (PrintSchedule now imports from utils), blank-scene factory 5× → 1, RuleCard remount bug fixed, 3 category modals → 1 shared form, palette helpers moved to lib, ProjectManager drive-fetch duplication documented (left as-is, low risk/benefit).

**Verification:** `npm run lint` (tsc) clean after every commit; Playwright suite grown from 5 broken tests to **16 green** (incl. seeded-project smoke tests for schedule/calendar/glide/designer/print, print-flow regression, daybreak context action, keyboard navigation).

## Follow-up pass (Aug 2026, 15 more branches)

| Branch | Change | Before → After |
|---|---|---|
| `refactor/context-menu-dedup` | ScheduleTab adopts shared `useStripboardContextMenu` (+`enableDaybreaks`); ~230 duplicated lines deleted | 2031 → 1798 |
| `refactor/entity-dropdown-split` | `DropdownPanel` + `lib/dropdownItems` + DD classes consolidated into `lib/dropdown` | 689 → 613 |
| `refactor/calendar-keyboard-hook` | `calendar/useCalendarKeyboard` (selection nav + clipboard effects) | 1558 → 1414 |
| `refactor/glide-paste-engine` | `lib/glidePaste.planPaste()` pure planner | — |
| `refactor/pm-drive-hook` | `lib/useDriveProjectList` (dup fetch logic removed) | 810 → 573 |
| `refactor/schedule-keyboard-hook` | `schedule/useScheduleKeyboard` (7 effects) | 1798 → 1552 |
| `refactor/glide-editor-factory` | `lib/glideEditor.createGlideCellEditor()` | 1051 → 947 |
| `refactor/color-rule-modal-split` | `rules/ColorRuleFormParts` (condition row, override, matrix editor) | 447 → 276 |
| `refactor/ribbon-canvas-split` | `RibbonDesignerGrid` / `RibbonLivePreview` / `RibbonContextMenu` | 1047 → 782 |
| `refactor/app-popouts` | `popout/PopoutFrames` (PopoutFrame, SubTabPopoutFrame, ReportCategorySidebar dedup) | 1081 → 883 |
| `refactor/store-domain-reducers` | `store/actions/{schedule,breakdown,design}` + `store/rows` | reducer 1143 → 365 |
| `refactor/schedule-drag-hook` | `schedule/useScheduleDrag` (day swaps, multi-row reorder, boneyard) | 1552 → 1409 |
| `refactor/boneyard-sort-hook` | `schedule/useBoneyardSort` (locked-criteria scene sorting) | 436 → 327 |
| `refactor/scene-sheet-split` | `SceneSheetFields` (header table + category grid) | 415 → 372 |

**Final largest files:** ScheduleTab 1409 (composition root), CalendarTab 1142, BreakdownTabGlide 947, App 883, RibbonTab 782 — all down from 1300-2600-line monoliths.

## Goal

Split the largest, hardest-to-maintain files in the codebase into smaller,
focused modules — WITHOUT changing any runtime behavior. Every refactor is a
**mechanical move** (code is relocated, not rewritten), verified by `tsc`
(`npm run lint`) after each commit and the Playwright E2E suite at milestones.

## Guiding principles (kept simple on purpose)

1. **Move code, don't rewrite it.** No behavior changes, no new abstractions.
   If a chunk needs more than trivial edits to move, it stays put.
2. **Composition roots stay.** Each tab component keeps its state/refs wiring;
   we extract *presentational* JSX and *pure* logic only.
3. **Barrel exports for zero-touch imports.** `src/store/` (directory) replaces
   `src/store.tsx` so existing `'../store'` imports keep working. Files that
   re-export (`ribbonUtils.ts`) keep all their public exports intact.
4. **Dead code goes.** Verified-unused functions/imports/state are removed
   (each verified with grep before removal).
5. **Dedup consolidation** only where the duplication is confirmed identical
   (e.g. `formatDateLong` in PrintSchedule vs utils, blank-scene literal 4x in
   Glide, RuleCard defined inside ColorsTab).
6. **Commit after each major piece** so every commit is independently
   revertible.

## Baseline (Aug 2026)

| File | Lines | Notes |
|---|---|---|
| `src/components/ScheduleTab.tsx` | 2559 | single 2,470-line component |
| `src/components/CalendarTab.tsx` | 2052 | 5 module-level sub-components in one file |
| `src/store.tsx` | 2050 | storage + 58-action reducer + provider + context |
| `src/components/SortableRibbon.tsx` | 1473 | `SortableRowContent` is 1,300 lines |
| `src/App.tsx` | 1325 | `AppContent` with 30+ states |
| `src/components/RibbonTab.tsx` | 1324 | toolbar/palette/canvas/preview |
| `src/components/BreakdownTabGlide.tsx` | 1089 | clipboard + editors + grid |
| `src/components/PrintSchedule.tsx` | 908 | 4 giant row-type renderers |
| `src/components/ElementManager.tsx` | 865 | `performSave` engine + 4 modals |
| `src/components/ProjectManager.tsx` | 810 | duplicate drive-fetch ×2, ProjectCard inline |
| `src/lib/importScreenplay.ts` | 736 | CSV+FDX+Fountain+commit+export |
| `src/components/EntityDropdown.tsx` | 689 | 110-line `onKeyDown` |
| `src/components/ColorsTab.tsx` | 675 | `RuleCard` defined inside component |
| `src/lib/ribbonUtils.ts` | 541 | 4 cohesive groups |

## Verified duplications (to consolidate)

1. `formatDateLong` — identical copy in `PrintSchedule.tsx` vs `utils.ts`
2. Blank-scene literal — 4× in `BreakdownTabGlide.tsx`, 1× in `importScreenplay.ts`
3. `RuleCard` defined **inside** `ColorsTab` → remounts every render (drag perf bug)
4. Dropdown class systems — `EntityDropdown.tsx` `DD_*_CLASS` vs `dropdown.ts` `DD_*`
5. Palette helpers (`findEntry`/`clonePalette`/`updateSceneColor`) stranded in `ColorsTab`
6. `fmt` closure in `PrintSchedule` re-implements `ribbonUtils.formatCellText`
7. ScheduleTab re-implements context-menu/clipboard logic that exists in `useStripboardContextMenu.ts` (lib, used by CalendarTab)
8. `ProjectManager` duplicate drive-fetch logic (two ~40-line blocks)
9. `IS_COARSE` sizing class constants repeated in ColorsTab/RibbonTab/ElementManager

## Execution phases

| # | Phase | Target lines → | New files | Risk |
|---|---|---|---|---|
| 0 | Baseline: lint + e2e pass, seed-data helper for Playwright | — | `e2e/helpers/seed.ts` | — |
| 1 | `store.tsx` → `src/store/` | 2050 → ~30 (barrel) | `src/store/{storage.ts,reducer.ts,provider.tsx,index.ts}` | med |
| 2 | `importScreenplay.ts` → `src/lib/import/` | 736 → barrel | `src/lib/import/{types,fdx,fountain,csv,shared,commitImport,exportCsv}.ts` | med |
| 3 | `ScheduleTab.tsx` extraction | 2559 → ~1500 | `schedule/ScheduleToolbar.tsx`, `schedule/ScheduleContextMenu.tsx`, `schedule/ScheduleModals.tsx`, `schedule/ScheduleOverlays.tsx`, + move `computeMiddleInsertIndex` → `lib/daybreakUtils.ts` | med |
| 4 | `CalendarTab.tsx` extraction | 2052 → ~1100 | `calendar/{SceneCard,DayCell,BoneyardSidebar}.tsx`, `calendar/calendarUtils.ts` | med |
| 5 | `SortableRibbon.tsx` extraction | 1473 → ~900 | `SortableRowNote.tsx`, `SortableRowBreak.tsx`, `SortableRowDaybreak.tsx`, `SortableRowScene.tsx` | high |
| 6 | `App.tsx` extraction | 1325 → ~700 | `AppHeader.tsx`, `TabBar.tsx`, `OfflineBanner.tsx`, `AppModals.tsx` | low |
| 7 | `RibbonTab.tsx` | 1324 → ~800 | `ribbon/RibbonPalette.tsx`, `ribbon/RibbonToolbar.tsx`, `ribbon/RibbonDesignerGrid.tsx`, `ribbon/RibbonContextMenu.tsx` | low |
| 8 | `BreakdownTabGlide.tsx` | 1089 → ~700 | `lib/sceneFactory.ts` (shared), `lib/glideClipboard.ts`, `lib/glideCells.ts` | med |
| 9 | `PrintSchedule.tsx` | 908 → ~300 | `print/{PrintNoteRow,PrintBreakRow,PrintDaybreakRow,PrintSceneRow,PrintSectionHeader,PrintSectionFooter}.tsx`, `print/printStyles.ts` | low |
| 10 | `ElementManager.tsx` | 865 → ~450 | `lib/elementDiff.ts`, `elements/{CategoryFormModal,ElementsTable}.tsx` | med |
| 11 | `ProjectManager.tsx` | 810 → ~450 | `lib/useDriveProjectList.ts`, `ProjectCard.tsx` | low |
| 12 | `EntityDropdown.tsx` | 689 → ~450 | `lib/dropdownCommit.ts`, `DropdownPanel.tsx` | med |
| 13 | `ColorsTab.tsx` | 675 → ~400 | `ColorRuleCard.tsx` (fixes remount), `lib/paletteOps.ts` | low |
| 14 | `ribbonUtils.ts` + shared components | 541 → ~250 | `lib/mergeGroups.ts`, `lib/sceneColors.ts`, `lib/ribbonDefaults.ts` + dedup consolidation | low |

## Verification strategy

- **After every commit:** `npm run lint` (tsc --noEmit, catches missed imports/refs)
- **At phase boundaries:** `npx playwright test` (full suite; auto-starts dev server on 3001)
- **Spot checks:** manual `npm run dev` smoke test on schedule/calendar/glide tabs
  with the seeded "Town - Jason" project

## Test-data seeding

`e2e/helpers/seed.ts` writes the "Town - Jason" project (exported `.lemon` JSON)
into `localStorage` before the app boots, using the app's own storage contract:
- Project data key: `lemon_schedule_project_v1_{id}`
- Index key: `lemon_schedule_project_index` → `[{ id, title, lastModified, createdAt }]`

Used by new smoke tests that exercise the real project (schedule stripboard,
daybreak sections, calendar month view, glide breakdown).
