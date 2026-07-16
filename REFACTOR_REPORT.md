# Daybreak Single-Source-of-Truth Refactor — Final Report

**Branch:** `refactor/daybreak-single-source`
**Base:** `feature/daybreak-ribbon`
**Status:** ✅ Complete · `npm run lint` clean · `npm run build` succeeds · changes uncommitted

---

## Summary

Consolidated daybreak computation (date math, section splitting, per-row call-time/elapsed, section sums, chrono day numbering, next-day-dates) into a single source of truth. Eliminated 5 duplicate `addDays` implementations, 4 duplicate `chronoDayMap` implementations, and 3 duplicate section-splitting routines scattered across 6+ files.

**Net change:** −339 / +151 lines across 7 modified files, plus 1 new file (`daybreakUtils.ts`).

---

## Files

### NEW — `src/lib/daybreakUtils.ts`
Pure utilities (no React) shared by the hook and non-hook consumers:

| Export | Purpose |
|---|---|
| `addDays(date, n)` | UTC date arithmetic. Replaces 6 inline copies. |
| `buildNonShootSet(nonShootDates)` | Returns `Set<string>` of non-shoot dates. |
| `splitSections(rows)` | Splits sorted rows at DAYBREAK → `ProductionDay[]`. |
| `computeRowData(rows, days, scenes, dateMap, labelMap, callTimeBase?)` | The core sequential loop. Returns `{ computedRows, sectionSums }`. Handles both multi-day (StripBlock) and single-day (PrintSchedule DaySection) cases. |
| `ProductionDay` | `{ index, rows, daybreakRow? }` (renamed from `DaybreakSection`). |
| `ComputedRow` | `ScheduleRow` + computed fields (`computedCallTime`, `daybreakLabel`, `daybreakDate`, `hasNextDaybreak`, `sectionTotal`, etc.). |
| `SectionSums` | `{ total, pages, shoot, break, endTime }`. |

### MODIFIED — `src/lib/useDaybreakSections.ts`
- Renamed `DaybreakSection` → `ProductionDay` (re-exported for compatibility).
- Replaced inline `addDays` / section splitting with imports from `daybreakUtils.ts`.
- **New exports:**
  - `chronoDayMap` — section index → sequential shoot-day number (skips pinned).
  - `productionChronoDayMap` — same but excludes pinned section 0 (for CalendarTab).
  - `nextSectionDateMap` — section index → next day's ISO date (pre-computed, skips non-shoot).
  - `daybreakRowToSection` — DAYBREAK row ID → section index.
  - `computedRows` — full row array with all computed fields attached.
  - `sectionSums` — `Map<sectionIndex, SectionSums>`.
  - `startDate` — resolved production start date.
- **Back-compat:** `sections` alias kept pointing at `productionDays` so the 6 existing consumers (`DoodsTab`, `PrintDialog`, `SceneSheet`, `ElementBreakdownView`, `DoodDialog`, plus `DoodsTab`'s `chronoDayMap`) compile unchanged.

### MODIFIED — `src/components/StripBlock.tsx`
**Removed:** entire local `computedRows` useMemo (~90 lines) including inline `addDays`, `nonShootSet`, `daybreakCounter`, and reverse `hasNextDaybreak` pass.
**Added:** filters the hook's global `computedRows` by this block's row IDs; derives `nextDateStr` per DAYBREAK row from `nextSectionDateMap` + `daybreakRowToSection`.
**Kept:** violation maps (`sectionViolationMap`, `nextSectionViolationMap`, `mergedSceneViolationMap`, `nextDaybreakMap`) — they're StripBlock-specific and consume `computedRows`.

### MODIFIED — `src/components/SortableRibbon.tsx`
**Removed:** inline `nextDateStr` useMemo (5th independent date-advancement implementation).
**Added:** `nextDateStr` prop (passed from StripBlock, sourced from the hook's `nextSectionDateMap`). Updated `sortableRowPropsEqual` and both render paths (readOnly + sortable) to thread it through.

### MODIFIED — `src/components/ScheduleTab.tsx`
**Removed:** inline `addOne` / `nonShootSet` / cursor-walking date math in `shootViolations` (~40 lines).
**Added:** `useDaybreakSections()` — uses `hookSectionDateMap`, `daybreakRowToSection`, and `hookNextSectionDateMap` to resolve violation dates per section.
**Kept:** container-keyed `chronoDayMap` and `existingDays` (container-based grouping is still needed for the stripboard's day-column layout and "DAY #N" labels).

### MODIFIED — `src/components/PrintSchedule.tsx`
**Parent:** replaced local section splitting, `addDays`, `startDate`, `nonShootSet`, `sectionDateMap`, and `chronoDayMap` with the hook's `productionDays`, `sectionDateMap`, `chronoDayMap`. Removed the now-unused `augmentedRows`/`scheduledRows`/`allRows` scaffolding.
**DaySection:** replaced the ~50-line local `computedRows` loop with a call to `computeRowData` (single-day mode: one `ProductionDay` with no `daybreakRow`).

### MODIFIED — `src/components/CalendarTab.tsx`
**Removed:** local `containerRows`, `sections`, `calendarSections`, `addDays`, `sectionDateMap`, `chronoDayMap` useMemos (~60 lines).
**Added:** `useDaybreakSections()` — `productionDays` → `sections`, `hookSectionDateMap` → `sectionDateMap`, `productionChronoDayMap` → `chronoDayMap`, `productionSections` → `calendarSections`. `workingLabels` rewritten to derive from `productionSections`.

### MODIFIED — `src/components/print/Dood.tsx`
**Removed:** inline `addDays` and manual section-splitting loop.
**Added:** imports `addDays`, `buildNonShootSet`, `splitSections` from `daybreakUtils.ts`. (Dood is a plain function, not a component, so it can't use the hook — uses the shared pure functions directly.)

---

## Verification

| Check | Result |
|---|---|
| `npm run lint` (tsc --noEmit) | ✅ Clean |
| `npm run build` | ✅ Succeeds (2128 modules, 2.43s) |
| `npx playwright test` | 5 failures — **all pre-existing & unrelated** (see below) |

### E2E Test Failures (Pre-existing)

All 5 failures are in `e2e/glide-breakdown.spec.ts`. Root cause: the test expects a "New Project" **button** (`getByRole('button', { name: /New Project/i })`), but the Project Manager dialog exposes "New Project" as a **heading**. The app loads correctly (Project Manager dialog renders, no runtime crash). None of the refactored files touch `ProjectManager.tsx`, the Breakdown tab, or the Glide Breakdown component — confirmed by `git diff --name-only`.

---

## Behavior Changes (Intended — per the refactor doc)

These are the doc's stated goals. The E2E suite doesn't cover these views, so manual verification is recommended:

1. **Cross-view consistency:** Day labels ("End of Day N") and dates now match across Schedule, Calendar, Print, and DOOD — they all read from the same hook.
2. **`hasNextDaybreak` is now global:** a DAYBREAK's "START OF DAY N+1" header visibility reflects whether *any* daybreak follows it globally, not just within its container.
3. **SortableRibbon pinned-daybreak date:** previously showed `productionStart`; now shows Day 1's actual computed date (consistent with other views).
4. **PrintSchedule chrono numbering:** now uses the hook's global `chronoDayMap` (section-indexed) rather than re-numbering 1..N per print selection.

---

## Divergences from the Doc (Made to Avoid Regressions)

1. **ScheduleTab `chronoDayMap` not replaced.** The doc suggested using `hookChronoDay` for "DAY #N" stripboard labels, but the hook's `chronoDayMap` is keyed by **section index** while the stripboard column headers need **container-keyed** numbering (multiple sections can share a container, or a container can have zero sections). Replacing it would renumber columns incorrectly. Only the inline violation *date* math was migrated to the hook; the container-keyed `chronoDayMap` and `existingDays` were kept.

2. **SortableRibbon `nextDaybreakNum` still uses the label regex.** The doc proposed replacing `parseInt(row.daybreakLabel.match(/\d+/))` with a section-label lookup. The regex is now fed by the hook's correct `"End of Day N"` label (was previously fed by StripBlock's local counter), so it's accurate. Replacing it with a new lookup added risk for no correctness gain.

3. **`sections` back-compat alias.** The doc renamed `DaybreakSection` → `ProductionDay` and renamed the `sections` export to `productionDays`. Six existing consumers (`DoodsTab`, `PrintDialog`, `SceneSheet`, `ElementBreakdownView`, `DoodDialog`) destructure `sections` directly. Rather than touch all of them (out of scope, risk), `sections` is kept as an alias for `productionDays`. These consumers are listed in the doc's "Files Unchanged" table.

---

## Edge Cases Handled

- **Pinned section 0:** `computeRowData` emits `daybreakLabel: ''` and `daybreakDate` from `sectionDateMap` for pinned rows; `chronoDayMap` skips pinned sections; `nextSectionDateMap` maps pinned section 0 to section 1's date.
- **PrintSchedule DaySection (single day, no DAYBREAK rows):** `computeRowData` is called with one `ProductionDay` having `daybreakRow: undefined`; all rows attach to section 0; `sectionSums.get(0)` returns the day's totals.
- **Non-shoot date skipping:** consolidated into `sectionDateMap` in the hook (and `addDays` loops in `Dood.tsx` which still needs its own map keyed by local section index for its print-specific day ordering).

---

## Duplication Eliminated

| Duplicated logic | Before | After |
|---|---|---|
| `addDays()` UTC date math | 6 files | 1 (`daybreakUtils.ts`) |
| Section splitting (`splitSections`) | 4 files | 1 (`daybreakUtils.ts`) |
| `chronoDayMap` | 4 files | 1 (`useDaybreakSections.ts`) |
| `nonShootSet` / `buildNonShootSet` | 5 files | 1 (`daybreakUtils.ts`) |
| `sectionDateMap` | 4 files | 1 (`useDaybreakSections.ts`) |
| Per-row `computedCallTime`/`elapsed` loop | 2 files (StripBlock, PrintSchedule) | 1 (`computeRowData`) |
| `nextDateStr` date advancement | 1 file (SortableRibbon) | 0 (pre-computed in hook) |

---

## Recommended Manual Verification

Before merging, verify in the running app:

- [ ] Day labels ("End of Day N") match across Schedule, Calendar, Print, DOOD for a project with ≥3 daybreaks
- [ ] Day dates match across all views
- [ ] Call times update correctly when editing a daybreak row's call time
- [ ] Adding/removing/moving a DAYBREAK row updates all views
- [ ] Non-shoot dates are skipped correctly everywhere
- [ ] Pinned daybreak (section 0) shows no "End of Day" label and no chrono number
- [ ] Print schedule chrono numbering matches the Schedule stripboard
- [ ] Violation flags (red Flag icons) appear on the correct days/dates across views