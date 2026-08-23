# Daybreak Single-Source-of-Truth Refactor

## Problem

Daybreak-related data (day labels, dates, call times, section totals, chrono day numbers) is computed independently in **6+ files** with no shared source of truth. This causes:

- Schedule tab showing stale/wrong day data vs Calendar/Print/DOOD views
- Inconsistent date math across views (5 independent `addDays` implementations)
- Bug risk: fixing a date computation in one file doesn't fix it in others

## Terminology

| Term | Meaning |
|---|---|
| **`ProductionDay`** | A group of rows between two DAYBREAK rows — represents one day in the production schedule. Pinned section 0 is an empty `ProductionDay` before shooting starts. |
| **`ComputedRow`** | A `ScheduleRow` from the store with extra computed daybreak properties attached (`computedCallTime`, `daybreakLabel`, `sectionTotal`, etc.). Same row, enriched with data. |
| **`SectionSums`** | Per-day summary stats: total elapsed, pages, shoot time, break time, end time. |
| **`useDaybreakSections`** | The single-source-of-truth React hook. Reads `activeVersion.rows`, builds `ProductionDay[]`, computes all dates/labels/sums. |

**Note:** `ComputedRow` is distinct from the old `augmentedRows` pattern (now removed — every scene in the project always has a real `ScheduleRow` in every version, so no synthetic/ghost rows exist).

## Current State: Duplication Matrix

| Computed Property | `useDaybreakSections` | StripBlock | PrintSchedule | CalendarTab | ScheduleTab | SortableRibbon | Dood.tsx |
|---|---|---|---|---|---|---|---|
| Sections splitting | YES | -- | duplicate | duplicate | -- | -- | duplicate |
| `addDays()` | YES | duplicate | duplicate | duplicate | duplicate | -- | duplicate |
| `nonShootSet` | YES | duplicate | duplicate | duplicate | duplicate | -- | duplicate |
| `startDate` / productionStart | YES | duplicate | duplicate | duplicate | duplicate | -- | duplicate |
| `sectionDateMap` | YES | -- | duplicate | duplicate (different keys) | inline | -- | duplicate |
| `sectionLabelMap` | YES | -- | -- | -- | -- | -- | -- |
| `sceneToSection` | YES | -- | -- | -- | -- | -- | -- |
| `chronoDayMap` | **NO** | -- | duplicate | duplicate | duplicate | -- | -- |
| `computedCallTime` per row | **NO** | YES | YES (per-section) | -- | -- | consumes | -- |
| `computedElapsed` per row | **NO** | YES | YES (per-section) | -- | -- | consumes | -- |
| `daybreakLabel` | **NO** | YES | consumes | -- | -- | consumes | -- |
| `daybreakDate` | **NO** | YES | -- | -- | -- | consumes | -- |
| `hasNextDaybreak` | **NO** | YES | -- | -- | -- | consumes | -- |
| `sectionTotal` | **NO** | YES | YES | -- | -- | consumes | -- |
| `sectionPages` | **NO** | YES | YES | -- | -- | consumes | -- |
| `sectionShoot` | **NO** | YES | YES | -- | -- | consumes | -- |
| `sectionBreak` | **NO** | YES | YES | -- | -- | consumes | -- |
| `sectionEndTime` | **NO** | YES | YES | -- | -- | consumes | -- |
| `nextDaybreakMap` | **NO** | YES | -- | -- | -- | consumes (via prop) | -- |
| `nextDateStr` (next day's date) | **NO** | -- | -- | -- | -- | own computation | -- |

## Source of Truth

`useDaybreakSections` (`src/lib/useDaybreakSections.ts`) is the existing hook that:
- Reads from `activeVersion.rows` (the real stripboard data)
- Splits rows at DAYBREAK boundaries into `ProductionDay[]`
- Computes `sectionDateMap` (section index → ISO date)
- Computes `sectionLabelMap` (section index → "Day N")
- Already used by: DoodsTab, PrintDialog, SceneSheet, ElementBreakdownView, DoodDialog

The data flow after refactor:

```
activeVersion.rows (store)
    ↓
useDaybreakSections recomputes on every row change
    ↓
All consumers get updated data:
  ├── StripBlock (Schedule tab)
  ├── SortableRibbon → "End of Day N" / "START OF DAY N+1"
  ├── CalendarTab → calendar grid
  ├── PrintSchedule → printed schedule
  ├── DoodsTab → Day Out of Days
  └── print/Dood.tsx → print DOOD
```

## Execution Plan

### Step 1: Branch

```
git checkout -b refactor/daybreak-single-source
```

### Step 2: Create `src/lib/daybreakUtils.ts` (NEW FILE)

Extract pure functions (no React hooks) that are duplicated across 6+ files:

```ts
// Shared pure utilities for daybreak computation.
// Used by both useDaybreakSections (hook) and non-hook consumers (PrintSchedule, Dood).

export function addDays(date: string, n: number): string
// UTC date arithmetic. Replaces 6 duplicate implementations.

export function buildNonShootSet(nonShootDates: NonShootDate[]): Set<string>
// Returns Set of non-shoot date strings.

export function splitSections(rows: ScheduleRow[]): ProductionDay[]
// Splits sorted rows at DAYBREAK boundaries → ProductionDay[].
// Replaces duplicate logic in PrintSchedule (lines 874-883),
// CalendarTab (lines 558-572), Dood.tsx (lines 133-144).

export interface ComputedRow extends ScheduleRow {
  computedCallTime: string;
  computedElapsed: number;
  daybreakLabel: string;       // "End of Day N" or "" for pinned
  daybreakDate: string;        // ISO date
  hasNextDaybreak: boolean;
  sectionTotal: number;
  sectionPages: number;
  sectionShoot: number;
  sectionBreak: number;
  sectionEndTime: string;
}

export interface SectionSums {
  total: number;
  pages: number;
  shoot: number;
  break: number;
  endTime: string;
}

export function computeRowData(
  rows: ScheduleRow[],
  productionDays: ProductionDay[],
  scenes: Scene[],
  sectionDateMap: Map<number, string>,
  sectionLabelMap: Map<number, string>,
  callTimeBase?: string,  // fallback for first day's call time
): { computedRows: ComputedRow[]; sectionSums: Map<number, SectionSums> }
```

This is the core loop from StripBlock lines 173-261, extracted as a pure function. Works for both:
- **Multi-day** (StripBlock: all rows for a day container, may contain multiple DAYBREAKs)
- **Single-day** (PrintSchedule DaySection: one day's rows, no DAYBREAKs)

Key implementation notes for `computeRowData`:
- Walk rows sequentially, accumulating `runningElapsed`, `sectionElapsed`, `sectionBaseTime`
- At each DAYBREAK: attach `daybreakLabel` (from `sectionLabelMap` + "End of" prefix), `daybreakDate` (from `sectionDateMap`), `hasNextDaybreak`, section sums
- For non-DAYBREAK rows: attach `computedCallTime` and `computedElapsed`
- `hasNextDaybreak` derived from day position (not a reverse pass)
- `sectionBaseTime` for first day comes from `callTimeBase` param or first DAYBREAK's `daybreakCallTime`

### Step 3: Enhance `useDaybreakSections.ts`

Rename `DaybreakSection` → `ProductionDay` throughout. Add new exports:

```ts
// TYPES:
export interface ProductionDay {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow;
}

// EXISTING EXPORTS (renamed):
productionDays: ProductionDay[]          // was: sections
productionSections: ProductionDay[]      // was: productionSections (filter out pinned)

// NEW EXPORTS:

// Sequential day numbering (replaces 4 duplicate chronoDayMap implementations)
chronoDayMap: Map<number, number>
// Maps sectionIndex → sequential number (1, 2, 3...).
// Skips pinned section 0 in numbering.

// Same but excludes pinned section 0 (for CalendarTab which filters pinned first)
productionChronoDayMap: Map<number, number>

// Per-day summary stats (replaces StripBlock + PrintSchedule section sums)
sectionSums: Map<number, SectionSums>
// Maps sectionIndex → { total, pages, shoot, break, endTime }

// Next day's date (replaces SortableRibbon's inline nextDateStr)
nextSectionDateMap: Map<number, string>
// Maps sectionIndex → next day's formatted date string.
// For the last day, maps to empty string.

// Maps DAYBREAK row ID → section index (for looking up day data by row)
daybreakRowToSection: Map<string, number>

// Full computed row array (calls computeRowData internally)
computedRows: ComputedRow[]
// All rows with computedCallTime, computedElapsed, daybreakLabel,
// daybreakDate, hasNextDaybreak, section sums attached.
```

Import `addDays`, `buildNonShootSet`, `splitSections`, `computeRowData` from `daybreakUtils.ts`. Remove the inline `addDays` and duplicated section-splitting logic from the hook.

### Step 4: Refactor `StripBlock.tsx`

**Remove (lines 173-261):**
- Entire local `computedRows` useMemo
- Local `addDays`, `startDate`, `nonShootSet`, `nextDate` (lines 184-193)
- Local `daybreakCounter` logic (line 199, 204)
- Local `hasNextDaybreak` reverse pass (lines 253-259)

**Add:**
```ts
const { computedRows, daybreakRowToSection, sectionDateMap, sectionLabelMap } = useDaybreakSections();
```

**Key mapping:** Filter `computedRows` to only this block's `rows` (match by row ID). Then for each DAYBREAK row, derive:
- `daybreakLabel`: from `sectionLabelMap` via `daybreakRowToSection`, formatted as `"End of Day N"`
- `daybreakDate`: from `sectionDateMap` via `daybreakRowToSection`

**Keep:** Violation maps (lines 263-319) — they're StripBlock-specific, depend on `computedRows`.

**Sortable rows filtering (lines 314-319):** Unchanged — still filters pinned row when no other daybreaks exist.

### Step 5: Refactor `SortableRibbon.tsx`

**Remove (lines 563-575):**
- Inline `nextDateStr` useMemo (5th independent date-advancement implementation)

**Replace with:** The row already carries `daybreakDate` from the hook. The `nextDateStr` can be:
- Option A: Pre-computed in `computeRowData` and attached to the row as `nextDaybreakDate`
- Option B: Passed as a prop from StripBlock (which has access to `nextSectionDateMap`)

**Also simplify (line 560):**
```ts
// BEFORE (fragile regex on label):
const nextDaybreakNum = (row as any).hasNextDaybreak
  ? parseInt((row.daybreakLabel || '').match(/\d+/)?.[0] || '0', 10) + 1
  : 0;

// AFTER (from section data):
const nextDaybreakNum = (row as any).hasNextDaybreak
  ? /* next day's number from sectionLabelMap */
  : 0;
```

### Step 6: Refactor `ScheduleTab.tsx`

**Remove:**
- Lines 803-810: local `chronoDayMap`
- Lines 823-842: inline date math in `shootViolations` (`addOne`, `nonShootSet`, `cursor`, `sectionDate`)

**Add:**
```ts
const { chronoDayMap: hookChronoDay, sectionDateMap, daybreakRowToSection } = useDaybreakSections();
```

Use `hookChronoDay` for violation day labels (`DAY #N`). Use `sectionDateMap.get(daybreakRowToSection.get(row.id))` for violation dates.

**Keep:** `existingDays` (lines 796-801) — still needed for container-based grouping.

### Step 7: Refactor `PrintSchedule.tsx`

**Parent component (lines 874-904) — Remove:**
- Local sections splitting (lines 874-883)
- Local `addDays`, `startDate`, `nonShootSet`, `sectionDateMap` (lines 885-888)
- Local `chronoDayMap` (lines 899-904)

**Add:**
```ts
const { productionDays, sectionDateMap, chronoDayMap } = useDaybreakSections();
```

**DaySection component (lines 126-185) — Remove:**
- Entire local `computedRows` loop

**Add:**
```ts
import { computeRowData } from '../lib/daybreakUtils';
// DaySection receives rows for ONE day:
const localDays = [{ index: 0, rows, daybreakRow: undefined }];
const { computedRows } = computeRowData(rows, localDays, scenes, new Map([[0, dateStr]]), new Map([[0, '']]), callTime);
```

### Step 8: Refactor `CalendarTab.tsx`

**Remove:**
- Lines 550-572: local `containerRows` + `sections` splitting
- Lines 576-580: local `addDays`
- Lines 588-606: local `sectionDateMap` + `chronoDayMap`

**Add:**
```ts
const { productionSections, sectionDateMap, productionChronoDayMap } = useDaybreakSections();
```

Map `productionSections` to CalendarTab's expected format. Use `productionChronoDayMap` for day numbering.

**Note:** CalendarTab's `sectionDateMap` keys differ from `useDaybreakSections` (CalendarTab keys by production-section index, hook keys by global section index). After refactor, CalendarTab should use the hook's `sectionDateMap` with `daybreakRowToSection` to look up dates by section index.

### Step 9: Refactor `print/Dood.tsx`

**Remove (lines 120-154):**
- Local `addDays`, `nonShootSet`, sections splitting, `sectionDateMap`

**Add:**
```ts
import { splitSections, buildNonShootSet, addDays } from '../lib/daybreakUtils';
// Dood is a plain function (not a component), so it can't use the hook.
// Use shared pure functions directly.
```

### Step 10: Verify

```bash
npm run lint          # type-check (tsc --noEmit)
npx playwright test   # E2E tests
```

Manual verification:
- Day labels ("End of Day N") match across Schedule, Calendar, Print, DOOD
- Day dates match across all views
- Call times update correctly when editing daybreak rows
- Adding/removing/moving DAYBREAK rows updates all views
- Non-shoot dates are skipped correctly everywhere

## Files Modified

| File | Change |
|---|---|
| `src/lib/daybreakUtils.ts` | **NEW** — shared pure functions |
| `src/lib/useDaybreakSections.ts` | Enhanced with new exports, rename `DaybreakSection` → `ProductionDay` |
| `src/components/StripBlock.tsx` | Remove local computation, use hook |
| `src/components/SortableRibbon.tsx` | Remove inline `nextDateStr` |
| `src/components/ScheduleTab.tsx` | Use hook for chronoDayMap + violations |
| `src/components/PrintSchedule.tsx` | Use hook + shared utils |
| `src/components/CalendarTab.tsx` | Use hook |
| `src/components/print/Dood.tsx` | Use shared utils |

## Files Unchanged

| File | Why |
|---|---|
| `src/components/print/ElementBreakdown.tsx` | Uses containerId-based sections (different paradigm) |
| `src/components/DoodsTab.tsx` | Already uses `useDaybreakSections` |
| `src/components/SceneSheet.tsx` | Already uses `useDaybreakSections` |
| `src/components/PrintDialog.tsx` | Already uses `useDaybreakSections` |
| `src/components/ElementBreakdownView.tsx` | Already uses `useDaybreakSections` |
| `src/components/print/DoodDialog.tsx` | Already uses `useDaybreakSections` |

## Edge Cases to Watch

1. **CalendarTab `sectionDateMap` key mismatch:** CalendarTab currently iterates `calendarSections` (pinned filtered out), so its keys are production-section indices (0, 1, 2...), not global section indices. After refactor, use `productionSections` from the hook and look up dates via the global `sectionDateMap` using the section's original index.

2. **PrintSchedule DaySection receives no DAYBREAK rows:** The `computeRowData` function must handle the case where `productionDays` has only one entry with no `daybreakRow` — treat all rows as belonging to that single day.

3. **StripBlock's `daybreakLabel` format:** Must remain `"End of Day N"` (not just `"Day N"`) because SortableRibbon uses `parseInt(row.daybreakLabel.match(/\d+/))` to derive the next day number. After refactor, this regex can be replaced with a direct lookup from section data.

4. **Pinned daybreak behavior:** Section 0's pinned daybreak gets empty `daybreakLabel` and is filtered from `sortableRows` when no other daybreaks exist. The hook's `sectionLabelMap` already returns `""` for pinned sections.

5. **`nextDateStr` in SortableRibbon:** Currently computes the next day's date by adding 1 day to `row.daybreakDate` and skipping non-shoot dates. After refactor, this should use `nextSectionDateMap` from the hook, which is pre-computed with the correct date-advancement logic.

6. **PrintSchedule `chronoDayMap`:** Currently keys by section entry index (after filtering by `selectedDays`). After refactor, use the hook's `chronoDayMap` keyed by global section index.
